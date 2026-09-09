import { describe, expect, it } from 'vitest';

import {
  createProviderIntent,
  createSessionVerifier,
  requireSafeReturnTo,
  safeReturnTo,
} from '../src/index.ts';

describe('account auth boundary', () => {
  const now = new Date('2026-09-07T12:00:00Z');
  const session = {
    userId: 'user-1',
    sessionId: 'session-1',
    expiresAt: '2026-09-07T13:00:00Z',
    aal: 'aal1' as const,
    authenticatedAt: '2026-09-07T11:59:00Z',
  };

  it('allows only relative returnTo values', () => {
    expect(safeReturnTo('/dashboard?tab=profile')).toBe(
      '/dashboard?tab=profile',
    );
    expect(safeReturnTo('https://evil.invalid')).toBe('/');
    expect(safeReturnTo('//evil.invalid')).toBe('/');
    expect(() => requireSafeReturnTo('https://evil.invalid')).toThrow(
      'INVALID_RETURN_TO',
    );
    expect(createProviderIntent('google', '/callback').returnTo).toBe(
      '/callback',
    );
    expect(safeReturnTo('/update-password?access_token=secret')).toBe('/');
    expect(safeReturnTo('/reauth?code_verifier=secret')).toBe('/');
    expect(() => requireSafeReturnTo('/callback?proof=secret')).toThrow(
      'INVALID_RETURN_TO',
    );
  });

  it('checks server-side session, revocation and expected user', async () => {
    const verifier = createSessionVerifier({
      lookup: async (token) => (token === 'valid' ? session : null),
      isRevoked: async (sessionId) => sessionId === 'revoked',
      clock: () => now,
    });
    expect(
      (
        await verifier.verifySession({
          accessToken: 'valid',
          expectedUserId: 'user-1',
          now,
        })
      ).ok,
    ).toBe(true);
    const missing = await verifier.verifySession({
      accessToken: 'missing',
      now,
    });
    const wrongUser = await verifier.verifySession({
      accessToken: 'valid',
      expectedUserId: 'user-2',
      now,
    });
    expect(missing.ok ? undefined : missing.error.code).toBe('SESSION_REVOKED');
    expect(wrongUser.ok ? undefined : wrongUser.error.code).toBe(
      'SESSION_REVOKED',
    );
  });

  it('requires a session-bound proof no older than five minutes', async () => {
    const verifier = createSessionVerifier({
      lookup: async () => session,
      clock: () => now,
    });
    const proof = {
      proofId: 'proof-1',
      userId: 'user-1',
      sessionId: 'session-1',
      factorId: 'factor-1',
      authenticatedAt: '2026-09-07T11:56:00Z',
      expiresAt: '2026-09-07T12:01:00Z',
    };
    const valid = verifier.verifyRecentAuth({ session, now, proof });
    expect(valid.ok).toBe(true);
    const missing = verifier.verifyRecentAuth({ session, now, proof: null });
    expect(missing.ok ? undefined : missing.error.code).toBe('PROOF_MISSING');
    const longLived = verifier.verifyRecentAuth({
      session,
      now,
      proof: { ...proof, expiresAt: '2026-09-07T12:06:00Z' },
    });
    expect(longLived.ok ? undefined : longLived.error.code).toBe(
      'PROOF_EXPIRED',
    );
  });
});
