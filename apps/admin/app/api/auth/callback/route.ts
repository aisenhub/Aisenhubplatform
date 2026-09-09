import { NextRequest, NextResponse } from 'next/server';
import {
  authCookieNames,
  callbackReturnTo,
  createRequestAuthClient,
  exchangeAuthCode,
  sessionIdFromAccessToken,
  writeAuthSessionCookies,
  writeLoginAcknowledgement,
  type AuthCookieWriter,
} from '@kit/account-auth-nextjs';
import { config, errorBody, flowFence, requestId } from '../_lib';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<Response> {
  const id = requestId();
  let returnTo: string;
  try {
    returnTo = callbackReturnTo(request.nextUrl.searchParams.get('returnTo'));
  } catch {
    return errorBody('INVALID_INPUT', 400, id);
  }
  const redirect = (path: string) => {
    const response = NextResponse.redirect(new URL(path, request.url));
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('X-Request-Id', id);
    return response;
  };
  try {
    const runtimeConfig = config();
    const names = authCookieNames('admin');
    const capturedFence = flowFence(request);
    if (capturedFence === null) return redirect('/admin/login?error=callback_expired');
    const code = request.nextUrl.searchParams.get('code');
    if (!code) return redirect('/admin/login?error=invalid_callback');
    const client = createRequestAuthClient(runtimeConfig);
    const { data, error } = await exchangeAuthCode(client, code);
    const sessionId = data.session ? sessionIdFromAccessToken(data.session.access_token) : null;
    if (error || !data.session || !sessionId) return redirect('/admin/login?error=callback_failed');
    const response = NextResponse.redirect(new URL(returnTo, request.url));
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('X-Request-Id', id);
    writeAuthSessionCookies({ writer: response.cookies as unknown as AuthCookieWriter, session: data.session, secure: process.env.NODE_ENV === 'production', prefix: 'admin' });
    writeLoginAcknowledgement({ writer: response.cookies as unknown as AuthCookieWriter, secure: process.env.NODE_ENV === 'production', sessionId, loginFence: capturedFence, prefix: 'admin' });
    response.cookies.delete(names.authFlow);
    response.cookies.delete(names.recentProof);
    return response;
  } catch {
    return redirect('/admin/login?error=callback_unavailable');
  }
}
