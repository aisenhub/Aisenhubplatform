import { describe, expect, it } from 'vitest';

import { verifyAdminMfaAttestation } from '@kit/domain/admin-mfa-attestation';

import {
  ADMIN_RECENT_MFA_MAX_AGE_SECONDS,
  authorizeAdminMfaFactorDeletion,
  finalizeAdminMfaFactorDeletion,
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

  it('prepares and finalizes factor deletion with a serialized operation', async () => {
    const operationId = '00000000-0000-4000-8000-000000000005';
    const recentProofId = '00000000-0000-4000-8000-000000000004';
    const prepared = await authorizeAdminMfaFactorDeletion({
      accountApiUrl: 'https://account.example',
      accessToken: 'fixture-aal2-token',
      recentProofId,
      factorId,
      operationId,
      fetcher: async (input, init) => {
        expect(input).toBe(
          `https://account.example/admin/api/v1/auth/mfa-factors/${factorId}/delete-authorization`,
        );
        const headers = new Headers(init?.headers);
        expect(headers.get('authorization')).toBe('Bearer fixture-aal2-token');
        expect(headers.get('x-recent-auth-proof')).toBe(recentProofId);
        expect(JSON.parse(String(init?.body))).toEqual({
          operation_id: operationId,
        });
        return Response.json(
          {
            data: {
              authorized: true,
              operation_id: operationId,
              lease_until: '2026-10-16T03:00:00.000Z',
            },
          },
          { status: 200 },
        );
      },
    });
    expect(prepared).toEqual({
      ok: true,
      operationId,
      leaseUntil: '2026-10-16T03:00:00.000Z',
    });

    const finalized = await finalizeAdminMfaFactorDeletion({
      accountApiUrl: 'https://account.example',
      accessToken: 'fixture-aal2-token',
      factorId,
      operationId,
      result: 'completed',
      fetcher: async (input, init) => {
        expect(input).toBe(
          `https://account.example/admin/api/v1/auth/mfa-factors/${factorId}/delete-finalization`,
        );
        expect(JSON.parse(String(init?.body))).toEqual({
          operation_id: operationId,
          result: 'completed',
        });
        return Response.json(
          { data: { state: 'completed', replayed: false } },
          { status: 200 },
        );
      },
    });
    expect(finalized).toEqual({ ok: true, state: 'completed' });
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
