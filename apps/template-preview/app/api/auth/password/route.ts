import { NextRequest } from 'next/server';
import {
  authCookieNames,
  createRequestAuthClient,
  authSessionGate,
  setRequestAuthSession,
  writeAuthSessionCookies,
  type AuthCookieWriter,
} from '@kit/account-auth-nextjs';
import {
  config,
  errorBody,
  hasValidCsrf,
  hasValidOrigin,
  responseBody,
} from '../_lib';

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const runtimeConfig = config();
    if (
      !hasValidOrigin(request, runtimeConfig.origin) ||
      !hasValidCsrf(request)
    )
      return errorBody('INVALID_INPUT', 403);
    const body = (await request.json()) as { password?: unknown };
    if (typeof body.password !== 'string' || body.password.length < 8)
      return errorBody('INVALID_INPUT', 400);
    const names = authCookieNames();
    const accessToken = request.cookies.get(names.access)?.value;
    const refreshToken = request.cookies.get(names.refresh)?.value;
    if (!accessToken || !refreshToken) return errorBody('UNAUTHORIZED', 401);
    const gate = authSessionGate({
      accessToken,
      refreshToken,
      logoutFence: request.cookies.get(names.logoutFence)?.value,
      loginAck: request.cookies.get(names.loginAck)?.value,
    });
    if (!gate.ok) return errorBody('UNAUTHORIZED', 401);
    const client = createRequestAuthClient(runtimeConfig);
    const sessionResult = await setRequestAuthSession(client, {
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (sessionResult.error) return errorBody('UNAUTHORIZED', 401);
    const { data, error } = await client.auth.updateUser({
      password: body.password,
    });
    if (error) return errorBody('INVALID_INPUT', 400);
    const response = responseBody({ updated: true });
    if (data.user && sessionResult.data.session) {
      writeAuthSessionCookies({
        writer: response.cookies as unknown as AuthCookieWriter,
        session: sessionResult.data.session,
        secure: process.env.NODE_ENV === 'production',
      });
    }
    return response;
  } catch {
    return errorBody('AUTHORIZATION_UNAVAILABLE', 503);
  }
}
