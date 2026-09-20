/// <reference lib="deno.ns" />

import { generateRedemptionCodes } from '../../../packages/domain/src/redemption.ts';
import { BILLING_ADMIN_ORDER_STATUSES } from '../../../packages/domain/src/contracts/billing.ts';
import {
  type Row,
  type Transaction,
  type AccountApiDependencies,
  type DispatchResult,
  type SessionContext,
  ApiFault,
  UUID,
  stringValue,
  uuidValue,
  hmacHex,
  platformHmacSecrets,
  redemptionHmacSecrets,
  requestId,
  encodeBillingOrderCursor,
  parseBillingOrderCursor,
  adminFileDto,
  adminAuditDto,
  deletionJobDto,
  body,
  expectedVersion,
  withEtag,
  requestPath,
} from './core.ts';

export async function adminStepUp(
  transaction: Transaction,
  session: SessionContext,
  request: Request,
): Promise<void> {
  if (session.aal !== 'aal2') throw new ApiFault(403, 'MFA_REQUIRED');
  const proofId = uuidValue(request.headers.get('x-recent-auth-proof'));
  if (!proofId) throw new ApiFault(403, 'RECENT_MFA_REQUIRED');
  const [row] = await transaction.unsafe<Row>(
    'select private.admin_step_up_valid($1::uuid, $2::uuid, $3::uuid) as valid',
    [session.userId, session.sessionId, proofId],
  );
  if (!row?.valid) throw new ApiFault(403, 'RECENT_MFA_REQUIRED');
}

export function adminContextValues(session: SessionContext): unknown[] {
  return [session.userId, session.sessionId, requestId()];
}

export function boundedLimit(value: string | null): number {
  const parsed = Number.parseInt(value ?? '20', 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100)
    throw new ApiFault(400, 'INVALID_INPUT');
  return parsed;
}

function randomBase64Url(bytes: number): string {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return btoa(String.fromCharCode(...value))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

async function generatedPlatformKey(
  dependencies: AccountApiDependencies,
  platformId: string,
  version: number,
): Promise<{
  readonly keyId: string;
  readonly presentedKey: string;
  readonly keyHmac: string;
  readonly keyPrefix: string;
  readonly keySuffix: string;
}> {
  const keyId = crypto.randomUUID();
  const presentedKey = `phk_v${version}_${keyId}_${randomBase64Url(32)}`;
  const secret = platformHmacSecrets(dependencies)[0];
  if (!secret) throw new ApiFault(503, 'AUTHORIZATION_UNAVAILABLE');
  const keyHmac = await hmacHex(
    secret,
    `${version}:platform-key:${keyId}:${presentedKey}`,
  );
  return {
    keyId,
    presentedKey,
    keyHmac,
    keyPrefix: presentedKey.slice(0, 12),
    keySuffix: presentedKey.slice(-8),
  };
}

export async function dispatchAdmin(
  request: Request,
  transaction: Transaction,
  dependencies: AccountApiDependencies,
  session: SessionContext,
): Promise<DispatchResult> {
  const url = new URL(request.url);
  const path = requestPath(request);
  const context = adminContextValues(session);
  if (path === 'admin/api/v1/auth/recent-proof' && request.method === 'POST') {
    if (session.aal !== 'aal2') throw new ApiFault(403, 'MFA_REQUIRED');
    const factorId = uuidValue(request.headers.get('x-mfa-factor-id'));
    if (!factorId) throw new ApiFault(400, 'INVALID_INPUT');
    const [proof] = await transaction.unsafe<Row>(
      'select * from private.admin_step_up_issue(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::uuid)',
      [...context, factorId],
    );
    if (!proof) throw new ApiFault(403, 'MFA_REQUIRED');
    return { status: 201, data: proof };
  }
  if (session.aal !== 'aal2') throw new ApiFault(403, 'MFA_REQUIRED');
  if (path === 'admin/api/v1/platforms' && request.method === 'GET') {
    const rows = await transaction.unsafe<Row>(
      'select * from private.admin_platform_list_v2(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::text, $5::integer)',
      [
        ...context,
        url.searchParams.get('q'),
        boundedLimit(url.searchParams.get('limit')),
      ],
    );
    return { status: 200, data: rows };
  }

  if (path === 'admin/api/v1/config-files' && request.method === 'GET') {
    const platformIdValue = url.searchParams.get('platform_id');
    const platformId =
      platformIdValue === null ? null : uuidValue(platformIdValue);
    if (platformIdValue !== null && !platformId)
      throw new ApiFault(400, 'INVALID_INPUT');
    const cursorValue = url.searchParams.get('cursor');
    const cursor = cursorValue === null ? null : uuidValue(cursorValue);
    if (cursorValue !== null && !cursor)
      throw new ApiFault(400, 'INVALID_INPUT');
    const limit = boundedLimit(url.searchParams.get('limit'));
    const rows = await transaction.unsafe<Row>(
      'select * from private.admin_file_list_v3(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::uuid, $5::uuid, $6::integer, $7::text)',
      [...context, platformId, cursor, limit, url.searchParams.get('q')],
    );
    return {
      status: 200,
      data: rows.map(adminFileDto),
      next_cursor:
        rows.length === limit ? uuidValue(rows.at(-1)?.file_id) : null,
    };
  }
  if (path === 'admin/api/v1/deletion-jobs' && request.method === 'GET') {
    const rows = await transaction.unsafe<Row>(
      'select * from private.admin_deletion_job_list(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::integer)',
      [...context, boundedLimit(url.searchParams.get('limit'))],
    );
    return { status: 200, data: rows.map(deletionJobDto) };
  }
  if (path === 'admin/api/v1/audit' && request.method === 'GET') {
    const cursorValue = url.searchParams.get('cursor');
    const cursor = cursorValue === null ? null : uuidValue(cursorValue);
    if (cursorValue !== null && !cursor)
      throw new ApiFault(400, 'INVALID_INPUT');
    const rows = await transaction.unsafe<Row>(
      'select * from private.admin_audit_list(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::uuid, $5::integer, $6::text)',
      [
        ...context,
        cursor,
        boundedLimit(url.searchParams.get('limit')),
        url.searchParams.get('q'),
      ],
    );
    return {
      status: 200,
      data: rows.map(adminAuditDto),
      next_cursor:
        rows.length === boundedLimit(url.searchParams.get('limit'))
          ? uuidValue(rows.at(-1)?.audit_id)
          : null,
    };
  }
  if (path === 'admin/api/v1/billing/orders' && request.method === 'GET') {
    const cursorValue = url.searchParams.get('cursor');
    const cursor =
      cursorValue === null ? null : parseBillingOrderCursor(cursorValue);
    const status = url.searchParams.get('status');
    if (
      status !== null &&
      !(BILLING_ADMIN_ORDER_STATUSES as readonly string[]).includes(status)
    )
      throw new ApiFault(400, 'INVALID_INPUT');
    const limit = boundedLimit(url.searchParams.get('limit'));
    const platformId = url.searchParams.get('platform_id');
    const platformAccountId = url.searchParams.get('platform_account_id');
    const providerAccountId = url.searchParams.get('provider_account_id');
    const queryValue = url.searchParams.get('q');
    const query = queryValue?.trim() || null;
    if (
      (platformId !== null && !uuidValue(platformId)) ||
      (platformAccountId !== null && !uuidValue(platformAccountId)) ||
      (providerAccountId !== null && !uuidValue(providerAccountId)) ||
      (query !== null && query.length > 128) ||
      (cursorValue !== null && cursor === null)
    )
      throw new ApiFault(400, 'INVALID_INPUT');
    if (
      cursor &&
      'legacyCreatedAt' in cursor &&
      (platformId !== null ||
        platformAccountId !== null ||
        providerAccountId !== null ||
        query !== null)
    )
      throw new ApiFault(400, 'INVALID_INPUT');
    const rows = await transaction.unsafe<Row>(
      cursor && 'legacyCreatedAt' in cursor
        ? 'select * from private.admin_billing_order_list(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::timestamptz, $5::integer, $6::text)'
        : 'select * from private.admin_billing_order_list_v2(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::timestamptz, $5::uuid, $6::integer, $7::text, $8::uuid, $9::uuid, $10::uuid, $11::text)',
      cursor && 'legacyCreatedAt' in cursor
        ? [...context, cursor.legacyCreatedAt, limit, status]
        : [
            ...context,
            cursor && 'createdAt' in cursor ? cursor.createdAt : null,
            cursor && 'createdAt' in cursor ? cursor.orderId : null,
            limit,
            status,
            platformId === null ? null : uuidValue(platformId),
            platformAccountId === null ? null : uuidValue(platformAccountId),
            providerAccountId === null ? null : uuidValue(providerAccountId),
            query,
          ],
    );
    const nextCursor =
      rows.length === limit ? encodeBillingOrderCursor(rows.at(-1)!) : null;
    if (rows.length === limit && !nextCursor)
      throw new ApiFault(503, 'AUTHORIZATION_UNAVAILABLE');
    return {
      status: 200,
      data: rows,
      next_cursor: nextCursor,
    };
  }
  if (path === 'admin/api/v1/billing/metrics' && request.method === 'GET') {
    const [result] = await transaction.unsafe<Row>(
      'select * from private.admin_billing_observability(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context)',
      context,
    );
    return { status: 200, data: result ?? null };
  }
  if (
    path === 'admin/api/v1/billing/provider-products' &&
    request.method === 'GET'
  ) {
    const providerAccountId = url.searchParams.get('provider_account_id');
    if (providerAccountId !== null && !uuidValue(providerAccountId))
      throw new ApiFault(400, 'INVALID_INPUT');
    const rows = await transaction.unsafe<Row>(
      'select * from private.admin_billing_provider_product_list(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::uuid)',
      [
        ...context,
        providerAccountId === null ? null : uuidValue(providerAccountId),
      ],
    );
    return { status: 200, data: rows };
  }
  const billingOrderMatch = /^admin\/api\/v1\/billing\/orders\/([^/]+)$/u.exec(
    path,
  );
  if (
    billingOrderMatch &&
    UUID.test(billingOrderMatch[1]!) &&
    request.method === 'GET'
  ) {
    const [result] = await transaction.unsafe<Row>(
      'select * from private.admin_billing_order_read_v3(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::uuid)',
      [...context, billingOrderMatch[1]],
    );
    if (!result) throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
    return {
      status: 200,
      data: result,
      headers: Number.isSafeInteger(Number(result.admin_version))
        ? { ETag: `W/"${Number(result.admin_version)}"` }
        : undefined,
    };
  }
  const billingRequeryMatch =
    /^admin\/api\/v1\/billing\/orders\/([^/]+)\/requery$/u.exec(path);
  if (
    billingRequeryMatch &&
    UUID.test(billingRequeryMatch[1]!) &&
    request.method === 'POST'
  ) {
    await adminStepUp(transaction, session, request);
    const input = await body(request);
    const operationId = uuidValue(input.operation_id);
    const reason = stringValue(input.reason);
    if (!operationId || !reason) throw new ApiFault(400, 'INVALID_INPUT');
    const [result] = await transaction.unsafe<Row>(
      'select * from private.admin_billing_order_requery(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::uuid, $5::uuid, $6::bigint, $7::text)',
      [
        ...context,
        billingRequeryMatch[1],
        operationId,
        expectedVersion(request),
        reason,
      ],
    );
    if (!result) throw new ApiFault(503, 'AUTHORIZATION_UNAVAILABLE');
    return { status: 202, data: result };
  }
  const billingResolveMatch =
    /^admin\/api\/v1\/billing\/orders\/([^/]+)\/resolve$/u.exec(path);
  if (
    billingResolveMatch &&
    UUID.test(billingResolveMatch[1]!) &&
    request.method === 'POST'
  ) {
    await adminStepUp(transaction, session, request);
    const input = await body(request);
    const operationId = uuidValue(input.operation_id);
    const decision = stringValue(input.decision);
    const reason = stringValue(input.reason);
    if (!operationId || !decision || !reason)
      throw new ApiFault(400, 'INVALID_INPUT');
    const [result] = await transaction.unsafe<Row>(
      'select * from private.admin_billing_order_resolve(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::uuid, $5::uuid, $6::bigint, $7::text, $8::text)',
      [
        ...context,
        billingResolveMatch[1],
        operationId,
        expectedVersion(request),
        decision,
        reason,
      ],
    );
    if (!result) throw new ApiFault(503, 'AUTHORIZATION_UNAVAILABLE');
    return { status: 200, data: result };
  }
  if (path === 'admin/api/v1/deletion-jobs' && request.method === 'POST') {
    await adminStepUp(transaction, session, request);
    const requestId = uuidValue((await body(request)).request_id);
    const proofId = uuidValue(request.headers.get('x-recent-auth-proof'));
    const idempotencyKey = request.headers.get('idempotency-key');
    if (
      !requestId ||
      !proofId ||
      !idempotencyKey ||
      idempotencyKey.length > 128
    )
      throw new ApiFault(400, 'INVALID_INPUT');
    const [row] = await transaction.unsafe<Row>(
      'select * from private.admin_deletion_job_start(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::uuid, $5::uuid, $6::text)',
      [...context, requestId, proofId, idempotencyKey],
    );
    if (!row) throw new ApiFault(503, 'AUTHORIZATION_UNAVAILABLE');
    return { status: 202, data: deletionJobDto(row) };
  }
  const deletionJobMatch = /^admin\/api\/v1\/deletion-jobs\/([^/]+)$/u.exec(
    path,
  );
  if (deletionJobMatch && UUID.test(deletionJobMatch[1]!)) {
    const jobId = deletionJobMatch[1]!;
    if (request.method === 'GET') {
      const [row] = await transaction.unsafe<Row>(
        'select * from private.admin_deletion_job_read(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::uuid)',
        [...context, jobId],
      );
      if (!row) throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
      return { status: 200, data: deletionJobDto(row) };
    }
  }
  const deletionRetryMatch =
    /^admin\/api\/v1\/deletion-jobs\/([^/]+)\/retry$/u.exec(path);
  if (
    deletionRetryMatch &&
    UUID.test(deletionRetryMatch[1]!) &&
    request.method === 'POST'
  ) {
    await adminStepUp(transaction, session, request);
    const proofId = uuidValue(request.headers.get('x-recent-auth-proof'));
    const idempotencyKey = request.headers.get('idempotency-key');
    if (!proofId || !idempotencyKey || idempotencyKey.length > 128)
      throw new ApiFault(400, 'INVALID_INPUT');
    const [row] = await transaction.unsafe<Row>(
      'select * from private.admin_deletion_job_retry(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::uuid, $5::uuid, $6::text)',
      [...context, deletionRetryMatch[1], proofId, idempotencyKey],
    );
    if (!row) throw new ApiFault(503, 'AUTHORIZATION_UNAVAILABLE');
    return { status: 202, data: deletionJobDto(row) };
  }
  const policyMatch = /^admin\/api\/v1\/platforms\/([^/]+)\/file-policy$/u.exec(
    path,
  );
  if (policyMatch && UUID.test(policyMatch[1]!)) {
    const platformId = policyMatch[1]!;
    if (request.method === 'GET') {
      const [result] = await transaction.unsafe<Row>(
        'select * from private.admin_file_policy_read(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::uuid)',
        [...context, platformId],
      );
      if (!result) throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
      return { status: 200, data: result };
    }
    if (request.method === 'PATCH') {
      await adminStepUp(transaction, session, request);
      const input = await body(request);
      const enabled = input.enabled;
      const maxFileBytes = Number(input.max_file_bytes);
      const maxFiles = Number(input.max_files);
      const maxTotalBytes = Number(input.max_total_bytes);
      if (
        typeof enabled !== 'boolean' ||
        !Number.isSafeInteger(maxFileBytes) ||
        !Number.isSafeInteger(maxFiles) ||
        !Number.isSafeInteger(maxTotalBytes)
      )
        throw new ApiFault(400, 'INVALID_INPUT');
      const [result] = await transaction.unsafe<Row>(
        'select * from private.admin_file_policy_update(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::uuid, $5::boolean, $6::bigint, $7::integer, $8::bigint)',
        [
          ...context,
          platformId,
          enabled,
          maxFileBytes,
          maxFiles,
          maxTotalBytes,
        ],
      );
      if (!result) throw new ApiFault(503, 'AUTHORIZATION_UNAVAILABLE');
      return { status: 200, data: result };
    }
  }
  const adminFileMatch = /^admin\/api\/v1\/config-files\/([^/]+)$/u.exec(path);
  if (adminFileMatch && request.method === 'GET') {
    const fileId = uuidValue(adminFileMatch[1]);
    if (!fileId) throw new ApiFault(400, 'INVALID_INPUT');
    const [result] = await transaction.unsafe<Row>(
      'select * from private.admin_file_read(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::uuid)',
      [...context, fileId],
    );
    if (!result) throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
    return { status: 200, data: adminFileDto(result) };
  }
  if (adminFileMatch && request.method === 'DELETE') {
    await adminStepUp(transaction, session, request);
    const fileId = uuidValue(adminFileMatch[1]);
    const proofId = uuidValue(request.headers.get('x-recent-auth-proof'));
    const idempotencyKey = request.headers.get('idempotency-key');
    if (!fileId || !proofId || !idempotencyKey || idempotencyKey.length > 128)
      throw new ApiFault(400, 'INVALID_INPUT');
    const [result] = await transaction.unsafe<Row>(
      'select * from private.admin_file_delete_request(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::uuid, $5::uuid, $6::text)',
      [...context, fileId, proofId, idempotencyKey],
    );
    if (!result) throw new ApiFault(503, 'AUTHORIZATION_UNAVAILABLE');
    return { status: 202, data: adminFileDto(result) };
  }
  if (path === 'admin/api/v1/platforms' && request.method === 'POST') {
    const input = await body(request);
    const [result] = await transaction.unsafe<Row>(
      'select * from private.admin_platform_create(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::text, $5::text, $6::text, $7::boolean, $8::text, $9::jsonb)',
      [
        ...context,
        input.code,
        input.name,
        input.status ?? 'active',
        input.allow_activation ?? true,
        input.default_locale ?? null,
        transaction.json(input.config ?? {}),
      ],
    );
    return { status: 201, data: result };
  }

  const platformMatch = /^admin\/api\/v1\/platforms\/([^/]+)$/u.exec(path);
  if (platformMatch && UUID.test(platformMatch[1]!)) {
    const platformId = platformMatch[1]!;
    if (request.method === 'GET') {
      const [result] = await transaction.unsafe<Row>(
        'select * from private.admin_platform_get(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::uuid)',
        [...context, platformId],
      );
      if (!result) throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
      return { status: 200, data: result };
    }
    if (request.method === 'PATCH') {
      const input = await body(request);
      if (
        (typeof input.status !== 'string' && input.status !== undefined) ||
        (typeof input.allow_activation !== 'boolean' &&
          input.allow_activation !== undefined)
      )
        throw new ApiFault(400, 'INVALID_INPUT');
      const [current] = await transaction.unsafe<Row>(
        'select * from private.admin_platform_get(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::uuid)',
        [...context, platformId],
      );
      if (!current) throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
      const [result] = await transaction.unsafe<Row>(
        'select * from private.admin_platform_update(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::uuid, $5::text, $6::boolean)',
        [
          ...context,
          platformId,
          input.status ?? current.status,
          input.allow_activation ?? current.allow_activation,
        ],
      );
      return { status: 200, data: result };
    }
  }

  const originsMatch = /^admin\/api\/v1\/platforms\/([^/]+)\/origins$/u.exec(
    path,
  );
  if (originsMatch && UUID.test(originsMatch[1]!)) {
    const platformId = originsMatch[1]!;
    if (request.method === 'GET') {
      const rows = await transaction.unsafe<Row>(
        'select * from private.admin_origin_list_v2(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::uuid, $5::text)',
        [...context, platformId, url.searchParams.get('q')],
      );
      return { status: 200, data: rows };
    }
    if (request.method === 'POST') {
      const input = await body(request);
      const [result] = await transaction.unsafe<Row>(
        'select * from private.admin_origin_create(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::uuid, $5::text, $6::text, $7::text, $8::text, $9::text)',
        [
          ...context,
          platformId,
          input.environment,
          input.origin,
          input.oauth_callback_url,
          input.password_reset_url,
          input.email_confirmation_url,
        ],
      );
      return { status: 201, data: result };
    }
  }

  const accountsMatch = /^admin\/api\/v1\/platforms\/([^/]+)\/accounts$/u.exec(
    path,
  );
  if (
    accountsMatch &&
    UUID.test(accountsMatch[1]!) &&
    request.method === 'GET'
  ) {
    const rows = await transaction.unsafe<Row>(
      'select * from private.admin_account_list_v2(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::uuid, $5::text, $6::integer)',
      [
        ...context,
        accountsMatch[1],
        url.searchParams.get('q'),
        boundedLimit(url.searchParams.get('limit')),
      ],
    );
    return { status: 200, data: rows };
  }

  const accountMatch =
    /^admin\/api\/v1\/platforms\/([^/]+)\/accounts\/([^/]+)$/u.exec(path);
  if (
    accountMatch &&
    UUID.test(accountMatch[1]!) &&
    UUID.test(accountMatch[2]!)
  ) {
    const platformId = accountMatch[1]!;
    const accountId = accountMatch[2]!;
    if (request.method === 'GET') {
      const [result] = await transaction.unsafe<Row>(
        'select * from private.admin_account_get(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::uuid, $5::uuid)',
        [...context, platformId, accountId],
      );
      if (!result) throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
      return { status: 200, data: result };
    }
    if (request.method === 'PATCH') {
      const input = await body(request);
      const status = stringValue(input.status);
      if (!status) throw new ApiFault(400, 'INVALID_INPUT');
      const [result] = await transaction.unsafe<Row>(
        'select * from private.admin_account_patch(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::uuid, $5::uuid, $6::text)',
        [...context, platformId, accountId, status],
      );
      return { status: 200, data: result };
    }
  }

  const accountActionMatch =
    /^admin\/api\/v1\/platforms\/([^/]+)\/accounts\/([^/]+)\/(suspend|restore|close)$/u.exec(
      path,
    );
  if (
    accountActionMatch &&
    UUID.test(accountActionMatch[1]!) &&
    UUID.test(accountActionMatch[2]!)
  ) {
    const action = accountActionMatch[3]!;
    if (action === 'suspend' || action === 'close')
      await adminStepUp(transaction, session, request);
    const [result] = await transaction.unsafe<Row>(
      'select * from private.admin_account_transition(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::uuid, $5::uuid, $6::text)',
      [...context, accountActionMatch[1], accountActionMatch[2], action],
    );
    return { status: action === 'close' ? 202 : 200, data: result };
  }

  const keysMatch = /^admin\/api\/v1\/platforms\/([^/]+)\/keys$/u.exec(path);
  if (keysMatch && UUID.test(keysMatch[1]!)) {
    const platformId = keysMatch[1]!;
    if (request.method === 'GET') {
      const rows = await transaction.unsafe<Row>(
        'select * from private.admin_platform_key_list_v3(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::uuid, $5::text)',
        [...context, platformId, url.searchParams.get('q')],
      );
      return { status: 200, data: rows };
    }
    if (request.method === 'POST') {
      await adminStepUp(transaction, session, request);
      const input = await body(request);
      const version = Number(input.hmac_key_version ?? 1);
      if (
        !Number.isInteger(version) ||
        version < 1 ||
        typeof input.name !== 'string'
      )
        throw new ApiFault(400, 'INVALID_INPUT');
      const material = await generatedPlatformKey(
        dependencies,
        platformId,
        version,
      );
      const operationId =
        uuidValue(input.creation_operation_id) ?? crypto.randomUUID();
      const [result] = await transaction.unsafe<Row>(
        'select * from private.admin_platform_key_create(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::uuid, $5::uuid, $6::text, $7::text, $8::integer, $9::text, $10::text, $11::uuid, $12::timestamptz)',
        [
          ...context,
          platformId,
          material.keyId,
          input.name,
          material.keyHmac,
          version,
          material.keyPrefix,
          material.keySuffix,
          operationId,
          input.expires_at ?? null,
        ],
      );
      return {
        status: 201,
        data: { ...result, presented_key: material.presentedKey },
      };
    }
  }

  const confirmDeploymentMatch =
    /^admin\/api\/v1\/platforms\/([^/]+)\/keys\/([^/]+)\/confirm-deployment$/u.exec(
      path,
    );
  if (
    confirmDeploymentMatch &&
    UUID.test(confirmDeploymentMatch[1]!) &&
    UUID.test(confirmDeploymentMatch[2]!) &&
    request.method === 'POST'
  ) {
    await adminStepUp(transaction, session, request);
    const [result] = await transaction.unsafe<Row>(
      'select * from private.admin_platform_key_confirm_deployment(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::uuid, $5::uuid)',
      [...context, confirmDeploymentMatch[1], confirmDeploymentMatch[2]],
    );
    return { status: 200, data: result };
  }

  const revokeKeyMatch =
    /^admin\/api\/v1\/platforms\/([^/]+)\/keys\/([^/]+)\/revoke$/u.exec(path);
  if (
    revokeKeyMatch &&
    UUID.test(revokeKeyMatch[1]!) &&
    UUID.test(revokeKeyMatch[2]!) &&
    request.method === 'POST'
  ) {
    await adminStepUp(transaction, session, request);
    const [result] = await transaction.unsafe<Row>(
      'select * from private.admin_platform_key_revoke(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::uuid, $5::uuid)',
      [...context, revokeKeyMatch[1], revokeKeyMatch[2]],
    );
    return { status: 200, data: result };
  }

  const planMatch = /^admin\/api\/v1\/platforms\/([^/]+)\/plans$/u.exec(path);
  if (planMatch && UUID.test(planMatch[1]!)) {
    const platformId = planMatch[1]!;
    if (request.method === 'GET') {
      const rows = await transaction.unsafe<Row>(
        'select * from private.admin_plan_list(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::uuid)',
        [...context, platformId],
      );
      return { status: 200, data: rows };
    }
    if (request.method === 'POST') {
      await adminStepUp(transaction, session, request);
      const input = await body(request);
      const planId = uuidValue(input.plan_id);
      const [result] = await transaction.unsafe<Row>(
        'select * from private.admin_plan_upsert(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::uuid, $5::uuid, $6::text, $7::text, $8::text, $9::text, $10::jsonb, $11::text, $12::boolean, $13::boolean)',
        [
          ...context,
          platformId,
          planId,
          input.code,
          input.name,
          input.description ?? null,
          input.kind,
          transaction.json(input.features ?? {}),
          input.status ?? 'active',
          input.make_default ?? false,
          input.clear_default ?? false,
        ],
      );
      return { status: planId ? 200 : 201, data: result };
    }
  }

  const subscriptionConfigMatch =
    /^admin\/api\/v1\/platforms\/([^/]+)\/subscription-config$/u.exec(path);
  if (subscriptionConfigMatch && UUID.test(subscriptionConfigMatch[1]!)) {
    const platformId = subscriptionConfigMatch[1]!;
    if (request.method === 'GET') {
      const [result] = await transaction.unsafe<Row>(
        'select * from private.admin_subscription_config_read_v2(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::uuid)',
        [...context, platformId],
      );
      if (!result) throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
      return { status: 200, data: result, headers: withEtag(result) };
    }
    if (request.method === 'PATCH') {
      await adminStepUp(transaction, session, request);
      const input = await body(request);
      const paidPlanId =
        input.paid_plan_id === null ? null : uuidValue(input.paid_plan_id);
      const copy =
        input.subscription_copy_override === null
          ? null
          : stringValue(input.subscription_copy_override);
      const reason = stringValue(input.reason);
      if (
        (input.paid_plan_id !== null && !paidPlanId) ||
        typeof input.purchases_paused !== 'boolean' ||
        typeof input.monthly_enabled !== 'boolean' ||
        typeof input.yearly_enabled !== 'boolean' ||
        typeof input.lifetime_enabled !== 'boolean' ||
        (input.subscription_copy_override !== null && copy === null) ||
        !reason
      )
        throw new ApiFault(400, 'INVALID_INPUT');
      const [result] = await transaction.unsafe<Row>(
        'select * from private.admin_subscription_config_patch_v2(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::uuid, $5::bigint, $6::uuid, $7::boolean, $8::boolean, $9::boolean, $10::boolean, $11::text, $12::text)',
        [
          ...context,
          platformId,
          expectedVersion(request),
          paidPlanId,
          input.purchases_paused,
          input.monthly_enabled,
          input.yearly_enabled,
          input.lifetime_enabled,
          copy,
          reason,
        ],
      );
      if (!result) throw new ApiFault(503, 'AUTHORIZATION_UNAVAILABLE');
      return { status: 200, data: result, headers: withEtag(result) };
    }
  }

  const batchCollection = /^admin\/api\/v1\/redemption-batches$/u.test(path);
  if (batchCollection) {
    const platformId = uuidValue(url.searchParams.get('platform_id'));
    if (request.method === 'GET') {
      if (!platformId) throw new ApiFault(400, 'INVALID_INPUT');
      const limit = Number.parseInt(url.searchParams.get('limit') ?? '20', 10);
      const rows = await transaction.unsafe<Row>(
        'select * from private.admin_batch_list(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::uuid, $5::integer)',
        [...context, platformId, limit],
      );
      return { status: 200, data: rows };
    }
    if (request.method === 'POST') {
      await adminStepUp(transaction, session, request);
      const input = await body(request);
      const inputPlatformId = uuidValue(input.platform_id);
      const planId = uuidValue(input.plan_id);
      const productCode = stringValue(input.product_code)?.trim().toLowerCase();
      const batchName = stringValue(input.name);
      const quantity = Number(input.quantity);
      const creationOperationId = uuidValue(input.creation_operation_id);
      const expiresAt = stringValue(input.expires_at);
      const deliveryDeadline = stringValue(input.delivery_deadline);
      if (
        !inputPlatformId ||
        (!planId && !productCode) ||
        (productCode !== undefined &&
          !['monthly', 'yearly', 'lifetime'].includes(productCode)) ||
        (productCode === undefined && !planId) ||
        !batchName ||
        !creationOperationId ||
        !expiresAt ||
        !deliveryDeadline ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 1000
      )
        throw new ApiFault(400, 'INVALID_INPUT');
      if (
        !productCode &&
        (!Number.isInteger(Number(input.duration_value)) ||
          Number(input.duration_value) <= 0 ||
          !['day', 'month', 'year'].includes(String(input.duration_unit)))
      )
        throw new ApiFault(400, 'INVALID_INPUT');
      const currentRedemptionSecret = redemptionHmacSecrets(dependencies)[0];
      if (!currentRedemptionSecret)
        throw new ApiFault(503, 'AUTHORIZATION_UNAVAILABLE');
      const { secret, version } = currentRedemptionSecret;
      const codes = await generateRedemptionCodes({
        platformId: inputPlatformId,
        hmacSecret: secret,
        hmacKeyVersion: version,
        quantity,
      });
      const receipt = `${crypto.randomUUID()}${crypto.randomUUID()}`;
      const receiptHmac = await hmacHex(
        secret,
        `delivery:v1:platform:${inputPlatformId}:receipt:${receipt}`,
      );
      const codePayload = transaction.json(
        codes.map((code) => ({
          code_hmac: code.codeHmac,
          hmac_key_version: code.hmacKeyVersion,
          code_prefix: code.codePrefix,
          code_suffix: code.codeSuffix,
        })),
      );
      const [result] = productCode
        ? await transaction.unsafe<Row>(
            'select * from private.admin_batch_create_v2(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::uuid, $5::text, $6::text, $7::integer, $8::timestamptz, $9::timestamptz, $10::uuid, $11::text, $12::jsonb)',
            [
              ...context,
              inputPlatformId,
              productCode,
              batchName,
              quantity,
              expiresAt,
              deliveryDeadline,
              creationOperationId,
              receiptHmac,
              codePayload,
            ],
          )
        : await transaction.unsafe<Row>(
            'select * from private.admin_batch_create(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::uuid, $5::uuid, $6::text, $7::integer, $8::integer, $9::text, $10::timestamptz, $11::timestamptz, $12::uuid, $13::text, $14::jsonb)',
            [
              ...context,
              inputPlatformId,
              planId,
              batchName,
              quantity,
              Number(input.duration_value),
              input.duration_unit,
              expiresAt,
              deliveryDeadline,
              creationOperationId,
              receiptHmac,
              codePayload,
            ],
          );
      if (result?.creation_state === 'replayed_existing') {
        return {
          status: 200,
          data: {
            batch_id: result.batch_id,
            status: result.status,
            quantity: result.quantity,
            creation_state: result.creation_state,
          },
        };
      }
      if (result?.creation_state !== 'created')
        throw new ApiFault(503, 'AUTHORIZATION_UNAVAILABLE');
      return {
        status: 201,
        data: { ...result, delivery_receipt: receipt, codes },
      };
    }
  }

  const confirmMatch =
    /^admin\/api\/v1\/redemption-batches\/([^/]+)\/(confirm-delivery|disable)$/u.exec(
      path,
    );
  if (confirmMatch && UUID.test(confirmMatch[1]!)) {
    await adminStepUp(transaction, session, request);
    const input = await body(request);
    const platformId = uuidValue(input.platform_id);
    if (!platformId) throw new ApiFault(400, 'INVALID_INPUT');
    if (confirmMatch[2] === 'confirm-delivery') {
      const receipt = stringValue(input.delivery_receipt);
      if (!receipt) throw new ApiFault(400, 'INVALID_INPUT');
      const receiptHmacs = await Promise.all(
        redemptionHmacSecrets(dependencies).map(({ secret }) =>
          hmacHex(
            secret,
            `delivery:v1:platform:${platformId}:receipt:${receipt}`,
          ),
        ),
      );
      const [result] = await transaction.unsafe<Row>(
        'select * from private.admin_batch_confirm_candidates(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::uuid, $5::uuid, $6::text[])',
        [...context, platformId, confirmMatch[1], receiptHmacs],
      );
      return { status: 200, data: result };
    }
    const [result] = await transaction.unsafe<Row>(
      'select * from private.admin_batch_disable(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::uuid, $5::uuid)',
      [...context, platformId, confirmMatch[1]],
    );
    return { status: 200, data: result };
  }

  const subscriptionMatch =
    /^admin\/api\/v1\/subscriptions\/([^/]+)(?:\/commands)?$/u.exec(path);
  if (subscriptionMatch && UUID.test(subscriptionMatch[1]!)) {
    const platformId = uuidValue(url.searchParams.get('platform_id'));
    if (!platformId) throw new ApiFault(400, 'INVALID_INPUT');
    if (path.endsWith('/commands')) {
      await adminStepUp(transaction, session, request);
      const input = await body(request);
      const [result] = await transaction.unsafe<Row>(
        'select * from private.admin_entitlement_command(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::uuid, $5::uuid, $6::text, $7::uuid, $8::uuid, $9::integer, $10::text, $11::uuid, $12::text)',
        [
          ...context,
          platformId,
          subscriptionMatch[1],
          input.action,
          input.operation_id,
          input.plan_id ?? null,
          input.duration_value ?? null,
          input.duration_unit ?? null,
          input.grant_id ?? null,
          input.reason,
        ],
      );
      return { status: 200, data: result };
    }
    const [result] = await transaction.unsafe<Row>(
      'select * from private.admin_subscription_read(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::uuid, $5::uuid)',
      [...context, platformId, subscriptionMatch[1]],
    );
    return { status: 200, data: result };
  }

  throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
}
