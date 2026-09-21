import { NextRequest } from 'next/server';
import { authCookieNames, authSessionGate } from '@kit/account-auth-nextjs';

import { accountApiSignal } from '../../_lib/account-api';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ path: string[] }> };

const resourceId =
  '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}';

export function isAllowedAdminPath(method: string, path: string): boolean {
  const id = resourceId;
  const exact = (value: string) => path === `admin/api/v1/${value}`;
  const matches = (value: string) =>
    new RegExp(`^admin/api/v1/${value}$`, 'u').test(path);

  if (method === 'GET') {
    return (
      exact('platforms') ||
      matches(`platforms/${id}`) ||
      matches(`platforms/${id}/origins`) ||
      matches(`platforms/${id}/accounts`) ||
      matches(`platforms/${id}/accounts/${id}`) ||
      matches(`platforms/${id}/keys`) ||
      matches(`platforms/${id}/plans`) ||
      matches(`platforms/${id}/subscription-config`) ||
      exact('redemption-batches') ||
      matches(`subscriptions/${id}`) ||
      exact('config-files') ||
      matches(`config-files/${id}`) ||
      matches(`platforms/${id}/file-policy`) ||
      matches(`config-files/${id}/content`) ||
      exact('audit') ||
      exact('billing/orders') ||
      matches(`billing/orders/${id}`) ||
      exact('billing/metrics') ||
      exact('billing/provider-products') ||
      exact('deletion-jobs') ||
      matches(`deletion-jobs/${id}`)
    );
  }
  if (method === 'POST') {
    return (
      exact('auth/recent-proof') ||
      exact('platforms') ||
      matches(`platforms/${id}/origins`) ||
      matches(`platforms/${id}/accounts/${id}/(?:suspend|restore|close)`) ||
      matches(`platforms/${id}/keys`) ||
      matches(`platforms/${id}/keys/${id}/(?:revoke|confirm-deployment)`) ||
      matches(`platforms/${id}/plans`) ||
      exact('redemption-batches') ||
      matches(`redemption-batches/${id}/(?:confirm-delivery|disable)`) ||
      matches(`subscriptions/${id}/commands`) ||
      matches(`billing/orders/${id}/(?:requery|resolve)`) ||
      exact('deletion-jobs') ||
      matches(`deletion-jobs/${id}/retry`)
    );
  }
  if (method === 'PATCH') {
    return (
      matches(`platforms/${id}`) ||
      matches(`platforms/${id}/accounts/${id}`) ||
      matches(`platforms/${id}/subscription-config`) ||
      matches(`platforms/${id}/file-policy`)
    );
  }
  if (method === 'DELETE') return matches(`config-files/${id}`);
  return false;
}

function cookie(request: NextRequest, name: string): string | undefined {
  return request.cookies.get(name)?.value;
}

function errorResponse(status: number, code: string, id: string): Response {
  return new Response(
    JSON.stringify({ error: { code, message: code }, request_id: id }),
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json',
        'X-Request-Id': id,
      },
    },
  );
}

async function dispatch(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  const id = crypto.randomUUID();
  try {
    const baseUrl = process.env.ACCOUNT_API_URL?.replace(/\/$/u, '');
    const origin = process.env.ADMIN_ORIGIN;
    if (!baseUrl || !origin)
      return errorResponse(503, 'AUTHORIZATION_UNAVAILABLE', id);
    const { path } = await context.params;
    const pathValue = path.join('/');
    if (!isAllowedAdminPath(request.method, pathValue))
      return errorResponse(404, 'NOT_FOUND', id);
    const target = `${baseUrl}/${pathValue}${request.nextUrl.search}`;
    const mutation = request.method !== 'GET';
    if (mutation) {
      if (request.headers.get('origin') !== origin)
        return errorResponse(403, 'INVALID_INPUT', id);
      const csrfCookie = cookie(request, authCookieNames('admin').csrf);
      if (!csrfCookie || csrfCookie !== request.headers.get('x-csrf-token'))
        return errorResponse(403, 'INVALID_INPUT', id);
    }
    const binaryDownload =
      request.method === 'GET' &&
      /^admin\/api\/v1\/config-files\/[^/]+\/content$/u.test(pathValue);
    const headers: Record<string, string> = {
      Accept: binaryDownload ? 'application/octet-stream' : 'application/json',
      'Cache-Control': 'no-store',
    };
    const names = authCookieNames('admin');
    const token = cookie(request, names.access);
    const refresh = cookie(request, names.refresh);
    const gate = authSessionGate({
      accessToken: token,
      refreshToken: refresh,
      logoutFence: cookie(request, names.logoutFence),
      loginAck: cookie(request, names.loginAck),
    });
    if (!token || !gate.ok) return errorResponse(401, 'UNAUTHORIZED', id);
    const proof = cookie(request, names.recentProof);
    if (token) headers.Authorization = `Bearer ${token}`;
    if (proof) headers['X-Recent-Auth-Proof'] = proof;
    const contentType = request.headers.get('content-type');
    if (contentType) headers['Content-Type'] = contentType;
    for (const name of ['if-match', 'if-none-match', 'idempotency-key']) {
      const value = request.headers.get(name);
      if (value) headers[name] = value;
    }
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: mutation ? await request.text() : undefined,
      signal: accountApiSignal(),
    });
    if (binaryDownload) {
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          'Cache-Control':
            upstream.headers.get('cache-control') ?? 'private, no-store',
          'Content-Type':
            upstream.headers.get('content-type') ?? 'application/octet-stream',
          'Content-Disposition':
            upstream.headers.get('content-disposition') ?? 'attachment',
          'X-Content-Type-Options':
            upstream.headers.get('x-content-type-options') ?? 'nosniff',
          'X-Request-Id': id,
          ...(upstream.headers.get('etag')
            ? { ETag: upstream.headers.get('etag') as string }
            : {}),
        },
      });
    }
    const payload = await upstream.text();
    return new Response(payload, {
      status: upstream.status,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json',
        'X-Request-Id': id,
        ...(upstream.headers.get('etag')
          ? { ETag: upstream.headers.get('etag') as string }
          : {}),
      },
    });
  } catch {
    return errorResponse(503, 'AUTHORIZATION_UNAVAILABLE', id);
  }
}

export function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  return dispatch(request, context);
}

export function POST(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  return dispatch(request, context);
}

export function PATCH(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  return dispatch(request, context);
}

export function DELETE(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  return dispatch(request, context);
}
