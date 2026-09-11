import { describe, expect, it } from 'vitest';

import { createAccountApiClient } from '../src/index.ts';
import type { AccountApiRequestBody } from '../src/index.ts';

describe('account API server client', () => {
  it('creates a fresh no-store request with server-only key and auth token', async () => {
    const requests: Array<{
      url: string;
      init: { headers: Readonly<Record<string, string>> };
    }> = [];
    const client = createAccountApiClient({
      baseUrl: 'https://account.example.invalid/',
      platformKey: 'phk_test_server_only',
      fetcher: async (url, init) => {
        requests.push({ url, init });
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: { row_version: 1 }, request_id: 'req-1' }),
        };
      },
    });

    await client.getProfile('access-token-1');
    expect(requests[0]).toMatchObject({
      url: 'https://account.example.invalid/v1/profile',
      init: {
        headers: {
          'X-Platform-Key': 'phk_test_server_only',
          Authorization: 'Bearer access-token-1',
          'Cache-Control': 'no-store',
        },
      },
    });
  });

  it('lists subscription products through the server-only Platform Key boundary', async () => {
    const requests: string[] = [];
    const client = createAccountApiClient({
      baseUrl: 'https://account.example.invalid',
      platformKey: 'phk_test_server_only',
      fetcher: async (url) => {
        requests.push(url);
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: [], request_id: 'products-1' }),
        };
      },
    });

    await expect(client.listSubscriptionProducts()).resolves.toEqual([]);
    expect(requests).toEqual([
      'https://account.example.invalid/v1/subscription/products',
    ]);
  });

  it('creates and reads subscription checkout through the authenticated server client', async () => {
    const requests: Array<{ url: string; init: Record<string, unknown> }> = [];
    const client = createAccountApiClient({
      baseUrl: 'https://account.example.invalid',
      platformKey: 'phk_test_server_only',
      fetcher: async (url, init) => {
        requests.push({ url, init: init as Record<string, unknown> });
        return {
          ok: true,
          status: 201,
          json: async () => ({
            data: {
              checkout_id: '00000000-0000-4000-8000-000000000001',
              status: 'pending',
              product_code: 'yearly',
              price: '199.00',
              currency: 'CNY',
              term: { kind: 'finite', duration_value: 1, duration_unit: 'year' },
              expires_at: '2026-09-11T12:30:00.000Z',
              provider_display_name: null,
              payment_url: null,
              paid_at: null,
              granted_at: null,
            },
            request_id: 'checkout-1',
          }),
        };
      },
    });

    await client.createSubscriptionCheckout(
      'access-token',
      'yearly',
      'checkout-idem-1',
    );
    await client.getSubscriptionCheckout(
      'access-token',
      '00000000-0000-4000-8000-000000000001',
    );
    expect(requests[0]).toMatchObject({
      url: 'https://account.example.invalid/v1/subscription/checkout',
      init: {
        method: 'POST',
        headers: {
          Authorization: 'Bearer access-token',
          'Idempotency-Key': 'checkout-idem-1',
        },
        body: JSON.stringify({ product_code: 'yearly' }),
      },
    });
    expect(requests[1]?.url).toBe(
      'https://account.example.invalid/v1/subscription/checkout/00000000-0000-4000-8000-000000000001',
    );
  });

  it('forwards the independently verified reauthentication token only as a header', async () => {
    const requests: Array<{
      url: string;
      init: { method: string; headers: Readonly<Record<string, string>> };
    }> = [];
    const client = createAccountApiClient({
      baseUrl: 'https://account.example.invalid',
      platformKey: 'phk_test_server_only',
      fetcher: async (url, init) => {
        requests.push({ url, init });
        return {
          ok: true,
          status: 201,
          json: async () => ({
            data: {
              proof_id: '00000000-0000-4000-8000-000000000001',
              expires_at: '2026-09-08T12:05:00.000Z',
            },
            request_id: 'req-1',
          }),
        };
      },
    });

    await client.issueRecentAuthProof('current-access', 'event-access');
    expect(requests[0]).toMatchObject({
      url: 'https://account.example.invalid/v1/auth/recent-proof',
      init: {
        method: 'POST',
        headers: {
          Authorization: 'Bearer current-access',
          'X-Reauth-Access-Token': 'event-access',
        },
      },
    });
  });

  it('forwards recent proof only as a server-side header for sensitive account actions', async () => {
    const requests: Array<{
      url: string;
      init: { method: string; headers: Readonly<Record<string, string>> };
    }> = [];
    const client = createAccountApiClient({
      baseUrl: 'https://account.example.invalid',
      platformKey: 'phk_test_server_only',
      fetcher: async (url, init) => {
        requests.push({ url, init });
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: { account_status: 'closed' },
            request_id: 'req-1',
          }),
        };
      },
    });

    await client.closeAccount(
      'access-token',
      '00000000-0000-4000-8000-000000000009',
    );
    expect(requests[0]).toMatchObject({
      url: 'https://account.example.invalid/v1/account/close',
      init: {
        method: 'POST',
        headers: {
          Authorization: 'Bearer access-token',
          'X-Recent-Auth-Proof': '00000000-0000-4000-8000-000000000009',
        },
      },
    });
  });

  it('maps central API errors without exposing the upstream message', async () => {
    const client = createAccountApiClient({
      baseUrl: 'https://account.example.invalid',
      platformKey: 'phk_test_server_only',
      fetcher: async () => ({
        ok: false,
        status: 503,
        json: async () => ({
          error: { code: 'AUTHORIZATION_UNAVAILABLE', message: 'SQL secret' },
          request_id: 'req-error-1',
        }),
      }),
    });

    await expect(client.getPrincipal('access-token-1')).rejects.toMatchObject({
      name: 'AccountApiError',
      status: 503,
      code: 'AUTHORIZATION_UNAVAILABLE',
      requestId: 'req-error-1',
      message: 'AUTHORIZATION_UNAVAILABLE',
    });
  });

  it('forwards subscription reads and redemption idempotency without exposing the key', async () => {
    const requests: Array<{
      url: string;
      init: {
        method: string;
        headers: Readonly<Record<string, string>>;
        body?: AccountApiRequestBody;
      };
    }> = [];
    const client = createAccountApiClient({
      baseUrl: 'https://account.example.invalid',
      platformKey: 'phk_test_server_only',
      fetcher: async (url, init) => {
        requests.push({ url, init });
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              effective_status: 'active',
              entitlement_kind: 'free',
              plan: null,
              features: {},
              started_at: null,
              current_period_end: null,
              evaluated_at: '2026-09-07T12:00:00.000Z',
              next_transition_at: null,
            },
            request_id: 'req-1',
          }),
        };
      },
    });

    await client.getSubscription('access-token-1');
    await client.redeemSubscription('access-token-1', 'CODE-ONCE', 'idem-1');
    expect(requests[0]!.url).toBe(
      'https://account.example.invalid/v1/subscription',
    );
    expect(requests[1]!).toMatchObject({
      url: 'https://account.example.invalid/v1/subscription/redeem',
      init: {
        method: 'POST',
        headers: {
          'Idempotency-Key': 'idem-1',
          Authorization: 'Bearer access-token-1',
        },
        body: JSON.stringify({ code: 'CODE-ONCE' }),
      },
    });
  });

  it('supports bounded file state reads and binary downloads through the server key', async () => {
    const requests: Array<{
      url: string;
      init: { method: string; headers: Readonly<Record<string, string>> };
    }> = [];
    const client = createAccountApiClient({
      baseUrl: 'https://account.example.invalid',
      platformKey: 'phk_test_server_only',
      fetcher: async (url, init) => {
        requests.push({ url, init });
        if (url.includes('/content'))
          return new Response('hello', {
            status: 200,
            headers: { 'Content-Type': 'application/octet-stream' },
          });
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: url.endsWith('/config-files')
              ? { items: [], next_cursor: null }
              : { file_id: 'file-1', status: 'active' },
            request_id: 'req-1',
          }),
        };
      },
    });

    await client.listConfigFiles('access-token-1', null, 20);
    await client.getConfigFile('access-token-1', 'file-1');
    const download = await client.downloadConfigFile(
      'access-token-1',
      'file-1',
    );
    expect(await download.arrayBuffer?.()).toEqual(
      new TextEncoder().encode('hello').buffer,
    );
    expect(requests.map((request) => request.url)).toEqual([
      'https://account.example.invalid/v1/config-files?limit=20',
      'https://account.example.invalid/v1/config-files/file-1',
      'https://account.example.invalid/v1/config-files/file-1/content',
    ]);
    expect(requests[2]?.init.headers).toMatchObject({
      Accept: 'application/octet-stream',
      'X-Platform-Key': 'phk_test_server_only',
      Authorization: 'Bearer access-token-1',
    });
  });

  it('retries transient reads and never retries upload streams', async () => {
    let readAttempts = 0;
    const delays: number[] = [];
    const client = createAccountApiClient({
      baseUrl: 'https://account.example.invalid',
      platformKey: 'phk_test_server_only',
      retry: {
        baseDelayMs: 10,
        maxDelayMs: 10,
        random: () => 0.5,
        sleep: async (milliseconds) => {
          delays.push(milliseconds);
        },
      },
      fetcher: async (url) => {
        if (url.endsWith('/v1/plans')) {
          readAttempts += 1;
          if (readAttempts < 3)
            return {
              ok: false,
              status: 503,
              json: async () => ({
                error: { code: 'AUTHORIZATION_UNAVAILABLE' },
                request_id: `retry-${readAttempts}`,
              }),
            };
          return {
            ok: true,
            status: 200,
            json: async () => ({ data: [], request_id: 'final-read' }),
          };
        }
        throw new Error('upload transport failed');
      },
    });

    await expect(client.listPublicPlans()).resolves.toEqual([]);
    expect(readAttempts).toBe(3);
    expect(delays).toEqual([10, 10]);
    await expect(
      client.uploadContent(
        'access-token',
        'file-1',
        new Uint8Array([1]),
        'idem-1',
      ),
    ).rejects.toMatchObject({
      status: 503,
      code: 'AUTHORIZATION_UNAVAILABLE',
    });
    expect(readAttempts).toBe(3);
  });

  it('retries an idempotent-key operation but not a business rejection', async () => {
    let attempts = 0;
    const client = createAccountApiClient({
      baseUrl: 'https://account.example.invalid',
      platformKey: 'phk_test_server_only',
      retry: { sleep: async () => undefined },
      fetcher: async () => {
        attempts += 1;
        if (attempts === 1)
          return {
            ok: false,
            status: 503,
            json: async () => ({
              error: { code: 'AUTHORIZATION_UNAVAILABLE' },
              request_id: 'retry-once',
            }),
          };
        return {
          ok: true,
          status: 201,
          json: async () => ({
            data: {
              file_id: 'file-1',
              upload_path: '/v1/config-files/file-1/content',
              expires_at: '2026-09-09T00:00:00Z',
            },
            request_id: 'intent-ok',
          }),
        };
      },
    });

    await expect(
      client.createUploadIntent(
        'access-token',
        {
          name: 'config.json',
          size: 1,
          content_type: 'application/json',
          purpose: 'config',
        },
        'idem-1',
      ),
    ).resolves.toMatchObject({ file_id: 'file-1' });
    expect(attempts).toBe(2);
  });
});
