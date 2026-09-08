import { describe, expect, it } from 'vitest';

import { createAccountApiClient } from '../src/index.ts';

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

  it('maps central API errors without exposing the upstream message', async () => {
    const client = createAccountApiClient({
      baseUrl: 'https://account.example.invalid',
      platformKey: 'phk_test_server_only',
      fetcher: async () => ({
        ok: false,
        status: 503,
        json: async () => ({
          error: { code: 'AUTHORIZATION_UNAVAILABLE', message: 'SQL secret' },
        }),
      }),
    });

    await expect(client.getPrincipal('access-token-1')).rejects.toMatchObject({
      name: 'AccountApiError',
      status: 503,
      code: 'AUTHORIZATION_UNAVAILABLE',
      message: 'AUTHORIZATION_UNAVAILABLE',
    });
  });

  it('forwards subscription reads and redemption idempotency without exposing the key', async () => {
    const requests: Array<{
      url: string;
      init: {
        method: string;
        headers: Readonly<Record<string, string>>;
        body?: string;
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
});
