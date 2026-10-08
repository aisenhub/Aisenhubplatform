const DEFAULT_ACCOUNT_API_TIMEOUT_MS = 5_000;
const MAX_ACCOUNT_API_TIMEOUT_MS = 30_000;
const MAX_SAFE_READ_RETRIES = 2;

export class AccountApiUpstreamError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;

  constructor(status: number, code: string, requestId: string | null = null) {
    super(code);
    this.name = 'AccountApiUpstreamError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

export function accountApiTimeoutMs(): number {
  const configured = Number.parseInt(
    process.env.ACCOUNT_API_TIMEOUT_MS ?? '',
    10,
  );
  return Number.isSafeInteger(configured) && configured > 0
    ? Math.min(configured, MAX_ACCOUNT_API_TIMEOUT_MS)
    : DEFAULT_ACCOUNT_API_TIMEOUT_MS;
}

export function accountApiSignal(): AbortSignal {
  return AbortSignal.timeout(accountApiTimeoutMs());
}

type AccountApiJsonOptions = {
  readonly method?: 'GET' | 'POST';
  readonly accessToken?: string;
  readonly reauthAccessToken?: string;
  readonly requirePlatformKey?: boolean;
  readonly body?: Readonly<Record<string, unknown>>;
};

function retryableStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}

export async function accountApiJson<T>(
  path: string,
  options: AccountApiJsonOptions = {},
): Promise<{ readonly data: T; readonly requestId: string | null }> {
  const baseUrl = process.env.ACCOUNT_API_URL?.replace(/\/$/u, '');
  if (!baseUrl)
    throw new AccountApiUpstreamError(503, 'AUTHORIZATION_UNAVAILABLE');
  const requirePlatformKey = options.requirePlatformKey ?? true;
  const platformKey = process.env.ACCOUNT_PLATFORM_KEY;
  if (requirePlatformKey && !platformKey)
    throw new AccountApiUpstreamError(503, 'AUTHORIZATION_UNAVAILABLE');

  const method = options.method ?? 'GET';
  const deadline = Date.now() + accountApiTimeoutMs();
  const maxRetries = method === 'GET' ? MAX_SAFE_READ_RETRIES : 0;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0)
      throw new AccountApiUpstreamError(503, 'AUTHORIZATION_UNAVAILABLE');
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-store',
          ...(platformKey && requirePlatformKey
            ? { 'X-Platform-Key': platformKey }
            : {}),
          ...(options.accessToken
            ? { Authorization: `Bearer ${options.accessToken}` }
            : {}),
          ...(options.reauthAccessToken
            ? { 'X-Reauth-Access-Token': options.reauthAccessToken }
            : {}),
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        },
        cache: 'no-store',
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(remainingMs),
      });
      const payload = (await response.json().catch(() => null)) as {
        readonly data?: T;
        readonly error?: { readonly code?: string };
        readonly request_id?: string;
      } | null;
      const requestId =
        payload?.request_id ?? response.headers.get('x-request-id') ?? null;
      if (!response.ok) {
        if (retryableStatus(response.status) && attempt < maxRetries) continue;
        throw new AccountApiUpstreamError(
          response.status,
          payload?.error?.code ?? 'AUTHORIZATION_UNAVAILABLE',
          requestId,
        );
      }
      if (payload?.data === undefined)
        throw new AccountApiUpstreamError(
          502,
          'AUTHORIZATION_UNAVAILABLE',
          requestId,
        );
      return { data: payload.data, requestId };
    } catch (error) {
      if (error instanceof AccountApiUpstreamError) throw error;
      if (attempt < maxRetries) continue;
      throw new AccountApiUpstreamError(503, 'AUTHORIZATION_UNAVAILABLE');
    }
  }
  throw new AccountApiUpstreamError(503, 'AUTHORIZATION_UNAVAILABLE');
}
