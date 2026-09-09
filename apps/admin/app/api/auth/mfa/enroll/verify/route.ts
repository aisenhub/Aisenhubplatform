import { NextRequest, NextResponse } from 'next/server';
import {
  authCookieNames,
  createRequestAuthClient,
  setRequestAuthSession,
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

function result(data: unknown, status = 200): NextResponse {
  return NextResponse.json(
    { data },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
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
      return result({ code: 'INVALID_INPUT' }, 403);

    const input = (await request.json()) as {
      factor_id?: unknown;
      code?: unknown;
    };
    if (
      typeof input.factor_id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        input.factor_id,
      ) ||
      typeof input.code !== 'string' ||
      !/^\d{6}$/u.test(input.code)
    )
      return result({ code: 'INVALID_INPUT' }, 400);

    const accessToken = request.cookies.get(names.access)?.value;
    const refreshToken = request.cookies.get(names.refresh)?.value;
    if (!accessToken || !refreshToken)
      return result({ code: 'UNAUTHORIZED' }, 401);

    const client = createRequestAuthClient(runtimeConfig);
    const sessionResult = await setRequestAuthSession(client, {
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (sessionResult.error) return result({ code: 'UNAUTHORIZED' }, 401);

    const { data, error } = await client.auth.mfa.challengeAndVerify({
      factorId: input.factor_id,
      code: input.code,
    });
    if (error || !data?.access_token || !data.refresh_token)
      return result(
        {
          code:
            error?.status && error.status >= 500
              ? 'AUTHORIZATION_UNAVAILABLE'
              : 'MFA_REQUIRED',
        },
        error?.status && error.status >= 500 ? 503 : 403,
      );

    const elevatedSessionResult = await setRequestAuthSession(client, {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    });
    const elevatedSession = elevatedSessionResult.data.session;
    if (elevatedSessionResult.error || !elevatedSession)
      return result({ code: 'AUTHORIZATION_UNAVAILABLE' }, 503);

    const response = result({
      authenticated: true,
      factor_id: input.factor_id,
    });
    writeAuthSessionCookies({
      writer: response.cookies as unknown as AuthCookieWriter,
      session: elevatedSession,
      secure: process.env.NODE_ENV === 'production',
      prefix: 'admin',
      csrfToken: csrf,
    });
    return response;
  } catch {
    return result({ code: 'AUTHORIZATION_UNAVAILABLE' }, 503);
  }
}
