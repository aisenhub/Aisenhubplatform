import { NextRequest } from 'next/server';
import {
  createRequestAuthClient,
  requestPasswordReset,
} from '@kit/account-auth-nextjs';
import { config, errorBody, hasValidOrigin, responseBody } from '../_lib';

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const runtimeConfig = config();
    if (!hasValidOrigin(request, runtimeConfig.origin))
      return errorBody('INVALID_INPUT', 403);
    const body = (await request.json()) as { email?: unknown };
    if (typeof body.email !== 'string') return errorBody('INVALID_INPUT', 400);
    const client = createRequestAuthClient(runtimeConfig);
    const { error } = await requestPasswordReset(
      client,
      body.email,
      `${runtimeConfig.origin}/auth/callback?returnTo=/update-password`,
    );
    if (error && error.status && error.status >= 500)
      return errorBody('AUTHORIZATION_UNAVAILABLE', 503);
    return responseBody({ requested: true });
  } catch {
    return errorBody('AUTHORIZATION_UNAVAILABLE', 503);
  }
}
