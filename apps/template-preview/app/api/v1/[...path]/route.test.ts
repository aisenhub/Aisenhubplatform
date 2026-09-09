import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { encodeAuthSessionAcknowledgement } from '@kit/account-auth-nextjs';
import { DELETE, GET, PATCH, POST, PUT } from './route';

const originalFetch = globalThis.fetch;
const originalEnv = {
  ACCOUNT_API_URL: process.env.ACCOUNT_API_URL,
  PLATFORM_KEY: process.env.PLATFORM_KEY,
  CONSUMER_ORIGIN: process.env.CONSUMER_ORIGIN,
};
const sessionToken = `eyJhbGciOiJub25lIn0.${Buffer.from(
  JSON.stringify({
    session_id: '00000000-0000-4000-8000-000000000001',
    exp: Math.floor(Date.now() / 1000) + 60,
  }),
).toString('base64url')}.signature`;
const sessionAck = encodeAuthSessionAcknowledgement({
  fence: 'none',
  session_id: '00000000-0000-4000-8000-000000000001',
});
const sessionCookies = `aisenhub-session=${sessionToken}; aisenhub-consumer-login-ack=${sessionAck}; aisenhub-consumer-csrf=csrf-1`;

function request(
  path: string,
  init?: ConstructorParameters<typeof NextRequest>[1],
): NextRequest {
  return new NextRequest(
    `https://consumer-a.example.test/api/v1/${path}`,
    init,
  );
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.restoreAllMocks();
});

describe('template consumer BFF', () => {
  it('calls the packaged server SDK for public pricing and never exposes a key to the response', async () => {
    process.env.ACCOUNT_API_URL = 'https://account.example.test';
    process.env.PLATFORM_KEY = 'phk_server_only_fixture';
    process.env.CONSUMER_ORIGIN = 'https://consumer-a.example.test';
    const fetchMock = vi.fn(async (_input: string, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        'X-Platform-Key': 'phk_server_only_fixture',
      });
      return new Response(
        JSON.stringify({ data: [{ code: 'free' }], request_id: 'account-1' }),
        { status: 200 },
      );
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const response = await GET(request('plans'), {
      params: Promise.resolve({ path: ['plans'] }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ data: [{ code: 'free' }] });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('rejects write requests without same-origin CSRF before calling the central API', async () => {
    process.env.ACCOUNT_API_URL = 'https://account.example.test';
    process.env.PLATFORM_KEY = 'phk_server_only_fixture';
    process.env.CONSUMER_ORIGIN = 'https://consumer-a.example.test';
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof fetch;

    const response = await PATCH(
      request('profile', {
        method: 'PATCH',
        headers: {
          origin: 'https://evil.example.test',
          cookie: sessionCookies,
        },
        body: JSON.stringify({ display_name: 'blocked' }),
      }),
      { params: Promise.resolve({ path: ['profile'] }) },
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: 'INVALID_INPUT' },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards session and ETag semantics for profile reads', async () => {
    process.env.ACCOUNT_API_URL = 'https://account.example.test';
    process.env.PLATFORM_KEY = 'phk_server_only_fixture';
    process.env.CONSUMER_ORIGIN = 'https://consumer-a.example.test';
    globalThis.fetch = vi.fn(async (_input: string, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        Authorization: `Bearer ${sessionToken}`,
      });
      return new Response(
        JSON.stringify({ data: { row_version: 7 }, request_id: 'account-2' }),
        { status: 200 },
      );
    }) as typeof fetch;

    const response = await GET(
      request('profile', { headers: { cookie: sessionCookies } }),
      { params: Promise.resolve({ path: ['profile'] }) },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('etag')).toBe('W/"7"');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('forwards file state reads and keeps binary downloads non-cacheable', async () => {
    process.env.ACCOUNT_API_URL = 'https://account.example.test';
    process.env.PLATFORM_KEY = 'phk_server_only_fixture';
    process.env.CONSUMER_ORIGIN = 'https://consumer-a.example.test';
    const fetchMock = vi.fn(async (input: string) => {
      if (input.includes('/content'))
        return new Response('hello', {
          status: 200,
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': 'attachment; filename="config.ini"',
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'private, no-store',
          },
        });
      return new Response(
        JSON.stringify({
          data: { items: [], next_cursor: null },
          request_id: 'file-1',
        }),
        { status: 200 },
      );
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const list = await GET(
      request('config-files?limit=20', {
        headers: { cookie: sessionCookies },
      }),
      { params: Promise.resolve({ path: ['config-files'] }) },
    );
    expect(list.status).toBe(200);
    expect(await list.json()).toMatchObject({ data: { items: [] } });
    const download = await GET(
      request('config-files/file-1/content', {
        headers: { cookie: sessionCookies },
      }),
      {
        params: Promise.resolve({
          path: ['config-files', 'file-1', 'content'],
        }),
      },
    );
    expect(download.status).toBe(200);
    expect(download.headers.get('cache-control')).toBe('private, no-store');
    expect(download.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await download.text()).toBe('hello');
  });

  it('requires idempotency and same-origin CSRF for redemption', async () => {
    process.env.ACCOUNT_API_URL = 'https://account.example.test';
    process.env.PLATFORM_KEY = 'phk_server_only_fixture';
    process.env.CONSUMER_ORIGIN = 'https://consumer-a.example.test';
    const fetchMock = vi.fn(async (_input: string, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        'Idempotency-Key': 'redeem-1',
        Authorization: `Bearer ${sessionToken}`,
      });
      return new Response(
        JSON.stringify({
          data: { entitlement_kind: 'term', effective_status: 'active' },
          request_id: 'account-3',
        }),
        { status: 200 },
      );
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const response = await POST(
      request('subscription/redeem', {
        method: 'POST',
        headers: {
          origin: 'https://consumer-a.example.test',
          cookie: sessionCookies,
          'x-csrf-token': 'csrf-1',
          'idempotency-key': 'redeem-1',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ code: 'CODE-ONCE' }),
      }),
      { params: Promise.resolve({ path: ['subscription', 'redeem'] }) },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { entitlement_kind: 'term' },
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('requires the HttpOnly recent-auth proof for account close', async () => {
    process.env.ACCOUNT_API_URL = 'https://account.example.test';
    process.env.PLATFORM_KEY = 'phk_server_only_fixture';
    process.env.CONSUMER_ORIGIN = 'https://consumer-a.example.test';
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof fetch;

    const response = await POST(
      request('account/close', {
        method: 'POST',
        headers: {
          origin: 'https://consumer-a.example.test',
          cookie: sessionCookies,
          'x-csrf-token': 'csrf-1',
        },
      }),
      { params: Promise.resolve({ path: ['account', 'close'] }) },
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: 'RECENT_MFA_REQUIRED' },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('buffers bounded binary uploads before forwarding them through the server SDK', async () => {
    process.env.ACCOUNT_API_URL = 'https://account.example.test';
    process.env.PLATFORM_KEY = 'phk_server_only_fixture';
    process.env.CONSUMER_ORIGIN = 'https://consumer-a.example.test';
    const calls: RequestInit[] = [];
    globalThis.fetch = vi.fn(async (_input: string, init?: RequestInit) => {
      calls.push(init ?? {});
      if (calls.length === 1)
        return new Response(
          JSON.stringify({ data: { platform_account_id: 'account-1' } }),
          { status: 200 },
        );
      return new Response(
        JSON.stringify({
          data: { file_id: 'file-1', status: 'active', size: 5 },
        }),
        { status: 202 },
      );
    }) as typeof fetch;

    const response = await PUT(
      request('config-files/file-1/content', {
        method: 'PUT',
        headers: {
          origin: 'https://consumer-a.example.test',
          cookie: sessionCookies,
          'x-csrf-token': 'csrf-1',
          'idempotency-key': 'content-1',
          'content-type': 'application/octet-stream',
        },
        body: 'hello',
      }),
      {
        params: Promise.resolve({
          path: ['config-files', 'file-1', 'content'],
        }),
      },
    );
    expect(response.status).toBe(202);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.headers).toMatchObject({
      'X-Platform-Key': 'phk_server_only_fixture',
      Authorization: `Bearer ${sessionToken}`,
      'Content-Type': 'application/octet-stream',
      'Idempotency-Key': 'content-1',
    });
    expect(calls[1]?.body).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(calls[1]?.body as Uint8Array)).toBe(
      'hello',
    );
  });

  it('rejects compressed or oversized binary bodies before the central API', async () => {
    process.env.ACCOUNT_API_URL = 'https://account.example.test';
    process.env.PLATFORM_KEY = 'phk_server_only_fixture';
    process.env.CONSUMER_ORIGIN = 'https://consumer-a.example.test';
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ data: { platform_account_id: 'account-1' } }),
          {
            status: 200,
          },
        ),
    );
    globalThis.fetch = fetchMock as typeof fetch;
    const response = await PUT(
      request('config-files/file-1/content', {
        method: 'PUT',
        headers: {
          origin: 'https://consumer-a.example.test',
          cookie: sessionCookies,
          'x-csrf-token': 'csrf-1',
          'idempotency-key': 'content-2',
          'content-encoding': 'gzip',
        },
        body: 'compressed',
      }),
      {
        params: Promise.resolve({
          path: ['config-files', 'file-1', 'content'],
        }),
      },
    );
    expect(response.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('forwards idempotent file deletion through the server SDK', async () => {
    process.env.ACCOUNT_API_URL = 'https://account.example.test';
    process.env.PLATFORM_KEY = 'phk_server_only_fixture';
    process.env.CONSUMER_ORIGIN = 'https://consumer-a.example.test';
    const calls: RequestInit[] = [];
    globalThis.fetch = vi.fn(async (_input: string, init?: RequestInit) => {
      calls.push(init ?? {});
      if (calls.length === 1)
        return new Response(
          JSON.stringify({ data: { platform_account_id: 'account-1' } }),
          { status: 200 },
        );
      return new Response(
        JSON.stringify({
          data: { file_id: 'file-1', status: 'deleting', reserved_bytes: 5 },
        }),
        { status: 202 },
      );
    }) as typeof fetch;

    const response = await DELETE(
      request('config-files/file-1', {
        method: 'DELETE',
        headers: {
          origin: 'https://consumer-a.example.test',
          cookie: sessionCookies,
          'x-csrf-token': 'csrf-1',
          'idempotency-key': 'delete-1',
        },
      }),
      { params: Promise.resolve({ path: ['config-files', 'file-1'] }) },
    );
    expect(response.status).toBe(202);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers).toMatchObject({
      'X-Platform-Key': 'phk_server_only_fixture',
      Authorization: `Bearer ${sessionToken}`,
      'Idempotency-Key': 'delete-1',
    });
  });
});
