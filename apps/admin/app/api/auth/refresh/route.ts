import { NextRequest, NextResponse } from 'next/server';
import {
  authCookieNames,
  clearAuthSessionCookies,
  createRequestAuthClient,
  refreshAuthSession,
  writeAuthSessionCookies,
  type AuthCookieWriter,
} from '@kit/account-auth-nextjs';

export const dynamic = 'force-dynamic';

function config(): { url: string; publishableKey: string; origin: string } {
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

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const runtimeConfig = config();
    const names = authCookieNames('admin');
    const csrf = request.cookies.get(names.csrf)?.value;
    if (
      request.headers.get('origin') !== runtimeConfig.origin ||
      !csrf ||
      request.headers.get('x-csrf-token') !== csrf
    )
      return NextResponse.json(
        { error: { code: 'INVALID_INPUT', message: 'INVALID_INPUT' } },
        { status: 403, headers: { 'Cache-Control': 'no-store' } },
      );
    const refreshToken = request.cookies.get(names.refresh)?.value;
    if (!refreshToken)
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'UNAUTHORIZED' } },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      );
    const client = createRequestAuthClient({
      url: runtimeConfig.url,
      publishableKey: runtimeConfig.publishableKey,
    });
    const { data, error } = await refreshAuthSession(client, refreshToken);
    if (error || !data.session) {
      const response = NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'UNAUTHORIZED' } },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      );
      clearAuthSessionCookies(
        response.cookies as unknown as Pick<AuthCookieWriter, 'delete'>,
        'admin',
      );
      return response;
    }
    const response = NextResponse.json(
      { data: { authenticated: true } },
      { headers: { 'Cache-Control': 'no-store' } },
    );
    writeAuthSessionCookies({
      writer: response.cookies as unknown as AuthCookieWriter,
      session: data.session,
      secure: process.env.NODE_ENV === 'production',
      prefix: 'admin',
      csrfToken: csrf,
    });
    return response;
  } catch {
    return NextResponse.json(
      {
        error: {
          code: 'AUTHORIZATION_UNAVAILABLE',
          message: 'AUTHORIZATION_UNAVAILABLE',
        },
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
