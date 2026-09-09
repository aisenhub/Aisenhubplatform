import { NextRequest, NextResponse } from 'next/server';
type ApiErrorCode =
  | 'INVALID_INPUT'
  | 'UNAUTHORIZED'
  | 'MFA_REQUIRED'
  | 'RECENT_MFA_REQUIRED'
  | 'RATE_LIMITED'
  | 'AUTHORIZATION_UNAVAILABLE';
import {
  authCookieNames,
  authSessionGate,
  currentLogoutFence,
  terminalClearAuthSessionCookies,
  type AuthCookieWriter,
} from '@kit/account-auth-nextjs';

export const dynamic = 'force-dynamic';

export function config(): {
  url: string;
  publishableKey: string;
  origin: string;
} {
  const url = (
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  )?.replace(/\/$/u, '');
  const publishableKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const origin = process.env.ADMIN_ORIGIN;
  if (!url || !publishableKey || !origin)
    throw new Error('AUTH_NOT_CONFIGURED');
  return { url, publishableKey, origin };
}

export async function issueAdminRecentProof(input: {
  readonly accountApiUrl: string;
  readonly accessToken: string;
  readonly factorId: string;
  readonly fetcher?: typeof fetch;
}): Promise<
  | { readonly ok: true; readonly proofId: string }
  | { readonly ok: false; readonly status: number }
> {
  try {
    const response = await (input.fetcher ?? fetch)(
      `${input.accountApiUrl.replace(/\/$/u, '')}/admin/api/v1/auth/recent-proof`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${input.accessToken}`,
          'Cache-Control': 'no-store',
          'X-Mfa-Factor-Id': input.factorId,
        },
        cache: 'no-store',
      },
    );
    const payload = (await response.json().catch(() => null)) as {
      data?: { proof_id?: unknown };
    } | null;
    const proofId = payload?.data?.proof_id;
    if (
      !response.ok ||
      typeof proofId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        proofId,
      )
    )
      return { ok: false, status: response.status };
    return { ok: true, proofId };
  } catch {
    return { ok: false, status: 503 };
  }
}

export function requestId(): string {
  return crypto.randomUUID();
}

function headersFor(requestIdValue: string): HeadersInit {
  return { 'Cache-Control': 'no-store', 'X-Request-Id': requestIdValue };
}

export function responseBody(
  data: unknown,
  status = 200,
  requestIdValue = requestId(),
): NextResponse {
  return NextResponse.json(
    { data, request_id: requestIdValue },
    { status, headers: headersFor(requestIdValue) },
  );
}

export function errorBody(
  code: ApiErrorCode,
  status: number,
  requestIdValue = requestId(),
  details?: Record<string, string>,
): NextResponse {
  return NextResponse.json(
    {
      error: { code, message: code, ...(details ? { details } : {}) },
      request_id: requestIdValue,
    },
    { status, headers: headersFor(requestIdValue) },
  );
}

export function hasValidOrigin(request: NextRequest, origin: string): boolean {
  return request.headers.get('origin') === origin;
}

export function hasValidCsrf(request: NextRequest): boolean {
  const csrf = request.cookies.get(authCookieNames('admin').csrf)?.value;
  return Boolean(csrf && request.headers.get('x-csrf-token') === csrf);
}

export function sessionGate(request: NextRequest) {
  const names = authCookieNames('admin');
  return authSessionGate({
    accessToken: request.cookies.get(names.access)?.value,
    refreshToken: request.cookies.get(names.refresh)?.value,
    logoutFence: request.cookies.get(names.logoutFence)?.value,
    loginAck: request.cookies.get(names.loginAck)?.value,
  });
}

export function flowFence(request: NextRequest): string | null {
  const names = authCookieNames('admin');
  const flow = request.cookies.get(names.authFlow)?.value;
  return flow === undefined
    ? currentLogoutFence(request.cookies.get(names.logoutFence)?.value)
    : flow;
}

export function terminalClear(response: NextResponse, secure: boolean): void {
  terminalClearAuthSessionCookies({
    writer: response.cookies as unknown as AuthCookieWriter,
    secure,
    prefix: 'admin',
  });
}

export function logoutResponse(
  response: NextResponse,
  remoteRevocation: 'confirmed' | 'not_required' | 'unavailable',
  requestIdValue: string,
): NextResponse {
  return NextResponse.json(
    {
      data: { authenticated: false, remote_revocation: remoteRevocation },
      request_id: requestIdValue,
    },
    { status: 200, headers: headersFor(requestIdValue) },
  );
}
