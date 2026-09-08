import { createPerRequestClient } from '@kit/account-auth-nextjs';
import { AccountApiError, createAccountApiClient } from '@kit/account-server';
import type { ApiErrorCode } from '@kit/account-server';
import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ path: string[] }> };
type SupportedMethod = 'GET' | 'POST' | 'PATCH';

class BffError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
  ) {
    super(code);
    this.name = 'BffError';
  }
}

function requestId(): string {
  return crypto.randomUUID();
}

function jsonResponse(
  body: unknown,
  status: number,
  id: string,
  additionalHeaders: Readonly<Record<string, string>> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
      'X-Request-Id': id,
      ...additionalHeaders,
    },
  });
}

function cookie(request: NextRequest, name: string): string | undefined {
  return request.cookies.get(name)?.value;
}

function config(): { baseUrl: string; platformKey: string; origin: string } {
  const baseUrl = process.env.ACCOUNT_API_URL;
  const platformKey = process.env.PLATFORM_KEY;
  const origin = process.env.CONSUMER_ORIGIN;
  if (!baseUrl || !platformKey || !origin) {
    throw new BffError(503, 'AUTHORIZATION_UNAVAILABLE');
  }
  return { baseUrl, platformKey, origin };
}

function assertMutationSecurity(
  request: NextRequest,
  trustedOrigin: string,
): void {
  if (request.headers.get('origin') !== trustedOrigin) {
    throw new BffError(403, 'INVALID_INPUT');
  }
  const csrfCookie = cookie(request, 'aisenhub-csrf');
  const csrfHeader = request.headers.get('x-csrf-token');
  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    throw new BffError(403, 'INVALID_INPUT');
  }
}

function accessToken(request: NextRequest): string {
  return cookie(request, 'aisenhub-session') ?? '';
}

async function jsonObject(
  request: NextRequest,
): Promise<Readonly<Record<string, unknown>>> {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 65536) {
    throw new BffError(413, 'PAYLOAD_TOO_LARGE');
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      throw new Error('not an object');
    }
    return parsed as Readonly<Record<string, unknown>>;
  } catch {
    throw new BffError(400, 'INVALID_INPUT');
  }
}

async function dispatch(
  request: NextRequest,
  method: SupportedMethod,
  context: RouteContext,
): Promise<Response> {
  const id = requestId();
  try {
    const { path } = await context.params;
    const route = path.join('/');
    const runtimeConfig = config();
    if (method !== 'GET') assertMutationSecurity(request, runtimeConfig.origin);

    const perRequest = createPerRequestClient(
      () =>
        createAccountApiClient({
          baseUrl: runtimeConfig.baseUrl,
          platformKey: runtimeConfig.platformKey,
        }),
      {
        origin: request.headers.get('origin') ?? undefined,
        host: request.headers.get('host') ?? undefined,
        cookie: request.headers.get('cookie') ?? undefined,
      },
      request.nextUrl.searchParams.get('returnTo') ?? '/',
    );
    const api = perRequest.client;
    const token = accessToken(request);

    if (route === 'plans' && method === 'GET') {
      return jsonResponse(
        { data: await api.listPublicPlans(), request_id: id },
        200,
        id,
      );
    }
    if (route === 'account/principal' && method === 'GET') {
      return jsonResponse(
        { data: await api.getPrincipal(token), request_id: id },
        200,
        id,
      );
    }
    if (route === 'account/activate' && method === 'POST') {
      return jsonResponse(
        { data: await api.activate(token), request_id: id },
        200,
        id,
      );
    }
    if (route === 'profile' && method === 'GET') {
      const data = await api.getProfile(token);
      return jsonResponse(
        { data, request_id: id },
        200,
        id,
        etag(data.row_version),
      );
    }
    if (route === 'profile' && method === 'PATCH') {
      const ifMatch = request.headers.get('if-match');
      if (!ifMatch) throw new BffError(428, 'PRECONDITION_REQUIRED');
      const data = await api.patchProfile(
        token,
        ifMatch,
        await jsonObject(request),
      );
      return jsonResponse(
        { data, request_id: id },
        200,
        id,
        etag(data.row_version),
      );
    }
    if (route === 'preferences' && method === 'GET') {
      const data = await api.getPreferences(token);
      return jsonResponse(
        { data, request_id: id },
        200,
        id,
        etag(data.row_version),
      );
    }
    if (route === 'preferences' && method === 'PATCH') {
      const ifMatch = request.headers.get('if-match');
      if (!ifMatch) throw new BffError(428, 'PRECONDITION_REQUIRED');
      const data = await api.patchPreferences(
        token,
        ifMatch,
        await jsonObject(request),
      );
      return jsonResponse(
        { data, request_id: id },
        200,
        id,
        etag(data.row_version),
      );
    }
    if (route === 'subscription' && method === 'GET') {
      return jsonResponse(
        { data: await api.getSubscription(token), request_id: id },
        200,
        id,
      );
    }
    if (route === 'subscription/redeem' && method === 'POST') {
      const idempotencyKey = request.headers.get('idempotency-key');
      if (!idempotencyKey) throw new BffError(400, 'INVALID_INPUT');
      const body = await jsonObject(request);
      if (typeof body.code !== 'string' || body.code.length < 1)
        throw new BffError(400, 'INVALID_INPUT');
      return jsonResponse(
        {
          data: await api.redeemSubscription(token, body.code, idempotencyKey),
          request_id: id,
        },
        200,
        id,
      );
    }
    throw new BffError(404, 'RESOURCE_NOT_FOUND');
  } catch (error) {
    const bffError =
      error instanceof BffError
        ? error
        : error instanceof AccountApiError
          ? new BffError(error.status, error.code)
          : new BffError(503, 'AUTHORIZATION_UNAVAILABLE');
    return jsonResponse(
      {
        error: { code: bffError.code, message: bffError.code },
        request_id: id,
      },
      bffError.status,
      id,
    );
  }
}

function etag(rowVersion: number): { ETag: string } {
  return { ETag: `W/"${rowVersion}"` };
}

export function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  return dispatch(request, 'GET', context);
}

export function POST(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  return dispatch(request, 'POST', context);
}

export function PATCH(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  return dispatch(request, 'PATCH', context);
}
