/// <reference lib="deno.ns" />

import { assertEquals, assertMatch } from 'jsr:@std/assert@1';

import { handleRequest } from './index.ts';

const platformId = '00000000-0000-4000-8000-000000000001';
const keyId = '00000000-0000-4000-8000-000000000002';
const userId = '00000000-0000-4000-8000-000000000003';
const sessionId = '00000000-0000-4000-8000-000000000004';
const reauthSessionId = '00000000-0000-4000-8000-000000000007';

function fakeJwt(
  aal: 'aal1' | 'aal2' = 'aal1',
  tokenSessionId = sessionId,
  tokenUserId = userId,
): string {
  const encode = (value: unknown) =>
    btoa(JSON.stringify(value))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replaceAll('=', '');
  return `${encode({ alg: 'none' })}.${encode({ sub: tokenUserId, session_id: tokenSessionId, aal })}.x`;
}

function fakeDatabase() {
  return {
    async begin<T>(
      callback: (transaction: {
        json: (value: unknown) => unknown;
        unsafe: <R extends Record<string, unknown>>(
          query: string,
          values?: unknown[],
        ) => Promise<R[]>;
      }) => Promise<T>,
    ) {
      return callback({
        json(value: unknown) {
          return value;
        },
        async unsafe<R extends Record<string, unknown>>(
          query: string,
        ): Promise<R[]> {
          if (
            query.startsWith(
              'select * from private.platform_key_verify_presented',
            )
          ) {
            return [
              {
                key_id: keyId,
                platform_id: platformId,
                platform_status: 'active',
              },
            ] as unknown as R[];
          }
          if (query.startsWith('select * from private.public_plans_list')) {
            return [
              {
                code: 'free',
                name: 'Free',
                description: null,
                kind: 'free',
                features: { quota: 1 },
              },
            ] as unknown as R[];
          }
          if (query.startsWith('select * from private.account_principal')) {
            return [
              {
                authorization: 'allowed',
                account_status: 'active',
                platform_account_id: userId,
              },
            ] as unknown as R[];
          }
          if (query.startsWith('select * from private.admin_step_up_issue')) {
            return [
              {
                proof_id: '00000000-0000-4000-8000-000000000005',
                expires_at: '2026-09-08T00:05:00.000Z',
              },
            ] as unknown as R[];
          }
          if (
            query.startsWith(
              'select * from private.user_recent_auth_proof_issue',
            )
          ) {
            return [
              {
                proof_id: '00000000-0000-4000-8000-000000000008',
                expires_at: '2026-09-08T00:05:00.000Z',
              },
            ] as unknown as R[];
          }
          if (query.startsWith('select * from private.entitlement_read')) {
            return [
              {
                effective_status: 'active',
                entitlement_kind: 'free',
                code: 'free',
                name: 'Free',
                description: null,
                features: { quota: 1 },
                started_at: null,
                current_period_end: null,
                next_transition_at: null,
                evaluated_at: new Date('2026-09-07T00:00:00Z'),
              },
            ] as unknown as R[];
          }
          return [] as R[];
        },
      });
    },
  };
}

Deno.test('Account API validates the Platform Key boundary before public plans', async () => {
  const response = await handleRequest(
    new Request('http://local/functions/v1/account-api/v1/plans', {
      headers: { 'X-Platform-Key': `phk_v1_${keyId}_fixture` },
    }),
    {
      database: fakeDatabase(),
      platformKeySecret: 'm3-test-platform-secret',
    },
  );
  assertEquals(response.status, 200);
  assertEquals((await response.json()).data[0].code, 'free');
  assertEquals(response.headers.get('cache-control'), 'no-store');
});

Deno.test('Account API accepts the Edge runtime function-name path prefix', async () => {
  const response = await handleRequest(
    new Request(`http://edge/account-api/v1/plans`, {
      headers: { 'X-Platform-Key': `phk_v1_${keyId}_fixture` },
    }),
    {
      database: fakeDatabase(),
      platformKeySecret: 'm3-test-platform-secret',
    },
  );
  assertEquals(response.status, 200);
  assertEquals((await response.json()).data[0].code, 'free');
});

Deno.test('Account API rejects missing Platform Key without touching the database', async () => {
  const response = await handleRequest(
    new Request('http://local/functions/v1/account-api/v1/plans'),
    { database: fakeDatabase(), platformKeySecret: 'm3-test-platform-secret' },
  );
  assertEquals(response.status, 401);
  assertMatch(
    (await response.json()).error.code,
    /^PLATFORM_CREDENTIAL_INVALID$/u,
  );
});

Deno.test('Account API maps an entitlement read to the stable DTO', async () => {
  const response = await handleRequest(
    new Request('http://local/functions/v1/account-api/v1/subscription', {
      headers: {
        Authorization: `Bearer ${fakeJwt()}`,
        'X-Platform-Key': `phk_v1_${keyId}_fixture`,
      },
    }),
    {
      database: fakeDatabase(),
      platformKeySecret: 'm3-test-platform-secret',
      verifyAccessToken: async () => userId,
    },
  );
  assertEquals(response.status, 200);
  assertEquals((await response.json()).data.entitlement_kind, 'free');
});

Deno.test('Account API sends current and previous redemption HMAC candidates atomically', async () => {
  const calls: Array<{ query: string; values?: unknown[] }> = [];
  const database = {
    async begin<T>(
      callback: (transaction: {
        json: (value: unknown) => unknown;
        unsafe: <R extends Record<string, unknown>>(
          query: string,
          values?: unknown[],
        ) => Promise<R[]>;
      }) => Promise<T>,
    ) {
      return callback({
        json: (value) => value,
        async unsafe<R extends Record<string, unknown>>(
          query: string,
          values?: unknown[],
        ): Promise<R[]> {
          calls.push({ query, values });
          if (
            query.startsWith(
              'select * from private.platform_key_verify_presented',
            )
          )
            return [
              {
                key_id: keyId,
                platform_id: platformId,
                platform_status: 'active',
              },
            ] as unknown as R[];
          if (query.startsWith('select * from private.account_principal'))
            return [
              {
                authorization: 'allowed',
                account_status: 'active',
                platform_account_id: userId,
              },
            ] as unknown as R[];
          if (
            query.startsWith(
              'select * from private.redeem_subscription_code_candidates',
            )
          )
            return [
              { outcome: 'applied', plan_id: platformId },
            ] as unknown as R[];
          if (query.startsWith('select * from private.entitlement_read'))
            return [
              {
                effective_status: 'active',
                entitlement_kind: 'paid',
                code: 'pro',
                name: 'Pro',
                features: {},
                started_at: null,
                current_period_end: null,
                next_transition_at: null,
                evaluated_at: null,
              },
            ] as unknown as R[];
          return [] as R[];
        },
      });
    },
  };
  const response = await handleRequest(
    new Request(
      'http://local/functions/v1/account-api/v1/subscription/redeem',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${fakeJwt()}`,
          'X-Platform-Key': `phk_v1_${keyId}_fixture`,
          'Idempotency-Key': 'rotation-test-1',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: 'ABCD2345' }),
      },
    ),
    {
      database,
      platformKeySecret: 'm3-test-platform-secret',
      redemptionSecrets: [
        { secret: 'm3-current-redemption-secret', version: 2 },
        { secret: 'm3-previous-redemption-secret', version: 1 },
      ],
      verifyAccessToken: async () => userId,
    },
  );
  assertEquals(response.status, 200);
  const candidateCall = calls.find((call) =>
    call.query.startsWith(
      'select * from private.redeem_subscription_code_candidates',
    ),
  );
  assertEquals(candidateCall?.values?.[5] instanceof Array, true);
  assertEquals(candidateCall?.values?.[6], [2, 1]);
});

Deno.test('Account API rejects a parsed JWT whose Auth-verified subject differs', async () => {
  const response = await handleRequest(
    new Request('http://local/functions/v1/account-api/v1/subscription', {
      headers: {
        Authorization: `Bearer ${fakeJwt()}`,
        'X-Platform-Key': `phk_v1_${keyId}_fixture`,
      },
    }),
    {
      database: fakeDatabase(),
      platformKeySecret: 'm3-test-platform-secret',
      verifyAccessToken: async () => '00000000-0000-4000-8000-000000000099',
    },
  );
  assertEquals(response.status, 401);
  assertEquals((await response.json()).error.code, 'UNAUTHORIZED');
});

Deno.test('Account API issues a recent proof only after Auth verification and AAL2', async () => {
  const response = await handleRequest(
    new Request(
      'http://local/functions/v1/account-api/admin/api/v1/auth/recent-proof',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${fakeJwt('aal2')}`,
          'X-Mfa-Factor-Id': '00000000-0000-4000-8000-000000000006',
        },
      },
    ),
    {
      database: fakeDatabase(),
      platformKeySecret: 'm3-test-platform-secret',
      verifyAccessToken: async () => userId,
    },
  );
  assertEquals(response.status, 201);
  assertEquals(
    (await response.json()).data.proof_id,
    '00000000-0000-4000-8000-000000000005',
  );
});

Deno.test('Account API refuses recent-proof issuance at AAL1', async () => {
  const response = await handleRequest(
    new Request(
      'http://local/functions/v1/account-api/admin/api/v1/auth/recent-proof',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${fakeJwt()}`,
          'X-Mfa-Factor-Id': '00000000-0000-4000-8000-000000000006',
        },
      },
    ),
    {
      database: fakeDatabase(),
      platformKeySecret: 'm3-test-platform-secret',
      verifyAccessToken: async () => userId,
    },
  );
  assertEquals(response.status, 403);
  assertEquals((await response.json()).error.code, 'MFA_REQUIRED');
});

Deno.test('Account API binds ordinary recent proof to a separate verified session', async () => {
  const calls: Array<{ query: string; values?: unknown[] }> = [];
  const database = {
    async begin<T>(
      callback: (transaction: {
        json: (value: unknown) => unknown;
        unsafe: <R extends Record<string, unknown>>(
          query: string,
          values?: unknown[],
        ) => Promise<R[]>;
      }) => Promise<T>,
    ) {
      return callback({
        json: (value) => value,
        async unsafe<R extends Record<string, unknown>>(
          query: string,
          values?: unknown[],
        ): Promise<R[]> {
          calls.push({ query, values });
          if (
            query.startsWith(
              'select * from private.platform_key_verify_presented',
            )
          )
            return [
              {
                key_id: keyId,
                platform_id: platformId,
                platform_status: 'active',
              },
            ] as unknown as R[];
          if (
            query.startsWith(
              'select * from private.user_recent_auth_proof_issue',
            )
          )
            return [
              {
                proof_id: '00000000-0000-4000-8000-000000000008',
                expires_at: '2026-09-08T00:05:00.000Z',
              },
            ] as unknown as R[];
          return [] as R[];
        },
      });
    },
  };
  const response = await handleRequest(
    new Request('http://local/functions/v1/account-api/v1/auth/recent-proof', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${fakeJwt()}`,
        'X-Reauth-Access-Token': fakeJwt('aal1', reauthSessionId),
        'X-Platform-Key': `phk_v1_${keyId}_fixture`,
      },
    }),
    {
      database,
      platformKeySecret: 'm3-test-platform-secret',
      verifyAccessToken: async () => userId,
    },
  );
  assertEquals(response.status, 201);
  assertEquals(
    (await response.json()).data.proof_id,
    '00000000-0000-4000-8000-000000000008',
  );
  const issuerCall = calls.find((call) =>
    call.query.startsWith('select * from private.user_recent_auth_proof_issue'),
  );
  assertEquals(issuerCall?.values?.[5], reauthSessionId);
  assertEquals(issuerCall?.values?.[6], 'email_otp');
});

Deno.test('Account API rejects ordinary proof without a separate event session', async () => {
  const response = await handleRequest(
    new Request('http://local/functions/v1/account-api/v1/auth/recent-proof', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${fakeJwt()}`,
        'X-Reauth-Access-Token': fakeJwt(),
        'X-Platform-Key': `phk_v1_${keyId}_fixture`,
      },
    }),
    {
      database: fakeDatabase(),
      platformKeySecret: 'm3-test-platform-secret',
      verifyAccessToken: async () => userId,
    },
  );
  assertEquals(response.status, 403);
  assertEquals((await response.json()).error.code, 'RECENT_MFA_REQUIRED');
});

Deno.test('Account API refuses every other Admin route at AAL1', async () => {
  const response = await handleRequest(
    new Request(
      'http://local/functions/v1/account-api/admin/api/v1/redemption-batches',
      { headers: { Authorization: `Bearer ${fakeJwt()}` } },
    ),
    {
      database: fakeDatabase(),
      platformKeySecret: 'm3-test-platform-secret',
      verifyAccessToken: async () => userId,
    },
  );
  assertEquals(response.status, 403);
  assertEquals((await response.json()).error.code, 'MFA_REQUIRED');
});
