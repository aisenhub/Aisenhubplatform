import { NextRequest, NextResponse } from 'next/server';
import { AccountApiError, createAccountApiClient } from '@kit/account-server';
import {
  authCookieNames,
  createRequestAuthClient,
  setRequestAuthSession,
  verifyEmailOtpToken,
} from '@kit/account-auth-nextjs';

export const dynamic = 'force-dynamic';

function config(): {
  url: string;
  publishableKey: string;
  origin: string;
  accountApiUrl: string;
  platformKey: string;
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
  const accountApiUrl = process.env.ACCOUNT_API_URL?.replace(/\/$/u, '');
  const platformKey = process.env.PLATFORM_KEY;
  if (!url || !publishableKey || !origin || !accountApiUrl || !platformKey)
    throw new Error('AUTH_NOT_CONFIGURED');
  return { url, publishableKey, origin, accountApiUrl, platformKey };
}

function result(data: unknown, status = 200): NextResponse {
  return NextResponse.json(
    { data },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

function isTokenHash(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 16 &&
    value.length <= 512 &&
    [...value].every((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code >= 0x20 && code !== 0x7f;
    })
  );
}

function accountApiFailure(error: unknown): NextResponse {
  if (error instanceof AccountApiError) {
    if (error.status === 401 || error.status === 403)
      return result(
        { code: error.status === 401 ? 'UNAUTHORIZED' : 'RECENT_MFA_REQUIRED' },
        error.status,
      );
    return result({ code: 'AUTHORIZATION_UNAVAILABLE' }, 503);
  }
  return result({ code: 'AUTHORIZATION_UNAVAILABLE' }, 503);
}

export async function POST(request: NextRequest): Promise<Response> {
  let temporaryClient: ReturnType<typeof createRequestAuthClient> | undefined;
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

    const body = (await request.json()) as { token_hash?: unknown };
    if (!isTokenHash(body.token_hash))
      return result({ code: 'INVALID_INPUT' }, 400);

    const accessToken = request.cookies.get(names.access)?.value;
    const refreshToken = request.cookies.get(names.refresh)?.value;
    if (!accessToken || !refreshToken)
      return result({ code: 'UNAUTHORIZED' }, 401);

    const currentClient = createRequestAuthClient(runtimeConfig);
    const currentSession = await setRequestAuthSession(currentClient, {
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (currentSession.error) return result({ code: 'UNAUTHORIZED' }, 401);
    const currentUser = await currentClient.auth.getUser();
    if (currentUser.error || !currentUser.data.user)
      return result({ code: 'UNAUTHORIZED' }, 401);

    temporaryClient = createRequestAuthClient(runtimeConfig);
    const temporaryResult = await verifyEmailOtpToken(
      temporaryClient,
      body.token_hash,
    );
    const temporarySession = temporaryResult.data.session;
    if (
      temporaryResult.error ||
      !temporarySession?.access_token ||
      !temporarySession.refresh_token ||
      temporarySession.user.id !== currentUser.data.user.id
    )
      return result(
        {
          code:
            temporaryResult.error?.status && temporaryResult.error.status >= 500
              ? 'AUTHORIZATION_UNAVAILABLE'
              : 'RECENT_MFA_REQUIRED',
        },
        temporaryResult.error?.status && temporaryResult.error.status >= 500
          ? 503
          : 403,
      );

    const accountApi = createAccountApiClient({
      baseUrl: runtimeConfig.accountApiUrl,
      platformKey: runtimeConfig.platformKey,
    });
    const proof = await accountApi.issueRecentAuthProof(
      accessToken,
      temporarySession.access_token,
    );
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
    if (error instanceof AccountApiError) return accountApiFailure(error);
    return result({ code: 'AUTHORIZATION_UNAVAILABLE' }, 503);
  } finally {
    if (temporaryClient)
      await temporaryClient.auth
        .signOut({ scope: 'local' })
        .catch(() => undefined);
  }
}
