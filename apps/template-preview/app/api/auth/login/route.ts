import { NextRequest, NextResponse } from 'next/server';
import {
  createRequestAuthClient,
  writeAuthSessionCookies,
  type AuthCookieWriter,
} from '@kit/account-auth-nextjs';

export const dynamic = 'force-dynamic';

function authConfig(): { url: string; anonKey: string; origin: string } {
  const url = (
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  )?.replace(/\/$/u, '');
  const anonKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const origin = process.env.CONSUMER_ORIGIN;
  if (!url || !anonKey || !origin) throw new Error('AUTH_NOT_CONFIGURED');
  return { url, anonKey, origin };
}

function responseBody(data: unknown, status = 200): NextResponse {
  return NextResponse.json(
    { data },
    {
      status,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const config = authConfig();
    if (request.headers.get('origin') !== config.origin)
      return responseBody({ code: 'INVALID_INPUT' }, 403);
    const body = (await request.json()) as {
      email?: unknown;
      password?: unknown;
    };
    if (typeof body.email !== 'string' || typeof body.password !== 'string')
      return responseBody({ code: 'INVALID_INPUT' }, 400);
    const client = createRequestAuthClient({
      url: config.url,
      publishableKey: config.anonKey,
    });
    const { data, error } = await client.auth.signInWithPassword({
      email: body.email,
      password: body.password,
    });
    if (error || !data.session)
      return responseBody(
        {
          code:
            error?.status && error.status >= 500
              ? 'AUTHORIZATION_UNAVAILABLE'
              : 'UNAUTHORIZED',
        },
        error?.status && error.status >= 500 ? 503 : 401,
      );
    const result = responseBody({ authenticated: true });
    writeAuthSessionCookies({
      writer: result.cookies as unknown as AuthCookieWriter,
      session: data.session,
      secure: process.env.NODE_ENV === 'production',
    });
    return result;
  } catch {
    return responseBody({ code: 'AUTHORIZATION_UNAVAILABLE' }, 503);
  }
}
