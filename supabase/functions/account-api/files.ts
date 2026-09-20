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
    headers: downloadHeaders(target.original_name),
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
