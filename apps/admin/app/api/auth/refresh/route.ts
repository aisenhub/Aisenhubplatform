import { NextRequest, NextResponse } from 'next/server';
import {
  authCookieNames,
  createRequestAuthClient,
  refreshAuthSession,
  sessionIdFromAccessToken,
  terminalClearAuthSessionCookies,
  writeAuthSessionCookies,
  type AuthCookieWriter,
} from '@kit/account-auth-nextjs';
import { config, errorBody, hasValidCsrf, hasValidOrigin, requestId, responseBody, sessionGate } from '../_lib';

export const dynamic = 'force-dynamic';

function definitivelyInvalidRefresh(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { status?: unknown; code?: unknown; message?: unknown };
  if (candidate.status === 401) return true;
  const code = typeof candidate.code === 'string' ? candidate.code.toLowerCase() : '';
  const message = typeof candidate.message === 'string' ? candidate.message.toLowerCase() : '';
  return ['invalid_refresh_token', 'refresh_token_not_found', 'refresh_token_already_used', 'invalid_grant'].includes(code) || /invalid refresh token|refresh token not found|refresh token already used/u.test(message);
}

function failureResponse(id: string, status: 401 | 429 | 503, clear: boolean, secure: boolean): NextResponse {
  const response = errorBody(status === 401 ? 'UNAUTHORIZED' : status === 429 ? 'RATE_LIMITED' : 'AUTHORIZATION_UNAVAILABLE', status, id);
  if (clear) terminalClearAuthSessionCookies({ writer: response.cookies as unknown as AuthCookieWriter, secure, prefix: 'admin' });
  return response;
}

export async function POST(request: NextRequest): Promise<Response> {
  const id = requestId();
  const secure = process.env.NODE_ENV === 'production';
  try {
    const runtimeConfig = config();
    if (!hasValidOrigin(request, runtimeConfig.origin) || !hasValidCsrf(request)) return errorBody('INVALID_INPUT', 403, id);
    const names = authCookieNames('admin');
    const accessToken = request.cookies.get(names.access)?.value;
    const refreshToken = request.cookies.get(names.refresh)?.value;
    const gate = sessionGate(request);
    if ((accessToken || refreshToken) && !gate.ok) return errorBody('UNAUTHORIZED', 401, id);
    if (!refreshToken) return failureResponse(id, 401, true, secure);
    const client = createRequestAuthClient(runtimeConfig);
    const { data, error } = await refreshAuthSession(client, refreshToken);
    if (error || !data.session) {
      if (definitivelyInvalidRefresh(error)) return failureResponse(id, 401, true, secure);
      if (error && typeof error === 'object' && (error as { status?: unknown }).status === 429) return failureResponse(id, 429, false, secure);
      return failureResponse(id, 503, false, secure);
    }
    const sessionId = sessionIdFromAccessToken(data.session.access_token);
    if (!sessionId || !gate.ok || sessionId !== gate.acknowledgement.session_id) return errorBody('UNAUTHORIZED', 401, id);
    const response = responseBody({ authenticated: true }, 200, id);
    writeAuthSessionCookies({ writer: response.cookies as unknown as AuthCookieWriter, session: data.session, secure, prefix: 'admin', csrfToken: request.cookies.get(names.csrf)?.value });
    return response;
  } catch {
    return failureResponse(id, 503, false, secure);
  }
}
