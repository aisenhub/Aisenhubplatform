import { NextRequest } from 'next/server';
import {
  authCookieNames,
  currentLogoutFence,
  createRequestAuthClient,
  signUpWithPassword,
  sessionIdFromAccessToken,
  writeLoginAcknowledgement,
  writeAuthFlowFence,
  writeAuthSessionCookies,
  type AuthCookieWriter,
} from '@kit/account-auth-nextjs';
import { config, errorBody, hasValidOrigin, responseBody } from '../_lib';

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const runtimeConfig = config();
    if (!hasValidOrigin(request, runtimeConfig.origin))
      return errorBody('INVALID_INPUT', 403);
    const loginFence = currentLogoutFence(
      request.cookies.get(authCookieNames('consumer').logoutFence)?.value,
    );
    const body = (await request.json()) as {
      email?: unknown;
      password?: unknown;
    };
    if (typeof body.email !== 'string' || typeof body.password !== 'string')
      return errorBody('INVALID_INPUT', 400);
    const client = createRequestAuthClient(runtimeConfig);
    const { data, error } = await signUpWithPassword(client, {
      email: body.email,
      password: body.password,
      emailRedirectTo: `${runtimeConfig.origin}/auth/callback?returnTo=/login`,
    });
    if (error)
      return errorBody(
        error.status && error.status >= 500
          ? 'AUTHORIZATION_UNAVAILABLE'
          : 'INVALID_INPUT',
        error.status && error.status >= 500 ? 503 : 400,
      );
    const response = responseBody(
      { registered: true, needs_email_confirmation: !data.session },
      201,
    );
    if (data.session) {
      const sessionId = sessionIdFromAccessToken(data.session.access_token);
      if (!sessionId) return errorBody('AUTHORIZATION_UNAVAILABLE', 503);
      writeAuthSessionCookies({
        writer: response.cookies as unknown as AuthCookieWriter,
        session: data.session,
        secure: process.env.NODE_ENV === 'production',
      });
      writeLoginAcknowledgement({
        writer: response.cookies as unknown as AuthCookieWriter,
        secure: process.env.NODE_ENV === 'production',
        sessionId,
        loginFence,
        prefix: 'consumer',
      });
    } else {
      const flowResponse = response;
      writeAuthFlowFence({
        writer: flowResponse.cookies as unknown as AuthCookieWriter,
        secure: process.env.NODE_ENV === 'production',
        fence: loginFence,
        prefix: 'consumer',
      });
    }
    return response;
  } catch {
    return errorBody('AUTHORIZATION_UNAVAILABLE', 503);
  }
}
