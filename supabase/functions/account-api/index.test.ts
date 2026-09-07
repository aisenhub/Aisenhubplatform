import { assertEquals, assertMatch } from 'jsr:@std/assert@1';

import { handleRequest } from './index.ts';

const platformId = '00000000-0000-4000-8000-000000000001';
const keyId = '00000000-0000-4000-8000-000000000002';
const userId = '00000000-0000-4000-8000-000000000003';
const sessionId = '00000000-0000-4000-8000-000000000004';

function fakeJwt(): string {
  const encode = (value: unknown) =>
    btoa(JSON.stringify(value))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replaceAll('=', '');
  return `${encode({ alg: 'none' })}.${encode({ sub: userId, session_id: sessionId, aal: 'aal1' })}.x`;
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
    },
  );
  assertEquals(response.status, 200);
  assertEquals((await response.json()).data.entitlement_kind, 'free');
});
