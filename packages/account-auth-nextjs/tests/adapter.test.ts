import { describe, expect, it, vi } from 'vitest';

import {
  assertSameOrigin,
  createPerRequestClient,
  noStoreHeaders,
  revokeSupabaseSession,
} from '../src/index.ts';

describe('SSR auth adapter', () => {
  it('creates a fresh client for each request and does not share headers', () => {
    const seen: string[] = [];
    const factory = (headers: Record<string, string | undefined>) => {
      seen.push(headers.cookie ?? '');
      return { id: seen.length };
    };
    const one = createPerRequestClient(
      factory,
      { cookie: 'session=one' },
      '/one',
    );
    const two = createPerRequestClient(
      factory,
      { cookie: 'session=two' },
      '/two',
    );
    expect(one.client.id).toBe(1);
    expect(two.client.id).toBe(2);
    expect(seen).toEqual(['session=one', 'session=two']);
  });

  it('enforces same-origin CSRF and no-store responses', () => {
    expect(() =>
      assertSameOrigin(
        { origin: 'https://app.invalid' },
        'https://app.invalid',
      ),
    ).not.toThrow();
    expect(() =>
      assertSameOrigin(
        { origin: 'https://evil.invalid' },
        'https://app.invalid',
      ),
    ).toThrow('CSRF_ORIGIN_MISMATCH');
    expect(noStoreHeaders('request-1')['Cache-Control']).toBe('no-store');
  });

  it('revokes the upstream session before callers clear local cookies', async () => {
    const fetcher = vi.fn(
      async (input: string | Request | URL, init?: RequestInit) => {
        expect(input).toBe('https://auth.example.test/auth/v1/logout');
        expect(init?.method).toBe('POST');
        expect(init?.cache).toBe('no-store');
        expect(init?.headers).toEqual({
          apikey: 'publishable-key',
          Authorization: 'Bearer access-token',
        });
        return new Response(null, { status: 204 });
      },
    );
    await revokeSupabaseSession({
      url: 'https://auth.example.test/',
      publishableKey: 'publishable-key',
      accessToken: 'access-token',
      fetcher,
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('does not treat an upstream logout outage as successful', async () => {
    await expect(
      revokeSupabaseSession({
        url: 'https://auth.example.test',
        publishableKey: 'publishable-key',
        accessToken: 'access-token',
        fetcher: async () => new Response(null, { status: 503 }),
      }),
    ).rejects.toThrow('AUTH_LOGOUT_UNAVAILABLE');
  });
});
