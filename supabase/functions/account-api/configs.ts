/// <reference lib="deno.ns" />

import {
  type Row,
  type Transaction,
  type DispatchResult,
  ApiFault,
  body,
  expectedVersion,
  isoDate,
  requestPath,
  stringValue,
  uuidValue,
  withEtag,
} from './core.ts';
import { boundedLimit } from './admin.ts';

function configDto(row: Row): Record<string, unknown> {
  return {
    config_id: uuidValue(row.config_id ?? row.id),
    title: stringValue(row.title) ?? '',
    description: stringValue(row.description),
    status: stringValue(row.status) ?? 'active',
    current_version_id: uuidValue(row.current_version_id),
    row_version: Number(row.row_version),
    created_at: isoDate(row.created_at),
    updated_at: isoDate(row.updated_at),
  };
}

function versionDto(row: Row): Record<string, unknown> {
  return {
    version_id: uuidValue(row.version_id ?? row.id),
    file_id: uuidValue(row.file_id),
    version_number: Number(row.version_number),
    schema_key: stringValue(row.schema_key) ?? '',
    schema_version: stringValue(row.schema_version) ?? '',
    changelog: stringValue(row.changelog),
    file_status: stringValue(row.file_status ?? row.status),
    write_outcome: stringValue(row.write_outcome),
    actual_size_bytes:
      row.actual_size_bytes === null || row.actual_size_bytes === undefined
        ? null
        : Number(row.actual_size_bytes),
    created_at: isoDate(row.created_at),
  };
}

function galleryDto(row: Row): Record<string, unknown> {
  return {
    config_id: uuidValue(row.config_id),
    title: stringValue(row.title) ?? '',
    description: stringValue(row.description),
    author_display_name: stringValue(row.author_display_name),
    published_version_id: uuidValue(row.published_version_id),
    version_number: Number(row.version_number),
    schema_key: stringValue(row.schema_key) ?? '',
    schema_version: stringValue(row.schema_version) ?? '',
    changelog: stringValue(row.changelog),
    like_count: Number(row.like_count),
    download_count: Number(row.download_count),
    apply_delivery_count: Number(row.apply_delivery_count),
    liked: row.liked === true,
    approved_at: isoDate(row.approved_at),
    updated_at: isoDate(row.updated_at),
  };
}

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

function optionalText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new ApiFault(400, 'INVALID_INPUT');
  return value;
}

export async function dispatchConfigResources(
  request: Request,
  transaction: Transaction,
  contextValues: readonly unknown[],
): Promise<DispatchResult | null> {
  const path = requestPath(request);
  const url = new URL(request.url);

  if (path === 'v1/configs' && request.method === 'GET') {
    const limit = boundedLimit(url.searchParams.get('limit'));
    const cursor = url.searchParams.get('cursor');
    const cursorId = cursor ? uuidValue(cursor) : null;
    if (cursor && !cursorId) throw new ApiFault(400, 'INVALID_INPUT');
    const rows = await transaction.unsafe<Row>(
      'select * from private.config_list(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid, $7::integer)',
      [...contextValues, cursorId, limit],
    );
    return {
      status: 200,
      data: { items: rows.map(configDto) },
      next_cursor:
        rows.length === limit ? uuidValue(rows.at(-1)?.config_id) : null,
    };
  }

  if (path === 'v1/configs' && request.method === 'POST') {
    const input = await body(request);
    strictFields(input, ['title', 'description']);
    const title = requiredText(input.title);
    const description = optionalText(input.description);
    const [row] = await transaction.unsafe<Row>(
      'select * from private.config_create(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::text, $7::text)',
      [...contextValues, title, description],
    );
    if (!row) throw new ApiFault(503, 'AUTHORIZATION_UNAVAILABLE');
    return { status: 201, data: configDto(row), headers: withEtag(row) };
  }

  const configMatch = /^v1\/configs\/([^/]+)$/u.exec(path);
  if (configMatch) {
    const configId = uuidValue(configMatch[1]);
    if (!configId) throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
    if (request.method === 'GET') {
      const [row] = await transaction.unsafe<Row>(
        'select * from private.config_read(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid)',
        [...contextValues, configId],
      );
      if (!row) throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
      return { status: 200, data: configDto(row), headers: withEtag(row) };
    }
    if (request.method === 'PATCH') {
      const expected = expectedVersion(request);
      const input = await body(request);
      strictFields(input, ['title', 'description']);
      if (
        !Object.hasOwn(input, 'title') &&
        !Object.hasOwn(input, 'description')
      )
        throw new ApiFault(400, 'INVALID_INPUT');
      const [current] = await transaction.unsafe<Row>(
        'select * from private.config_read(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid)',
        [...contextValues, configId],
      );
      if (!current) throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
      const title = Object.hasOwn(input, 'title')
        ? requiredText(input.title)
        : (stringValue(current.title) ?? '');
      const description = Object.hasOwn(input, 'description')
        ? optionalText(input.description)
        : stringValue(current.description);
      const [row] = await transaction.unsafe<Row>(
        'select * from private.config_patch(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid, $7::bigint, $8::text, $9::text)',
        [...contextValues, configId, expected, title, description],
      );
      if (!row) throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
      return { status: 200, data: configDto(row), headers: withEtag(row) };
    }
    if (request.method === 'DELETE') {
      const [row] = await transaction.unsafe<Row>(
        'select * from private.config_delete_request(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid)',
        [...contextValues, configId],
      );
      if (!row) throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
      return {
        status: 202,
        data: {
          config_id: uuidValue(row.config_id),
          status: stringValue(row.status),
          row_version: Number(row.row_version),
          delete_requested_at: isoDate(row.delete_requested_at),
        },
      };
    }
  }

  const versionsMatch = /^v1\/configs\/([^/]+)\/versions$/u.exec(path);
  if (versionsMatch && request.method === 'GET') {
    const configId = uuidValue(versionsMatch[1]);
    if (!configId) throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
    const rows = await transaction.unsafe<Row>(
      'select * from private.config_version_list(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid)',
      [...contextValues, configId],
    );
    return { status: 200, data: { items: rows.map(versionDto) } };
  }

  const intentMatch = /^v1\/configs\/([^/]+)\/versions\/upload-intent$/u.exec(
    path,
  );
  if (intentMatch && request.method === 'POST') {
    const configId = uuidValue(intentMatch[1]);
    if (!configId) throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
    const idempotencyKey = request.headers.get('idempotency-key');
    if (!idempotencyKey || idempotencyKey.length > 128)
      throw new ApiFault(400, 'INVALID_INPUT');
    const input = await body(request);
    strictFields(input, [
      'name',
      'size',
      'content_type',
      'schema_key',
      'schema_version',
      'changelog',
    ]);
    const size = input.size;
    if (!Number.isSafeInteger(size) || Number(size) < 1)
      throw new ApiFault(400, 'INVALID_INPUT');
    const [row] = await transaction.unsafe<Row>(
      'select * from private.config_version_intent_create(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid, $7::text, $8::bigint, $9::text, $10::text, $11::text, $12::text, $13::text)',
      [
        ...contextValues,
        configId,
        requiredText(input.name),
        Number(size),
        optionalText(input.content_type),
        requiredText(input.schema_key),
        requiredText(input.schema_version),
        optionalText(input.changelog),
        idempotencyKey,
      ],
    );
    if (!row) throw new ApiFault(503, 'AUTHORIZATION_UNAVAILABLE');
    const versionId = uuidValue(row.version_id);
    if (!versionId) throw new ApiFault(503, 'AUTHORIZATION_UNAVAILABLE');
    return {
      status: 201,
      data: {
        version_id: versionId,
        file_id: uuidValue(row.file_id),
        version_number: Number(row.version_number),
        file_status: stringValue(row.file_status),
        write_outcome: stringValue(row.write_outcome),
        reserved_bytes: Number(row.reserved_bytes),
        intent_expires_at: isoDate(row.intent_expires_at),
        upload_path: `/v1/configs/${configId}/versions/${versionId}/content`,
        upload_method: 'PUT',
      },
    };
  }

  const submissionMatch = /^v1\/configs\/([^/]+)\/gallery-submissions$/u.exec(
    path,
  );
  if (submissionMatch && request.method === 'POST') {
    const configId = uuidValue(submissionMatch[1]);
    if (!configId) throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
    const input = await body(request);
    strictFields(input, ['version_id']);
    const versionId = uuidValue(input.version_id);
    if (!versionId) throw new ApiFault(400, 'INVALID_INPUT');
    const [row] = await transaction.unsafe<Row>(
      'select * from private.config_gallery_submission_create(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid, $7::uuid)',
      [...contextValues, configId, versionId],
    );
    if (!row) throw new ApiFault(503, 'AUTHORIZATION_UNAVAILABLE');
    return {
      status: 201,
      data: {
        submission_id: uuidValue(row.submission_id),
        config_id: uuidValue(row.config_id),
        version_id: uuidValue(row.version_id),
        status: stringValue(row.status),
        submitted_at: isoDate(row.submitted_at),
      },
    };
  }

  if (path === 'v1/config-gallery' && request.method === 'GET') {
    const limit = boundedLimit(url.searchParams.get('limit'));
    const cursor = url.searchParams.get('cursor');
    const cursorId = cursor ? uuidValue(cursor) : null;
    if (cursor && !cursorId) throw new ApiFault(400, 'INVALID_INPUT');
    const rows = await transaction.unsafe<Row>(
      'select * from private.config_gallery_list(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid, $7::integer)',
      [...contextValues, cursorId, limit],
    );
    return {
      status: 200,
      data: { items: rows.map(galleryDto) },
      next_cursor:
        rows.length === limit ? uuidValue(rows.at(-1)?.config_id) : null,
    };
  }

  const galleryMatch = /^v1\/config-gallery\/([^/]+)$/u.exec(path);
  if (galleryMatch && request.method === 'GET') {
    const configId = uuidValue(galleryMatch[1]);
    if (!configId) throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
    const [row] = await transaction.unsafe<Row>(
      'select * from private.config_gallery_read(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid)',
      [...contextValues, configId],
    );
    if (!row) throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
    return { status: 200, data: galleryDto(row) };
  }

  const likeMatch = /^v1\/config-gallery\/([^/]+)\/like$/u.exec(path);
  if (likeMatch && (request.method === 'PUT' || request.method === 'DELETE')) {
    const configId = uuidValue(likeMatch[1]);
    if (!configId) throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
    const [row] = await transaction.unsafe<Row>(
      'select * from private.config_gallery_like_set(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid, $7::boolean)',
      [...contextValues, configId, request.method === 'PUT'],
    );
    if (!row) throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
    return {
      status: 200,
      data: {
        config_id: uuidValue(row.config_id),
        liked: row.liked === true,
        like_count: Number(row.like_count),
      },
    };
  }

  return null;
}
