/// <reference lib="deno.ns" />

import {
  type AccountApiDependencies,
  type DispatchResult,
  type Row,
  type SessionContext,
  type Transaction,
  ApiFault,
  body,
  expectedVersion,
  isoDate,
  objectValue,
  requestPath,
  stringValue,
  uuidValue,
  verifiedAuthUserFromRequest,
  withEtag,
} from './core.ts';
import { boundedLimit } from './admin.ts';

function strictFields(
  input: Record<string, unknown>,
  allowed: readonly string[],
): void {
  if (Object.keys(input).some((field) => !allowed.includes(field)))
    throw new ApiFault(400, 'INVALID_INPUT');
}

function requiredText(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0)
    throw new ApiFault(400, 'INVALID_INPUT');
  return value;
}

function clientContextValue(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value))
    throw new ApiFault(400, 'INVALID_INPUT');
  return value as Record<string, unknown>;
}

function feedbackSummaryDto(row: Row): Record<string, unknown> {
  return {
    feedback_id: uuidValue(row.feedback_id ?? row.id),
    category: stringValue(row.category),
    title: stringValue(row.title),
    status: stringValue(row.status),
    flagged: row.flagged === true,
    contact_allowed: row.contact_allowed === true,
    attachment_count: Number(row.attachment_count ?? 0),
    row_version: Number(row.row_version),
    submitted_at: isoDate(row.submitted_at),
    created_at: isoDate(row.created_at),
    updated_at: isoDate(row.updated_at),
  };
}

function attachmentDto(row: Row): Record<string, unknown> {
  return {
    attachment_id: uuidValue(row.attachment_id ?? row.id),
    status: stringValue(row.status),
    write_outcome: stringValue(row.write_outcome),
    original_name: stringValue(row.original_name),
    mime_type: stringValue(row.mime_type),
    requested_size_bytes: Number(row.requested_size_bytes),
    actual_size_bytes:
      row.actual_size_bytes === null || row.actual_size_bytes === undefined
        ? null
        : Number(row.actual_size_bytes),
    sha256: stringValue(row.sha256),
    created_at: isoDate(row.created_at),
    updated_at: isoDate(row.updated_at),
  };
}

function feedbackDetailDto(
  row: Row,
  attachments: readonly Row[],
): Record<string, unknown> {
  return {
    feedback_id: uuidValue(row.feedback_id ?? row.id),
    category: stringValue(row.category),
    title: stringValue(row.title),
    body: stringValue(row.body),
    status: stringValue(row.status),
    contact_allowed: row.contact_allowed === true,
    client_context: objectValue(row.client_context),
    flagged: row.flagged === true,
    row_version: Number(row.row_version),
    submitted_at: isoDate(row.submitted_at),
    created_at: isoDate(row.created_at),
    updated_at: isoDate(row.updated_at),
    attachments: attachments.map(attachmentDto),
  };
}

async function feedbackRead(
  transaction: Transaction,
  contextValues: readonly unknown[],
  feedbackId: string,
): Promise<{ row: Row; attachments: Row[] }> {
  const [row] = await transaction.unsafe<Row>(
    'select * from private.feedback_read(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid)',
    [...contextValues, feedbackId],
  );
  if (!row) throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
  const attachments = await transaction.unsafe<Row>(
    'select * from private.feedback_attachment_list(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid)',
    [...contextValues, feedbackId],
  );
  return { row, attachments };
}

export async function dispatchFeedback(
  request: Request,
  transaction: Transaction,
  dependencies: AccountApiDependencies,
  session: SessionContext,
  contextValues: readonly unknown[],
): Promise<DispatchResult | null> {
  const path = requestPath(request);
  const url = new URL(request.url);

  if (path === 'v1/feedback' && request.method === 'GET') {
    const limit = boundedLimit(url.searchParams.get('limit'));
    const cursorValue = url.searchParams.get('cursor');
    const cursor = cursorValue ? uuidValue(cursorValue) : null;
    if (cursorValue && !cursor) throw new ApiFault(400, 'INVALID_INPUT');
    const rows = await transaction.unsafe<Row>(
      'select * from private.feedback_list(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid, $7::integer)',
      [...contextValues, cursor, limit],
    );
    return {
      status: 200,
      data: { items: rows.map(feedbackSummaryDto) },
      next_cursor:
        rows.length === limit ? uuidValue(rows.at(-1)?.feedback_id) : null,
    };
  }

  if (path === 'v1/feedback' && request.method === 'POST') {
    const idempotencyKey = request.headers.get('idempotency-key');
    if (!idempotencyKey || idempotencyKey.length > 128)
      throw new ApiFault(400, 'INVALID_INPUT');
    const input = await body(request);
    strictFields(input, [
      'category',
      'title',
      'body',
      'contact_allowed',
      'client_context',
    ]);
    if (typeof input.contact_allowed !== 'boolean')
      throw new ApiFault(400, 'INVALID_INPUT');
    const category = requiredText(input.category);
    const title = requiredText(input.title);
    const feedbackBody = requiredText(input.body);
    const clientContext = clientContextValue(input.client_context);
    const [row] = await transaction.unsafe<Row>(
      'select * from private.feedback_create(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::text, $7::text, $8::text, $9::boolean, $10::jsonb, $11::text)',
      [
        ...contextValues,
        category,
        title,
        feedbackBody,
        input.contact_allowed,
        transaction.json(clientContext),
        idempotencyKey,
      ],
    );
    if (!row) throw new ApiFault(503, 'AUTHORIZATION_UNAVAILABLE');
    return {
      status: 201,
      data: feedbackSummaryDto(row),
      headers: withEtag(row),
    };
  }

  const feedbackMatch = /^v1\/feedback\/([^/]+)$/u.exec(path);
  if (feedbackMatch) {
    const feedbackId = uuidValue(feedbackMatch[1]);
    if (!feedbackId) throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
    if (request.method === 'GET') {
      const current = await feedbackRead(
        transaction,
        contextValues,
        feedbackId,
      );
      return {
        status: 200,
        data: feedbackDetailDto(current.row, current.attachments),
        headers: withEtag(current.row),
      };
    }
    if (request.method === 'PATCH') {
      const expected = expectedVersion(request);
      const input = await body(request);
      strictFields(input, [
        'category',
        'title',
        'body',
        'contact_allowed',
        'client_context',
      ]);
      if (Object.keys(input).length === 0)
        throw new ApiFault(400, 'INVALID_INPUT');
      const current = await feedbackRead(
        transaction,
        contextValues,
        feedbackId,
      );
      const category = Object.hasOwn(input, 'category')
        ? requiredText(input.category)
        : requiredText(current.row.category);
      const title = Object.hasOwn(input, 'title')
        ? requiredText(input.title)
        : requiredText(current.row.title);
      const feedbackBody = Object.hasOwn(input, 'body')
        ? requiredText(input.body)
        : requiredText(current.row.body);
      const contactAllowed = Object.hasOwn(input, 'contact_allowed')
        ? input.contact_allowed
        : current.row.contact_allowed;
      if (typeof contactAllowed !== 'boolean')
        throw new ApiFault(400, 'INVALID_INPUT');
      const clientContext = Object.hasOwn(input, 'client_context')
        ? clientContextValue(input.client_context)
        : objectValue(current.row.client_context);
      const [row] = await transaction.unsafe<Row>(
        'select * from private.feedback_patch(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid, $7::bigint, $8::text, $9::text, $10::text, $11::boolean, $12::jsonb)',
        [
          ...contextValues,
          feedbackId,
          expected,
          category,
          title,
          feedbackBody,
          contactAllowed,
          transaction.json(clientContext),
        ],
      );
      if (!row) throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
      const updated = await feedbackRead(
        transaction,
        contextValues,
        feedbackId,
      );
      return {
        status: 200,
        data: feedbackDetailDto(updated.row, updated.attachments),
        headers: withEtag(updated.row),
      };
    }
  }

  const intentMatch =
    /^v1\/feedback\/([^/]+)\/attachments\/upload-intent$/u.exec(path);
  if (intentMatch && request.method === 'POST') {
    const feedbackId = uuidValue(intentMatch[1]);
    if (!feedbackId) throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
    const idempotencyKey = request.headers.get('idempotency-key');
    if (!idempotencyKey || idempotencyKey.length > 128)
      throw new ApiFault(400, 'INVALID_INPUT');
    const input = await body(request);
    strictFields(input, ['name', 'size', 'content_type']);
    if (!Number.isSafeInteger(input.size) || Number(input.size) < 1)
      throw new ApiFault(400, 'INVALID_INPUT');
    const [row] = await transaction.unsafe<Row>(
      'select * from private.feedback_attachment_intent_create(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid, $7::text, $8::bigint, $9::text, $10::text)',
      [
        ...contextValues,
        feedbackId,
        requiredText(input.name),
        Number(input.size),
        requiredText(input.content_type),
        idempotencyKey,
      ],
    );
    if (!row) throw new ApiFault(503, 'AUTHORIZATION_UNAVAILABLE');
    const attachmentId = uuidValue(row.attachment_id);
    if (!attachmentId) throw new ApiFault(503, 'AUTHORIZATION_UNAVAILABLE');
    return {
      status: 201,
      data: {
        attachment_id: attachmentId,
        feedback_id: uuidValue(row.feedback_id),
        status: stringValue(row.status),
        write_outcome: stringValue(row.write_outcome),
        requested_size_bytes: Number(row.requested_size_bytes),
        intent_expires_at: isoDate(row.intent_expires_at),
        upload_path: `/v1/feedback/${feedbackId}/attachments/${attachmentId}/content`,
        upload_method: 'PUT',
      },
    };
  }

  const cancelMatch = /^v1\/feedback\/([^/]+)\/attachments\/([^/]+)$/u.exec(
    path,
  );
  if (cancelMatch && request.method === 'DELETE') {
    const feedbackId = uuidValue(cancelMatch[1]);
    const attachmentId = uuidValue(cancelMatch[2]);
    if (!feedbackId || !attachmentId)
      throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
    await transaction.unsafe<Row>(
      'select * from private.feedback_attachment_upload_state(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid, $7::uuid)',
      [...contextValues, feedbackId, attachmentId],
    );
    const [row] = await transaction.unsafe<Row>(
      'select * from private.feedback_attachment_cancel(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid)',
      [...contextValues, attachmentId],
    );
    if (!row) throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
    return {
      status: 202,
      data: {
        attachment_id: uuidValue(row.attachment_id),
        status: stringValue(row.status),
        write_outcome: stringValue(row.write_outcome),
        deleted_at: isoDate(row.deleted_at),
      },
    };
  }

  const submitMatch = /^v1\/feedback\/([^/]+)\/submit$/u.exec(path);
  if (submitMatch && request.method === 'POST') {
    const feedbackId = uuidValue(submitMatch[1]);
    if (!feedbackId) throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
    const input = await body(request);
    strictFields(input, []);
    const authUser = await verifiedAuthUserFromRequest(request, dependencies);
    const [row] = await transaction.unsafe<Row>(
      'select * from private.feedback_submit(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid, $7::text)',
      [...contextValues, feedbackId, authUser.email],
    );
    if (!row) throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
    return {
      status: 200,
      data: {
        feedback_id: uuidValue(row.feedback_id),
        status: stringValue(row.status),
        row_version: Number(row.row_version),
        submitted_at: isoDate(row.submitted_at),
      },
      headers: withEtag(row),
    };
  }

  return null;
}
