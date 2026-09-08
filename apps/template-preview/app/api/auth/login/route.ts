import { NextRequest, NextResponse } from 'next/server';

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
    const upstream = await fetch(
      `${config.url}/auth/v1/token?grant_type=password`,
      {
        method: 'POST',
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${config.anonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: body.email, password: body.password }),
        cache: 'no-store',
      },
    );
    const payload = (await upstream.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error_code?: string;
    };
    if (!upstream.ok || !payload.access_token)
      return responseBody(
        { code: payload.error_code ?? 'UNAUTHORIZED' },
        upstream.status === 400 ? 401 : 503,
      );
    const result = responseBody({ authenticated: true });
    const maxAge = Math.max(60, Number(payload.expires_in ?? 3600));
    result.cookies.set('aisenhub-session', payload.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge,
    });
    if (payload.refresh_token) {
      result.cookies.set('aisenhub-refresh-token', payload.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
      });
    }
    result.cookies.set('aisenhub-csrf', crypto.randomUUID(), {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge,
    });
    return result;
  } catch {
    return responseBody({ code: 'AUTHORIZATION_UNAVAILABLE' }, 503);
  }
}
