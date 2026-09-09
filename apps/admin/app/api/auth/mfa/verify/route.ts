import { NextRequest, NextResponse } from 'next/server';
import {
  authCookieNames,
  createRequestAuthClient,
  setRequestAuthSession,
  verifyMfaFactor,
  writeAuthSessionCookies,
  type AuthCookieWriter,
} from '@kit/account-auth-nextjs';

export const dynamic = 'force-dynamic';

function config(): {
  url: string;
  publishableKey: string;
  origin: string;
  accountApiUrl: string;
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
  const accountApiUrl = process.env.ACCOUNT_API_URL?.replace(/\/$/u, '');
  if (!url || !publishableKey || !origin || !accountApiUrl)
    throw new Error('AUTH_NOT_CONFIGURED');
  return { url, publishableKey, origin, accountApiUrl };
}

function result(data: unknown, status = 200): NextResponse {
  return NextResponse.json(
    { data },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

function authFailure(status: number): NextResponse {
  if (status === 401 || status === 403)
    return result(
      { code: status === 401 ? 'UNAUTHORIZED' : 'MFA_REQUIRED' },
      status,
    );
  return result({ code: 'AUTHORIZATION_UNAVAILABLE' }, 503);
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

    const { data: mfaData, error: mfaError } = await verifyMfaFactor(client, {
      factorId: input.factor_id,
      code: input.code,
    });
    if (mfaError || !mfaData.access_token || !mfaData.refresh_token)
      return result(
        {
          code:
            mfaError?.status && mfaError.status >= 500
              ? 'AUTHORIZATION_UNAVAILABLE'
              : 'MFA_REQUIRED',
        },
        mfaError?.status && mfaError.status >= 500 ? 503 : 403,
      );

    const elevatedSessionResult = await setRequestAuthSession(client, {
      access_token: mfaData.access_token,
      refresh_token: mfaData.refresh_token,
    });
    const elevatedSession = elevatedSessionResult.data.session;
    if (elevatedSessionResult.error || !elevatedSession)
      return result({ code: 'AUTHORIZATION_UNAVAILABLE' }, 503);

    const proofResponse = await fetch(
      `${runtimeConfig.accountApiUrl}/admin/api/v1/auth/recent-proof`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${elevatedSession.access_token}`,
          'Cache-Control': 'no-store',
          'X-Mfa-Factor-Id': input.factor_id,
        },
        cache: 'no-store',
      },
    );
    const proofPayload = (await proofResponse.json().catch(() => null)) as {
      data?: { proof_id?: unknown };
    } | null;
    const proofId = proofPayload?.data?.proof_id;
    if (
      !proofResponse.ok ||
      typeof proofId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        proofId,
      )
    )
      return authFailure(proofResponse.status);

    const response = result({ authenticated: true, proof: 'issued' });
    writeAuthSessionCookies({
      writer: response.cookies as unknown as AuthCookieWriter,
      session: elevatedSession,
      secure: process.env.NODE_ENV === 'production',
      prefix: 'admin',
      csrfToken: csrf,
    });
    response.cookies.set('aisenhub-recent-auth-proof', proofId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 5 * 60,
    });
    return response;
  } catch {
    return result({ code: 'AUTHORIZATION_UNAVAILABLE' }, 503);
  }
}
