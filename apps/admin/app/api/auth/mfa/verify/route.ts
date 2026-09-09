import { NextRequest, NextResponse } from 'next/server';
import { errorBody, issueAdminRecentProof, responseBody } from '../../_lib';
import {
  authCookieNames,
  authSessionGate,
  createRequestAuthClient,
  sessionIdFromAccessToken,
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
  if (data && typeof data === 'object' && 'code' in data) {
    const code = (data as { code: string }).code;
    const mapped =
      code === 'RATE_LIMITED'
        ? 'RATE_LIMITED'
        : code === 'MFA_REQUIRED'
          ? 'MFA_REQUIRED'
          : code === 'RECENT_MFA_REQUIRED'
            ? 'RECENT_MFA_REQUIRED'
            : code === 'UNAUTHORIZED'
              ? 'UNAUTHORIZED'
              : 'AUTHORIZATION_UNAVAILABLE';
    return errorBody(mapped, status);
  }
  return responseBody(data, status);
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
    const gate = authSessionGate({
      accessToken,
      refreshToken,
      logoutFence: request.cookies.get(names.logoutFence)?.value,
      loginAck: request.cookies.get(names.loginAck)?.value,
    });
    if (!gate.ok) return result({ code: 'UNAUTHORIZED' }, 401);

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
            mfaError?.status === 429
              ? 'RATE_LIMITED'
              : mfaError?.status && mfaError.status >= 500
                ? 'AUTHORIZATION_UNAVAILABLE'
                : 'MFA_REQUIRED',
        },
        mfaError?.status === 429
          ? 429
          : mfaError?.status && mfaError.status >= 500
            ? 503
            : 403,
      );

    const elevatedSessionResult = await setRequestAuthSession(client, {
      access_token: mfaData.access_token,
      refresh_token: mfaData.refresh_token,
    });
    const elevatedSession = elevatedSessionResult.data.session;
    if (elevatedSessionResult.error || !elevatedSession)
      return result({ code: 'AUTHORIZATION_UNAVAILABLE' }, 503);
    if (
      sessionIdFromAccessToken(elevatedSession.access_token) !==
      gate.acknowledgement.session_id
    )
      return result({ code: 'AUTHORIZATION_UNAVAILABLE' }, 503);

    const proof = await issueAdminRecentProof({
      accountApiUrl: runtimeConfig.accountApiUrl,
      accessToken: elevatedSession.access_token,
      factorId: input.factor_id,
    });
    const proofStatus = proof.ok
      ? 200
      : proof.status === 429
        ? 429
        : proof.status >= 500
          ? 503
          : 403;
    const response = proof.ok
      ? result({
          authenticated: true,
          factor_id: input.factor_id,
          proof: 'issued',
        })
      : errorBody('RECENT_MFA_REQUIRED', proofStatus, undefined, {
          mfa_verified: 'true',
          proof_issued: 'false',
          recovery: 'verify_existing_factor',
        });
    writeAuthSessionCookies({
      writer: response.cookies as unknown as AuthCookieWriter,
      session: elevatedSession,
      secure: process.env.NODE_ENV === 'production',
      prefix: 'admin',
      csrfToken: csrf,
    });
    if (proof.ok)
      response.cookies.set(names.recentProof, proof.proofId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 5 * 60,
      });
    else response.cookies.delete(names.recentProof);
    return response;
  } catch {
    return result({ code: 'AUTHORIZATION_UNAVAILABLE' }, 503);
  }
}
