import { NextRequest } from 'next/server';
import {
  authCookieNames,
  createRequestAuthClient,
  requestEmailOtp,
  setRequestAuthSession,
} from '@kit/account-auth-nextjs';

import {
  config,
  errorBody,
  hasValidCsrf,
  hasValidOrigin,
  requestId,
  responseBody,
} from '../../_lib';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<Response> {
  const id = requestId();
  try {
    const runtimeConfig = config();
    if (
      !hasValidOrigin(request, runtimeConfig.origin) ||
      !hasValidCsrf(request)
    )
      return errorBody('INVALID_INPUT', 403, id);

    const names = authCookieNames('consumer');
    const accessToken = request.cookies.get(names.access)?.value;
    const refreshToken = request.cookies.get(names.refresh)?.value;
    if (!accessToken || !refreshToken)
      return errorBody('UNAUTHORIZED', 401, id);

    const client = createRequestAuthClient(runtimeConfig);
    const session = await setRequestAuthSession(client, {
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (session.error) return errorBody('UNAUTHORIZED', 401, id);

    const user = await client.auth.getUser();
    if (user.error || !user.data.user?.email)
      return errorBody('UNAUTHORIZED', 401, id);

    const result = await requestEmailOtp(client, user.data.user.email);
    if (result.error) {
      const status =
        result.error.status && result.error.status >= 500 ? 503 : 403;
      return errorBody(
        status === 503 ? 'AUTHORIZATION_UNAVAILABLE' : 'RATE_LIMITED',
        status,
        id,
      );
    }
    return responseBody({ requested: true }, 200, id);
  } catch {
    return errorBody('AUTHORIZATION_UNAVAILABLE', 503, id);
  }
}
