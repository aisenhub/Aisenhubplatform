/// <reference lib="deno.ns" />

import { assertEquals, assertMatch } from 'jsr:@std/assert@1';

import { handleRequest } from './index.ts';
import { UploadGate } from '../_shared/upload.ts';

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
          if (query.startsWith('select private.admin_step_up_valid')) {
            return [{ valid: true }] as unknown as R[];
          }
          if (query.startsWith('select * from private.admin_platform_list')) {
            return [
              {
                platform_id: platformId,
                code: 'fixture',
                name: 'Fixture',
                status: 'active',
                allow_activation: true,
              },
            ] as unknown as R[];
          }
          if (query.startsWith('select * from private.admin_platform_get')) {
            return [
              {
                platform_id: platformId,
                code: 'fixture',
                name: 'Fixture',
                status: 'active',
                allow_activation: true,
              },
            ] as unknown as R[];
          }
          if (query.startsWith('select * from private.admin_platform_update')) {
            return [
              {
                platform_id: platformId,
                status: 'disabled',
                allow_activation: false,
              },
            ] as unknown as R[];
          }
          if (query.startsWith('select * from private.admin_origin_list')) {
            return [
              { origin_id: platformId, environment: 'local' },
            ] as unknown as R[];
          }
          if (query.startsWith('select * from private.admin_account_list')) {
            return [
              { platform_account_id: sessionId, status: 'active' },
            ] as unknown as R[];
          }
          if (query.startsWith('select * from private.admin_account_get')) {
            return [
              { platform_account_id: sessionId, status: 'active' },
            ] as unknown as R[];
          }
          if (query.startsWith('select * from private.admin_account_patch')) {
            return [
              {
                platform_account_id: sessionId,
                user_id: userId,
                status: 'suspended',
              },
            ] as unknown as R[];
          }
          if (
            query.startsWith('select * from private.admin_platform_key_list')
          ) {
            return [{ key_id: keyId, status: 'active' }] as unknown as R[];
          }
          if (
            query.startsWith('select * from private.admin_platform_key_create')
          ) {
            return [
              { key_id: keyId, platform_id: platformId, status: 'active' },
            ] as unknown as R[];
          }
          if (
            query.startsWith('select * from private.admin_account_transition')
          ) {
            return [
              { platform_account_id: sessionId, status: 'suspended' },
            ] as unknown as R[];
          }
          if (
            query.startsWith('select * from private.admin_platform_key_revoke')
          ) {
            return [{ key_id: keyId, status: 'revoked' }] as unknown as R[];
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
          if (query.startsWith('select * from private.account_close')) {
            return [
              { platform_account_id: sessionId, account_status: 'closed' },
            ] as unknown as R[];
          }
          if (
            query.startsWith('select * from private.identity_delete_request')
          ) {
            return [
              { request_id: sessionId, state: 'pending_admin' },
            ] as unknown as R[];
          }
          if (query.startsWith('select * from private.file_delete_request')) {
            return [
              {
                file_id: '00000000-0000-4000-8000-000000000010',
                status: 'deleting',
                write_outcome: 'confirmed',
                reserved_bytes: 5,
                actual_size_bytes: 5,
                mime_type: 'text/plain',
                created_at: new Date('2026-09-09T00:00:00Z'),
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

Deno.test('Account API exposes the M2 account close and delete-request wrappers', async () => {
  const headers = {
    Authorization: `Bearer ${fakeJwt()}`,
    'X-Platform-Key': `phk_v1_${keyId}_fixture`,
    'X-Recent-Auth-Proof': '00000000-0000-4000-8000-000000000009',
  };
  const close = await handleRequest(
    new Request('http://local/functions/v1/account-api/v1/account/close', {
      method: 'POST',
      headers,
    }),
    {
      database: fakeDatabase(),
      platformKeySecret: 'm3-test-platform-secret',
      verifyAccessToken: async () => userId,
    },
  );
  assertEquals(close.status, 200);
  assertEquals((await close.json()).data.account_status, 'closed');

  const deletion = await handleRequest(
    new Request(
      'http://local/functions/v1/account-api/v1/identity/delete-request',
      { method: 'POST', headers },
    ),
    {
      database: fakeDatabase(),
      platformKeySecret: 'm3-test-platform-secret',
      verifyAccessToken: async () => userId,
    },
  );
  assertEquals(deletion.status, 202);
  assertEquals((await deletion.json()).data.state, 'pending_admin');
});

Deno.test('Account API exposes the AAL2 M2 platform management wrappers', async () => {
  const list = await handleRequest(
    new Request(
      'http://local/functions/v1/account-api/admin/api/v1/platforms',
      {
        headers: { Authorization: `Bearer ${fakeJwt('aal2')}` },
      },
    ),
    {
      database: fakeDatabase(),
      verifyAccessToken: async () => userId,
    },
  );
  assertEquals(list.status, 200);
  assertEquals((await list.json()).data[0].code, 'fixture');

  const key = await handleRequest(
    new Request(
      'http://local/functions/v1/account-api/admin/api/v1/platforms/00000000-0000-4000-8000-000000000001/keys',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${fakeJwt('aal2')}`,
          'X-Recent-Auth-Proof': '00000000-0000-4000-8000-000000000009',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'fixture-key' }),
      },
    ),
    {
      database: fakeDatabase(),
      platformKeySecret: 'm3-test-platform-secret',
      verifyAccessToken: async () => userId,
    },
  );
  assertEquals(key.status, 201);
  assertEquals((await key.json()).data.status, 'active');
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

Deno.test('Account API settles a bounded upload through the injected Storage adapter', async () => {
  const attemptId = '00000000-0000-4000-8000-000000000009';
  const fileId = '00000000-0000-4000-8000-000000000010';
  let storagePutCalls = 0;
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
          )
            return [
              {
                key_id: keyId,
                platform_id: platformId,
                platform_status: 'active',
              },
            ] as unknown as R[];
          if (query.startsWith('select * from private.file_upload_state'))
            return [
              {
                file_id: fileId,
                platform_account_id: userId,
                requested_size_bytes: 5,
                max_file_bytes: 5,
                status: 'pending',
                write_outcome: 'not_started',
              },
            ] as unknown as R[];
          if (query.startsWith('select * from private.file_receive_claim'))
            return [
              {
                file_id: fileId,
                platform_account_id: userId,
                requested_size_bytes: 5,
                max_file_bytes: 5,
                status: 'receiving',
                write_outcome: 'not_started',
                storage_path: `${platformId}/${userId}/${fileId}`,
                mime_type: 'text/plain',
              },
            ] as unknown as R[];
          if (query.startsWith('select * from private.file_prepare_store'))
            return [
              {
                file_id: fileId,
                status: 'storing',
                write_outcome: 'in_flight',
                storage_path: `${platformId}/${userId}/${fileId}`,
                write_attempt_id: attemptId,
              },
            ] as unknown as R[];
          if (
            query.startsWith(
              'select * from private.file_write_attempt_finalize',
            )
          )
            return [
              {
                file_id: fileId,
                status: 'active',
                write_outcome: 'confirmed',
                actual_size_bytes: 5,
                sha256:
                  '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
                reserved_bytes: 5,
                reserved_count: 1,
                original_name: 'config.ini',
                mime_type: 'text/plain',
                created_at: new Date('2026-09-09T00:00:00Z'),
              },
            ] as unknown as R[];
          return [] as unknown as R[];
        },
      });
    },
  };
  const response = await handleRequest(
    new Request(
      `http://local/functions/v1/account-api/v1/config-files/${fileId}/content`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${fakeJwt()}`,
          'X-Platform-Key': `phk_v1_${keyId}_fixture`,
          'Idempotency-Key': 'content-1',
          'Content-Type': 'application/octet-stream',
        },
        body: 'hello',
      },
    ),
    {
      database,
      verifyAccessToken: async () => userId,
      platformKeySecret: 'm3-test-platform-secret',
      uploadGate: new UploadGate(16, 2),
      storageAdapter: {
        async putImmutable() {
          storagePutCalls += 1;
          return { providerRequestId: 'provider-1' };
        },
        async getInfo() {
          return { size: 5, etag: 'not-a-hash' };
        },
        async download() {
          return new Response('hello');
        },
        async remove() {},
      },
    },
  );
  assertEquals(response.status, 202);
  assertEquals((await response.json()).data.status, 'active');
  assertEquals(storagePutCalls, 1);
});

Deno.test('Account API exposes idempotent file deletion through the account executor', async () => {
  const response = await handleRequest(
    new Request(
      'http://local/functions/v1/account-api/v1/config-files/00000000-0000-4000-8000-000000000010',
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${fakeJwt()}`,
          'X-Platform-Key': `phk_v1_${keyId}_fixture`,
          'Idempotency-Key': 'delete-1',
        },
      },
    ),
    {
      database: fakeDatabase(),
      platformKeySecret: 'm3-test-platform-secret',
      verifyAccessToken: async () => userId,
    },
  );
  assertEquals(response.status, 202);
  assertEquals((await response.json()).data.status, 'deleting');
});
