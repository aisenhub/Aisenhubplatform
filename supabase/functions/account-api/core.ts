/// <reference lib="deno.ns" />

import postgres from 'npm:postgres@3.4.3';

import { UploadGate } from '../_shared/upload.ts';
import { type StorageAdapter } from '../_shared/storage.ts';
import {
  isSubscriptionProductDto,
  type SubscriptionCheckoutDto,
  type SubscriptionProductDto,
} from '../../../packages/domain/src/contracts/api.ts';
import {
  isBillingCheckoutStatus,
  isBillingEntitlementStatus,
  isBillingJobState,
  isBillingVerificationStatus,
  isProviderOrderStatus,
  type BillingCheckoutNextAction,
  type BillingCheckoutProgressReason,
  type BillingJobState,
} from '../../../packages/domain/src/contracts/billing.ts';
import {
  buildAfdianCheckoutUrl,
  providerUrlsRequireHttps,
} from '../_shared/afdian.ts';

export type Row = Record<string, unknown>;

export interface Transaction {
  unsafe<T extends Row = Row>(query: string, values?: unknown[]): Promise<T[]>;
  json(value: unknown): unknown;
}

export interface Database {
  begin<T>(callback: (transaction: Transaction) => Promise<T>): Promise<T>;
}

export interface AccountApiDependencies {
  readonly database?: Database;
  readonly platformKeySecret?: string;
  readonly platformKeySecrets?: readonly string[];
  readonly checkoutSecret?: string;
  readonly checkoutKeyVersion?: number;
  readonly checkoutProviderAccountId?: string;
  readonly checkoutEnabled?: boolean;
  readonly afdianCheckoutBaseUrl?: string;
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

export type KeyContext = {
  readonly keyId: string;
  readonly platformId: string;
  readonly platformStatus: 'active' | 'disabled';
};

export interface DispatchResult {
  readonly status: number;
  readonly data: unknown;
  readonly headers?: Record<string, string>;
  readonly next_cursor?: string | null;
}

export type SessionContext = {
  readonly userId: string;
  readonly sessionId: string;
  readonly aal: 'aal1' | 'aal2';
};

export class ApiFault extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = 'ApiFault';
  }
}

const DEFAULT_AUTH_FETCH_TIMEOUT_MS = 5_000;
const MAX_AUTH_FETCH_TIMEOUT_MS = 30_000;

function authFetchTimeoutMs(): number {
  const configured = Number.parseInt(
    Deno.env.get('ACCOUNT_API_AUTH_TIMEOUT_MS') ?? '',
    10,
  );
  return Number.isSafeInteger(configured) && configured > 0
    ? Math.min(configured, MAX_AUTH_FETCH_TIMEOUT_MS)
    : DEFAULT_AUTH_FETCH_TIMEOUT_MS;
}

async function authFetch(
  input: string | URL | Request,
  init: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), authFetchTimeoutMs());
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
export const stringValue = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

export const uuidValue = (value: unknown): string | null => {
  const valueString = stringValue(value);
  return valueString && UUID.test(valueString)
    ? valueString.toLowerCase()
    : null;
};

export function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ApiFault(400, 'INVALID_INPUT');
  return value as Record<string, unknown>;
}

function base64UrlBytes(value: string): Uint8Array {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

function base64UrlDecode(value: string): string {
  const bytes = base64UrlBytes(value);
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

const accessTokenVerificationInFlight = new Map<
  string,
  Promise<string | null>
>();
const platformHmacKeyCache = new Map<string, Promise<CryptoKey>>();
const jwtVerificationKeyCache = new Map<string, Promise<CryptoKey>>();
const jwksCryptoKeyCache = new Map<string, Promise<CryptoKey>>();
let jwksCache:
  | { readonly expiresAt: number; readonly keys: Map<string, JsonWebKey> }
  | undefined;
let jwksFetchInFlight: Promise<Map<string, JsonWebKey> | null> | undefined;
let jwksUnavailableUntil = 0;

function platformHmacKey(secret: string): Promise<CryptoKey> {
  const existing = platformHmacKeyCache.get(secret);
  if (existing) return existing;

  const key = crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  platformHmacKeyCache.set(secret, key);
  while (platformHmacKeyCache.size > 2) {
    const oldest = platformHmacKeyCache.keys().next().value;
    if (oldest === undefined) break;
    platformHmacKeyCache.delete(oldest);
  }
  void key.catch(() => {
    if (platformHmacKeyCache.get(secret) === key)
      platformHmacKeyCache.delete(secret);
  });
  return key;
}

function jwtVerificationKey(secret: string): Promise<CryptoKey> {
  const existing = jwtVerificationKeyCache.get(secret);
  if (existing) return existing;

  const key = crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  jwtVerificationKeyCache.set(secret, key);
  while (jwtVerificationKeyCache.size > 2) {
    const oldest = jwtVerificationKeyCache.keys().next().value;
    if (oldest === undefined) break;
    jwtVerificationKeyCache.delete(oldest);
  }
  void key.catch(() => {
    if (jwtVerificationKeyCache.get(secret) === key)
      jwtVerificationKeyCache.delete(secret);
  });
  return key;
}

async function loadJwks(): Promise<Map<string, JsonWebKey> | null> {
  const now = Date.now();
  if (jwksCache && jwksCache.expiresAt > now) return jwksCache.keys;
  if (jwksUnavailableUntil > now) return null;
  if (jwksFetchInFlight) return jwksFetchInFlight;

  const url = Deno.env.get('SUPABASE_URL')?.replace(/\/$/u, '');
  if (!url) return null;
  const fetchPromise = (async () => {
    try {
      const publishableKey =
        Deno.env.get('SUPABASE_ANON_KEY') ??
        Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
      const response = await authFetch(`${url}/auth/v1/.well-known/jwks.json`, {
        headers: publishableKey ? { apikey: publishableKey } : undefined,
        cache: 'no-store',
      });
      if (!response.ok) {
        jwksUnavailableUntil = Date.now() + 10_000;
        return null;
      }
      const payload = objectValue(await response.json().catch(() => null));
      const keys = new Map<string, JsonWebKey>();
      for (const candidate of Array.isArray(payload.keys) ? payload.keys : []) {
        const jwk = objectValue(candidate);
        const kid = stringValue(jwk.kid);
        if (kid && jwk.kty === 'EC' && jwk.crv === 'P-256')
          keys.set(kid, jwk as JsonWebKey);
      }
      jwksUnavailableUntil = 0;
      jwksCache = { expiresAt: Date.now() + 5 * 60_000, keys };
      return keys;
    } catch {
      jwksUnavailableUntil = Date.now() + 10_000;
      return null;
    }
  })();
  jwksFetchInFlight = fetchPromise;
  try {
    return await fetchPromise;
  } finally {
    if (jwksFetchInFlight === fetchPromise) jwksFetchInFlight = undefined;
  }
}

async function jwksVerificationKey(
  kid: string,
): Promise<CryptoKey | undefined> {
  const keys = await loadJwks();
  const jwk = keys?.get(kid);
  if (!jwk) return undefined;
  const cacheKey = `${kid}:${jwk.x ?? ''}:${jwk.y ?? ''}`;
  const existing = jwksCryptoKeyCache.get(cacheKey);
  if (existing) return existing;
  const key = crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );
  jwksCryptoKeyCache.set(cacheKey, key);
  while (jwksCryptoKeyCache.size > 4) {
    const oldest = jwksCryptoKeyCache.keys().next().value;
    if (oldest === undefined) break;
    jwksCryptoKeyCache.delete(oldest);
  }
  void key.catch(() => {
    if (jwksCryptoKeyCache.get(cacheKey) === key)
      jwksCryptoKeyCache.delete(cacheKey);
  });
  return key;
}

async function verifyAccessTokenLocally(
  accessToken: string,
): Promise<string | null | undefined> {
  const hmacSecret =
    Deno.env.get('ACCOUNT_API_JWT_SECRET') ??
    Deno.env.get('SUPABASE_JWT_SECRET');

  try {
    const parts = accessToken.split('.');
    if (parts.length !== 3) return null;
    const header = objectValue(JSON.parse(base64UrlDecode(parts[0]!)));
    if (header.alg !== 'HS256' && header.alg !== 'ES256') return undefined;
    if (header.alg === 'HS256' && !hmacSecret) return undefined;
    const claims = objectValue(JSON.parse(base64UrlDecode(parts[1]!)));
    if (claims.aud !== 'authenticated') return null;
    const authUrl = Deno.env.get('SUPABASE_URL')?.replace(/\/$/u, '');
    if (authUrl && claims.iss !== `${authUrl}/auth/v1`) return null;
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = Number(claims.exp);
    const notBefore = claims.nbf === undefined ? null : Number(claims.nbf);
    if (
      !Number.isFinite(expiresAt) ||
      expiresAt <= now ||
      (notBefore !== null && (!Number.isFinite(notBefore) || notBefore > now))
    )
      return null;

    const signatureBytes = base64UrlBytes(parts[2]!);
    const signature = new ArrayBuffer(signatureBytes.byteLength);
    new Uint8Array(signature).set(signatureBytes);
    const key =
      header.alg === 'HS256'
        ? await jwtVerificationKey(hmacSecret!)
        : await jwksVerificationKey(stringValue(header.kid) ?? '');
    if (!key) return undefined;
    const valid = await crypto.subtle.verify(
      header.alg === 'HS256' ? 'HMAC' : { name: 'ECDSA', hash: 'SHA-256' },
      key,
      signature,
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    if (!valid) return null;
    const userId = uuidValue(claims.sub);
    const sessionId = uuidValue(claims.session_id ?? claims.sid);
    const aal =
      claims.aal === 'aal2' ? 'aal2' : claims.aal === 'aal1' ? 'aal1' : null;
    return userId && sessionId && aal ? userId : null;
  } catch {
    return null;
  }
}

async function verifyAccessTokenWithAuthRemote(
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
    response = await authFetch(`${url}/auth/v1/user`, {
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

async function verifyAccessTokenWithAuth(
  accessToken: string,
): Promise<string | null> {
  const existing = accessTokenVerificationInFlight.get(accessToken);
  if (existing) return existing;

  const verification = (async () => {
    const local = await verifyAccessTokenLocally(accessToken);
    return local === undefined
      ? verifyAccessTokenWithAuthRemote(accessToken)
      : local;
  })();
  accessTokenVerificationInFlight.set(accessToken, verification);
  try {
    return await verification;
  } finally {
    if (accessTokenVerificationInFlight.get(accessToken) === verification)
      accessTokenVerificationInFlight.delete(accessToken);
  }
}

export async function verifiedSessionFromRequest(
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

export async function verifiedSessionFromAccessToken(
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

export async function hmacHex(secret: string, value: string): Promise<string> {
  const key = await platformHmacKey(secret);
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function platformHmacSecrets(
  dependencies: AccountApiDependencies,
): readonly string[] {
  if (dependencies.platformKeySecrets?.length)
    return dependencies.platformKeySecrets;
  return [
    dependencies.platformKeySecret ?? env('PLATFORM_KEY_HMAC_SECRET'),
    Deno.env.get('PLATFORM_KEY_HMAC_SECRET_PREVIOUS'),
  ].filter((secret): secret is string => Boolean(secret));
}

export function redemptionHmacSecrets(
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

export function requestId(): string {
  return crypto.randomUUID();
}

export function response(
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

export function mapSqlFault(error: unknown): ApiFault {
  const sqlError = error as { code?: string; message?: string };
  const message = sqlError.message ?? '';
  const code = sqlError.code;
  if (error instanceof ApiFault) return error;
  if (code === '22023') return new ApiFault(400, 'INVALID_INPUT');
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
  if (message.includes('purchases_paused'))
    return new ApiFault(409, 'PURCHASES_PAUSED');
  if (
    message.includes('provider_mapping_unavailable') ||
    message.includes('checkout_key_unavailable') ||
    message.includes('paid_plan_not_configured')
  )
    return new ApiFault(503, 'CHECKOUT_UNAVAILABLE');
  if (message.includes('plan_conflict'))
    return new ApiFault(409, 'PLAN_CONFLICT');
  if (
    message.includes('subscription_plan_switch_blocked') ||
    message.includes('subscription_plan_in_use') ||
    message.includes('plan_unavailable') ||
    message.includes('product_unavailable') ||
    message.includes('product_disabled')
  )
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

export function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new ApiFault(503, 'AUTHORIZATION_UNAVAILABLE');
  return value;
}

function databasePoolMax(): number {
  const value = Number.parseInt(
    Deno.env.get('ACCOUNT_API_DB_POOL_MAX') ?? '8',
    10,
  );
  return Number.isSafeInteger(value) && value >= 4 && value <= 64 ? value : 8;
}

function databaseRoleAtConnection(): boolean {
  return Deno.env.get('ACCOUNT_API_DB_ROLE_MODE') === 'startup';
}

const databases = new Map<'account' | 'admin', Database>();
export const defaultUploadGate = new UploadGate();
export function database(executor: 'account' | 'admin'): Database {
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
    max: databasePoolMax(),
    prepare: false,
    connect_timeout: 5,
    ...(databaseRoleAtConnection()
      ? { connection: { options: `-c role=${executor}_executor` } }
      : {}),
  }) as unknown as Database;
  databases.set(executor, connection);
  return connection;
}

export async function setRole(
  transaction: Transaction,
  role: 'account_executor' | 'admin_executor',
) {
  if (databaseRoleAtConnection()) return;
  await transaction.unsafe(`set local role ${role}`);
}

export async function verifyPlatformKey(
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

export async function principalFromPresentedKey(
  transaction: Transaction,
  request: Request,
  dependencies: AccountApiDependencies,
  session: SessionContext,
): Promise<{ readonly key: KeyContext; readonly row: Row }> {
  const parsed = parsePlatformKey(request.headers.get('x-platform-key'));
  let row: Row | undefined;
  for (const secret of platformHmacSecrets(dependencies)) {
    const keyHmac = await hmacHex(
      secret,
      `${parsed.version}:platform-key:${parsed.keyId}:${parsed.presentedKey}`,
    );
    [row] = await transaction.unsafe<Row>(
      'select * from private.account_principal_presented($1::uuid, $2::uuid, $3::uuid, $4::text, $5::integer)',
      [
        session.userId,
        session.sessionId,
        parsed.keyId,
        keyHmac,
        parsed.version,
      ],
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
  return {
    key: { keyId, platformId, platformStatus },
    row,
  };
}

export function principalDto(
  row: Row,
  key: KeyContext,
  session: SessionContext,
) {
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

export function assertAllowed(row: Row): void {
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

export function accountContextValues(
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

export function isoDate(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' ? value : null;
}

type BillingOrderCursor =
  | { readonly createdAt: string; readonly orderId: string }
  | { readonly legacyCreatedAt: string };

export function encodeBillingOrderCursor(row: Row): string | null {
  const createdAt = isoDate(row.created_at);
  const orderId = uuidValue(row.order_id);
  if (!createdAt || !orderId) return null;
  const encoded = btoa(
    JSON.stringify({ created_at: createdAt, order_id: orderId }),
  )
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
  return `v1.${encoded}`;
}

export function parseBillingOrderCursor(
  value: string,
): BillingOrderCursor | null {
  if (!value.startsWith('v1.')) {
    const legacyDate = new Date(value);
    return Number.isNaN(legacyDate.getTime())
      ? null
      : { legacyCreatedAt: legacyDate.toISOString() };
  }
  try {
    const decoded = objectValue(JSON.parse(base64UrlDecode(value.slice(3))));
    const createdAt = stringValue(decoded.created_at);
    const orderId = uuidValue(decoded.order_id);
    if (!createdAt || !orderId || Number.isNaN(new Date(createdAt).getTime()))
      return null;
    return { createdAt: new Date(createdAt).toISOString(), orderId };
  } catch {
    return null;
  }
}

export function fileDto(row: Row): Record<string, unknown> {
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

export function fileBudgetDto(row: Row): Record<string, unknown> {
  return {
    platform_id: uuidValue(row.platform_id),
    enabled: row.enabled === true,
    max_file_bytes: Number(row.max_file_bytes ?? 0),
    max_files: Number(row.max_files ?? 0),
    max_total_bytes: Number(row.max_total_bytes ?? 0),
    reserved_bytes: Number(row.reserved_bytes ?? 0),
    reserved_count: Number(row.reserved_count ?? 0),
    available_bytes: Number(row.available_bytes ?? 0),
    available_count: Number(row.available_count ?? 0),
    over_quota: row.over_quota === true,
    updated_at: isoDate(row.updated_at),
  };
}

export function adminFileDto(row: Row): Record<string, unknown> {
  return {
    ...fileDto(row),
    platform_id: uuidValue(row.platform_id),
    platform_account_id: uuidValue(row.platform_account_id),
  };
}

export function adminAuditDto(row: Row): Record<string, unknown> {
  return {
    id: uuidValue(row.audit_id ?? row.id),
    request_id: uuidValue(row.request_id),
    action: stringValue(row.event_type),
    actor_type: stringValue(row.actor_type),
    actor_id: uuidValue(row.actor_id ?? row.actor_user_id),
    target_type: stringValue(row.target_type),
    target_id: uuidValue(row.target_id),
    outcome: stringValue(row.outcome),
    created_at: isoDate(row.created_at),
  };
}

export function deletionJobDto(row: Row): Record<string, unknown> {
  return {
    job_id: row.job_id,
    request_id: row.request_id,
    user_id: row.user_id,
    state: row.state,
    checkpoint: row.checkpoint,
    fence: row.fence,
    retry_count: row.retry_count,
    next_attempt_at: row.next_attempt_at,
    last_error_code: row.last_error_code,
    created_at: row.created_at,
    completed_at: row.completed_at,
  };
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function entitlementDto(row: Row) {
  const code = stringValue(row.code);
  const subscriptionProductCode = stringValue(row.subscription_product_code);
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
    subscription_product: subscriptionProductCode
      ? {
          code: subscriptionProductCode,
          name:
            stringValue(row.subscription_product_name) ??
            subscriptionProductCode,
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

export function subscriptionProductDto(row: Row): SubscriptionProductDto {
  const dto: unknown = {
    code: stringValue(row.product_code),
    name: stringValue(row.product_name),
    description: stringValue(row.product_description),
    price: stringValue(row.price_amount),
    currency: stringValue(row.currency),
    term: {
      kind: stringValue(row.term_kind),
      duration_value:
        row.duration_value === null || row.duration_value === undefined
          ? null
          : Number(row.duration_value),
      duration_unit: stringValue(row.duration_unit),
    },
    price_version: Number(row.price_version),
    recommended: row.recommended === true,
    enabled: row.enabled === true,
    purchasable: row.purchasable === true,
    reason: stringValue(row.reason),
  };
  if (!isSubscriptionProductDto(dto))
    throw new ApiFault(503, 'AUTHORIZATION_UNAVAILABLE');
  return dto;
}

export function subscriptionCheckoutDto(
  row: Row,
  paymentUrl: string | null = null,
): SubscriptionCheckoutDto {
  const status = isBillingCheckoutStatus(row.status) ? row.status : 'pending';
  const providerStatus = isProviderOrderStatus(row.provider_status)
    ? row.provider_status
    : 'unknown';
  const verificationStatus = isBillingVerificationStatus(
    row.verification_status,
  )
    ? row.verification_status
    : 'unverified';
  const entitlementStatus = isBillingEntitlementStatus(row.entitlement_status)
    ? row.entitlement_status
    : 'not_started';
  const jobState: BillingJobState | null = isBillingJobState(row.job_state)
    ? row.job_state
    : null;
  const reason: BillingCheckoutProgressReason =
    status === 'granted'
      ? 'entitlement_granted'
      : status === 'resolved'
        ? 'resolved'
        : status === 'review_required'
          ? 'manual_review'
          : status === 'expired'
            ? 'expired'
            : status === 'paid'
              ? 'payment_observed'
              : status === 'verified'
                ? 'verification_pending'
                : 'awaiting_payment';
  const nextAction: BillingCheckoutNextAction =
    status === 'granted' || status === 'resolved'
      ? 'none'
      : status === 'review_required'
        ? 'contact_support'
        : status === 'expired'
          ? 'create_new_checkout'
          : status === 'paid' || status === 'verified'
            ? 'wait'
            : 'pay_provider';
  return {
    checkout_id: uuidValue(row.checkout_id ?? row.id) ?? '',
    status,
    product_code: (stringValue(row.product_code) ??
      'monthly') as SubscriptionCheckoutDto['product_code'],
    price: String(row.price_amount ?? '0.00'),
    currency: 'CNY',
    term: {
      kind: 'finite',
      duration_value: Number(row.duration_value ?? 0),
      duration_unit: (stringValue(row.duration_unit) ?? 'month') as
        | 'month'
        | 'year',
    },
    expires_at: isoDate(row.expires_at) ?? new Date(0).toISOString(),
    provider_display_name: stringValue(row.provider_display_name),
    payment_url: paymentUrl,
    paid_at: isoDate(row.paid_at),
    granted_at: isoDate(row.granted_at),
    progress: {
      status,
      provider_status: providerStatus,
      verification_status: verificationStatus,
      entitlement_status: entitlementStatus,
      job_state: jobState,
      reason,
      next_action: nextAction,
    },
  };
}

function stringArrayValue(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

export async function checkoutPaymentUrl(
  transaction: Transaction,
  contextValues: readonly unknown[],
  checkout: Row,
  dependencies: AccountApiDependencies,
): Promise<string | null> {
  if (stringValue(checkout.status) !== 'pending') return null;
  const checkoutId = uuidValue(checkout.checkout_id ?? checkout.id);
  if (!checkoutId) return null;
  const [facts] = await transaction.unsafe<Row>(
    'select * from private.subscription_checkout_payment_facts(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid)',
    [...contextValues, checkoutId],
  );
  if (!facts) return null;
  try {
    return buildAfdianCheckoutUrl({
      baseUrl:
        dependencies.afdianCheckoutBaseUrl ??
        Deno.env.get('AFDIAN_CHECKOUT_BASE_URL'),
      requireHttps: providerUrlsRequireHttps(),
      productType: stringValue(facts.product_type) ?? '',
      externalPlanId: stringValue(facts.external_plan_id) ?? '',
      externalSkuIds: stringArrayValue(facts.external_sku_ids),
      customOrderId: stringValue(facts.custom_order_id) ?? '',
    });
  } catch {
    return null;
  }
}

export async function body(request: Request): Promise<Record<string, unknown>> {
  const bytes = new TextEncoder().encode(await request.text());
  if (bytes.byteLength > 65536) throw new ApiFault(413, 'PAYLOAD_TOO_LARGE');
  try {
    return jsonObject(JSON.parse(new TextDecoder().decode(bytes)));
  } catch (error) {
    if (error instanceof ApiFault) throw error;
    throw new ApiFault(400, 'INVALID_INPUT');
  }
}

export function expectedVersion(request: Request): number {
  const value = request.headers.get('if-match');
  if (!value) throw new ApiFault(428, 'PRECONDITION_REQUIRED');
  const match = /^(?:W\/)?"(\d+)"$/u.exec(value);
  if (!match) throw new ApiFault(400, 'INVALID_INPUT');
  return Number.parseInt(match[1]!, 10);
}

export function withEtag(row: Row): Record<string, string> {
  const version = Number(row.row_version);
  return Number.isSafeInteger(version) ? { ETag: `W/"${version}"` } : {};
}

export function requestPath(request: Request): string {
  return new URL(request.url).pathname
    .replace(/^\/functions\/v1\/account-api(?:\/|$)/iu, '')
    .replace(/^\/account-api(?:\/|$)/iu, '')
    .replace(/^\/+/u, '');
}
