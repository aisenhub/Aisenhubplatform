import { describe, expect, it } from 'vitest';

import {
  authorizeAccountRequest,
  authorizeAdminRequest,
  authorizeProtectedFeature,
  generatePlatformKeyMaterial,
  generateRedemptionCodes,
  normalizeOrigin,
  REDEMPTION_CODE_ALPHABET,
  validateCallbackUrl,
} from '../src/index.ts';
import { createSessionVerifier } from '@kit/account-auth';

const session = {
  userId: 'admin-1',
  sessionId: 'session-1',
  expiresAt: '2026-09-07T13:00:00Z',
  aal: 'aal2' as const,
  authenticatedAt: '2026-09-07T11:59:00Z',
};
const proof = {
  proofId: 'proof-1',
  userId: 'admin-1',
  sessionId: 'session-1',
  factorId: 'factor-1',
  authenticatedAt: '2026-09-07T11:56:00Z',
  expiresAt: '2026-09-07T12:01:00Z',
};

describe('server authorization guards', () => {
  it('checks admin membership and fresh proof at the sensitive boundary', async () => {
    const verifier = createSessionVerifier({
      lookup: async (token) => (token === 'valid' ? session : null),
      clock: () => new Date('2026-09-07T12:00:00Z'),
    });
    const common = {
      accessToken: 'valid',
      verifier,
      lookupMembership: async () => ({
        userId: 'admin-1',
        role: 'admin' as const,
        active: true,
      }),
      sensitive: true,
      now: new Date('2026-09-07T12:00:00Z'),
    };
    expect((await authorizeAdminRequest({ ...common, proof })).ok).toBe(true);
    const missingProof = await authorizeAdminRequest({
      ...common,
      proof: null,
    });
    expect(missingProof.ok ? undefined : missingProof.code).toBe(
      'RECENT_MFA_REQUIRED',
    );
  });

  it('does not authorize a user whose session is revoked or bound to another user', async () => {
    const verifier = createSessionVerifier({
      lookup: async () => session,
      isRevoked: async () => true,
    });
    const denied = await authorizeAccountRequest({
      accessToken: 'valid',
      verifier,
      expectedUserId: 'admin-1',
    });
    expect(denied.ok ? undefined : denied.code).toBe('UNAUTHORIZED');
  });

  it('uses the central entitlement result for server-side feature authorization', async () => {
    const entitlement = {
      effective_status: 'active' as const,
      entitlement_kind: 'term' as const,
      plan: null,
      features: { advanced_config: true },
      started_at: '2026-09-11T00:00:00Z',
      current_period_end: '2026-10-11T00:00:00Z',
      evaluated_at: '2026-09-11T12:00:00Z',
      next_transition_at: '2026-10-11T00:00:00Z',
    };
    const client = { getSubscription: async () => entitlement };
    await expect(
      authorizeProtectedFeature({
        client,
        accessToken: 'server-token',
        feature: 'advanced_config',
      }),
    ).resolves.toEqual({ ok: true, entitlement });
    await expect(
      authorizeProtectedFeature({
        client: {
          getSubscription: async () => ({
            ...entitlement,
            effective_status: 'none' as const,
          }),
        },
        accessToken: 'server-token',
        feature: 'advanced_config',
      }),
    ).resolves.toMatchObject({ ok: false, code: 'ENTITLEMENT_REQUIRED' });
  });

  it('generates non-repeatable HMAC-backed key material and validates origins', () => {
    const one = generatePlatformKeyMaterial({
      hmacSecret: 'test-secret',
      version: 1,
      platformId: 'platform-1',
      keyId: 'key-1',
    });
    const two = generatePlatformKeyMaterial({
      hmacSecret: 'test-secret',
      version: 1,
      platformId: 'platform-1',
      keyId: 'key-2',
    });
    expect(one.presentedKey).not.toBe(two.presentedKey);
    expect(one.keyHmac).toMatch(/^[0-9a-f]{64}$/);
    expect(one.keySuffix.length).toBe(8);
    expect(normalizeOrigin('HTTPS://App.Example.test/')).toBe(
      'https://app.example.test',
    );
    expect(
      validateCallbackUrl(
        'https://app.example.test/auth/callback',
        'https://app.example.test',
      ),
    ).toContain('/auth/callback');
    expect(() =>
      normalizeOrigin('https://user:pass@app.example.test/'),
    ).toThrow('INVALID_ORIGIN');
    expect(() =>
      validateCallbackUrl(
        'https://evil.example.test/callback',
        'https://app.example.test',
      ),
    ).toThrow('ORIGIN_MISMATCH');
  });

  it('generates one-time redemption material with uniform alphabet sampling', async () => {
    expect(REDEMPTION_CODE_ALPHABET).toHaveLength(31);
    const codes = await generateRedemptionCodes({
      platformId: '00000000-0000-4000-8000-000000000001',
      hmacSecret: 'm3-test-hmac-secret-that-is-not-real',
      hmacKeyVersion: 3,
      quantity: 24,
    });
    expect(codes).toHaveLength(24);
    expect(new Set(codes.map((item) => item.code)).size).toBe(24);
    for (const item of codes) {
      expect(item.code).toHaveLength(31);
      expect(item.code).toMatch(new RegExp(`^[${REDEMPTION_CODE_ALPHABET}]+$`));
      expect(item.codePrefix).toBe(item.code.slice(0, 4));
      expect(item.codeSuffix).toBe(item.code.slice(-4));
      expect(item.codeHmac).toMatch(/^[0-9a-f]{64}$/u);
    }
  });

  it('rejects unsafe redemption generator parameters', async () => {
    await expect(
      generateRedemptionCodes({
        platformId: 'platform',
        hmacSecret: 'short',
        hmacKeyVersion: 0,
        quantity: 0,
      }),
    ).rejects.toThrow('INVALID_REDEMPTION_CODE_INPUT');
  });
});
