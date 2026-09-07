import postgres from 'npm:postgres@3.4.3';

import {
  generateRedemptionCodes,
  REDEMPTION_CODE_ALPHABET,
} from '../../../packages/domain/src/redemption.ts';

type Row = Record<string, unknown>;

interface Transaction {
  unsafe<T extends Row = Row>(query: string, values?: unknown[]): Promise<T[]>;
  json(value: unknown): unknown;
}

interface Database {
  begin<T>(callback: (transaction: Transaction) => Promise<T>): Promise<T>;
}

interface AccountApiDependencies {
  readonly database?: Database;
  readonly platformKeySecret?: string;
  readonly redemptionSecret?: string;
  readonly redemptionKeyVersion?: number;
}

type KeyContext = {
  readonly keyId: string;
  readonly platformId: string;
  readonly platformStatus: 'active' | 'disabled';
};

interface DispatchResult {
  readonly status: number;
  readonly data: unknown;
  readonly headers?: Record<string, string>;
}

type SessionContext = {
  readonly userId: string;
  readonly sessionId: string;
  readonly aal: 'aal1' | 'aal2';
};

class ApiFault extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = 'ApiFault';
  }
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CODE = new RegExp(`^[${REDEMPTION_CODE_ALPHABET}]+$`, 'u');

const stringValue = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

const uuidValue = (value: unknown): string | null => {
  const valueString = stringValue(value);
  return valueString && UUID.test(valueString) ? valueString : null;
};

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ApiFault(400, 'INVALID_INPUT');
  return value as Record<string, unknown>;
}

function base64UrlDecode(value: string): string {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const bytes = Uint8Array.from(atob(padded), (character) =>
    character.charCodeAt(0),
  );
  return new TextDecoder().decode(bytes);
}

function sessionFromRequest(request: Request): SessionContext {
  const authorization = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+([^\s]+)$/iu.exec(authorization);
  if (!match) throw new ApiFault(401, 'UNAUTHORIZED');
  const parts = match[1]!.split('.');
  if (parts.length !== 3) throw new ApiFault(401, 'UNAUTHORIZED');
  try {
    const claims = objectValue(JSON.parse(base64UrlDecode(parts[1]!)));
    const userId = uuidValue(claims.sub);
    const sessionId = uuidValue(claims.session_id ?? claims.sid);
    const aal =
      claims.aal === 'aal2' ? 'aal2' : claims.aal === 'aal1' ? 'aal1' : null;
    if (!userId || !sessionId || !aal)
      throw new Error('session claims missing');
    return { userId, sessionId, aal };
  } catch {
    throw new ApiFault(401, 'UNAUTHORIZED');
  }
}

function parsePlatformKey(value: string | null): {
  readonly version: number;
  readonly keyId: string;
  readonly presentedKey: string;
} {
  if (!value) throw new ApiFault(401, 'PLATFORM_CREDENTIAL_INVALID');
  const match = /^phk_v(\d+)_([0-9a-f-]{36})_(.+)$/iu.exec(value);
  const version = match ? Number.parseInt(match[1]!, 10) : Number.NaN;
  const keyId = match?.[2]?.toLowerCase();
  if (!match || !Number.isInteger(version) || version < 1 || !keyId)
    throw new ApiFault(401, 'PLATFORM_CREDENTIAL_INVALID');
  return { version, keyId, presentedKey: value };
}

async function hmacHex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function requestId(): string {
  return crypto.randomUUID();
}

function response(
  body: unknown,
  status: number,
  id: string,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
      'X-Request-Id': id,
      ...headers,
    },
  });
}

function mapSqlFault(error: unknown): ApiFault {
  const sqlError = error as { code?: string; message?: string };
  const message = sqlError.message ?? '';
  const code = sqlError.code;
  if (error instanceof ApiFault) return error;
  if (code === '23505') return new ApiFault(409, 'IDEMPOTENCY_CONFLICT');
  if (code === '40001') return new ApiFault(412, 'PRECONDITION_FAILED');
  if (code === '42501') {
    if (message.includes('admin_required'))
      return new ApiFault(403, 'ADMIN_REQUIRED');
    if (message.includes('platform_disabled'))
      return new ApiFault(403, 'PLATFORM_DISABLED');
    if (message.includes('account_suspended'))
      return new ApiFault(403, 'ACCOUNT_SUSPENDED');
    if (message.includes('account_closed'))
      return new ApiFault(403, 'ACCOUNT_CLOSED');
    if (message.includes('global_delete_pending'))
      return new ApiFault(403, 'GLOBAL_DELETE_PENDING');
    if (message.includes('recent_mfa_required'))
      return new ApiFault(403, 'RECENT_MFA_REQUIRED');
    return new ApiFault(401, 'UNAUTHORIZED');
  }
  if (code === '28000' || message.includes('platform_key_invalid'))
    return new ApiFault(401, 'PLATFORM_CREDENTIAL_INVALID');
  if (code === 'P0002' || message.includes('resource_not_found'))
    return new ApiFault(404, 'RESOURCE_NOT_FOUND');
  if (message.includes('account_not_activated'))
    return new ApiFault(409, 'ACCOUNT_NOT_ACTIVATED');
  if (message.includes('activation_disabled'))
    return new ApiFault(409, 'ACTIVATION_DISABLED');
  if (message.includes('plan_conflict'))
    return new ApiFault(409, 'PLAN_CONFLICT');
  if (message.includes('entitlement_perpetual'))
    return new ApiFault(409, 'ENTITLEMENT_PERPETUAL');
  if (message.includes('code_already_redeemed'))
    return new ApiFault(409, 'CODE_ALREADY_REDEEMED');
  if (message.includes('code_disabled'))
    return new ApiFault(409, 'CODE_DISABLED');
  if (message.includes('code_expired'))
    return new ApiFault(410, 'CODE_EXPIRED');
  if (code === '22023' || message.includes('invalid_input'))
    return new ApiFault(400, 'INVALID_INPUT');
  return new ApiFault(503, 'AUTHORIZATION_UNAVAILABLE');
}

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new ApiFault(503, 'AUTHORIZATION_UNAVAILABLE');
  return value;
}

let defaultDatabase: Database | undefined;
function database(): Database {
  if (defaultDatabase) return defaultDatabase;
  const url =
    Deno.env.get('ACCOUNT_API_DB_URL') ?? Deno.env.get('SUPABASE_DB_URL');
  if (!url) throw new ApiFault(503, 'AUTHORIZATION_UNAVAILABLE');
  defaultDatabase = postgres(url, {
    max: 8,
    prepare: false,
    connect_timeout: 5,
  }) as unknown as Database;
  return defaultDatabase;
}

async function setRole(
  transaction: Transaction,
  role: 'account_executor' | 'admin_executor',
) {
  await transaction.unsafe(`set local role ${role}`);
}

async function verifyPlatformKey(
  transaction: Transaction,
  request: Request,
  dependencies: AccountApiDependencies,
): Promise<KeyContext> {
  const parsed = parsePlatformKey(request.headers.get('x-platform-key'));
  const secret =
    dependencies.platformKeySecret ?? env('PLATFORM_KEY_HMAC_SECRET');
  const keyHmac = await hmacHex(
    secret,
    `${parsed.version}:platform-key:${parsed.keyId}:${parsed.presentedKey}`,
  );
  const [row] = await transaction.unsafe<Row>(
    'select * from private.platform_key_verify_presented($1::uuid, $2::text, $3::integer)',
    [parsed.keyId, keyHmac, parsed.version],
  );
  if (!row) throw new ApiFault(401, 'PLATFORM_CREDENTIAL_INVALID');
  const platformId = uuidValue(row.platform_id);
  const keyId = uuidValue(row.key_id);
  const platformStatus = stringValue(row.platform_status);
  if (
    !platformId ||
    !keyId ||
    (platformStatus !== 'active' && platformStatus !== 'disabled')
  )
    throw new ApiFault(401, 'PLATFORM_CREDENTIAL_INVALID');
  return { keyId, platformId, platformStatus };
}

async function principal(
  transaction: Transaction,
  key: KeyContext,
  session: SessionContext,
): Promise<Row> {
  const [row] = await transaction.unsafe<Row>(
    'select * from private.account_principal(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context)',
    [session.userId, session.sessionId, key.platformId, key.keyId, requestId()],
  );
  if (!row) throw new ApiFault(503, 'AUTHORIZATION_UNAVAILABLE');
  return row;
}

function principalDto(row: Row, key: KeyContext, session: SessionContext) {
  const authorization = stringValue(row.authorization);
  if (authorization === 'unauthorized') {
    const reason = stringValue(row.reason);
    if (reason === 'session_not_found_or_expired')
      throw new ApiFault(401, 'SESSION_REVOKED');
    throw new ApiFault(401, 'UNAUTHORIZED');
  }
  return {
    user_id: session.userId,
    platform_id: key.platformId,
    platform_account_id: uuidValue(row.platform_account_id),
    platform_status: key.platformStatus,
    account_status: stringValue(row.account_status) ?? 'not_activated',
  };
}

function assertAllowed(row: Row): void {
  switch (stringValue(row.authorization)) {
    case 'allowed':
      return;
    case 'not_activated':
      throw new ApiFault(409, 'ACCOUNT_NOT_ACTIVATED');
    case 'suspended':
      throw new ApiFault(403, 'ACCOUNT_SUSPENDED');
    case 'closed':
      throw new ApiFault(403, 'ACCOUNT_CLOSED');
    case 'platform_disabled':
      throw new ApiFault(403, 'PLATFORM_DISABLED');
    default:
      throw new ApiFault(401, 'UNAUTHORIZED');
  }
}

function accountContextValues(
  session: SessionContext,
  key: KeyContext,
): unknown[] {
  return [
    session.userId,
    session.sessionId,
    key.platformId,
    key.keyId,
    requestId(),
  ];
}

function entitlementDto(row: Row) {
  const code = stringValue(row.code);
  return {
    effective_status: stringValue(row.effective_status) ?? 'none',
    entitlement_kind: stringValue(row.entitlement_kind) ?? 'none',
    plan: code
      ? {
          code,
          name: stringValue(row.name) ?? code,
          description: stringValue(row.description),
          kind: stringValue(row.entitlement_kind) === 'free' ? 'free' : 'paid',
          features: objectValue(row.features),
        }
      : null,
    features: objectValue(row.features),
    started_at:
      row.started_at instanceof Date
        ? row.started_at.toISOString()
        : (row.started_at ?? null),
    current_period_end:
      row.current_period_end instanceof Date
        ? row.current_period_end.toISOString()
        : (row.current_period_end ?? null),
    evaluated_at:
      row.evaluated_at instanceof Date
        ? row.evaluated_at.toISOString()
        : row.evaluated_at,
    next_transition_at:
      row.next_transition_at instanceof Date
        ? row.next_transition_at.toISOString()
        : (row.next_transition_at ?? null),
  };
}

async function body(request: Request): Promise<Record<string, unknown>> {
  const bytes = new TextEncoder().encode(await request.text());
  if (bytes.byteLength > 65536) throw new ApiFault(413, 'PAYLOAD_TOO_LARGE');
  try {
    return jsonObject(JSON.parse(new TextDecoder().decode(bytes)));
  } catch (error) {
    if (error instanceof ApiFault) throw error;
    throw new ApiFault(400, 'INVALID_INPUT');
  }
}

function expectedVersion(request: Request): number {
  const value = request.headers.get('if-match');
  if (!value) throw new ApiFault(428, 'PRECONDITION_REQUIRED');
  const match = /^(?:W\/)?"(\d+)"$/u.exec(value);
  if (!match) throw new ApiFault(400, 'INVALID_INPUT');
  return Number.parseInt(match[1]!, 10);
}

function withEtag(row: Row): Record<string, string> {
  const version = Number(row.row_version);
  return Number.isSafeInteger(version) ? { ETag: `W/"${version}"` } : {};
}

async function dispatchAccount(
  request: Request,
  transaction: Transaction,
  dependencies: AccountApiDependencies,
): Promise<DispatchResult> {
  const url = new URL(request.url);
  const path = url.pathname
    .replace(/^\/functions\/v1\/account-api/iu, '')
    .replace(/^\/+/u, '');
  const key = await verifyPlatformKey(transaction, request, dependencies);

  if (path === 'v1/plans' && request.method === 'GET') {
    if (key.platformStatus !== 'active')
      throw new ApiFault(403, 'PLATFORM_DISABLED');
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

  const session = sessionFromRequest(request);
  const row = await principal(transaction, key, session);
  if (path === 'v1/account/principal' && request.method === 'GET') {
    return { status: 200, data: principalDto(row, key, session) };
  }

  const contextValues = accountContextValues(session, key);
  if (path === 'v1/account/activate' && request.method === 'POST') {
    const [result] = await transaction.unsafe<Row>(
      'select * from private.account_activate(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context)',
      contextValues,
    );
    return { status: 200, data: result };
  }
  assertAllowed(row);

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
    const code = stringValue(input.code)
      ?.replaceAll('-', '')
      .trim()
      .toUpperCase();
    if (!code || code.length > 128 || !CODE.test(code))
      throw new ApiFault(400, 'INVALID_INPUT');
    const version =
      dependencies.redemptionKeyVersion ??
      Number.parseInt(Deno.env.get('REDEMPTION_HMAC_KEY_VERSION') ?? '1', 10);
    const secret =
      dependencies.redemptionSecret ?? env('REDEMPTION_HMAC_SECRET');
    const codeHmac = await hmacHex(
      secret,
      `redeem:v1:platform:${key.platformId}:key:${version}:code:${code}`,
    );
    const [result] = await transaction.unsafe<Row>(
      'select * from private.redeem_subscription_code(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::text, $7::smallint, $8::text)',
      [...contextValues, codeHmac, version, idempotencyKey],
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

async function adminStepUp(
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

function adminContextValues(session: SessionContext): unknown[] {
  return [session.userId, session.sessionId, requestId()];
}

async function dispatchAdmin(
  request: Request,
  transaction: Transaction,
  dependencies: AccountApiDependencies,
): Promise<DispatchResult> {
  const url = new URL(request.url);
  const path = url.pathname
    .replace(/^\/functions\/v1\/account-api/iu, '')
    .replace(/^\/+/u, '');
  const session = sessionFromRequest(request);
  const context = adminContextValues(session);
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
      const quantity = Number(input.quantity);
      const creationOperationId = uuidValue(input.creation_operation_id);
      const expiresAt = stringValue(input.expires_at);
      const deliveryDeadline = stringValue(input.delivery_deadline);
      if (
        !inputPlatformId ||
        !planId ||
        !creationOperationId ||
        !expiresAt ||
        !deliveryDeadline ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 1000
      )
        throw new ApiFault(400, 'INVALID_INPUT');
      const version =
        dependencies.redemptionKeyVersion ??
        Number.parseInt(Deno.env.get('REDEMPTION_HMAC_KEY_VERSION') ?? '1', 10);
      const secret =
        dependencies.redemptionSecret ?? env('REDEMPTION_HMAC_SECRET');
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
      const [result] = await transaction.unsafe<Row>(
        'select * from private.admin_batch_create(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::uuid, $5::uuid, $6::text, $7::integer, $8::integer, $9::text, $10::timestamptz, $11::timestamptz, $12::uuid, $13::text, $14::jsonb)',
        [
          ...context,
          inputPlatformId,
          planId,
          input.name,
          quantity,
          Number(input.duration_value),
          input.duration_unit,
          expiresAt,
          deliveryDeadline,
          creationOperationId,
          receiptHmac,
          transaction.json(
            codes.map((code) => ({
              code_hmac: code.codeHmac,
              hmac_key_version: code.hmacKeyVersion,
              code_prefix: code.codePrefix,
              code_suffix: code.codeSuffix,
            })),
          ),
        ],
      );
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
      const secret =
        dependencies.redemptionSecret ?? env('REDEMPTION_HMAC_SECRET');
      const receiptHmac = await hmacHex(
        secret,
        `delivery:v1:platform:${platformId}:receipt:${receipt}`,
      );
      const [result] = await transaction.unsafe<Row>(
        'select * from private.admin_batch_confirm(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::uuid, $5::uuid, $6::text)',
        [...context, platformId, confirmMatch[1], receiptHmac],
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

export async function handleRequest(
  request: Request,
  dependencies: AccountApiDependencies = {},
): Promise<Response> {
  const id = requestId();
  try {
    const path = new URL(request.url).pathname
      .replace(/^\/functions\/v1\/account-api/iu, '')
      .replace(/^\/+/u, '');
    const db = dependencies.database ?? database();
    const result = await db.begin(async (transaction) => {
      if (path.startsWith('admin/')) {
        await setRole(transaction, 'admin_executor');
        return dispatchAdmin(request, transaction, dependencies);
      }
      await setRole(transaction, 'account_executor');
      return dispatchAccount(request, transaction, dependencies);
    });
    return response(
      { data: result.data, request_id: id },
      result.status,
      id,
      result.headers,
    );
  } catch (error) {
    const fault = mapSqlFault(error);
    return response(
      { error: { code: fault.code, message: fault.code }, request_id: id },
      fault.status,
      id,
    );
  }
}

if (import.meta.main) {
  const port = Number.parseInt(Deno.env.get('ACCOUNT_API_PORT') ?? '8000', 10);
  Deno.serve({ port }, (request) => handleRequest(request));
}
