import { NextRequest } from 'next/server';
import {
  authCookieNames,
  createRequestAuthClient,
  currentLogoutFence,
  sessionIdFromAccessToken,
  writeAuthSessionCookies,
  writeLoginAcknowledgement,
  type AuthCookieWriter,
} from '@kit/account-auth-nextjs';
import {
  config,
  errorBody,
  hasValidOrigin,
  requestId,
  responseBody,
} from '../_lib';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<Response> {
  const id = requestId();
  try {
    const runtimeConfig = config();
    if (!hasValidOrigin(request, runtimeConfig.origin))
      return errorBody('INVALID_INPUT', 403, id);
    const body = (await request.json()) as {
      email?: unknown;
      password?: unknown;
    };
    if (typeof body.email !== 'string' || typeof body.password !== 'string')
      return errorBody('INVALID_INPUT', 400, id);
    const client = createRequestAuthClient({
      url: runtimeConfig.url,
      publishableKey: runtimeConfig.publishableKey,
    });
    const { data, error } = await client.auth.signInWithPassword({
      email: body.email,
      password: body.password,
    });
    if (error || !data.session) {
      const status =
        error?.status === 429
          ? 429
          : error?.status && error.status >= 500
            ? 503
            : 401;
      return errorBody(
        status === 429
          ? 'RATE_LIMITED'
          : status === 503
            ? 'AUTHORIZATION_UNAVAILABLE'
            : 'UNAUTHORIZED',
        status,
        id,
      );
    }
    const sessionId = sessionIdFromAccessToken(data.session.access_token);
    if (!sessionId) return errorBody('AUTHORIZATION_UNAVAILABLE', 503, id);
    const response = responseBody({ authenticated: true }, 200, id);
    const names = authCookieNames('consumer');
    response.cookies.delete(names.recentProof);
    response.cookies.delete(names.loginAck);
    writeAuthSessionCookies({
      writer: response.cookies as unknown as AuthCookieWriter,
      session: data.session,
      secure: process.env.NODE_ENV === 'production',
      prefix: 'consumer',
    });
    writeLoginAcknowledgement({
      writer: response.cookies as unknown as AuthCookieWriter,
      secure: process.env.NODE_ENV === 'production',
      sessionId,
      loginFence: currentLogoutFence(
        request.cookies.get(names.logoutFence)?.value,
      ),
      prefix: 'consumer',
    });
    return response;
  } catch {
    return errorBody('AUTHORIZATION_UNAVAILABLE', 503, id);
  }
}
