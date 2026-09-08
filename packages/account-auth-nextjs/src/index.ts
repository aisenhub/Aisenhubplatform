import { requireSafeReturnTo, safeReturnTo } from '@kit/account-auth';
import { createBrowserClient, createServerClient } from '@supabase/ssr';
import {
  createClient,
  type Session,
  type SupabaseClient,
} from '@supabase/supabase-js';

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

export interface SupabaseAuthConfig {
  readonly url: string;
  readonly publishableKey: string;
  readonly cookieName?: string;
}

export interface CookieStore {
  readonly getAll: () => readonly { name: string; value: string }[];
  readonly setAll: (
    cookies: readonly {
      name: string;
      value: string;
      options: Record<string, unknown>;
    }[],
  ) => void;
}

export function createBrowserSupabaseClient(
  config: SupabaseAuthConfig,
): SupabaseClient {
  return createBrowserClient(config.url, config.publishableKey, {
    ...(config.cookieName
      ? { cookieOptions: { name: config.cookieName } }
      : {}),
  });
}

export function createServerSupabaseClient(
  config: SupabaseAuthConfig,
  cookies: CookieStore,
): SupabaseClient {
  return createServerClient(config.url, config.publishableKey, {
    ...(config.cookieName
      ? { cookieOptions: { name: config.cookieName } }
      : {}),
    cookies: {
      getAll: () => [...cookies.getAll()],
      setAll: (values) => cookies.setAll(values),
    },
  });
}

/** A request-scoped Auth client that never persists tokens to a shared store. */
export function createRequestAuthClient(
  config: SupabaseAuthConfig,
): SupabaseClient {
  return createClient(config.url, config.publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

export function authCookieNames(prefix: 'consumer' | 'admin' = 'consumer') {
  return prefix === 'admin'
    ? {
        access: 'aisenhub-admin-session',
        refresh: 'aisenhub-admin-refresh-token',
        csrf: 'aisenhub-csrf',
      }
    : {
        access: 'aisenhub-session',
        refresh: 'aisenhub-refresh-token',
        csrf: 'aisenhub-csrf',
      };
}

export interface AuthCookieWriter {
  readonly set: (
    name: string,
    value: string,
    options: {
      httpOnly: boolean;
      secure: boolean;
      sameSite: 'lax' | 'strict';
      path: '/';
      maxAge: number;
    },
  ) => void;
  readonly delete: (name: string) => void;
}

export function writeAuthSessionCookies(input: {
  readonly writer: AuthCookieWriter;
  readonly session: Session;
  readonly secure: boolean;
  readonly prefix?: 'consumer' | 'admin';
  readonly csrfToken?: string;
}): string {
  const names = authCookieNames(input.prefix);
  const maxAge = Math.max(60, input.session.expires_in);
  const base = {
    secure: input.secure,
    sameSite: 'lax' as const,
    path: '/' as const,
    maxAge,
  };
  input.writer.set(names.access, input.session.access_token, {
    ...base,
    httpOnly: true,
  });
  input.writer.set(names.refresh, input.session.refresh_token, {
    ...base,
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
  });
  const csrfToken = input.csrfToken ?? crypto.randomUUID();
  input.writer.set(names.csrf, csrfToken, {
    ...base,
    httpOnly: false,
  });
  return csrfToken;
}

export function clearAuthSessionCookies(
  writer: Pick<AuthCookieWriter, 'delete'>,
  prefix: 'consumer' | 'admin' = 'consumer',
): void {
  const names = authCookieNames(prefix);
  writer.delete(names.access);
  writer.delete(names.refresh);
  writer.delete(names.csrf);
  writer.delete('aisenhub-recent-auth-proof');
}

export async function signInWithPassword(
  client: SupabaseClient,
  input: { readonly email: string; readonly password: string },
) {
  return client.auth.signInWithPassword(input);
}

export async function refreshAuthSession(
  client: SupabaseClient,
  refreshToken: string,
) {
  return client.auth.refreshSession({ refresh_token: refreshToken });
}

export async function setRequestAuthSession(
  client: SupabaseClient,
  tokens: { readonly access_token: string; readonly refresh_token: string },
) {
  return client.auth.setSession(tokens);
}

export async function listMfaFactors(client: SupabaseClient) {
  return client.auth.mfa.listFactors();
}

export async function verifyMfaFactor(
  client: SupabaseClient,
  input: { readonly factorId: string; readonly code: string },
) {
  return client.auth.mfa.challengeAndVerify(input);
}

export async function requestReauthentication(client: SupabaseClient) {
  return client.auth.reauthenticate();
}

export async function verifyReauthenticationOtp(
  client: SupabaseClient,
  input: { readonly email: string; readonly token: string },
) {
  return client.auth.verifyOtp({
    email: input.email,
    token: input.token,
    type: 'reauthentication',
  });
}

export async function exchangeAuthCode(client: SupabaseClient, code: string) {
  return client.auth.exchangeCodeForSession(code);
}

export async function signUpWithPassword(
  client: SupabaseClient,
  input: {
    readonly email: string;
    readonly password: string;
    readonly emailRedirectTo?: string;
  },
) {
  return client.auth.signUp({
    email: input.email,
    password: input.password,
    options: input.emailRedirectTo
      ? { emailRedirectTo: input.emailRedirectTo }
      : undefined,
  });
}

export async function requestPasswordReset(
  client: SupabaseClient,
  email: string,
  redirectTo: string,
) {
  return client.auth.resetPasswordForEmail(email, { redirectTo });
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
