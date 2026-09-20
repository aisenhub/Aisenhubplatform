/// <reference lib="deno.ns" />

import { normalizeRedemptionCode } from '../../../packages/domain/src/redemption.ts';
import {
  billingSwitchEnabled,
  deriveCheckoutToken,
} from '../_shared/billing.ts';
import {
  type Row,
  type Transaction,
  type AccountApiDependencies,
  type DispatchResult,
  type SessionContext,
  ApiFault,
  stringValue,
  uuidValue,
  objectValue,
  hmacHex,
  redemptionHmacSecrets,
  verifyPlatformKey,
  principalFromPresentedKey,
  principalDto,
  assertAllowed,
  accountContextValues,
  isoDate,
  fileDto,
  fileBudgetDto,
  entitlementDto,
  subscriptionProductDto,
  subscriptionCheckoutDto,
  checkoutPaymentUrl,
  body,
  expectedVersion,
  withEtag,
  requestPath,
} from './core.ts';
import { boundedLimit } from './admin.ts';

export async function dispatchAccount(
  request: Request,
  transaction: Transaction,
  dependencies: AccountApiDependencies,
  session?: SessionContext,
  reauthSession?: SessionContext,
): Promise<DispatchResult> {
  const path = requestPath(request);

  if (
    (path === 'v1/plans' || path === 'v1/subscription/products') &&
    request.method === 'GET'
  ) {
    const key = await verifyPlatformKey(transaction, request, dependencies);
    if (key.platformStatus !== 'active')
      throw new ApiFault(403, 'PLATFORM_DISABLED');
    if (path === 'v1/subscription/products') {
      const rows = await transaction.unsafe<Row>(
        'select * from private.subscription_products_list($1::uuid, $2::uuid)',
        [key.platformId, key.keyId],
      );
      return {
        status: 200,
        data: rows.map((row) => subscriptionProductDto(row)),
      };
    }
    const rows = await transaction.unsafe<Row>(
      'select * from private.public_plans_list($1::uuid, $2::uuid)',
      [key.platformId, key.keyId],
    );
    return {
      status: 200,
      data: rows.map((row) => ({
        code: row.code,
        name: row.name,
        description: row.description ?? null,
        kind: row.kind,
        features: objectValue(row.features),
      })),
    };
  }

  if (!session) {
    await verifyPlatformKey(transaction, request, dependencies);
    throw new ApiFault(401, 'UNAUTHORIZED');
  }
  if (path === 'v1/auth/recent-proof' && request.method === 'POST') {
    const key = await verifyPlatformKey(transaction, request, dependencies);
    if (
      !reauthSession ||
      reauthSession.userId !== session.userId ||
      reauthSession.sessionId === session.sessionId
    )
      throw new ApiFault(403, 'RECENT_MFA_REQUIRED');
    const [proof] = await transaction.unsafe<Row>(
      'select * from private.user_recent_auth_proof_issue(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid, $7::text)',
      [
        ...accountContextValues(session, key),
        reauthSession.sessionId,
        'email_otp',
      ],
    );
    if (!proof) throw new ApiFault(403, 'RECENT_MFA_REQUIRED');
    return { status: 201, data: proof };
  }

  const { key, row } = await principalFromPresentedKey(
    transaction,
    request,
    dependencies,
    session,
  );
  if (path === 'v1/account/principal' && request.method === 'GET') {
    return { status: 200, data: principalDto(row, key, session) };
  }

  const contextValues = accountContextValues(session, key);
  if (path === 'v1/subscription/checkout' && request.method === 'GET') {
    assertAllowed(row);
    const idempotencyKey = request.headers.get('idempotency-key');
    if (!idempotencyKey || idempotencyKey.length > 128)
      throw new ApiFault(400, 'INVALID_INPUT');
    const [checkout] = await transaction.unsafe<Row>(
      'select * from private.subscription_checkout_read_by_idempotency(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::text)',
      [...contextValues, idempotencyKey],
    );
    if (!checkout) throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
    return {
      status: 200,
      data: subscriptionCheckoutDto(
        checkout,
        await checkoutPaymentUrl(
          transaction,
          contextValues,
          checkout,
          dependencies,
        ),
      ),
    };
  }
  if (path === 'v1/subscription/checkout' && request.method === 'POST') {
    assertAllowed(row);
    if (
      !(
        dependencies.checkoutEnabled ??
        billingSwitchEnabled('BILLING_CHECKOUT_ENABLED', false)
      )
    )
      throw new ApiFault(503, 'CHECKOUT_UNAVAILABLE');
    const idempotencyKey = request.headers.get('idempotency-key');
    if (!idempotencyKey || idempotencyKey.length > 128)
      throw new ApiFault(400, 'INVALID_INPUT');
    const input = await body(request);
    if (
      Object.keys(input).some((field) => field !== 'product_code') ||
      !['monthly', 'yearly', 'lifetime'].includes(
        stringValue(input.product_code) ?? '',
      )
    )
      throw new ApiFault(400, 'INVALID_INPUT');
    const checkoutId = crypto.randomUUID();
    let tokenKeyVersion: number | null = null;
    let tokenDigest: Uint8Array | null = null;
    if (
      dependencies.checkoutSecret &&
      dependencies.checkoutKeyVersion &&
      dependencies.checkoutProviderAccountId
    ) {
      const token = await deriveCheckoutToken({
        secret: dependencies.checkoutSecret,
        keyVersion: dependencies.checkoutKeyVersion,
        providerAccountId: dependencies.checkoutProviderAccountId,
        checkoutId,
      });
      tokenKeyVersion = dependencies.checkoutKeyVersion;
      tokenDigest = token.digest;
    }
    const [checkout] = await transaction.unsafe<Row>(
      'select * from private.subscription_checkout_create(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid, $7::text, $8::text, $9::smallint, $10::bytea)',
      [
        ...contextValues,
        checkoutId,
        input.product_code,
        idempotencyKey,
        tokenKeyVersion,
        tokenDigest,
      ],
    );
    if (!checkout) throw new ApiFault(503, 'CHECKOUT_UNAVAILABLE');
    return {
      status: 201,
      data: subscriptionCheckoutDto(
        checkout,
        await checkoutPaymentUrl(
          transaction,
          contextValues,
          checkout,
          dependencies,
        ),
      ),
    };
  }
  const checkoutMatch = /^v1\/subscription\/checkout\/([^/]+)$/u.exec(path);
  if (checkoutMatch && request.method === 'GET') {
    const checkoutId = uuidValue(checkoutMatch[1]);
    if (!checkoutId) throw new ApiFault(400, 'INVALID_INPUT');
    const [checkout] = await transaction.unsafe<Row>(
      'select * from private.subscription_checkout_read_v2(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid)',
      [...contextValues, checkoutId],
    );
    if (!checkout) throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
    return {
      status: 200,
      data: subscriptionCheckoutDto(
        checkout,
        await checkoutPaymentUrl(
          transaction,
          contextValues,
          checkout,
          dependencies,
        ),
      ),
    };
  }
  if (path === 'v1/config-files' && request.method === 'GET') {
    const cursorValue = new URL(request.url).searchParams.get('cursor');
    const cursor = cursorValue === null ? null : uuidValue(cursorValue);
    if (cursorValue !== null && !cursor)
      throw new ApiFault(400, 'INVALID_INPUT');
    const limit = boundedLimit(new URL(request.url).searchParams.get('limit'));
    const rows = await transaction.unsafe<Row>(
      'select * from private.file_list(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid, $7::integer)',
      [...contextValues, cursor, limit],
    );
    const [budget] = await transaction.unsafe<Row>(
      'select * from private.file_budget_read(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context)',
      contextValues,
    );
    return {
      status: 200,
      data: {
        items: rows.map(fileDto),
        next_cursor:
          rows.length === limit ? uuidValue(rows.at(-1)?.file_id) : null,
        budget: fileBudgetDto(budget ?? {}),
      },
    };
  }
  const getFileMatch = /^v1\/config-files\/([^/]+)$/u.exec(path);
  if (getFileMatch && request.method === 'GET') {
    const fileId = uuidValue(getFileMatch[1]);
    if (!fileId) throw new ApiFault(400, 'INVALID_INPUT');
    const [result] = await transaction.unsafe<Row>(
      'select * from private.file_read(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid)',
      [...contextValues, fileId],
    );
    if (!result) throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
    return { status: 200, data: fileDto(result) };
  }
  if (path === 'v1/config-files/upload-intent' && request.method === 'POST') {
    assertAllowed(row);
    const idempotencyKey = request.headers.get('idempotency-key');
    if (!idempotencyKey || idempotencyKey.length > 128)
      throw new ApiFault(400, 'INVALID_INPUT');
    const input = await body(request);
    const name = stringValue(input.name);
    const contentType = stringValue(input.content_type);
    const purpose = stringValue(input.purpose);
    const size = Number(input.size);
    const replacesFileId =
      input.replaces_file_id === undefined || input.replaces_file_id === null
        ? null
        : uuidValue(input.replaces_file_id);
    if (
      !name ||
      !contentType ||
      purpose !== 'config' ||
      !Number.isSafeInteger(size) ||
      size < 1 ||
      size > 1048576 ||
      (input.replaces_file_id !== undefined &&
        input.replaces_file_id !== null &&
        !replacesFileId)
    )
      throw new ApiFault(400, 'INVALID_INPUT');
    let result: Row | undefined;
    try {
      [result] = await transaction.unsafe<Row>(
        'select * from private.file_intent_create(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::text, $7::bigint, $8::text, $9::text, $10::uuid, $11::text)',
        [
          ...contextValues,
          name,
          size,
          contentType,
          purpose,
          replacesFileId,
          idempotencyKey,
        ],
      );
    } catch (error) {
      if (
        replacesFileId &&
        String((error as { message?: string }).message ?? '').includes(
          'quota_exceeded',
        )
      )
        throw new ApiFault(409, 'REPLACEMENT_CAPACITY_REQUIRED');
      throw error;
    }
    if (!result) throw new ApiFault(503, 'AUTHORIZATION_UNAVAILABLE');
    return {
      status: 201,
      data: {
        file_id: result.file_id,
        upload_path: `/v1/config-files/${result.file_id}/content`,
        expires_at: isoDate(result.intent_expires_at),
      },
    };
  }
  const deleteFileMatch = /^v1\/config-files\/([^/]+)$/u.exec(path);
  if (deleteFileMatch && request.method === 'DELETE') {
    assertAllowed(row);
    const fileId = uuidValue(deleteFileMatch[1]);
    const idempotencyKey = request.headers.get('idempotency-key');
    if (!fileId || !idempotencyKey || idempotencyKey.length > 128)
      throw new ApiFault(400, 'INVALID_INPUT');
    const [result] = await transaction.unsafe<Row>(
      'select * from private.file_delete_request(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid, $7::text)',
      [...contextValues, fileId, idempotencyKey],
    );
    if (!result) throw new ApiFault(503, 'AUTHORIZATION_UNAVAILABLE');
    return { status: 202, data: fileDto(result) };
  }
  if (path === 'v1/account/activate' && request.method === 'POST') {
    const [result] = await transaction.unsafe<Row>(
      'select * from private.account_activate(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context)',
      contextValues,
    );
    return { status: 200, data: result };
  }
  if (path === 'v1/account/close' && request.method === 'POST') {
    const authorization = stringValue(row.authorization);
    if (!['allowed', 'suspended', 'closed'].includes(authorization ?? '')) {
      if (authorization === 'platform_disabled')
        throw new ApiFault(403, 'PLATFORM_DISABLED');
      throw new ApiFault(409, 'ACCOUNT_NOT_ACTIVATED');
    }
  } else if (
    path === 'v1/identity/delete-request' &&
    request.method === 'POST'
  ) {
    const authorization = stringValue(row.authorization);
    if (authorization === 'platform_disabled')
      throw new ApiFault(403, 'PLATFORM_DISABLED');
    if (authorization === 'unauthorized')
      throw new ApiFault(401, 'UNAUTHORIZED');
  } else {
    assertAllowed(row);
  }

  if (path === 'v1/account/close' && request.method === 'POST') {
    const proofId = uuidValue(request.headers.get('x-recent-auth-proof'));
    const [result] = await transaction.unsafe<Row>(
      'select * from private.account_close(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid)',
      [...accountContextValues(session, key), proofId],
    );
    return { status: 200, data: result };
  }
  if (path === 'v1/identity/delete-request' && request.method === 'POST') {
    const proofId = uuidValue(request.headers.get('x-recent-auth-proof'));
    const [result] = await transaction.unsafe<Row>(
      'select * from private.identity_delete_request(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid)',
      [...accountContextValues(session, key), proofId],
    );
    return { status: 202, data: result };
  }

  if (path === 'v1/profile' && request.method === 'GET') {
    const [result] = await transaction.unsafe<Row>(
      'select * from private.profile_get(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context)',
      contextValues,
    );
    if (!result) throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
    return { status: 200, data: result, headers: withEtag(result) };
  }
  if (path === 'v1/profile' && request.method === 'PATCH') {
    const [result] = await transaction.unsafe<Row>(
      'select * from private.profile_patch(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::bigint, $7::jsonb)',
      [
        ...contextValues,
        expectedVersion(request),
        transaction.json(await body(request)),
      ],
    );
    if (!result) throw new ApiFault(503, 'AUTHORIZATION_UNAVAILABLE');
    return { status: 200, data: result, headers: withEtag(result) };
  }
  if (path === 'v1/preferences' && request.method === 'GET') {
    const [result] = await transaction.unsafe<Row>(
      'select * from private.preferences_get(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context)',
      contextValues,
    );
    if (!result) throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
    return { status: 200, data: result, headers: withEtag(result) };
  }
  if (path === 'v1/preferences' && request.method === 'PATCH') {
    const [result] = await transaction.unsafe<Row>(
      'select * from private.preferences_patch(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::bigint, $7::jsonb)',
      [
        ...contextValues,
        expectedVersion(request),
        transaction.json(await body(request)),
      ],
    );
    if (!result) throw new ApiFault(503, 'AUTHORIZATION_UNAVAILABLE');
    return { status: 200, data: result, headers: withEtag(result) };
  }
  if (path === 'v1/subscription' && request.method === 'GET') {
    const [result] = await transaction.unsafe<Row>(
      'select * from private.entitlement_read(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context)',
      contextValues,
    );
    if (!result) throw new ApiFault(503, 'AUTHORIZATION_UNAVAILABLE');
    return { status: 200, data: entitlementDto(result) };
  }
  if (path === 'v1/subscription/redeem' && request.method === 'POST') {
    const idempotencyKey = request.headers.get('idempotency-key');
    if (!idempotencyKey || idempotencyKey.length > 128)
      throw new ApiFault(400, 'INVALID_INPUT');
    const input = await body(request);
    let code: string;
    try {
      code = normalizeRedemptionCode(stringValue(input.code) ?? '');
    } catch {
      throw new ApiFault(400, 'INVALID_INPUT');
    }
    const candidates = redemptionHmacSecrets(dependencies);
    const codeHmacs = await Promise.all(
      candidates.map(({ secret, version }) =>
        hmacHex(
          secret,
          `redeem:v1:platform:${key.platformId}:key:${version}:code:${code}`,
        ),
      ),
    );
    const [result] = await transaction.unsafe<Row>(
      'select * from private.redeem_subscription_code_candidates(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::text[], $7::smallint[], $8::text)',
      [
        ...contextValues,
        codeHmacs,
        candidates.map(({ version }) => version),
        idempotencyKey,
      ],
    );
    if (!result) throw new ApiFault(503, 'AUTHORIZATION_UNAVAILABLE');
    if (result.outcome === 'rejected') {
      const errorCode = stringValue(result.error_code) ?? 'INVALID_INPUT';
      throw new ApiFault(errorCode === 'CODE_EXPIRED' ? 410 : 409, errorCode);
    }
    const [entitlement] = await transaction.unsafe<Row>(
      'select * from private.entitlement_read(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context)',
      contextValues,
    );
    return { status: 200, data: entitlementDto(entitlement ?? {}) };
  }
  throw new ApiFault(404, 'RESOURCE_NOT_FOUND');
}
