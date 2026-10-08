import { describe, expect, it } from 'vitest';

import {
  createAdminMfaAttestation,
  verifyAdminMfaAttestation,
} from '../src/admin-mfa-attestation.ts';

const secret = 'test-admin-mfa-attestation-secret-32-bytes-minimum';
const userId = '00000000-0000-4000-8000-000000000001';
const sessionId = '00000000-0000-4000-8000-000000000002';
const factorId = '00000000-0000-4000-8000-000000000003';
const nonce = '00000000-0000-4000-8000-000000000004';
const now = Date.parse('2026-10-08T10:00:00.000Z');

describe('admin MFA attestation', () => {
  it('binds a short-lived attestation to user, session and factor', async () => {
    const attestation = await createAdminMfaAttestation({
      secret,
      userId,
      sessionId,
      factorId,
      nonce,
      now,
    });

    await expect(
      verifyAdminMfaAttestation({
        attestation,
        secret,
        expectedUserId: userId,
        expectedSessionId: sessionId,
        now: now + 30_000,
      }),
    ).resolves.toEqual({
      factorId,
      verifiedAt: '2026-10-08T10:00:00.000Z',
      nonce,
    });
  });

  it('rejects tampering, session mismatch and expiry', async () => {
    const attestation = await createAdminMfaAttestation({
      secret,
      userId,
      sessionId,
      factorId,
      nonce,
      now,
    });
    const tampered = `${attestation.slice(0, -1)}${attestation.endsWith('A') ? 'B' : 'A'}`;

    await expect(
      verifyAdminMfaAttestation({
        attestation: tampered,
        secret,
        expectedUserId: userId,
        expectedSessionId: sessionId,
        now: now + 1_000,
      }),
    ).resolves.toBeNull();
    await expect(
      verifyAdminMfaAttestation({
        attestation,
        secret,
        expectedUserId: userId,
        expectedSessionId: '00000000-0000-4000-8000-000000000099',
        now: now + 1_000,
      }),
    ).resolves.toBeNull();
    await expect(
      verifyAdminMfaAttestation({
        attestation,
        secret,
        expectedUserId: userId,
        expectedSessionId: sessionId,
        now: now + 60_001,
      }),
    ).resolves.toBeNull();
  });
});
