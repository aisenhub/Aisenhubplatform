import { requireSafeReturnTo, safeReturnTo } from '@kit/account-auth';

export interface CookiePolicy {
  readonly name: string;
  readonly httpOnly: true;
  readonly secure: true;
  readonly sameSite: 'lax' | 'strict';
  readonly path: '/';
}

export const AUTH_COOKIE_POLICY: CookiePolicy = {
  name: 'aisenhub-session',
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
};

export interface RequestHeaders {
  readonly origin?: string;
  readonly host?: string;
  readonly cookie?: string;
  readonly [name: string]: string | undefined;
}

export interface PerRequestClient<TClient> {
  readonly client: TClient;
  readonly headers: RequestHeaders;
  readonly returnTo: string;
}

export function createPerRequestClient<TClient>(
  factory: (headers: RequestHeaders) => TClient,
  headers: RequestHeaders,
  returnTo?: string,
): PerRequestClient<TClient> {
  return {
    client: factory({ ...headers }),
    headers: { ...headers },
    returnTo: safeReturnTo(returnTo),
  };
}

export function assertSameOrigin(
  headers: RequestHeaders,
  trustedOrigin: string,
): void {
  if (!headers.origin || headers.origin !== trustedOrigin)
    throw new Error('CSRF_ORIGIN_MISMATCH');
}

export function callbackReturnTo(value: string | null | undefined): string {
  return requireSafeReturnTo(value);
}

export function noStoreHeaders(requestId: string): Record<string, string> {
  return { 'Cache-Control': 'no-store', 'X-Request-Id': requestId };
}

/**
 * Ends the current Supabase Auth session before the caller clears its own
 * cookies. A local cookie deletion alone leaves the refresh-token session
 * active on Auth and therefore cannot support server-side revocation checks.
 */
export async function revokeSupabaseSession(input: {
  readonly url: string;
  readonly publishableKey: string;
  readonly accessToken: string;
  readonly fetcher?: typeof fetch;
}): Promise<void> {
  const fetcher = input.fetcher ?? fetch;
  const response = await fetcher(
    `${input.url.replace(/\/$/u, '')}/auth/v1/logout`,
    {
      method: 'POST',
      headers: {
        apikey: input.publishableKey,
        Authorization: `Bearer ${input.accessToken}`,
      },
      cache: 'no-store',
    },
  );
  // A missing or already-revoked session is terminally safe: no usable
  // server session remains. Infrastructure errors must not masquerade as a
  // successful logout, so the caller can retain cookies and allow a retry.
  if (response.ok || response.status === 401 || response.status === 403) return;
  throw new Error('AUTH_LOGOUT_UNAVAILABLE');
}
