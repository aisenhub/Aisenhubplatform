import { describe, expect, it } from 'vitest';

import { resolveAdminSecurityView } from './admin-security-status';

function response(status: number, requestId = 'request-1') {
  return new Response(null, {
    status,
    headers: { 'x-request-id': requestId },
  });
}

describe('Admin security status gate', () => {
  it('keeps anonymous and non-admin outcomes distinct', () => {
    expect(resolveAdminSecurityView(response(401), null)).toEqual({
      kind: 'unauthenticated',
    });
    expect(
      resolveAdminSecurityView(response(403), {
        error: { code: 'ADMIN_REQUIRED' },
      }),
    ).toEqual({ kind: 'admin_required', requestId: 'request-1' });
  });

  it('accepts both authenticated assurance levels', () => {
    expect(
      resolveAdminSecurityView(response(200), {
        data: { current_aal: 'aal1' },
      }),
    ).toEqual({ kind: 'aal1' });
    expect(
      resolveAdminSecurityView(response(200), {
        data: { current_aal: 'aal2' },
      }),
    ).toEqual({ kind: 'aal2' });
  });

  it('preserves request IDs and fails closed for unexpected responses', () => {
    expect(resolveAdminSecurityView(response(503), null)).toEqual({
      kind: 'unavailable',
      requestId: 'request-1',
      errorCode: 'HTTP_503',
    });
    expect(
      resolveAdminSecurityView(response(403), {
        error: { code: 'MFA_REQUIRED' },
        request_id: 'payload-request',
      }),
    ).toEqual({
      kind: 'unavailable',
      requestId: 'request-1',
      errorCode: 'MFA_REQUIRED',
    });
    expect(
      resolveAdminSecurityView(response(200), {
        data: { current_aal: 'unknown' },
      }).kind,
    ).toBe('unavailable');
  });
});
