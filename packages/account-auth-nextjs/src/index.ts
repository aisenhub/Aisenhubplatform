import { requireSafeReturnTo, safeReturnTo } from '@kit/account-auth';
import { createBrowserClient, createServerClient } from '@supabase/ssr';
import {
  createClient,
  type Session,
  type SupabaseClient,
} from '@supabase/supabase-js';
import { authCookieNames } from './cookie-policy.ts';

export { authCookieNames } from './cookie-policy.ts';

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

export const AUTH_COOKIE_MAX_AGE = {
  refresh: 60 * 60 * 24 * 30,
  csrf: 60 * 60 * 24 * 30,
  logoutFence: 60 * 60 * 24 * 31,
  loginAck: 60 * 60 * 24 * 30,
  authFlow: 15 * 60,
  recentProof: 5 * 60,
} as const;

export const NO_LOGOUT_FENCE = 'none';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function baseCookieOptions(input: {
  readonly secure: boolean;
  readonly sameSite?: 'lax' | 'strict';
  readonly maxAge: number;
}) {
  return {
    secure: input.secure,
    sameSite: input.sameSite ?? ('lax' as const),
    path: '/' as const,
    maxAge: input.maxAge,
  };
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const normalized =
      part.replace(/-/gu, '+').replace(/_/gu, '/') +
      '='.repeat((4 - (part.length % 4)) % 4);
    const binary = atob(normalized);
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0),
    );
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    return payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function sessionIdFromAccessToken(token: string): string | null {
  const payload = decodeJwtPayload(token);
  return isUuid(payload?.session_id) ? payload.session_id : null;
}

export function accessTokenIsUsable(token: string, now = Date.now()): boolean {
  const payload = decodeJwtPayload(token);
  return typeof payload?.exp === 'number' && payload.exp * 1000 > now;
}

export function currentLogoutFence(value: string | undefined): string {
  return isUuid(value) ? value : NO_LOGOUT_FENCE;
}

export interface AuthSessionAcknowledgement {
  readonly fence: string;
  readonly session_id: string;
}

function encodeOpaqueJson(value: object): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/gu, '-')
    .replace(/\//gu, '_')
    .replace(/=+$/u, '');
}

function decodeOpaqueJson(value: string): unknown {
  try {
    const normalized =
      value.replace(/-/gu, '+').replace(/_/gu, '/') +
      '='.repeat((4 - (value.length % 4)) % 4);
    const binary = atob(normalized);
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0),
    );
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return null;
  }
}

export function encodeAuthSessionAcknowledgement(
  value: AuthSessionAcknowledgement,
): string {
  return encodeOpaqueJson(value);
}

export function decodeAuthSessionAcknowledgement(
  value: string | undefined,
): AuthSessionAcknowledgement | null {
  const decoded = value ? decodeOpaqueJson(value) : null;
  if (!decoded || typeof decoded !== 'object') return null;
  const candidate = decoded as Record<string, unknown>;
  if (
    typeof candidate.fence !== 'string' ||
    (candidate.fence !== NO_LOGOUT_FENCE && !isUuid(candidate.fence)) ||
    !isUuid(candidate.session_id)
  )
    return null;
  return { fence: candidate.fence, session_id: candidate.session_id };
}

export function authSessionGate(input: {
  readonly accessToken?: string;
  readonly refreshToken?: string;
  readonly logoutFence?: string;
  readonly loginAck?: string;
}):
  | { readonly ok: true; readonly acknowledgement: AuthSessionAcknowledgement }
  | {
      readonly ok: false;
      readonly reason: 'missing_ack' | 'fence_mismatch' | 'session_mismatch';
    } {
  const acknowledgement = decodeAuthSessionAcknowledgement(input.loginAck);
  if (!acknowledgement) return { ok: false, reason: 'missing_ack' };
  if (acknowledgement.fence !== currentLogoutFence(input.logoutFence))
    return { ok: false, reason: 'fence_mismatch' };
  if (input.accessToken) {
    const sessionId = sessionIdFromAccessToken(input.accessToken);
    if (!sessionId || sessionId !== acknowledgement.session_id)
      return { ok: false, reason: 'session_mismatch' };
  } else if (!input.refreshToken) {
    return { ok: false, reason: 'missing_ack' };
  }
  return { ok: true, acknowledgement };
}

export function readLoginFlowFence(value: string | undefined): string | null {
  return value === undefined ? null : currentLogoutFence(value);
}

function deleteAuthMaterial(
  writer: Pick<AuthCookieWriter, 'delete'>,
  prefix: 'consumer' | 'admin',
): void {
  const names = authCookieNames(prefix);
  writer.delete(names.access);
  writer.delete(names.refresh);
  writer.delete(names.csrf);
  writer.delete(names.recentProof);
  writer.delete(names.loginAck);
  writer.delete(names.authFlow);
}

export function writeLogoutFence(input: {
  readonly writer: AuthCookieWriter;
  readonly secure: boolean;
  readonly prefix?: 'consumer' | 'admin';
}): string {
  const fence = crypto.randomUUID();
  input.writer.set(
    authCookieNames(input.prefix).logoutFence,
    fence,
    {
      ...baseCookieOptions({
        secure: input.secure,
        maxAge: AUTH_COOKIE_MAX_AGE.logoutFence,
      }),
      httpOnly: true,
    },
  );
  return fence;
}

export function writeLoginAcknowledgement(input: {
  readonly writer: AuthCookieWriter;
  readonly secure: boolean;
  readonly sessionId: string;
  readonly loginFence: string;
  readonly prefix?: 'consumer' | 'admin';
}): void {
  if (!isUuid(input.sessionId)) throw new Error('AUTH_SESSION_ID_INVALID');
  if (input.loginFence !== NO_LOGOUT_FENCE && !isUuid(input.loginFence))
    throw new Error('AUTH_LOGOUT_FENCE_INVALID');
  input.writer.set(
    authCookieNames(input.prefix).loginAck,
    encodeAuthSessionAcknowledgement({
      fence: input.loginFence,
      session_id: input.sessionId,
    }),
    {
      ...baseCookieOptions({
        secure: input.secure,
        maxAge: AUTH_COOKIE_MAX_AGE.loginAck,
      }),
      httpOnly: true,
    },
  );
}

export function writeAuthFlowFence(input: {
  readonly writer: AuthCookieWriter;
  readonly secure: boolean;
  readonly fence: string;
  readonly prefix?: 'consumer' | 'admin';
}): void {
  if (input.fence !== NO_LOGOUT_FENCE && !isUuid(input.fence))
    throw new Error('AUTH_LOGOUT_FENCE_INVALID');
  input.writer.set(
    authCookieNames(input.prefix).authFlow,
    input.fence,
    {
      ...baseCookieOptions({
        secure: input.secure,
        maxAge: AUTH_COOKIE_MAX_AGE.authFlow,
      }),
      httpOnly: true,
    },
  );
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
  const base = baseCookieOptions({ secure: input.secure, maxAge });
  input.writer.set(names.access, input.session.access_token, {
    ...base,
    httpOnly: true,
  });
  input.writer.set(names.refresh, input.session.refresh_token, {
    ...base,
    httpOnly: true,
    maxAge: AUTH_COOKIE_MAX_AGE.refresh,
  });
  const csrfToken = input.csrfToken ?? crypto.randomUUID();
  input.writer.set(names.csrf, csrfToken, {
    ...baseCookieOptions({
      secure: input.secure,
      maxAge: AUTH_COOKIE_MAX_AGE.csrf,
    }),
    httpOnly: false,
  });
  return csrfToken;
}

export function clearAuthSessionCookies(
  writer: Pick<AuthCookieWriter, 'delete'>,
  prefix: 'consumer' | 'admin' = 'consumer',
): void {
  deleteAuthMaterial(writer, prefix);
}

export function terminalClearAuthSessionCookies(input: {
  readonly writer: AuthCookieWriter;
  readonly secure: boolean;
  readonly prefix?: 'consumer' | 'admin';
}): string {
  deleteAuthMaterial(input.writer, input.prefix ?? 'consumer');
  return writeLogoutFence(input);
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
  if (!accessTokenIsUsable(tokens.access_token)) {
    return {
      data: { session: null },
      error: {
        name: 'AuthSessionExpiredError',
        message: 'SESSION_EXPIRED',
        status: 401,
      },
    } as const;
  }
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

/**
 * Starts an isolated email sign-in flow used as the ordinary-user recent-auth
 * event. The caller must never persist or return this client's session.
 */
export async function requestEmailOtp(client: SupabaseClient, email: string) {
  return client.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });
}

/** Verifies the token_hash delivered by the isolated email sign-in flow. */
export async function verifyEmailOtpToken(
  client: SupabaseClient,
  tokenHash: string,
) {
  return client.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
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
  readonly timeoutMs?: number;
}): Promise<'confirmed' | 'unavailable'> {
  const fetcher = input.fetcher ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 5_000);
  try {
    const response = await fetcher(
      `${input.url.replace(/\/$/u, '')}/auth/v1/logout?scope=local`,
      {
        method: 'POST',
        headers: {
          apikey: input.publishableKey,
          Authorization: `Bearer ${input.accessToken}`,
        },
        cache: 'no-store',
        signal: controller.signal,
      },
    );
    return response.ok ? 'confirmed' : 'unavailable';
  } catch {
    return 'unavailable';
  } finally {
    clearTimeout(timer);
  }
}
