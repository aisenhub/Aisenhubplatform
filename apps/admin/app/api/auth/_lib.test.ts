import { describe, expect, it } from 'vitest';

import { verifyAdminMfaAttestation } from '@kit/domain/admin-mfa-attestation';

import {
  ADMIN_RECENT_MFA_MAX_AGE_SECONDS,
  issueAdminRecentProof,
} from './_lib';

const signingKey = 'fixture-admin-mfa-attestation-key-32-bytes-minimum';
const userId = '00000000-0000-4000-8000-000000000001';
const sessionId = '00000000-0000-4000-8000-000000000002';
const factorId = '00000000-0000-4000-8000-000000000003';

describe('Admin auth server helpers', () => {
  it('keeps the recent MFA proof window at thirty minutes', () => {
    expect(ADMIN_RECENT_MFA_MAX_AGE_SECONDS).toBe(30 * 60);
  });

  it('exchanges a server-signed MFA attestation instead of a browser factor header', async () => {
    const result = await issueAdminRecentProof({
      accountApiUrl: 'https://account.example',
      accessToken: 'fixture-aal2-token',
      attestationSecret: signingKey,
      userId,
      sessionId,
      factorId,
      fetcher: async (input, init) => {
        expect(input).toBe(
          'https://account.example/admin/api/v1/auth/recent-proof',
        );
        const headers = new Headers(init?.headers);
        expect(headers.get('authorization')).toBe('Bearer fixture-aal2-token');
        expect(headers.get('x-mfa-factor-id')).toBeNull();
        const attestation = headers.get('x-mfa-attestation');
        expect(attestation).toBeTruthy();
        await expect(
          verifyAdminMfaAttestation({
            attestation: attestation!,
            secret: signingKey,
            expectedUserId: userId,
            expectedSessionId: sessionId,
          }),
        ).resolves.toMatchObject({ factorId });

        return Response.json(
          { data: { proof_id: '00000000-0000-4000-8000-000000000004' } },
          { status: 201 },
        );
      },
    });

    expect(result).toEqual({
      ok: true,
      proofId: '00000000-0000-4000-8000-000000000004',
    });
  });
});
