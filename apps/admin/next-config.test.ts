import { describe, expect, it } from 'vitest';

import nextConfig, { ADMIN_SECURITY_HEADERS } from './next.config.mjs';

describe('Admin browser security headers', () => {
  it('enforces framing, MIME and the validated CSP policy', async () => {
    const byName = new Map(
      ADMIN_SECURITY_HEADERS.map((header) => [header.key, header.value]),
    );
    expect(byName.get('X-Frame-Options')).toBe('DENY');
    expect(byName.get('X-Content-Type-Options')).toBe('nosniff');
    expect(byName.get('Referrer-Policy')).toBe(
      'strict-origin-when-cross-origin',
    );
    expect(byName.get('Content-Security-Policy-Report-Only')).toBeUndefined();
    expect(byName.get('Content-Security-Policy')).toContain(
      "frame-ancestors 'none'",
    );
    expect(byName.get('Content-Security-Policy')).toContain(
      "img-src 'self' data: blob:",
    );

    const entries = await nextConfig.headers?.();
    expect(entries).toEqual([
      { source: '/:path*', headers: ADMIN_SECURITY_HEADERS },
    ]);
  });
});
