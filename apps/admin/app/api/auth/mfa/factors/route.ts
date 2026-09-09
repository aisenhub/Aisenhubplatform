import { NextRequest, NextResponse } from 'next/server';
import { errorBody, responseBody } from '../../_lib';
import {
  authCookieNames,
  authSessionGate,
  createRequestAuthClient,
  listMfaFactors,
  setRequestAuthSession,
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
  if (data && typeof data === 'object' && 'code' in data) {
    const code = (data as { code: string }).code;
    const mapped =
      code === 'RATE_LIMITED'
        ? 'RATE_LIMITED'
        : code === 'MFA_REQUIRED'
          ? 'MFA_REQUIRED'
          : code === 'UNAUTHORIZED'
            ? 'UNAUTHORIZED'
            : 'AUTHORIZATION_UNAVAILABLE';
    return errorBody(mapped, status);
  }
  return responseBody(data, status);
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const runtimeConfig = config();
    const origin = request.headers.get('origin');
    if (origin && origin !== runtimeConfig.origin)
      return result({ code: 'INVALID_INPUT' }, 403);
    const names = authCookieNames('admin');
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
    const { data, error } = await listMfaFactors(client);
    if (error) {
      const status =
        error.status === 401 ? 401 : error.status === 429 ? 429 : 503;
      return result(
        {
          code:
            status === 401
              ? 'UNAUTHORIZED'
              : status === 429
                ? 'RATE_LIMITED'
                : 'AUTHORIZATION_UNAVAILABLE',
        },
        status,
      );
    }
    const factors = (data.totp ?? [])
      .filter((factor) => factor.status === 'verified')
      .map((factor) => ({
        id: factor.id,
        factor_type: factor.factor_type,
        friendly_name: factor.friendly_name ?? null,
        status: factor.status,
      }));
    return result({ factors });
  } catch {
    return result({ code: 'AUTHORIZATION_UNAVAILABLE' }, 503);
  }
}
