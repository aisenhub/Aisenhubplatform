/// <reference lib="deno.ns" />

import { readBoundedBody, UploadFault } from '../_shared/upload.ts';
import { createSupabaseStorageAdapter } from '../_shared/storage.ts';
import {
  type Row,
  type Transaction,
  type AccountApiDependencies,
  type KeyContext,
  type DispatchResult,
  type SessionContext,
  ApiFault,
  stringValue,
  uuidValue,
  defaultUploadGate,
  database,
  setRole,
  verifyPlatformKey,
  assertAllowed,
  accountContextValues,
  fileDto,
  isoDate,
  sha256Hex,
  requestPath,
} from './core.ts';
import { adminStepUp, adminContextValues } from './admin.ts';

function contentFileId(request: Request): string | null {
  const match = /^v1\/config-files\/([^/]+)\/content$/u.exec(
    requestPath(request),
  );
  return match && uuidValue(match[1]) ? uuidValue(match[1]) : null;
}

function safeDownloadFilename(value: unknown): string {
  const name = stringValue(value)
    ?.split('')
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127 ? '_' : character;
    })
    .join('')
    .replace(/[\\/\r\n"']/gu, '_')
    .trim();
  return name && name !== '.' && name !== '..'
    ? name.slice(0, 180)
    : 'config-file';
}

function downloadHeaders(filename: unknown): Record<string, string> {
  const safeName = safeDownloadFilename(filename);
  return {
    'Cache-Control': 'private, no-store',
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
    'X-Content-Type-Options': 'nosniff',
  };
}

async function uploadTransaction<T>(
  request: Request,
  dependencies: AccountApiDependencies,
  callback: (transaction: Transaction, key: KeyContext) => Promise<T>,
): Promise<T> {
  const db = dependencies.database ?? database('account');
  return db.begin(async (transaction) => {
    await setRole(transaction, 'account_executor');
    const key = await verifyPlatformKey(transaction, request, dependencies);
    return callback(transaction, key);
  });
}

async function adminTransaction<T>(
  request: Request,
  dependencies: AccountApiDependencies,
  session: SessionContext,
  callback: (transaction: Transaction) => Promise<T>,
): Promise<T> {
  const db = dependencies.database ?? database('admin');
  return db.begin(async (transaction) => {
    await setRole(transaction, 'admin_executor');
    await adminStepUp(transaction, session, request);
    return callback(transaction);
  });
}

async function adminEventTransaction<T>(
  dependencies: AccountApiDependencies,
  callback: (transaction: Transaction) => Promise<T>,
): Promise<T> {
  const db = dependencies.database ?? database('admin');
  return db.begin(async (transaction) => {
    await setRole(transaction, 'admin_executor');
    return callback(transaction);
  });
}

async function recordDownloadEvent(
  request: Request,
  dependencies: AccountApiDependencies,
  session: SessionContext,
  fileId: string,
  event: 'stream_completed' | 'failed',
  admin: boolean,
  errorCode?: string,
): Promise<void> {
  try {
    if (admin) {
      await adminEventTransaction(dependencies, async (transaction) => {
        await transaction.unsafe(
          'select private.admin_file_download_event(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::uuid, $5::text, $6::text)',
          [...adminContextValues(session), fileId, event, errorCode ?? null],
        );
      });
    } else {
      await uploadTransaction(
        request,
        dependencies,
        async (transaction, key) => {
          await transaction.unsafe(
            'select private.file_download_event(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid, $7::text, $8::text)',
            [
              ...accountContextValues(session, key),
              fileId,
              event,
              errorCode ?? null,
            ],
          );
        },
      );
    }
  } catch {
    // A download response must never be replaced with an error JSON after its
    // body has started. The failed audit is best effort at this boundary.
  }
}

export async function handleDownload(
  request: Request,
  dependencies: AccountApiDependencies,
  session: SessionContext,
  admin: boolean,
): Promise<Response> {
  if (request.method !== 'GET') throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
  const fileId =
    contentFileId(request) ??
    uuidValue(
      /^admin\/api\/v1\/config-files\/([^/]+)\/content$/u.exec(
        requestPath(request),
      )?.[1],
    );
  if (!fileId) throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
  const target = admin
    ? await adminTransaction(
        request,
        dependencies,
        session,
        async (transaction) => {
          const [row] = await transaction.unsafe<Row>(
            'select * from private.admin_file_download_authorize(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::uuid)',
            [...adminContextValues(session), fileId],
          );
          if (!row) throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
          return row;
        },
      )
    : await uploadTransaction(
        request,
        dependencies,
        async (transaction, key) => {
          const [principalRow] = await transaction.unsafe<Row>(
            'select * from private.account_principal(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context)',
            accountContextValues(session, key),
          );
          if (!principalRow)
            throw new ApiFault(503, 'AUTHORIZATION_UNAVAILABLE');
          assertAllowed(principalRow);
          const [row] = await transaction.unsafe<Row>(
            'select * from private.file_download_authorize(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid)',
            [...accountContextValues(session, key), fileId],
          );
          if (!row) throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
          return row;
        },
      );
  const adapter = dependencies.storageAdapter ?? createSupabaseStorageAdapter();
  let upstream: Response;
  try {
    upstream = await adapter.download({
      bucket: 'platform-config-files',
      path: String(target.storage_path),
      timeoutMs: 30_000,
    });
  } catch {
    await recordDownloadEvent(
      request,
      dependencies,
      session,
      fileId,
      'failed',
      admin,
      'storage_unavailable',
    );
    throw new ApiFault(503, 'STORAGE_UNAVAILABLE');
  }
  if (!upstream.ok || !upstream.body) {
    await recordDownloadEvent(
      request,
      dependencies,
      session,
      fileId,
      'failed',
      admin,
      upstream.ok
        ? 'empty_stream'
        : upstream.status === 404
          ? 'missing_object'
          : 'storage_unavailable',
    );
    throw new ApiFault(503, 'STORAGE_UNAVAILABLE');
  }
  const reader = upstream.body.getReader();
  let settled = false;
  const settle = async (
    event: 'stream_completed' | 'failed',
    errorCode?: string,
  ) => {
    if (settled) return;
    settled = true;
    await recordDownloadEvent(
      request,
      dependencies,
      session,
      fileId,
      event,
      admin,
      errorCode,
    );
  };
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await reader.read();
        if (chunk.done) {
          await settle('stream_completed');
          controller.close();
        } else if (chunk.value) {
          controller.enqueue(chunk.value);
        }
      } catch {
        await settle('failed', 'stream_error');
        controller.error(new Error('STORAGE_STREAM_FAILED'));
      }
    },
    async cancel(reason) {
      await reader.cancel(reason);
      await settle('failed', 'stream_cancelled');
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      ...downloadHeaders(target.original_name),
      ...(session.requestId ? { 'X-Request-Id': session.requestId } : {}),
    },
  });
}

export async function handleUploadContent(
  request: Request,
  dependencies: AccountApiDependencies,
  session: SessionContext,
): Promise<DispatchResult> {
  if (request.method !== 'PUT') throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
  const fileId = contentFileId(request);
  if (!fileId) throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
  const idempotencyKey = request.headers.get('idempotency-key');
  if (!idempotencyKey || idempotencyKey.length > 128)
    throw new ApiFault(400, 'INVALID_INPUT');

  const initial = await uploadTransaction(
    request,
    dependencies,
    async (transaction, key) => {
      const [state] = await transaction.unsafe<Row>(
        'select * from private.file_upload_state(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid)',
        [...accountContextValues(session, key), fileId],
      );
      if (!state) throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
      return state;
    },
  );
  const accountId = uuidValue(initial.platform_account_id);
  if (!accountId) throw new ApiFault(503, 'AUTHORIZATION_UNAVAILABLE');
  const gate = dependencies.uploadGate ?? defaultUploadGate;
  if (!gate.tryAcquire(accountId)) throw new ApiFault(429, 'RATE_LIMITED');

  try {
    const stateStatus = stringValue(initial.status);
    if (stateStatus === 'active') {
      const limit = Math.min(Number(initial.requested_size_bytes), 1048576);
      const received = await readBoundedBody(request, limit, 15_000);
      const hash = await sha256Hex(received.bytes);
      if (
        hash !== stringValue(initial.sha256) ||
        received.size !== Number(initial.actual_size_bytes)
      )
        throw new ApiFault(409, 'FILE_CONTENT_CONFLICT');
      return { status: 202, data: fileDto(initial) };
    }
    if (stateStatus !== 'pending')
      throw new ApiFault(409, 'OPERATION_IN_PROGRESS');

    const claim = await uploadTransaction(
      request,
      dependencies,
      async (transaction, key) => {
        const [result] = await transaction.unsafe<Row>(
          'select * from private.file_receive_claim(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid, $7::text, $8::integer)',
          [
            ...accountContextValues(session, key),
            fileId,
            `account-api:${crypto.randomUUID()}`,
            15,
          ],
        );
        if (!result) throw new ApiFault(503, 'AUTHORIZATION_UNAVAILABLE');
        return result;
      },
    );
    const limit = Math.min(
      Number(claim.requested_size_bytes),
      Number(claim.max_file_bytes),
    );
    const received = await readBoundedBody(request, limit, 15_000);
    const hash = await sha256Hex(received.bytes);
    const prepared = await uploadTransaction(
      request,
      dependencies,
      async (transaction, key) => {
        const [result] = await transaction.unsafe<Row>(
          'select * from private.file_prepare_store(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid, $7::bigint, $8::text, $9::text)',
          [
            ...accountContextValues(session, key),
            fileId,
            received.size,
            hash,
            idempotencyKey,
          ],
        );
        if (!result) throw new ApiFault(503, 'AUTHORIZATION_UNAVAILABLE');
        if (result.replace_outcome === 'file_busy')
          return { status: 409, data: fileDto(result) };
        return result;
      },
    );
    const adapter =
      dependencies.storageAdapter ?? createSupabaseStorageAdapter();
    let providerRequestId: string | null = null;
    try {
      const putResult = await adapter.putImmutable({
        bucket: 'platform-config-files',
        path: String(prepared.storage_path),
        body: received.bytes,
        contentType: stringValue(claim.mime_type) ?? 'application/octet-stream',
        timeoutMs: 30_000,
      });
      providerRequestId = putResult.providerRequestId;
      const info = await adapter.getInfo({
        bucket: 'platform-config-files',
        path: String(prepared.storage_path),
        timeoutMs: 30_000,
      });
      if (info.size !== received.size) throw new Error('STORAGE_SIZE_MISMATCH');
    } catch (error) {
      await uploadTransaction(
        request,
        dependencies,
        async (transaction, key) => {
          await transaction.unsafe(
            'select * from private.file_write_attempt_mark_unknown(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid, $7::uuid, $8::text)',
            [
              ...accountContextValues(session, key),
              fileId,
              prepared.write_attempt_id,
              error instanceof Error
                ? error.message.slice(0, 128)
                : 'storage_error',
            ],
          );
          return undefined;
        },
      ).catch(() => undefined);
      throw new ApiFault(503, 'STORAGE_UNAVAILABLE');
    }
    const finalized = await uploadTransaction(
      request,
      dependencies,
      async (transaction, key) => {
        const [result] = await transaction.unsafe<Row>(
          'select * from private.file_write_attempt_finalize(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid, $7::uuid, $8::bigint, $9::text, $10::text)',
          [
            ...accountContextValues(session, key),
            fileId,
            prepared.write_attempt_id,
            received.size,
            hash,
            providerRequestId,
          ],
        );
        if (!result) throw new ApiFault(503, 'AUTHORIZATION_UNAVAILABLE');
        return result;
      },
    );
    return { status: 202, data: fileDto(finalized) };
  } catch (error) {
    if (error instanceof UploadFault)
      throw new ApiFault(error.status, error.code);
    throw error;
  } finally {
    gate.release(accountId);
  }
}

function configVersionContentTarget(
  request: Request,
): { configId: string; versionId: string } | null {
  const match = /^v1\/configs\/([^/]+)\/versions\/([^/]+)\/content$/u.exec(
    requestPath(request),
  );
  const configId = uuidValue(match?.[1]);
  const versionId = uuidValue(match?.[2]);
  return configId && versionId ? { configId, versionId } : null;
}

function galleryContentTarget(
  request: Request,
): { configId: string; delivery: 'download' | 'apply' } | null {
  const match = /^v1\/config-gallery\/([^/]+)\/(content|apply)$/u.exec(
    requestPath(request),
  );
  const configId = uuidValue(match?.[1]);
  if (!configId || !match?.[2]) return null;
  return { configId, delivery: match[2] === 'apply' ? 'apply' : 'download' };
}

function feedbackAttachmentContentTarget(
  request: Request,
): { feedbackId: string; attachmentId: string } | null {
  const match = /^v1\/feedback\/([^/]+)\/attachments\/([^/]+)\/content$/u.exec(
    requestPath(request),
  );
  const feedbackId = uuidValue(match?.[1]);
  const attachmentId = uuidValue(match?.[2]);
  return feedbackId && attachmentId ? { feedbackId, attachmentId } : null;
}

function feedbackImageMagicMatches(
  bytes: Uint8Array,
  mimeType: string,
): boolean {
  if (mimeType === 'image/jpeg') {
    return (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    );
  }
  if (mimeType === 'image/png') {
    const magic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return (
      bytes.length >= magic.length &&
      magic.every((value, index) => bytes[index] === value)
    );
  }
  if (mimeType === 'image/webp') {
    return (
      bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
      String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
    );
  }
  return false;
}

function feedbackAttachmentUploadDto(
  row: Row,
  feedbackId: string,
  attachmentId: string,
): Record<string, unknown> {
  return {
    feedback_id: feedbackId,
    attachment_id: attachmentId,
    status: stringValue(row.status),
    write_outcome: stringValue(row.write_outcome),
    actual_size_bytes:
      row.actual_size_bytes === null || row.actual_size_bytes === undefined
        ? null
        : Number(row.actual_size_bytes),
    sha256: stringValue(row.sha256),
    uploaded_at: isoDate(row.uploaded_at),
  };
}

function configVersionUploadDto(
  row: Row,
  configId: string,
  versionId: string,
): Record<string, unknown> {
  return {
    config_id: configId,
    version_id: versionId,
    file_id: uuidValue(row.file_id),
    file_status: stringValue(row.status ?? row.file_status),
    write_outcome: stringValue(row.write_outcome),
    actual_size_bytes:
      row.actual_size_bytes === null || row.actual_size_bytes === undefined
        ? null
        : Number(row.actual_size_bytes),
    sha256: stringValue(row.sha256),
    uploaded_at: isoDate(row.uploaded_at),
  };
}

export async function handleConfigVersionUploadContent(
  request: Request,
  dependencies: AccountApiDependencies,
  session: SessionContext,
): Promise<DispatchResult> {
  if (request.method !== 'PUT') throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
  const target = configVersionContentTarget(request);
  if (!target) throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
  const idempotencyKey = request.headers.get('idempotency-key');
  if (!idempotencyKey || idempotencyKey.length > 128)
    throw new ApiFault(400, 'INVALID_INPUT');

  const initial = await uploadTransaction(
    request,
    dependencies,
    async (transaction, key) => {
      const [state] = await transaction.unsafe<Row>(
        'select * from private.config_version_upload_state(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid, $7::uuid)',
        [
          ...accountContextValues(session, key),
          target.configId,
          target.versionId,
        ],
      );
      if (!state) throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
      return state;
    },
  );
  const accountId = uuidValue(initial.platform_account_id);
  if (!accountId) throw new ApiFault(503, 'AUTHORIZATION_UNAVAILABLE');
  const gate = dependencies.uploadGate ?? defaultUploadGate;
  if (!gate.tryAcquire(accountId)) throw new ApiFault(429, 'RATE_LIMITED');

  try {
    const stateStatus = stringValue(initial.status);
    if (stateStatus === 'active') {
      const limit = Math.min(Number(initial.requested_size_bytes), 1048576);
      const received = await readBoundedBody(request, limit, 15_000);
      const hash = await sha256Hex(received.bytes);
      if (
        hash !== stringValue(initial.sha256) ||
        received.size !== Number(initial.actual_size_bytes)
      )
        throw new ApiFault(409, 'FILE_CONTENT_CONFLICT');
      return {
        status: 202,
        data: configVersionUploadDto(
          initial,
          target.configId,
          target.versionId,
        ),
      };
    }
    if (stateStatus !== 'pending')
      throw new ApiFault(409, 'OPERATION_IN_PROGRESS');

    const claim = await uploadTransaction(
      request,
      dependencies,
      async (transaction, key) => {
        const [result] = await transaction.unsafe<Row>(
          'select * from private.config_version_receive_claim(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid, $7::uuid, $8::text, $9::integer)',
          [
            ...accountContextValues(session, key),
            target.configId,
            target.versionId,
            `account-api:${crypto.randomUUID()}`,
            15,
          ],
        );
        if (!result) throw new ApiFault(503, 'AUTHORIZATION_UNAVAILABLE');
        return result;
      },
    );
    const limit = Math.min(
      Number(claim.requested_size_bytes),
      Number(claim.max_file_bytes),
    );
    const received = await readBoundedBody(request, limit, 15_000);
    const hash = await sha256Hex(received.bytes);
    const prepared = await uploadTransaction(
      request,
      dependencies,
      async (transaction, key) => {
        const [result] = await transaction.unsafe<Row>(
          'select * from private.config_version_prepare_store(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid, $7::uuid, $8::bigint, $9::text, $10::text)',
          [
            ...accountContextValues(session, key),
            target.configId,
            target.versionId,
            received.size,
            hash,
            idempotencyKey,
          ],
        );
        if (!result) throw new ApiFault(503, 'AUTHORIZATION_UNAVAILABLE');
        return result;
      },
    );
    const adapter =
      dependencies.storageAdapter ?? createSupabaseStorageAdapter();
    let providerRequestId: string | null = null;
    try {
      const putResult = await adapter.putImmutable({
        bucket: 'platform-config-files',
        path: String(prepared.storage_path),
        body: received.bytes,
        contentType: stringValue(claim.mime_type) ?? 'application/octet-stream',
        timeoutMs: 30_000,
      });
      providerRequestId = putResult.providerRequestId;
      const info = await adapter.getInfo({
        bucket: 'platform-config-files',
        path: String(prepared.storage_path),
        timeoutMs: 30_000,
      });
      if (info.size !== received.size) throw new Error('STORAGE_SIZE_MISMATCH');
    } catch (error) {
      await uploadTransaction(
        request,
        dependencies,
        async (transaction, key) => {
          await transaction.unsafe(
            'select * from private.config_version_write_attempt_mark_unknown(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid, $7::uuid, $8::uuid, $9::text)',
            [
              ...accountContextValues(session, key),
              target.configId,
              target.versionId,
              prepared.write_attempt_id,
              error instanceof Error
                ? error.message.slice(0, 128)
                : 'storage_error',
            ],
          );
          return undefined;
        },
      ).catch(() => undefined);
      throw new ApiFault(503, 'STORAGE_UNAVAILABLE');
    }
    const finalized = await uploadTransaction(
      request,
      dependencies,
      async (transaction, key) => {
        const [result] = await transaction.unsafe<Row>(
          'select * from private.config_version_write_attempt_finalize(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid, $7::uuid, $8::uuid, $9::bigint, $10::text, $11::text)',
          [
            ...accountContextValues(session, key),
            target.configId,
            target.versionId,
            prepared.write_attempt_id,
            received.size,
            hash,
            providerRequestId,
          ],
        );
        if (!result) throw new ApiFault(503, 'AUTHORIZATION_UNAVAILABLE');
        return result;
      },
    );
    return {
      status: 202,
      data: configVersionUploadDto(
        finalized,
        target.configId,
        target.versionId,
      ),
    };
  } catch (error) {
    if (error instanceof UploadFault)
      throw new ApiFault(error.status, error.code);
    throw error;
  } finally {
    gate.release(accountId);
  }
}

export async function handleFeedbackAttachmentUploadContent(
  request: Request,
  dependencies: AccountApiDependencies,
  session: SessionContext,
): Promise<DispatchResult> {
  if (request.method !== 'PUT') throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
  const target = feedbackAttachmentContentTarget(request);
  if (!target) throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
  const idempotencyKey = request.headers.get('idempotency-key');
  if (!idempotencyKey || idempotencyKey.length > 128)
    throw new ApiFault(400, 'INVALID_INPUT');

  const initial = await uploadTransaction(
    request,
    dependencies,
    async (transaction, key) => {
      const [state] = await transaction.unsafe<Row>(
        'select * from private.feedback_attachment_upload_state(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid, $7::uuid)',
        [
          ...accountContextValues(session, key),
          target.feedbackId,
          target.attachmentId,
        ],
      );
      if (!state) throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
      return state;
    },
  );
  const accountId = uuidValue(initial.platform_account_id);
  if (!accountId) throw new ApiFault(503, 'AUTHORIZATION_UNAVAILABLE');
  const gate = dependencies.uploadGate ?? defaultUploadGate;
  if (!gate.tryAcquire(accountId)) throw new ApiFault(429, 'RATE_LIMITED');

  try {
    const mimeType = stringValue(initial.mime_type);
    if (!mimeType) throw new ApiFault(409, 'OPERATION_IN_PROGRESS');
    const received = await readBoundedBody(
      request,
      Math.min(Number(initial.requested_size_bytes), 4_194_304),
      15_000,
    );
    if (received.size !== Number(initial.requested_size_bytes))
      throw new ApiFault(400, 'UPLOAD_SIZE_MISMATCH');
    if (!feedbackImageMagicMatches(received.bytes, mimeType))
      throw new ApiFault(415, 'UNSUPPORTED_MEDIA_TYPE');
    const hash = await sha256Hex(received.bytes);
    const stateStatus = stringValue(initial.status);
    if (stateStatus === 'active') {
      if (
        hash !== stringValue(initial.sha256) ||
        received.size !== Number(initial.actual_size_bytes)
      )
        throw new ApiFault(409, 'FILE_CONTENT_CONFLICT');
      return {
        status: 202,
        data: feedbackAttachmentUploadDto(
          initial,
          target.feedbackId,
          target.attachmentId,
        ),
      };
    }
    if (stateStatus !== 'pending')
      throw new ApiFault(409, 'OPERATION_IN_PROGRESS');

    await uploadTransaction(request, dependencies, async (transaction, key) => {
      const [result] = await transaction.unsafe<Row>(
        'select * from private.feedback_attachment_receive_claim(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid, $7::text, $8::integer)',
        [
          ...accountContextValues(session, key),
          target.attachmentId,
          `account-api:${crypto.randomUUID()}`,
          15,
        ],
      );
      if (!result) throw new ApiFault(503, 'AUTHORIZATION_UNAVAILABLE');
      return result;
    });
    const prepared = await uploadTransaction(
      request,
      dependencies,
      async (transaction, key) => {
        const [result] = await transaction.unsafe<Row>(
          'select * from private.feedback_attachment_prepare_store(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid, $7::bigint, $8::text, $9::text)',
          [
            ...accountContextValues(session, key),
            target.attachmentId,
            received.size,
            hash,
            idempotencyKey,
          ],
        );
        if (!result) throw new ApiFault(503, 'AUTHORIZATION_UNAVAILABLE');
        return result;
      },
    );
    const adapter =
      dependencies.storageAdapter ?? createSupabaseStorageAdapter();
    let providerRequestId: string | null = null;
    try {
      const putResult = await adapter.putImmutable({
        bucket: 'platform-feedback-attachments',
        path: String(prepared.storage_path),
        body: received.bytes,
        contentType: mimeType,
        timeoutMs: 30_000,
      });
      providerRequestId = putResult.providerRequestId;
      const info = await adapter.getInfo({
        bucket: 'platform-feedback-attachments',
        path: String(prepared.storage_path),
        timeoutMs: 30_000,
      });
      if (info.size !== received.size) throw new Error('STORAGE_SIZE_MISMATCH');
    } catch (error) {
      await uploadTransaction(
        request,
        dependencies,
        async (transaction, key) => {
          await transaction.unsafe(
            'select * from private.feedback_attachment_mark_unknown(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid, $7::uuid, $8::text)',
            [
              ...accountContextValues(session, key),
              target.attachmentId,
              prepared.write_attempt_id,
              error instanceof Error
                ? error.message.slice(0, 128)
                : 'storage_error',
            ],
          );
          return undefined;
        },
      ).catch(() => undefined);
      throw new ApiFault(503, 'STORAGE_UNAVAILABLE');
    }
    const finalized = await uploadTransaction(
      request,
      dependencies,
      async (transaction, key) => {
        const [result] = await transaction.unsafe<Row>(
          'select * from private.feedback_attachment_finalize(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid, $7::uuid, $8::bigint, $9::text, $10::text)',
          [
            ...accountContextValues(session, key),
            target.attachmentId,
            prepared.write_attempt_id,
            received.size,
            hash,
            providerRequestId,
          ],
        );
        if (!result) throw new ApiFault(503, 'AUTHORIZATION_UNAVAILABLE');
        return result;
      },
    );
    return {
      status: 202,
      data: feedbackAttachmentUploadDto(
        finalized,
        target.feedbackId,
        target.attachmentId,
      ),
    };
  } catch (error) {
    if (error instanceof UploadFault)
      throw new ApiFault(error.status, error.code);
    throw error;
  } finally {
    gate.release(accountId);
  }
}

async function recordGalleryUsage(
  request: Request,
  dependencies: AccountApiDependencies,
  session: SessionContext,
  configId: string,
  eventType: 'download_completed' | 'apply_delivery_completed',
  eventKey: string,
): Promise<void> {
  try {
    await uploadTransaction(request, dependencies, async (transaction, key) => {
      await transaction.unsafe(
        'select * from private.config_gallery_usage_record(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid, $7::text, $8::text)',
        [...accountContextValues(session, key), configId, eventType, eventKey],
      );
    });
  } catch {
    // Usage facts are only recorded after a complete stream. If that final
    // append is unavailable, do not turn already-delivered bytes into a
    // synthetic application failure or invent a count.
  }
}

export async function handleConfigResourceDownload(
  request: Request,
  dependencies: AccountApiDependencies,
  session: SessionContext,
): Promise<Response> {
  const versionTarget = configVersionContentTarget(request);
  const galleryTarget = galleryContentTarget(request);
  if (versionTarget) {
    if (request.method !== 'GET') throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
  } else if (galleryTarget) {
    if (
      (galleryTarget.delivery === 'download' && request.method !== 'GET') ||
      (galleryTarget.delivery === 'apply' && request.method !== 'POST')
    )
      throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
  } else {
    throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
  }

  const applyKey =
    galleryTarget?.delivery === 'apply'
      ? request.headers.get('idempotency-key')
      : null;
  if (
    galleryTarget?.delivery === 'apply' &&
    (!applyKey || applyKey.length > 128)
  )
    throw new ApiFault(400, 'INVALID_INPUT');

  const target = await uploadTransaction(
    request,
    dependencies,
    async (transaction, key) => {
      const [principalRow] = await transaction.unsafe<Row>(
        'select * from private.account_principal(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context)',
        accountContextValues(session, key),
      );
      if (!principalRow) throw new ApiFault(503, 'AUTHORIZATION_UNAVAILABLE');
      assertAllowed(principalRow);
      if (versionTarget) {
        const [row] = await transaction.unsafe<Row>(
          'select * from private.config_version_download_authorize(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid, $7::uuid)',
          [
            ...accountContextValues(session, key),
            versionTarget.configId,
            versionTarget.versionId,
          ],
        );
        if (!row) throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
        return row;
      }
      const [row] = await transaction.unsafe<Row>(
        'select * from private.config_gallery_content_authorize(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid, $7::text)',
        [
          ...accountContextValues(session, key),
          galleryTarget!.configId,
          galleryTarget!.delivery,
        ],
      );
      if (!row) throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
      return row;
    },
  );

  const adapter = dependencies.storageAdapter ?? createSupabaseStorageAdapter();
  let upstream: Response;
  try {
    upstream = await adapter.download({
      bucket: 'platform-config-files',
      path: String(target.storage_path),
      timeoutMs: 30_000,
    });
  } catch {
    throw new ApiFault(503, 'STORAGE_UNAVAILABLE');
  }
  if (!upstream.ok || !upstream.body)
    throw new ApiFault(503, 'STORAGE_UNAVAILABLE');

  const reader = upstream.body.getReader();
  let settled = false;
  const settle = async () => {
    if (settled) return;
    settled = true;
    if (!galleryTarget) return;
    const eventKey =
      galleryTarget.delivery === 'apply'
        ? applyKey!
        : (session.requestId ?? crypto.randomUUID());
    await recordGalleryUsage(
      request,
      dependencies,
      session,
      galleryTarget.configId,
      galleryTarget.delivery === 'apply'
        ? 'apply_delivery_completed'
        : 'download_completed',
      eventKey,
    );
  };
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await reader.read();
        if (chunk.done) {
          await settle();
          controller.close();
        } else if (chunk.value) {
          controller.enqueue(chunk.value);
        }
      } catch {
        controller.error(new Error('STORAGE_STREAM_FAILED'));
      }
    },
    async cancel(reason) {
      await reader.cancel(reason);
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      ...downloadHeaders(target.original_name),
      ...(session.requestId ? { 'X-Request-Id': session.requestId } : {}),
    },
  });
}
