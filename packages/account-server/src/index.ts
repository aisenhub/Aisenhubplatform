import type {
  AuthSession,
  RecentAuthProof,
  SessionVerifier,
} from '@kit/account-auth';
import type {
  ApiErrorCode,
  ApiResponse,
  AccountPrincipalDto,
  DeleteRequestDto,
  EntitlementDto,
  PlanDto,
  PreferencesDto,
  ProfileDto,
  RecentAuthProofDto,
  SubscriptionProductDto,
  ConfigFileDto,
  ConfigFileListDto,
  UploadIntentDto,
} from '@kit/domain/contracts';
import { generateRedemptionCodes as generateDomainRedemptionCodes } from '@kit/domain';
import type { RedemptionCodeMaterial } from '@kit/domain';
export { REDEMPTION_CODE_ALPHABET } from '@kit/domain';
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
    .update(`${input.version}:platform-key:${keyId}:${presentedKey}`)
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

export async function generateRedemptionCodes(input: {
  readonly platformId: string;
  readonly hmacSecret: string;
  readonly hmacKeyVersion: number;
  readonly quantity: number;
  readonly length?: number;
}): Promise<readonly RedemptionCodeMaterial[]> {
  return generateDomainRedemptionCodes(input);
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
  readonly issueRecentAuthProof: (
    accessToken: string,
    reauthAccessToken: string,
  ) => Promise<RecentAuthProofDto>;
  readonly closeAccount: (
    accessToken: string,
    recentAuthProofId: string,
  ) => Promise<AccountPrincipalDto>;
  readonly requestIdentityDeletion: (
    accessToken: string,
    recentAuthProofId: string,
  ) => Promise<DeleteRequestDto>;
  readonly listPublicPlans: () => Promise<readonly PlanDto[]>;
  readonly listSubscriptionProducts: () => Promise<readonly SubscriptionProductDto[]>;
  readonly getPrincipal: (accessToken: string) => Promise<AccountPrincipalDto>;
  readonly activate: (accessToken: string) => Promise<AccountPrincipalDto>;
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
  readonly createUploadIntent: (
    accessToken: string,
    input: {
      readonly name: string;
      readonly size: number;
      readonly content_type: string;
      readonly purpose: 'config';
      readonly replaces_file_id?: string | null;
    },
    idempotencyKey: string,
  ) => Promise<UploadIntentDto>;
  readonly uploadContent: (
    accessToken: string,
    fileId: string,
    body: Uint8Array,
    idempotencyKey: string,
  ) => Promise<ConfigFileDto>;
  readonly deleteConfigFile: (
    accessToken: string,
    fileId: string,
    idempotencyKey: string,
  ) => Promise<ConfigFileDto>;
  readonly listConfigFiles: (
    accessToken: string,
    cursor?: string | null,
    limit?: number,
  ) => Promise<ConfigFileListDto>;
  readonly getConfigFile: (
    accessToken: string,
    fileId: string,
  ) => Promise<ConfigFileDto>;
  readonly downloadConfigFile: (
    accessToken: string,
    fileId: string,
  ) => Promise<AccountApiBinaryResponse>;
}

export type AccountApiRequestBody = string | Uint8Array;

export interface AccountApiFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly json: () => Promise<unknown>;
}

export interface AccountApiBinaryResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly headers?: Headers;
  readonly body?: ReadableStream<Uint8Array> | null;
  readonly arrayBuffer?: () => Promise<ArrayBuffer>;
  readonly json?: () => Promise<unknown>;
}

export type AccountApiFetcher = (
  input: string,
  init: {
    readonly method: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly body?: AccountApiRequestBody;
    readonly signal?: AbortSignal;
  },
) => Promise<AccountApiFetchResponse & AccountApiBinaryResponse>;

export interface AccountApiRetryOptions {
  readonly maxRetries?: number;
  readonly baseDelayMs?: number;
  readonly maxDelayMs?: number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly random?: () => number;
}

export class AccountApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly requestId: string | null;

  constructor(
    status: number,
    code: ApiErrorCode,
    requestId: string | null = null,
  ) {
    super(code);
    this.name = 'AccountApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

export function createAccountApiClient(input: {
  readonly baseUrl: string;
  readonly platformKey: string;
  readonly fetcher?: AccountApiFetcher;
  readonly timeoutMs?: number;
  readonly retry?: AccountApiRetryOptions;
}): AccountApiClient {
  const baseUrl = input.baseUrl.replace(/\/$/u, '');
  const timeoutMs = input.timeoutMs ?? 5_000;
  const retry = input.retry ?? {};
  const maxRetries = Math.max(0, Math.min(retry.maxRetries ?? 2, 2));
  const baseDelayMs = Math.max(0, retry.baseDelayMs ?? 50);
  const maxDelayMs = Math.max(baseDelayMs, retry.maxDelayMs ?? 500);
  const sleep =
    retry.sleep ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const random = retry.random ?? Math.random;
  const fetcher: AccountApiFetcher =
    input.fetcher ??
    (async (url, init) =>
      fetch(url, {
        method: init.method,
        headers: init.headers,
        body: init.body as never,
        signal: init.signal,
      }));

  function retryableStatus(status: number): boolean {
    return status === 502 || status === 503 || status === 504;
  }

  function retryDelay(attempt: number): number {
    const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
    return Math.round(exponential * (0.75 + random() * 0.5));
  }

  function retryableOperation(options: {
    readonly method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    readonly idempotencyKey?: string;
    readonly binaryBody?: Uint8Array;
  }): boolean {
    if (options.binaryBody) return false;
    return options.method === 'GET' || Boolean(options.idempotencyKey);
  }

  async function waitForRetry(
    attempt: number,
    deadline: number,
  ): Promise<void> {
    const delayMs = retryDelay(attempt);
    if (Date.now() + delayMs >= deadline)
      throw new AccountApiError(503, 'AUTHORIZATION_UNAVAILABLE');
    await sleep(delayMs);
  }

  async function withTimeout<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    remainingMs = timeoutMs,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remainingMs);
    try {
      return await operation(controller.signal);
    } finally {
      clearTimeout(timer);
    }
  }

  async function request<T>(options: {
    readonly method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    readonly path: string;
    readonly accessToken?: string;
    readonly ifMatch?: string;
    readonly idempotencyKey?: string;
    readonly reauthAccessToken?: string;
    readonly recentAuthProofId?: string;
    readonly contentType?: string;
    readonly body?: Readonly<Record<string, unknown>>;
    readonly binaryBody?: Uint8Array;
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
    if (options.reauthAccessToken)
      headers['X-Reauth-Access-Token'] = options.reauthAccessToken;
    if (options.recentAuthProofId)
      headers['X-Recent-Auth-Proof'] = options.recentAuthProofId;
    if (options.body || options.binaryBody) {
      headers['Content-Type'] = options.contentType ?? 'application/json';
    }
    const canRetry = retryableOperation(options);
    const deadline = Date.now() + timeoutMs;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0)
        throw new AccountApiError(503, 'AUTHORIZATION_UNAVAILABLE');
      try {
        const response = await withTimeout(
          (signal) =>
            fetcher(`${baseUrl}${options.path}`, {
              method: options.method,
              headers,
              signal,
              ...(options.binaryBody
                ? { body: options.binaryBody }
                : options.body
                  ? { body: JSON.stringify(options.body) }
                  : {}),
            }),
          remainingMs,
        );
        const payload = (await response.json()) as
          | ApiResponse<T>
          | {
              readonly error?: { readonly code?: ApiErrorCode };
              readonly request_id?: string;
            };
        const requestId =
          'request_id' in payload ? (payload.request_id ?? null) : null;
        if (!response.ok) {
          const code =
            'error' in payload
              ? (payload.error?.code ?? 'AUTHORIZATION_UNAVAILABLE')
              : 'AUTHORIZATION_UNAVAILABLE';
          if (
            canRetry &&
            retryableStatus(response.status) &&
            attempt < maxRetries
          ) {
            await waitForRetry(attempt, deadline);
            continue;
          }
          throw new AccountApiError(response.status, code, requestId);
        }
        if (!('data' in payload))
          throw new AccountApiError(
            502,
            'AUTHORIZATION_UNAVAILABLE',
            requestId,
          );
        return payload.data;
      } catch (error) {
        if (error instanceof AccountApiError) throw error;
        if (canRetry && attempt < maxRetries) {
          await waitForRetry(attempt, deadline);
          continue;
        }
        throw new AccountApiError(503, 'AUTHORIZATION_UNAVAILABLE');
      }
    }
    throw new AccountApiError(503, 'AUTHORIZATION_UNAVAILABLE');
  }

  async function requestBinary(options: {
    readonly path: string;
    readonly accessToken?: string;
  }): Promise<AccountApiBinaryResponse> {
    const deadline = Date.now() + timeoutMs;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0)
        throw new AccountApiError(503, 'AUTHORIZATION_UNAVAILABLE');
      try {
        const response = await withTimeout(
          (signal) =>
            fetcher(`${baseUrl}${options.path}`, {
              method: 'GET',
              headers: {
                Accept: 'application/octet-stream',
                'Cache-Control': 'no-store',
                'X-Platform-Key': input.platformKey,
                ...(options.accessToken
                  ? { Authorization: `Bearer ${options.accessToken}` }
                  : {}),
              },
              signal,
            }),
          remainingMs,
        );
        if (!response.ok) {
          let code: ApiErrorCode = 'AUTHORIZATION_UNAVAILABLE';
          let requestId: string | null = null;
          if (response.json) {
            const payload = (await response.json().catch(() => null)) as {
              readonly error?: { readonly code?: ApiErrorCode };
              readonly request_id?: string;
            } | null;
            code = payload?.error?.code ?? code;
            requestId = payload?.request_id ?? null;
          }
          if (retryableStatus(response.status) && attempt < maxRetries) {
            await waitForRetry(attempt, deadline);
            continue;
          }
          throw new AccountApiError(response.status, code, requestId);
        }
        return response;
      } catch (error) {
        if (error instanceof AccountApiError) throw error;
        if (attempt < maxRetries) {
          await waitForRetry(attempt, deadline);
          continue;
        }
        throw new AccountApiError(503, 'AUTHORIZATION_UNAVAILABLE');
      }
    }
    throw new AccountApiError(503, 'AUTHORIZATION_UNAVAILABLE');
  }

  return {
    issueRecentAuthProof: (accessToken, reauthAccessToken) =>
      request<RecentAuthProofDto>({
        method: 'POST',
        path: '/v1/auth/recent-proof',
        accessToken,
        reauthAccessToken,
      }),
    closeAccount: (accessToken, recentAuthProofId) =>
      request<AccountPrincipalDto>({
        method: 'POST',
        path: '/v1/account/close',
        accessToken,
        recentAuthProofId,
      }),
    requestIdentityDeletion: (accessToken, recentAuthProofId) =>
      request<DeleteRequestDto>({
        method: 'POST',
        path: '/v1/identity/delete-request',
        accessToken,
        recentAuthProofId,
      }),
    listPublicPlans: () =>
      request<readonly PlanDto[]>({ method: 'GET', path: '/v1/plans' }),
    listSubscriptionProducts: () =>
      request<readonly SubscriptionProductDto[]>({
        method: 'GET',
        path: '/v1/subscription/products',
      }),
    getPrincipal: (accessToken) =>
      request<AccountPrincipalDto>({
        method: 'GET',
        path: '/v1/account/principal',
        accessToken,
      }),
    activate: (accessToken) =>
      request<AccountPrincipalDto>({
        method: 'POST',
        path: '/v1/account/activate',
        accessToken,
      }),
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
        contentType: 'application/merge-patch+json',
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
    createUploadIntent: (accessToken, input, idempotencyKey) =>
      request<UploadIntentDto>({
        method: 'POST',
        path: '/v1/config-files/upload-intent',
        accessToken,
        idempotencyKey,
        body: input,
      }),
    uploadContent: (accessToken, fileId, body, idempotencyKey) =>
      request<ConfigFileDto>({
        method: 'PUT',
        path: `/v1/config-files/${encodeURIComponent(fileId)}/content`,
        accessToken,
        idempotencyKey,
        contentType: 'application/octet-stream',
        binaryBody: body,
      }),
    deleteConfigFile: (accessToken, fileId, idempotencyKey) =>
      request<ConfigFileDto>({
        method: 'DELETE',
        path: `/v1/config-files/${encodeURIComponent(fileId)}`,
        accessToken,
        idempotencyKey,
      }),
    listConfigFiles: (accessToken, cursor, limit) =>
      request<ConfigFileListDto>({
        method: 'GET',
        path: `/v1/config-files${
          cursor || limit
            ? `?${new URLSearchParams({
                ...(cursor ? { cursor } : {}),
                ...(limit ? { limit: String(limit) } : {}),
              }).toString()}`
            : ''
        }`,
        accessToken,
      }),
    getConfigFile: (accessToken, fileId) =>
      request<ConfigFileDto>({
        method: 'GET',
        path: `/v1/config-files/${encodeURIComponent(fileId)}`,
        accessToken,
      }),
    downloadConfigFile: (accessToken, fileId) =>
      requestBinary({
        path: `/v1/config-files/${encodeURIComponent(fileId)}/content`,
        accessToken,
      }),
  };
}
