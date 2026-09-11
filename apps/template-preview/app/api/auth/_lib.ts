import { NextRequest, NextResponse } from 'next/server';
import {
  authCookieNames,
  authSessionGate,
  currentLogoutFence,
} from '@kit/account-auth-nextjs';

type ApiErrorCode =
  | 'INVALID_INPUT'
  | 'UNAUTHORIZED'
  | 'RATE_LIMITED'
  | 'AUTHORIZATION_UNAVAILABLE';

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
  const origin = process.env.TEMPLATE_ORIGIN;
  if (!url || !publishableKey || !origin)
    throw new Error('AUTH_NOT_CONFIGURED');
  return { url, publishableKey, origin };
}

export function requestId(): string {
  return crypto.randomUUID();
}

function headersFor(id: string): HeadersInit {
  return { 'Cache-Control': 'no-store', 'X-Request-Id': id };
}

export function responseBody(
  data: unknown,
  status = 200,
  id = requestId(),
): NextResponse {
  return NextResponse.json(
    { data, request_id: id },
    { status, headers: headersFor(id) },
  );
}

export function errorBody(
  code: ApiErrorCode,
  status: number,
  id = requestId(),
): NextResponse {
  return NextResponse.json(
    { error: { code, message: code }, request_id: id },
    { status, headers: headersFor(id) },
  );
}

export function hasValidOrigin(request: NextRequest, origin: string): boolean {
  return request.headers.get('origin') === origin;
}

export function hasValidCsrf(request: NextRequest): boolean {
  const csrf = request.cookies.get(authCookieNames('consumer').csrf)?.value;
  return Boolean(csrf && csrf === request.headers.get('x-csrf-token'));
}

export function sessionGate(request: NextRequest) {
  const names = authCookieNames('consumer');
  return authSessionGate({
    accessToken: request.cookies.get(names.access)?.value,
    refreshToken: request.cookies.get(names.refresh)?.value,
    logoutFence: request.cookies.get(names.logoutFence)?.value,
    loginAck: request.cookies.get(names.loginAck)?.value,
  });
}

export function flowFence(request: NextRequest): string | null {
  const names = authCookieNames('consumer');
  const flow = request.cookies.get(names.authFlow)?.value;
  return flow === undefined
    ? currentLogoutFence(request.cookies.get(names.logoutFence)?.value)
    : flow;
}
