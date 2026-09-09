import { NextRequest, NextResponse } from 'next/server';
import { authCookieNames } from '@kit/account-auth-nextjs';

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
  const origin = process.env.CONSUMER_ORIGIN;
  if (!url || !publishableKey || !origin)
    throw new Error('AUTH_NOT_CONFIGURED');
  return { url, publishableKey, origin };
}

export function responseBody(data: unknown, status = 200): NextResponse {
  return NextResponse.json(
    { data },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

export function errorBody(code: string, status: number): NextResponse {
  return NextResponse.json(
    { error: { code, message: code } },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

export function hasValidOrigin(request: NextRequest, origin: string): boolean {
  return request.headers.get('origin') === origin;
}

export function hasValidCsrf(request: NextRequest): boolean {
  const csrf = request.cookies.get(authCookieNames().csrf)?.value;
  return Boolean(csrf && request.headers.get('x-csrf-token') === csrf);
}
