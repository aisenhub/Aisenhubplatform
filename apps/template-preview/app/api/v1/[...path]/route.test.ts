import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET, PATCH, POST } from './route';

const originalFetch = globalThis.fetch;
const originalEnv = {
  ACCOUNT_API_URL: process.env.ACCOUNT_API_URL,
  PLATFORM_KEY: process.env.PLATFORM_KEY,
  CONSUMER_ORIGIN: process.env.CONSUMER_ORIGIN,
};

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
          cookie: 'aisenhub-session=session-1',
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
        Authorization: 'Bearer session-1',
      });
      return new Response(
        JSON.stringify({ data: { row_version: 7 }, request_id: 'account-2' }),
        { status: 200 },
      );
    }) as typeof fetch;

    const response = await GET(
      request('profile', { headers: { cookie: 'aisenhub-session=session-1' } }),
      { params: Promise.resolve({ path: ['profile'] }) },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('etag')).toBe('W/"7"');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('requires idempotency and same-origin CSRF for redemption', async () => {
    process.env.ACCOUNT_API_URL = 'https://account.example.test';
    process.env.PLATFORM_KEY = 'phk_server_only_fixture';
    process.env.CONSUMER_ORIGIN = 'https://consumer-a.example.test';
    const fetchMock = vi.fn(async (_input: string, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        'Idempotency-Key': 'redeem-1',
        Authorization: 'Bearer session-1',
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
          cookie: 'aisenhub-session=session-1; aisenhub-csrf=csrf-1',
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
          cookie: 'aisenhub-session=session-1; aisenhub-csrf=csrf-1',
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
});
