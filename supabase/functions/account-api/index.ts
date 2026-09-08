/// <reference lib="deno.ns" />

import postgres from 'npm:postgres@3.4.3';

import { readBoundedBody, UploadFault, UploadGate } from '../_shared/upload.ts';
import {
  createSupabaseStorageAdapter,
  type StorageAdapter,
} from '../_shared/storage.ts';

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
  readonly platformKeySecrets?: readonly string[];
  readonly redemptionSecret?: string;
  readonly redemptionKeyVersion?: number;
  readonly redemptionSecrets?: readonly {
    readonly secret: string;
    readonly version: number;
  }[];
  /**
   * Verifies a bearer token with Supabase Auth and returns its subject. This
   * is injectable only for isolated Deno tests; production uses Auth's
   * /auth/v1/user endpoint with the publishable key.
   */
  readonly verifyAccessToken?: (accessToken: string) => Promise<string | null>;
  readonly storageAdapter?: StorageAdapter;
  readonly uploadGate?: UploadGate;
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
  readonly next_cursor?: string | null;
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
  return valueString && UUID.test(valueString)
    ? valueString.toLowerCase()
    : null;
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

function sessionFromAccessToken(accessToken: string): SessionContext {
  const parts = accessToken.split('.');
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

function presentedSession(request: Request): {
  readonly accessToken: string;
  readonly session: SessionContext;
} {
  const authorization = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+([^\s]+)$/iu.exec(authorization);
  if (!match) throw new ApiFault(401, 'UNAUTHORIZED');
  const accessToken = match[1]!;
  return { accessToken, session: sessionFromAccessToken(accessToken) };
}

async function verifyAccessTokenWithAuth(
  accessToken: string,
): Promise<string | null> {
  const url = Deno.env.get('SUPABASE_URL')?.replace(/\/$/u, '');
  const publishableKey =
    Deno.env.get('SUPABASE_ANON_KEY') ??
    Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
  if (!url || !publishableKey)
    throw new ApiFault(503, 'AUTHORIZATION_UNAVAILABLE');

  let response: Response;
  try {
    response = await fetch(`${url}/auth/v1/user`, {
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
    });
  } catch {
    throw new ApiFault(503, 'AUTHORIZATION_UNAVAILABLE');
  }
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new ApiFault(503, 'AUTHORIZATION_UNAVAILABLE');

  const payload = objectValue(await response.json().catch(() => null));
  return uuidValue(objectValue(payload.user).id) ?? uuidValue(payload.id);
}

async function verifiedSessionFromRequest(
  request: Request,
  dependencies: AccountApiDependencies,
): Promise<SessionContext> {
  const presented = presentedSession(request);
  const verifiedUserId = await (dependencies.verifyAccessToken
    ? dependencies.verifyAccessToken(presented.accessToken)
    : verifyAccessTokenWithAuth(presented.accessToken));
  if (!verifiedUserId || verifiedUserId !== presented.session.userId)
    throw new ApiFault(401, 'UNAUTHORIZED');
  return presented.session;
}

async function verifiedSessionFromAccessToken(
  accessToken: string,
  dependencies: AccountApiDependencies,
): Promise<SessionContext> {
  const session = sessionFromAccessToken(accessToken);
  const verifiedUserId = await (dependencies.verifyAccessToken
    ? dependencies.verifyAccessToken(accessToken)
    : verifyAccessTokenWithAuth(accessToken));
  if (!verifiedUserId || verifiedUserId !== session.userId)
    throw new ApiFault(401, 'UNAUTHORIZED');
  return session;
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

function platformHmacSecrets(
  dependencies: AccountApiDependencies,
): readonly string[] {
  if (dependencies.platformKeySecrets?.length)
    return dependencies.platformKeySecrets;
  return [
    dependencies.platformKeySecret ?? env('PLATFORM_KEY_HMAC_SECRET'),
    Deno.env.get('PLATFORM_KEY_HMAC_SECRET_PREVIOUS'),
  ].filter((secret): secret is string => Boolean(secret));
}

function redemptionHmacSecrets(
  dependencies: AccountApiDependencies,
): readonly { readonly secret: string; readonly version: number }[] {
  if (dependencies.redemptionSecrets?.length)
    return dependencies.redemptionSecrets;
  const version =
    dependencies.redemptionKeyVersion ??
    Number.parseInt(Deno.env.get('REDEMPTION_HMAC_KEY_VERSION') ?? '1', 10);
  const secret = dependencies.redemptionSecret ?? env('REDEMPTION_HMAC_SECRET');
  if (!Number.isSafeInteger(version) || version < 1 || version > 32767)
    throw new ApiFault(503, 'AUTHORIZATION_UNAVAILABLE');
  const previousSecret = Deno.env.get('REDEMPTION_HMAC_SECRET_PREVIOUS');
  const previousVersionRaw = Deno.env.get(
    'REDEMPTION_HMAC_PREVIOUS_KEY_VERSION',
  );
  if (!previousSecret && !previousVersionRaw) return [{ secret, version }];
  const previousVersion = Number.parseInt(previousVersionRaw ?? '', 10);
  if (
    !previousSecret ||
    !Number.isSafeInteger(previousVersion) ||
    previousVersion < 1 ||
    previousVersion > 32767 ||
    previousVersion === version
  )
    throw new ApiFault(503, 'AUTHORIZATION_UNAVAILABLE');
  return [
    { secret, version },
    { secret: previousSecret, version: previousVersion },
  ];
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
    if (message.includes('platform_file_policy_disabled'))
      return new ApiFault(403, 'PLATFORM_DISABLED');
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
  if (message.includes('quota_exceeded'))
    return new ApiFault(409, 'QUOTA_EXCEEDED');
  if (message.includes('file_busy')) return new ApiFault(409, 'FILE_BUSY');
  if (message.includes('file_not_downloadable'))
    return new ApiFault(409, 'FILE_NOT_DOWNLOADABLE');
  if (message.includes('operation_in_progress'))
    return new ApiFault(409, 'OPERATION_IN_PROGRESS');
  if (message.includes('intent_expired'))
    return new ApiFault(410, 'UPLOAD_INTENT_EXPIRED');
  if (message.includes('size_mismatch'))
    return new ApiFault(400, 'UPLOAD_SIZE_MISMATCH');
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

const databases = new Map<'account' | 'admin', Database>();
const defaultUploadGate = new UploadGate();
function database(executor: 'account' | 'admin'): Database {
  const cached = databases.get(executor);
  if (cached) return cached;
  const dedicatedUrl = Deno.env.get(
    executor === 'admin' ? 'ADMIN_DB_URL' : 'ACCOUNT_DB_URL',
  );
  const url =
    dedicatedUrl ??
    Deno.env.get('ACCOUNT_API_DB_URL') ??
    Deno.env.get('SUPABASE_DB_URL');
  if (!url) throw new ApiFault(503, 'AUTHORIZATION_UNAVAILABLE');
  const connection = postgres(url, {
    max: 8,
    prepare: false,
    connect_timeout: 5,
  }) as unknown as Database;
  databases.set(executor, connection);
  return connection;
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
  let row: Row | undefined;
  for (const secret of platformHmacSecrets(dependencies)) {
    const keyHmac = await hmacHex(
      secret,
      `${parsed.version}:platform-key:${parsed.keyId}:${parsed.presentedKey}`,
    );
    [row] = await transaction.unsafe<Row>(
      'select * from private.platform_key_verify_presented($1::uuid, $2::text, $3::integer)',
      [parsed.keyId, keyHmac, parsed.version],
    );
    if (row) break;
  }
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

function isoDate(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' ? value : null;
}

function fileDto(row: Row): Record<string, unknown> {
  return {
    file_id: uuidValue(row.file_id ?? row.id),
    status: stringValue(row.status) ?? 'pending',
    size: Number(row.actual_size_bytes ?? row.reserved_bytes ?? 0),
    reserved_bytes: Number(row.reserved_bytes ?? 0),
    reserved_count: Number(row.reserved_count ?? 0),
    actual_size_bytes:
      row.actual_size_bytes === null || row.actual_size_bytes === undefined
        ? null
        : Number(row.actual_size_bytes),
    original_name: stringValue(row.original_name),
    content_type: stringValue(row.mime_type) ?? 'application/octet-stream',
    created_at: isoDate(row.created_at) ?? new Date(0).toISOString(),
    updated_at: isoDate(row.updated_at) ?? new Date(0).toISOString(),
    cancel_requested_at: isoDate(row.cancel_requested_at),
    write_outcome: stringValue(row.write_outcome) ?? 'not_started',
  };
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
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

function requestPath(request: Request): string {
  return new URL(request.url).pathname
    .replace(/^\/functions\/v1\/account-api(?:\/|$)/iu, '')
    .replace(/^\/account-api(?:\/|$)/iu, '')
    .replace(/^\/+/u, '');
}

async function dispatchAccount(
  request: Request,
  transaction: Transaction,
  dependencies: AccountApiDependencies,
  session?: SessionContext,
  reauthSession?: SessionContext,
): Promise<DispatchResult> {
  const path = requestPath(request);
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

  if (!session) throw new ApiFault(401, 'UNAUTHORIZED');
  if (path === 'v1/auth/recent-proof' && request.method === 'POST') {
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

  const row = await principal(transaction, key, session);
  if (path === 'v1/account/principal' && request.method === 'GET') {
    return { status: 200, data: principalDto(row, key, session) };
  }

  const contextValues = accountContextValues(session, key);
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
    return {
      status: 200,
      data: {
        items: rows.map(fileDto),
        next_cursor:
          rows.length === limit ? uuidValue(rows.at(-1)?.file_id) : null,
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
    const code = stringValue(input.code)
      ?.replaceAll('-', '')
      .trim()
      .toUpperCase();
    if (!code || code.length > 128 || !CODE.test(code))
      throw new ApiFault(400, 'INVALID_INPUT');
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

function boundedLimit(value: string | null): number {
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

async function dispatchAdmin(
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
      'select * from private.admin_platform_list(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::integer)',
      [...context, boundedLimit(url.searchParams.get('limit'))],
    );
    return { status: 200, data: rows };
  }

  if (path === 'admin/api/v1/config-files' && request.method === 'GET') {
    const cursorValue = url.searchParams.get('cursor');
    const cursor = cursorValue === null ? null : uuidValue(cursorValue);
    if (cursorValue !== null && !cursor)
      throw new ApiFault(400, 'INVALID_INPUT');
    const limit = boundedLimit(url.searchParams.get('limit'));
    const rows = await transaction.unsafe<Row>(
      'select * from private.admin_file_list(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::uuid, $5::integer)',
      [...context, cursor, limit],
    );
    return {
      status: 200,
      data: rows.map(fileDto),
      next_cursor:
        rows.length === limit ? uuidValue(rows.at(-1)?.file_id) : null,
    };
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
    return { status: 200, data: fileDto(result) };
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
        'select * from private.admin_origin_list(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::uuid)',
        [...context, platformId],
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
      'select * from private.admin_account_list(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::uuid, $5::integer)',
      [
        ...context,
        accountsMatch[1],
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
        'select * from private.admin_platform_key_list(row($1::uuid, $2::uuid, $3::uuid)::private.admin_context, $4::uuid)',
        [...context, platformId],
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

async function handleDownload(
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

async function handleUploadContent(
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

export async function handleRequest(
  request: Request,
  dependencies: AccountApiDependencies = {},
): Promise<Response> {
  const id = requestId();
  try {
    const path = requestPath(request);
    const session =
      path.startsWith('admin/') ||
      !(path === 'v1/plans' && request.method === 'GET')
        ? await verifiedSessionFromRequest(request, dependencies)
        : undefined;
    const reauthSession =
      path === 'v1/auth/recent-proof' && request.method === 'POST'
        ? await verifiedSessionFromAccessToken(
            request.headers.get('x-reauth-access-token') ?? '',
            dependencies,
          )
        : undefined;
    if (
      path.startsWith('v1/config-files/') &&
      path.endsWith('/content') &&
      request.method === 'PUT'
    ) {
      if (!session) throw new ApiFault(401, 'UNAUTHORIZED');
      return response(
        {
          data: (await handleUploadContent(request, dependencies, session))
            .data,
          request_id: id,
        },
        202,
        id,
      );
    }
    if (
      path.startsWith('v1/config-files/') &&
      path.endsWith('/content') &&
      request.method === 'GET'
    ) {
      if (!session) throw new ApiFault(401, 'UNAUTHORIZED');
      return await handleDownload(request, dependencies, session, false);
    }
    if (
      path.startsWith('admin/api/v1/config-files/') &&
      path.endsWith('/content') &&
      request.method === 'GET'
    ) {
      if (!session) throw new ApiFault(401, 'UNAUTHORIZED');
      return await handleDownload(request, dependencies, session, true);
    }
    const executor = path.startsWith('admin/') ? 'admin' : 'account';
    const db = dependencies.database ?? database(executor);
    const result = await db.begin(async (transaction) => {
      if (path.startsWith('admin/')) {
        if (!session) throw new ApiFault(401, 'UNAUTHORIZED');
        await setRole(transaction, 'admin_executor');
        return dispatchAdmin(request, transaction, dependencies, session);
      }
      await setRole(transaction, 'account_executor');
      return dispatchAccount(
        request,
        transaction,
        dependencies,
        session,
        reauthSession,
      );
    });
    return response(
      {
        data: result.data,
        ...(result.next_cursor === undefined
          ? {}
          : { next_cursor: result.next_cursor }),
        request_id: id,
      },
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
