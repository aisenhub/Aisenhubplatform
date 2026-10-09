import { NextRequest } from 'next/server';
import {
  readBoundedJson,
  UploadFault,
} from '../../../../_lib/integration/bounded-body';
import {
  authCookieNames,
  createRequestAuthClient,
  setRequestAuthSession,
  verifyEmailOtpToken,
} from '../../../../_lib/auth/server';

import {
  config,
  errorBody,
  hasValidCsrf,
  hasValidOrigin,
  requestId,
  responseBody,
} from '../../_lib';
import {
  accountApiJson,
  AccountApiUpstreamError,
} from '../../../_lib/account-api';

export const dynamic = 'force-dynamic';

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

function runtimeConfig() {
  const base = config();
  if (!process.env.ACCOUNT_API_URL) throw new Error('AUTH_NOT_CONFIGURED');
  return base;
}

function accountApiFailure(error: unknown, id: string): Response {
  if (error instanceof AccountApiUpstreamError) {
    if (error.status === 401 || error.status === 403)
      return errorBody(
        error.status === 401 ? 'UNAUTHORIZED' : 'AUTHORIZATION_UNAVAILABLE',
        error.status,
        id,
      );
  }
  return errorBody('AUTHORIZATION_UNAVAILABLE', 503, id);
}

export async function POST(request: NextRequest): Promise<Response> {
  const id = requestId();
  let temporaryClient: ReturnType<typeof createRequestAuthClient> | undefined;
  try {
    const runtime = runtimeConfig();
    if (!hasValidOrigin(request, runtime.origin) || !hasValidCsrf(request))
      return errorBody('INVALID_INPUT', 403, id);

    const body = (await readBoundedJson(request)) as {
      token_hash?: unknown;
    } | null;
    if (!isTokenHash(body?.token_hash))
      return errorBody('INVALID_INPUT', 400, id);

    const names = authCookieNames('consumer');
    const accessToken = request.cookies.get(names.access)?.value;
    const refreshToken = request.cookies.get(names.refresh)?.value;
    if (!accessToken || !refreshToken)
      return errorBody('UNAUTHORIZED', 401, id);

    const currentClient = createRequestAuthClient(runtime);
    const currentSession = await setRequestAuthSession(currentClient, {
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (currentSession.error) return errorBody('UNAUTHORIZED', 401, id);
    const currentUser = await currentClient.auth.getUser();
    if (currentUser.error || !currentUser.data.user)
      return errorBody('UNAUTHORIZED', 401, id);

    temporaryClient = createRequestAuthClient(runtime);
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
      return errorBody('AUTHORIZATION_UNAVAILABLE', 403, id);

    const { data: proof } = await accountApiJson<{
      readonly proof_id: string;
      readonly expires_at: string;
    }>('/v1/auth/recent-proof', {
      method: 'POST',
      accessToken,
      reauthAccessToken: temporarySession.access_token,
    });
    const response = responseBody(
      { verified: true, expires_at: proof.expires_at },
      200,
      id,
    );
    response.cookies.set(names.recentProof, proof.proof_id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 5 * 60,
    });
    return response;
  } catch (error) {
    if (error instanceof UploadFault)
      return errorBody(
        error.status >= 500 ? 'AUTHORIZATION_UNAVAILABLE' : 'INVALID_INPUT',
        error.status,
        id,
      );
    if (error instanceof AccountApiUpstreamError)
      return accountApiFailure(error, id);
    return errorBody('AUTHORIZATION_UNAVAILABLE', 503, id);
  } finally {
    if (temporaryClient)
      await temporaryClient.auth
        .signOut({ scope: 'local' })
        .catch(() => undefined);
  }
}
