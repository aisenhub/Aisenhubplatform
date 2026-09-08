import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ path: string[] }> };

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
    const target = `${baseUrl}/${path.join('/')}${request.nextUrl.search}`;
    const mutation = request.method !== 'GET';
    if (mutation) {
      if (request.headers.get('origin') !== origin)
        return errorResponse(403, 'INVALID_INPUT', id);
      const csrfCookie = cookie(request, 'aisenhub-csrf');
      if (!csrfCookie || csrfCookie !== request.headers.get('x-csrf-token'))
        return errorResponse(403, 'INVALID_INPUT', id);
    }
    const binaryDownload =
      request.method === 'GET' &&
      /^admin\/api\/v1\/config-files\/[^/]+\/content$/u.test(path.join('/'));
    const headers: Record<string, string> = {
      Accept: binaryDownload ? 'application/octet-stream' : 'application/json',
      'Cache-Control': 'no-store',
    };
    const token = cookie(request, 'aisenhub-admin-session');
    const proof = cookie(request, 'aisenhub-recent-auth-proof');
    if (token) headers.Authorization = `Bearer ${token}`;
    if (proof) headers['X-Recent-Auth-Proof'] = proof;
    const contentType = request.headers.get('content-type');
    if (contentType) headers['Content-Type'] = contentType;
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: mutation ? await request.text() : undefined,
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
