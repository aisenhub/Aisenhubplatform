import { NextRequest, NextResponse } from 'next/server';
import { authCookieNames } from '@kit/account-auth-nextjs';
import { AccountApiError, createAccountApiClient } from '@kit/account-server';

export const dynamic = 'force-dynamic';

function config(): {
  accountApiUrl: string;
  platformKey: string;
  origin: string;
} {
  const accountApiUrl = process.env.ACCOUNT_API_URL?.replace(/\/$/u, '');
  const platformKey = process.env.PLATFORM_KEY;
  const origin = process.env.CONSUMER_ORIGIN;
  if (!accountApiUrl || !platformKey || !origin)
    throw new Error('AUTH_NOT_CONFIGURED');
  return { accountApiUrl, platformKey, origin };
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
    const names = authCookieNames();
    const csrf = request.cookies.get(names.csrf)?.value;
    if (
      request.headers.get('origin') !== runtimeConfig.origin ||
      !csrf ||
      request.headers.get('x-csrf-token') !== csrf
    )
      return result({ code: 'INVALID_INPUT' }, 403);
    const body = (await request.json()) as { token?: unknown };
    if (typeof body.token !== 'string' || !/^\d{6}$/u.test(body.token))
      return result({ code: 'INVALID_INPUT' }, 400);
    const accessToken = request.cookies.get(names.access)?.value;
    if (!accessToken) return result({ code: 'UNAUTHORIZED' }, 401);

    const api = createAccountApiClient({
      baseUrl: runtimeConfig.accountApiUrl,
      platformKey: runtimeConfig.platformKey,
    });
    const proof = await api.issueRecentAuthProof(accessToken, body.token);
    const response = result({ verified: true, expires_at: proof.expires_at });
    response.cookies.set('aisenhub-recent-auth-proof', proof.proof_id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 5 * 60,
    });
    return response;
  } catch (error) {
    if (error instanceof AccountApiError) {
      const status =
        error.status === 400
          ? 400
          : error.status === 401
            ? 401
            : error.status === 403
              ? 403
              : 503;
      return result({ code: error.code }, status);
    }
    return result({ code: 'AUTHORIZATION_UNAVAILABLE' }, 503);
  }
}
