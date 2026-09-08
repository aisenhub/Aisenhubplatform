import { createPerRequestClient } from '@kit/account-auth-nextjs';
import { AccountApiError, createAccountApiClient } from '@kit/account-server';
import type { ApiErrorCode } from '@kit/account-server';
import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ path: string[] }> };
type SupportedMethod = 'GET' | 'POST' | 'PATCH' | 'PUT';

const MAX_UPLOAD_BYTES = 1024 * 1024;
let activeUploads = 0;
const activeUploadsByAccount = new Map<string, number>();

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

async function boundedBinaryBody(request: NextRequest): Promise<Uint8Array> {
  const declared = request.headers.get('content-length');
  if (
    declared !== null &&
    (!/^\d+$/u.test(declared) || Number(declared) > MAX_UPLOAD_BYTES)
  )
    throw new BffError(413, 'PAYLOAD_TOO_LARGE');
  const encoding = request.headers.get('content-encoding');
  if (encoding && encoding.toLowerCase() !== 'identity')
    throw new BffError(400, 'INVALID_INPUT');
  const reader = request.body?.getReader();
  if (!reader) throw new BffError(400, 'INVALID_INPUT');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      if (size + value.byteLength > MAX_UPLOAD_BYTES) {
        await reader.cancel('upload limit exceeded').catch(() => undefined);
        throw new BffError(413, 'PAYLOAD_TOO_LARGE');
      }
      chunks.push(value);
      size += value.byteLength;
    }
    if (declared !== null && Number(declared) !== size)
      throw new BffError(400, 'UPLOAD_SIZE_MISMATCH');
    if (size === 0) throw new BffError(400, 'INVALID_INPUT');
    const result = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result;
  } finally {
    reader.releaseLock();
  }
}

function acquireUpload(accountId: string): boolean {
  const accountActive = activeUploadsByAccount.get(accountId) ?? 0;
  if (activeUploads >= 16 || accountActive >= 2) return false;
  activeUploads += 1;
  activeUploadsByAccount.set(accountId, accountActive + 1);
  return true;
}

function releaseUpload(accountId: string): void {
  activeUploads = Math.max(0, activeUploads - 1);
  const accountActive = Math.max(
    0,
    (activeUploadsByAccount.get(accountId) ?? 1) - 1,
  );
  if (accountActive === 0) activeUploadsByAccount.delete(accountId);
  else activeUploadsByAccount.set(accountId, accountActive);
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
    if (route === 'account/close' && method === 'POST') {
      const proof = cookie(request, 'aisenhub-recent-auth-proof');
      if (!proof) throw new BffError(403, 'RECENT_MFA_REQUIRED');
      return jsonResponse(
        { data: await api.closeAccount(token, proof), request_id: id },
        200,
        id,
      );
    }
    if (route === 'identity/delete-request' && method === 'POST') {
      const proof = cookie(request, 'aisenhub-recent-auth-proof');
      if (!proof) throw new BffError(403, 'RECENT_MFA_REQUIRED');
      return jsonResponse(
        {
          data: await api.requestIdentityDeletion(token, proof),
          request_id: id,
        },
        202,
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
    if (route === 'config-files/upload-intent' && method === 'POST') {
      const idempotencyKey = request.headers.get('idempotency-key');
      if (!idempotencyKey) throw new BffError(400, 'INVALID_INPUT');
      const input = await jsonObject(request);
      if (
        typeof input.name !== 'string' ||
        typeof input.size !== 'number' ||
        typeof input.content_type !== 'string' ||
        input.purpose !== 'config'
      )
        throw new BffError(400, 'INVALID_INPUT');
      return jsonResponse(
        {
          data: await api.createUploadIntent(
            token,
            {
              name: input.name,
              size: input.size,
              content_type: input.content_type,
              purpose: 'config',
              replaces_file_id:
                typeof input.replaces_file_id === 'string'
                  ? input.replaces_file_id
                  : null,
            },
            idempotencyKey,
          ),
          request_id: id,
        },
        201,
        id,
      );
    }
    const contentMatch = /^config-files\/([^/]+)\/content$/u.exec(route);
    if (contentMatch && method === 'PUT') {
      const fileId = contentMatch[1]!;
      const principal = (await api.getPrincipal(token)) as {
        platform_account_id?: unknown;
      };
      if (typeof principal.platform_account_id !== 'string')
        throw new BffError(409, 'ACCOUNT_NOT_ACTIVATED');
      if (!acquireUpload(principal.platform_account_id))
        throw new BffError(429, 'RATE_LIMITED');
      try {
        const idempotencyKey = request.headers.get('idempotency-key');
        if (!idempotencyKey) throw new BffError(400, 'INVALID_INPUT');
        const data = await api.uploadContent(
          token,
          fileId,
          await boundedBinaryBody(request),
          idempotencyKey,
        );
        return jsonResponse({ data, request_id: id }, 202, id);
      } finally {
        releaseUpload(principal.platform_account_id);
      }
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

export function PUT(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  return dispatch(request, 'PUT', context);
}
