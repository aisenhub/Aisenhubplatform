import { NextRequest } from 'next/server';
import { authCookieNames, authSessionGate } from '@kit/account-auth-nextjs';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ path: string[] }> };

function errorResponse(status: number, code: string): Response {
  return new Response(JSON.stringify({ error: { code, message: code } }), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
    },
  });
}

const resourceId =
  '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}';

function isAllowedPath(method: string, path: string): boolean {
  const id = resourceId;
  if (method === 'GET') {
    return (
      path === 'v1/plans' ||
      path === 'v1/account/principal' ||
      path === 'v1/profile' ||
      path === 'v1/preferences' ||
      path === 'v1/subscription' ||
      path === 'v1/subscription/products' ||
      path === 'v1/config-files' ||
      new RegExp(`^v1/subscription/checkout/${id}$`, 'u').test(path) ||
      new RegExp(`^v1/config-files/${id}$`, 'u').test(path) ||
      new RegExp(`^v1/config-files/${id}/content$`, 'u').test(path)
    );
  }
  if (method === 'POST') {
    return (
      path === 'v1/account/activate' ||
      path === 'v1/account/close' ||
      path === 'v1/auth/recent-proof' ||
      path === 'v1/identity/delete-request' ||
      path === 'v1/subscription/checkout' ||
      path === 'v1/subscription/redeem' ||
      path === 'v1/config-files/upload-intent'
    );
  }
  if (method === 'PATCH')
    return path === 'v1/profile' || path === 'v1/preferences';
  if (method === 'PUT')
    return new RegExp(`^v1/config-files/${id}/content$`, 'u').test(path);
  if (method === 'DELETE')
    return new RegExp(`^v1/config-files/${id}$`, 'u').test(path);
  return false;
}

async function dispatch(request: NextRequest, context: RouteContext) {
  const baseUrl = process.env.ACCOUNT_API_URL?.replace(/\/$/u, '');
  const platformKey = process.env.ACCOUNT_PLATFORM_KEY;
  const origin = process.env.TEMPLATE_ORIGIN;
  if (!baseUrl || !platformKey)
    return errorResponse(503, 'AUTHORIZATION_UNAVAILABLE');

  const { path } = await context.params;
  const pathValue = ['v1', ...path].join('/');
  if (!isAllowedPath(request.method, pathValue))
    return errorResponse(404, 'NOT_FOUND');
  const publicRead =
    request.method === 'GET' &&
    (pathValue === 'v1/plans' || pathValue === 'v1/subscription/products');
  const names = authCookieNames('consumer');
  const accessToken = request.cookies.get(names.access)?.value;
  const refreshToken = request.cookies.get(names.refresh)?.value;
  const gate = authSessionGate({
    accessToken,
    refreshToken,
    logoutFence: request.cookies.get(names.logoutFence)?.value,
    loginAck: request.cookies.get(names.loginAck)?.value,
  });
  if (!publicRead && (!accessToken || !gate.ok))
    return errorResponse(401, 'UNAUTHORIZED');

  if (request.method !== 'GET') {
    if (!origin || request.headers.get('origin') !== origin)
      return errorResponse(403, 'INVALID_INPUT');
    const csrf = request.cookies.get(names.csrf)?.value;
    if (!csrf || csrf !== request.headers.get('x-csrf-token'))
      return errorResponse(403, 'INVALID_INPUT');
  }

  try {
    const upstream = await fetch(
      `${baseUrl}/${pathValue}${request.nextUrl.search}`,
      {
        method: request.method,
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-store',
          'X-Platform-Key': platformKey,
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          ...Object.fromEntries(
            [
              'content-type',
              'idempotency-key',
              'if-match',
              'x-recent-auth-proof',
              'x-reauth-access-token',
            ].flatMap((name) => {
              const value = request.headers.get(name);
              return value ? [[name, value]] : [];
            }),
          ),
          ...(request.cookies.get(names.recentProof)?.value
            ? {
                'x-recent-auth-proof': request.cookies.get(names.recentProof)
                  ?.value as string,
              }
            : {}),
        },
        body: request.method === 'GET' ? undefined : await request.text(),
      },
    );
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type':
          upstream.headers.get('content-type') ?? 'application/json',
        ...(upstream.headers.get('x-request-id')
          ? { 'X-Request-Id': upstream.headers.get('x-request-id') as string }
          : {}),
        ...(upstream.headers.get('content-disposition')
          ? {
              'Content-Disposition': upstream.headers.get(
                'content-disposition',
              ) as string,
            }
          : {}),
        ...(upstream.headers.get('x-content-type-options')
          ? {
              'X-Content-Type-Options': upstream.headers.get(
                'x-content-type-options',
              ) as string,
            }
          : {}),
        ...(upstream.headers.get('etag')
          ? { ETag: upstream.headers.get('etag') as string }
          : {}),
      },
    });
  } catch {
    return errorResponse(503, 'AUTHORIZATION_UNAVAILABLE');
  }
}

export function GET(request: NextRequest, context: RouteContext) {
  return dispatch(request, context);
}

export function POST(request: NextRequest, context: RouteContext) {
  return dispatch(request, context);
}

export function PATCH(request: NextRequest, context: RouteContext) {
  return dispatch(request, context);
}

export function PUT(request: NextRequest, context: RouteContext) {
  return dispatch(request, context);
}

export function DELETE(request: NextRequest, context: RouteContext) {
  return dispatch(request, context);
}
