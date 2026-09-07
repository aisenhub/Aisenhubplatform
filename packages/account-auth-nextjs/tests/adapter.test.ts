import { describe, expect, it } from 'vitest';

import {
  assertSameOrigin,
  createPerRequestClient,
  noStoreHeaders,
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
});
