import { NextRequest } from 'next/server';
import { authCookieNames, authSessionGate } from '../../../_lib/auth/server';

import {
  accountApiJson,
  AccountApiUpstreamError,
} from '../../_lib/account-api';
import type { EntitlementDto } from '../../../_lib/integration/account-contract';
import { authorizeProtectedFeature } from '../../../_lib/integration/authorization';

export const dynamic = 'force-dynamic';

function json(
  data: unknown,
  status = 200,
  requestId = crypto.randomUUID(),
): Response {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Request-Id': requestId },
  });
}

export async function GET(request: NextRequest): Promise<Response> {
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
  const baseUrl = process.env.ACCOUNT_API_URL?.replace(/\/$/u, '');
  const platformKey = process.env.ACCOUNT_PLATFORM_KEY;
  const names = authCookieNames('consumer');
  const accessToken = request.cookies.get(names.access)?.value;
  const gate = authSessionGate({
    accessToken,
    refreshToken: request.cookies.get(names.refresh)?.value,
    logoutFence: request.cookies.get(names.logoutFence)?.value,
    loginAck: request.cookies.get(names.loginAck)?.value,
  });
  if (!baseUrl || !platformKey)
    return json(
      { error: { code: 'AUTHORIZATION_UNAVAILABLE' }, request_id: requestId },
      503,
      requestId,
    );
  if (!accessToken || !gate.ok)
    return json(
      { error: { code: 'UNAUTHORIZED' }, request_id: requestId },
      401,
      requestId,
    );

  try {
    let upstreamRequestId: string | null = null;
    const authorization = await authorizeProtectedFeature({
      feature: 'advanced_config',
      getSubscription: async () => {
        const upstream = await accountApiJson<EntitlementDto>(
          '/v1/subscription',
          {
            accessToken,
          },
        );
        upstreamRequestId = upstream.requestId;
        return upstream.data;
      },
    });
    if (!authorization.ok)
      return json(
        {
          error: { code: authorization.code },
          request_id: authorization.requestId ?? upstreamRequestId ?? requestId,
        },
        authorization.code === 'AUTHORIZATION_UNAVAILABLE' ? 503 : 403,
        requestId,
      );
    return json(
      {
        data: { authorized: true, entitlement: authorization.entitlement },
        request_id: upstreamRequestId ?? requestId,
      },
      200,
      requestId,
    );
  } catch (error) {
    const upstreamRequestId =
      error instanceof AccountApiUpstreamError ? error.requestId : null;
    return json(
      {
        error: { code: 'AUTHORIZATION_UNAVAILABLE' },
        request_id: upstreamRequestId ?? requestId,
      },
      503,
      requestId,
    );
  }
}
