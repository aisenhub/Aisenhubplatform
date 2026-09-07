import type {
  AuthSession,
  RecentAuthProof,
  SessionVerifier,
} from '@kit/account-auth';
import type {
  ApiErrorCode,
  ApiResponse,
  EntitlementDto,
  PlanDto,
  PreferencesDto,
  ProfileDto,
} from '@kit/domain/contracts';
import { createHmac, randomBytes } from 'node:crypto';

export type { ApiErrorCode } from '@kit/domain/contracts';

export interface Membership {
  readonly userId: string;
  readonly role: 'admin' | 'support';
  readonly active: boolean;
}

export interface AdminAuthorization {
  readonly session: AuthSession;
  readonly membership: Membership;
  readonly proof?: RecentAuthProof;
}

export type AuthorizationFailure =
  | 'UNAUTHORIZED'
  | 'ADMIN_REQUIRED'
  | 'AAL2_REQUIRED'
  | 'RECENT_MFA_REQUIRED';

export interface AuthorizationResult<T> {
  readonly ok: true;
  readonly value: T;
}

export interface AuthorizationError {
  readonly ok: false;
  readonly code: AuthorizationFailure;
}

export type AuthorizationOutcome<T> =
  | AuthorizationResult<T>
  | AuthorizationError;

export async function authorizeAdminRequest(input: {
  readonly accessToken: string;
  readonly verifier: SessionVerifier;
  readonly lookupMembership: (userId: string) => Promise<Membership | null>;
  readonly proof: RecentAuthProof | null;
  readonly sensitive: boolean;
  readonly now?: Date;
}): Promise<AuthorizationOutcome<AdminAuthorization>> {
  const sessionResult = await input.verifier.verifySession({
    accessToken: input.accessToken,
    now: input.now,
  });
  if (!sessionResult.ok) return { ok: false, code: 'UNAUTHORIZED' };
  const session = sessionResult.session;
  if (session.aal !== 'aal2') return { ok: false, code: 'AAL2_REQUIRED' };
  const membership = await input.lookupMembership(session.userId);
  if (!membership || !membership.active || membership.role !== 'admin')
    return { ok: false, code: 'ADMIN_REQUIRED' };
  if (input.sensitive) {
    const proofResult = input.verifier.verifyRecentAuth({
      proof: input.proof,
      session,
      now: input.now,
    });
    if (!proofResult.ok) return { ok: false, code: 'RECENT_MFA_REQUIRED' };
    return {
      ok: true,
      value: { session, membership, proof: proofResult.proof },
    };
  }
  return { ok: true, value: { session, membership } };
}

export async function authorizeAccountRequest(input: {
  readonly accessToken: string;
  readonly verifier: SessionVerifier;
  readonly expectedUserId?: string;
  readonly proof?: RecentAuthProof | null;
  readonly requiresRecentAuth?: boolean;
  readonly now?: Date;
}): Promise<AuthorizationOutcome<AuthSession>> {
  const result = await input.verifier.verifySession({
    accessToken: input.accessToken,
    expectedUserId: input.expectedUserId,
    now: input.now,
  });
  if (!result.ok) return { ok: false, code: 'UNAUTHORIZED' };
  if (input.requiresRecentAuth) {
    const proof = input.verifier.verifyRecentAuth({
      proof: input.proof ?? null,
      session: result.session,
      now: input.now,
    });
    if (!proof.ok) return { ok: false, code: 'RECENT_MFA_REQUIRED' };
  }
  return { ok: true, value: result.session };
}

export interface PlatformKeyMaterial {
  readonly keyId: string;
  readonly version: number;
  readonly presentedKey: string;
  readonly keyHmac: string;
  readonly keyPrefix: string;
  readonly keySuffix: string;
}

export function generatePlatformKeyMaterial(input: {
  readonly hmacSecret: string;
  readonly version: number;
  readonly platformId: string;
  readonly keyId?: string;
}): PlatformKeyMaterial {
  if (!input.hmacSecret || input.version < 1 || !input.platformId)
    throw new Error('INVALID_KEY_INPUT');
  const keyId = input.keyId ?? crypto.randomUUID();
  const raw = randomBytes(32).toString('base64url');
  const presentedKey = `phk_v${input.version}_${keyId}_${raw}`;
  const keyHmac = createHmac('sha256', input.hmacSecret)
    .update(`${input.version}:platform:${input.platformId}:${presentedKey}`)
    .digest('hex');
  return {
    keyId,
    version: input.version,
    presentedKey,
    keyHmac,
    keyPrefix: presentedKey.slice(0, 12),
    keySuffix: presentedKey.slice(-8),
  };
}

export const REDEMPTION_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ023456789';

export interface RedemptionCodeMaterial {
  readonly code: string;
  readonly codeHmac: string;
  readonly hmacKeyVersion: number;
  readonly codePrefix: string;
  readonly codeSuffix: string;
}

function randomRedemptionCode(length: number): string {
  const result: string[] = [];
  const alphabetLength = REDEMPTION_CODE_ALPHABET.length;
  const rejectionLimit = 256 - (256 % alphabetLength);
  while (result.length < length) {
    const bytes = randomBytes(length - result.length + 8);
    for (const byte of bytes) {
      if (byte >= rejectionLimit) continue;
      result.push(REDEMPTION_CODE_ALPHABET[byte % alphabetLength]!);
      if (result.length === length) break;
    }
  }
  return result.join('');
}

export function generateRedemptionCodes(input: {
  readonly platformId: string;
  readonly hmacSecret: string;
  readonly hmacKeyVersion: number;
  readonly quantity: number;
  readonly length?: number;
}): readonly RedemptionCodeMaterial[] {
  const length = input.length ?? 31;
  if (
    !input.platformId ||
    input.hmacSecret.length < 16 ||
    !Number.isInteger(input.hmacKeyVersion) ||
    input.hmacKeyVersion < 1 ||
    !Number.isInteger(input.quantity) ||
    input.quantity < 1 ||
    input.quantity > 1000 ||
    !Number.isInteger(length) ||
    length < 16 ||
    length > 128
  )
    throw new Error('INVALID_REDEMPTION_CODE_INPUT');

  return Array.from({ length: input.quantity }, () => {
    const code = randomRedemptionCode(length);
    const codeHmac = createHmac('sha256', input.hmacSecret)
      .update(
        `redeem:v1:platform:${input.platformId}:key:${input.hmacKeyVersion}:code:${code}`,
      )
      .digest('hex');
    return {
      code,
      codeHmac,
      hmacKeyVersion: input.hmacKeyVersion,
      codePrefix: code.slice(0, 4),
      codeSuffix: code.slice(-4),
    };
  });
}

export function normalizeOrigin(value: string): string {
  const url = new URL(value);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('INVALID_ORIGIN');
  return url.origin;
}

export function validateCallbackUrl(value: string, origin: string): string {
  const normalizedOrigin = normalizeOrigin(origin);
  const callback = new URL(value);
  if (
    callback.origin !== normalizedOrigin ||
    callback.protocol !== new URL(normalizedOrigin).protocol
  )
    throw new Error('ORIGIN_MISMATCH');
  return callback.toString();
}

export interface AccountApiClient {
  readonly listPublicPlans: () => Promise<readonly PlanDto[]>;
  readonly getPrincipal: (accessToken: string) => Promise<unknown>;
  readonly activate: (accessToken: string) => Promise<unknown>;
  readonly getProfile: (accessToken: string) => Promise<ProfileDto>;
  readonly patchProfile: (
    accessToken: string,
    ifMatch: string,
    patch: Readonly<Record<string, unknown>>,
  ) => Promise<ProfileDto>;
  readonly getPreferences: (accessToken: string) => Promise<PreferencesDto>;
  readonly patchPreferences: (
    accessToken: string,
    ifMatch: string,
    patch: Readonly<Record<string, unknown>>,
  ) => Promise<PreferencesDto>;
  readonly getSubscription: (accessToken: string) => Promise<EntitlementDto>;
  readonly redeemSubscription: (
    accessToken: string,
    code: string,
    idempotencyKey: string,
  ) => Promise<EntitlementDto>;
}

export interface AccountApiFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly json: () => Promise<unknown>;
}

export type AccountApiFetcher = (
  input: string,
  init: {
    readonly method: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly body?: string;
  },
) => Promise<AccountApiFetchResponse>;

export class AccountApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;

  constructor(status: number, code: ApiErrorCode) {
    super(code);
    this.name = 'AccountApiError';
    this.status = status;
    this.code = code;
  }
}

export function createAccountApiClient(input: {
  readonly baseUrl: string;
  readonly platformKey: string;
  readonly fetcher?: AccountApiFetcher;
}): AccountApiClient {
  const baseUrl = input.baseUrl.replace(/\/$/u, '');
  const fetcher: AccountApiFetcher =
    input.fetcher ??
    (async (url, init) =>
      fetch(url, {
        method: init.method,
        headers: init.headers,
        body: init.body,
      }));

  async function request<T>(options: {
    readonly method: 'GET' | 'POST' | 'PATCH';
    readonly path: string;
    readonly accessToken?: string;
    readonly ifMatch?: string;
    readonly idempotencyKey?: string;
    readonly body?: Readonly<Record<string, unknown>>;
  }): Promise<T> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Cache-Control': 'no-store',
      'X-Platform-Key': input.platformKey,
    };
    if (options.accessToken)
      headers.Authorization = `Bearer ${options.accessToken}`;
    if (options.ifMatch) headers['If-Match'] = options.ifMatch;
    if (options.idempotencyKey)
      headers['Idempotency-Key'] = options.idempotencyKey;
    if (options.body) {
      headers['Content-Type'] = 'application/json';
    }
    const response = await fetcher(`${baseUrl}${options.path}`, {
      method: options.method,
      headers,
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });
    const payload = (await response.json()) as
      | ApiResponse<T>
      | { readonly error?: { readonly code?: ApiErrorCode } };
    if (!response.ok) {
      const code =
        'error' in payload
          ? (payload.error?.code ?? 'AUTHORIZATION_UNAVAILABLE')
          : 'AUTHORIZATION_UNAVAILABLE';
      throw new AccountApiError(response.status, code);
    }
    if (!('data' in payload))
      throw new AccountApiError(502, 'AUTHORIZATION_UNAVAILABLE');
    return payload.data;
  }

  return {
    listPublicPlans: () =>
      request<readonly PlanDto[]>({ method: 'GET', path: '/v1/plans' }),
    getPrincipal: (accessToken) =>
      request({ method: 'GET', path: '/v1/account/principal', accessToken }),
    activate: (accessToken) =>
      request({ method: 'POST', path: '/v1/account/activate', accessToken }),
    getProfile: (accessToken) =>
      request<ProfileDto>({ method: 'GET', path: '/v1/profile', accessToken }),
    patchProfile: (accessToken, ifMatch, patch) =>
      request<ProfileDto>({
        method: 'PATCH',
        path: '/v1/profile',
        accessToken,
        ifMatch,
        body: patch,
      }),
    getPreferences: (accessToken) =>
      request<PreferencesDto>({
        method: 'GET',
        path: '/v1/preferences',
        accessToken,
      }),
    patchPreferences: (accessToken, ifMatch, patch) =>
      request<PreferencesDto>({
        method: 'PATCH',
        path: '/v1/preferences',
        accessToken,
        ifMatch,
        body: patch,
      }),
    getSubscription: (accessToken) =>
      request<EntitlementDto>({
        method: 'GET',
        path: '/v1/subscription',
        accessToken,
      }),
    redeemSubscription: (accessToken, code, idempotencyKey) =>
      request<EntitlementDto>({
        method: 'POST',
        path: '/v1/subscription/redeem',
        accessToken,
        idempotencyKey,
        body: { code },
      }),
  };
}
