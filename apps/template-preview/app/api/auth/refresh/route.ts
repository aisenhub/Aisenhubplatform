import { NextRequest } from 'next/server';
import {
  authCookieNames,
  createRequestAuthClient,
  refreshAuthSession,
  sessionIdFromAccessToken,
  terminalClearAuthSessionCookies,
  writeAuthSessionCookies,
  type AuthCookieWriter,
} from '@kit/account-auth-nextjs';
import {
  config,
  errorBody,
  hasValidCsrf,
  hasValidOrigin,
  requestId,
  responseBody,
  sessionGate,
} from '../_lib';

export const dynamic = 'force-dynamic';

function definitivelyInvalidRefresh(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as {
    status?: unknown;
    code?: unknown;
    message?: unknown;
  };
  if (candidate.status === 401) return true;
  const code =
    typeof candidate.code === 'string' ? candidate.code.toLowerCase() : '';
  const message =
    typeof candidate.message === 'string'
      ? candidate.message.toLowerCase()
      : '';
  return (
    [
      'invalid_refresh_token',
      'refresh_token_not_found',
      'refresh_token_already_used',
      'invalid_grant',
    ].includes(code) ||
    /invalid refresh token|refresh token not found|refresh token already used/u.test(
      message,
    )
  );
}

export async function POST(request: NextRequest): Promise<Response> {
  const id = requestId();
  const secure = process.env.NODE_ENV === 'production';
  try {
    const runtimeConfig = config();
    if (
      !hasValidOrigin(request, runtimeConfig.origin) ||
      !hasValidCsrf(request)
    )
      return errorBody('INVALID_INPUT', 403, id);
    const names = authCookieNames('consumer');
    const refreshToken = request.cookies.get(names.refresh)?.value;
    const gate = sessionGate(request);
    if (!gate.ok) return errorBody('UNAUTHORIZED', 401, id);
    if (!refreshToken) return errorBody('UNAUTHORIZED', 401, id);
    const client = createRequestAuthClient(runtimeConfig);
    const { data, error } = await refreshAuthSession(client, refreshToken);
    if (error || !data.session) {
      if (definitivelyInvalidRefresh(error)) {
        const response = errorBody('UNAUTHORIZED', 401, id);
        terminalClearAuthSessionCookies({
          writer: response.cookies as unknown as AuthCookieWriter,
          secure,
          prefix: 'consumer',
        });
        return response;
      }
      return errorBody(
        error &&
          typeof error === 'object' &&
          (error as { status?: unknown }).status === 429
          ? 'RATE_LIMITED'
          : 'AUTHORIZATION_UNAVAILABLE',
        error &&
          typeof error === 'object' &&
          (error as { status?: unknown }).status === 429
          ? 429
          : 503,
        id,
      );
    }
    const sessionId = sessionIdFromAccessToken(data.session.access_token);
    if (!sessionId || sessionId !== gate.acknowledgement.session_id)
      return errorBody('UNAUTHORIZED', 401, id);
    const response = responseBody({ authenticated: true }, 200, id);
    writeAuthSessionCookies({
      writer: response.cookies as unknown as AuthCookieWriter,
      session: data.session,
      secure,
      prefix: 'consumer',
      csrfToken: request.cookies.get(names.csrf)?.value,
    });
    return response;
  } catch {
    return errorBody('AUTHORIZATION_UNAVAILABLE', 503, id);
  }
}
