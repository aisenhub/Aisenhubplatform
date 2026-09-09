import { NextRequest } from 'next/server';
import {
  authCookieNames,
  revokeSupabaseSession,
  terminalClearAuthSessionCookies,
  type AuthCookieWriter,
} from '@kit/account-auth-nextjs';
import { config, errorBody, hasValidCsrf, hasValidOrigin, requestId, responseBody } from '../_lib';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<Response> {
  const id = requestId();
  const secure = process.env.NODE_ENV === 'production';
  try {
    const runtimeConfig = config();
    if (!hasValidOrigin(request, runtimeConfig.origin) || !hasValidCsrf(request)) return errorBody('INVALID_INPUT', 403, id);
    const names = authCookieNames('admin');
    const accessToken = request.cookies.get(names.access)?.value;
    const refreshToken = request.cookies.get(names.refresh)?.value;
    let remoteRevocation: 'confirmed' | 'not_required' | 'unavailable';
    if (!accessToken && !refreshToken) remoteRevocation = 'not_required';
    else if (!accessToken) remoteRevocation = 'unavailable';
    else remoteRevocation = await revokeSupabaseSession({ url: runtimeConfig.url, publishableKey: runtimeConfig.publishableKey, accessToken, timeoutMs: 5_000 });
    const response = responseBody({ authenticated: false, remote_revocation: remoteRevocation }, 200, id);
    terminalClearAuthSessionCookies({ writer: response.cookies as unknown as AuthCookieWriter, secure, prefix: 'admin' });
    return response;
  } catch {
    return errorBody('AUTHORIZATION_UNAVAILABLE', 503, id);
  }
}
