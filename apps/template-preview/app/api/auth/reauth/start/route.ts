import { NextRequest, NextResponse } from 'next/server';
import {
  authCookieNames,
  authSessionGate,
  createRequestAuthClient,
  requestEmailOtp,
  setRequestAuthSession,
} from '@kit/account-auth-nextjs';
import { errorBody, responseBody } from '../../_lib';

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
  const origin = process.env.CONSUMER_ORIGIN;
  if (!url || !publishableKey || !origin)
    throw new Error('AUTH_NOT_CONFIGURED');
  return { url, publishableKey, origin };
}

function result(data: unknown, status = 200): NextResponse {
  if (data && typeof data === 'object' && 'code' in data) {
    const code = (data as { code: string }).code;
    return errorBody(
      code === 'RECENT_MFA_REQUIRED' ? 'RECENT_MFA_REQUIRED' : code === 'RATE_LIMITED' ? 'RATE_LIMITED' : code === 'UNAUTHORIZED' ? 'UNAUTHORIZED' : 'AUTHORIZATION_UNAVAILABLE',
      status,
    );
  }
  return responseBody(data, status);
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const runtimeConfig = config();
    const names = authCookieNames('consumer');
    const csrf = request.cookies.get(names.csrf)?.value;
    if (
      request.headers.get('origin') !== runtimeConfig.origin ||
      !csrf ||
      request.headers.get('x-csrf-token') !== csrf
    )
      return result({ code: 'INVALID_INPUT' }, 403);

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

    const { data, error } = await client.auth.getUser();
    if (error || !data.user?.email)
      return result({ code: 'UNAUTHORIZED' }, 401);

    const otpResult = await requestEmailOtp(client, data.user.email);
    if (otpResult.error)
      return result(
        {
          code:
            otpResult.error.status && otpResult.error.status >= 500
              ? 'AUTHORIZATION_UNAVAILABLE'
              : 'RECENT_MFA_REQUIRED',
        },
        otpResult.error.status && otpResult.error.status >= 500 ? 503 : 403,
      );
    return result({ requested: true });
  } catch {
    return result({ code: 'AUTHORIZATION_UNAVAILABLE' }, 503);
  }
}
