/// <reference lib="deno.ns" />

import { assertEquals } from 'jsr:@std/assert@1';

import { handleMaintenanceRequest } from './index.ts';

const fileId = '00000000-0000-4000-8000-000000000001';
const jobId = '00000000-0000-4000-8000-000000000002';
const accountId = '00000000-0000-4000-8000-000000000006';
const userId = '00000000-0000-4000-8000-000000000003';
const fence = 4;
const events: string[] = [];

type TestRow = Record<string, unknown>;
type TestTransaction = {
  unsafe<T extends TestRow = TestRow>(
    query: string,
    values?: unknown[],
  ): Promise<T[]>;
};
type TestDatabase = {
  begin<T>(callback: (transaction: TestTransaction) => Promise<T>): Promise<T>;
};

function database(): TestDatabase {
  return {
    async begin<T>(callback: (transaction: TestTransaction) => Promise<T>) {
      events.push('begin');
      return callback({
        async unsafe<T extends TestRow = TestRow>(
          query: string,
          _values?: unknown[],
        ): Promise<T[]> {
          events.push(
            query.startsWith('set local role')
              ? 'role'
              : query.includes('file_cleanup_candidates')
                ? 'candidates'
                : query.includes('file_cleanup_claim')
                  ? 'claim'
                  : query.includes('deletion_job_claim')
                    ? 'delete-claim'
                    : query.includes('deletion_job_step')
                      ? 'delete-step'
                      : query.includes('deletion_job_auth_target')
                        ? 'auth-target'
                        : query.includes('deletion_job_auth_prepare')
                          ? 'auth-prepare'
                          : query.includes('account_retention_candidates')
                            ? 'retention-candidates'
                            : query.includes('account_retention_cleanup')
                              ? 'retention-cleanup'
                              : query.includes('idempotency_cleanup')
                                ? 'idempotency-cleanup'
                                : query.includes('billing_processing_job_claim')
                                  ? 'billing-claim'
                                  : query.includes(
                                        'billing_processing_job_finish',
                                      )
                                    ? 'billing-finish'
                                    : query.includes(
                                          'billing_order_query_target',
                                        )
                                      ? 'billing-target'
                                      : query.includes(
                                            'billing_order_verify_and_settle',
                                          )
                                        ? 'billing-verify'
                                        : query.includes(
                                              'deletion_job_backup_barrier_guard',
                                            )
                                          ? 'barrier-guard'
                                          : 'finish',
          );
          if (query.includes('file_cleanup_candidates'))
            return [{ file_id: fileId }] as unknown as T[];
          if (query.includes('file_cleanup_claim'))
            return [
              {
                action: 'remove',
                storage_path: 'platform/file',
                fencing_token: fence,
              },
            ] as unknown as T[];
          if (query.includes('deletion_job_claim'))
            return [
              {
                job_id: jobId,
                checkpoint: 'created',
                fence: 2,
                lease_fence: 1,
              },
            ] as unknown as T[];
          if (query.includes('deletion_job_step'))
            return [
              { job_id: jobId, state: 'retry', checkpoint: 'sessions_revoked' },
            ] as unknown as T[];
          if (query.includes('deletion_job_auth_target'))
            return [{ user_id: userId }] as unknown as T[];
          if (query.includes('deletion_job_auth_prepare'))
            return [{ detached_accounts: 0 }] as unknown as T[];
          if (query.includes('account_retention_candidates'))
            return [{ platform_account_id: accountId }] as unknown as T[];
          if (query.includes('account_retention_cleanup'))
            return [
              { platform_account_id: accountId, action: 'cleaned' },
            ] as unknown as T[];
          if (query.includes('idempotency_cleanup'))
            return [{ user_deleted: 1, admin_deleted: 1 }] as unknown as T[];
          if (query.includes('billing_processing_job_claim'))
            return [
              {
                job_id: jobId,
                job_kind: 'webhook_order_discovery',
                fence: 3,
                lease_until: '2026-09-11T00:01:00Z',
              },
            ] as unknown as T[];
          if (query.includes('billing_processing_job_finish'))
            return [
              { job_id: jobId, state: 'completed', fence: 3 },
            ] as unknown as T[];
          if (query.includes('billing_order_query_target'))
            return [
              {
                provider_account_id: accountId,
                provider_order_no: 'provider-order-1',
              },
            ] as unknown as T[];
          if (query.includes('billing_order_verify_and_settle'))
            return [
              {
                order_id: jobId,
                verification_status: 'verified',
                entitlement_status: 'granted',
                settlement_state: 'finalized',
                decision_code: 'granted',
              },
            ] as unknown as T[];
          if (query.includes('deletion_job_backup_barrier_guard'))
            return [
              { can_proceed: false, error_code: 'backup_barrier' },
            ] as unknown as T[];
          return [
            { file_id: fileId, status: 'deleted', retry_count: 0 },
          ] as unknown as T[];
        },
      });
    },
  };
}

Deno.test('maintenance worker authenticates and deletes outside the DB transaction', async () => {
  events.length = 0;
  const response = await handleMaintenanceRequest(
    new Request('http://local/maintenance/v1/files/cleanup', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-job',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ file_id: fileId }),
    }),
    {
      jobToken: 'test-job',
      workerId: 'test-worker',
      database: database(),
      storageAdapter: {
        async putImmutable() {
          throw new Error('unused');
        },
        async getInfo() {
          throw new Error('unused');
        },
        async download() {
          throw new Error('unused');
        },
        async remove() {
          events.push('storage-remove');
        },
      },
    },
  );
  assertEquals(response.status, 200);
  assertEquals(events, [
    'begin',
    'role',
    'claim',
    'storage-remove',
    'begin',
    'role',
    'finish',
  ]);
});

Deno.test('maintenance scheduler uses the fixed candidate batch', async () => {
  events.length = 0;
  const response = await handleMaintenanceRequest(
    new Request('http://local/maintenance/v1/files/run', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-job',
        'content-type': 'application/json',
      },
      body: '{}',
    }),
    {
      jobToken: 'test-job',
      workerId: 'test-worker',
      database: database(),
      storageAdapter: {
        async putImmutable() {
          throw new Error('unused');
        },
        async getInfo() {
          throw new Error('unused');
        },
        async download() {
          throw new Error('unused');
        },
        async remove() {},
      },
    },
  );
  assertEquals(response.status, 200);
  assertEquals((await response.json()).data.processed, 1);
  assertEquals(events[0], 'begin');
  assertEquals(events[2], 'candidates');
});

Deno.test('maintenance worker rejects user-style requests and arbitrary routes', async () => {
  const unauthorized = await handleMaintenanceRequest(
    new Request('http://local/maintenance/v1/files/reconcile', {
      method: 'POST',
    }),
    { jobToken: 'test-job', database: database() },
  );
  assertEquals(unauthorized.status, 401);
  const notFound = await handleMaintenanceRequest(
    new Request('http://local/maintenance/v1/sql', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-job',
        'content-type': 'application/json',
      },
      body: '{}',
    }),
    { jobToken: 'test-job', database: database() },
  );
  assertEquals(notFound.status, 404);
});

Deno.test('maintenance exposes fenced Global Delete claim and step boundaries', async () => {
  events.length = 0;
  const claim = await handleMaintenanceRequest(
    new Request('http://local/maintenance/v1/deletion-jobs/claim', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-job',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ job_id: jobId }),
    }),
    { jobToken: 'test-job', workerId: 'test-worker', database: database() },
  );
  assertEquals(claim.status, 200);
  const step = await handleMaintenanceRequest(
    new Request('http://local/maintenance/v1/deletion-jobs/step', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-job',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        job_id: jobId,
        fence: 2,
        lease_fence: 1,
        step: 'sessions_revoked',
        outcome: 'retry',
        error_code: 'provider_timeout',
      }),
    }),
    { jobToken: 'test-job', workerId: 'test-worker', database: database() },
  );
  assertEquals(step.status, 200);
  assertEquals(events, [
    'begin',
    'role',
    'delete-claim',
    'begin',
    'role',
    'delete-step',
  ]);
});

Deno.test('maintenance runs closed-account retention through the job role', async () => {
  events.length = 0;
  const response = await handleMaintenanceRequest(
    new Request('http://local/maintenance/v1/accounts/retention', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-job',
        'content-type': 'application/json',
      },
      body: '{}',
    }),
    { jobToken: 'test-job', workerId: 'test-worker', database: database() },
  );
  assertEquals(response.status, 200);
  assertEquals((await response.json()).data.processed, 1);
  assertEquals(events, [
    'begin',
    'role',
    'retention-candidates',
    'begin',
    'role',
    'retention-cleanup',
  ]);
});

Deno.test('maintenance claims and finishes billing jobs with a worker lease', async () => {
  events.length = 0;
  const claim = await handleMaintenanceRequest(
    new Request('http://local/maintenance/v1/billing/jobs/claim', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-job',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ limit: 10 }),
    }),
    { jobToken: 'test-job', workerId: 'test-worker', database: database() },
  );
  assertEquals(claim.status, 200);
  assertEquals((await claim.json()).data.jobs[0].fence, 3);
  const finish = await handleMaintenanceRequest(
    new Request('http://local/maintenance/v1/billing/jobs/finish', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-job',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ job_id: jobId, fence: 3, state: 'completed' }),
    }),
    { jobToken: 'test-job', workerId: 'test-worker', database: database() },
  );
  assertEquals(finish.status, 200);
  assertEquals(events, [
    'begin',
    'role',
    'billing-claim',
    'begin',
    'role',
    'billing-finish',
  ]);
});

Deno.test('maintenance cleans only expired seven-day idempotency caches', async () => {
  events.length = 0;
  const response = await handleMaintenanceRequest(
    new Request('http://local/maintenance/v1/idempotency/cleanup', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-job',
        'content-type': 'application/json',
      },
      body: '{}',
    }),
    { jobToken: 'test-job', workerId: 'test-worker', database: database() },
  );
  assertEquals(response.status, 200);
  assertEquals((await response.json()).data.deleted, {
    user_deleted: 1,
    admin_deleted: 1,
  });
  assertEquals(events, ['begin', 'role', 'idempotency-cleanup']);
});

Deno.test('maintenance stop switches leave leases and provider state untouched', async () => {
  events.length = 0;
  const claim = await handleMaintenanceRequest(
    new Request('http://local/maintenance/v1/billing/jobs/claim', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-job',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ limit: 10 }),
    }),
    {
      jobToken: 'test-job',
      workerId: 'test-worker',
      database: database(),
      backgroundProcessingEnabled: false,
    },
  );
  assertEquals(claim.status, 503);
  assertEquals(
    (await claim.json()).data.error.code,
    'BILLING_PROCESSING_DISABLED',
  );
  assertEquals(events, []);

  let providerQueries = 0;
  const process = await handleMaintenanceRequest(
    new Request('http://local/maintenance/v1/billing/jobs/process', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-job',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ job_id: jobId, order_id: jobId, fence: 3 }),
    }),
    {
      jobToken: 'test-job',
      workerId: 'test-worker',
      database: database(),
      automaticSettlementEnabled: false,
      billingProviderAdapter: {
        async queryOrder() {
          providerQueries += 1;
          return { status: 'temporarily_unavailable' };
        },
      },
    },
  );
  assertEquals(process.status, 503);
  assertEquals(
    (await process.json()).data.error.code,
    'BILLING_SETTLEMENT_DISABLED',
  );
  assertEquals(providerQueries, 0);
});

Deno.test('maintenance backlog remains claimable after the worker switch restarts', async () => {
  events.length = 0;
  let backlog = 1;
  const recoveryDatabase: TestDatabase = {
    async begin<T>(callback: (transaction: TestTransaction) => Promise<T>) {
      events.push('begin');
      return callback({
        async unsafe<T extends TestRow = TestRow>(query: string): Promise<T[]> {
          if (query.startsWith('set local role')) {
            events.push('role');
            return [] as T[];
          }
          if (query.includes('billing_processing_job_claim')) {
            events.push('billing-claim');
            if (backlog === 0) return [] as T[];
            backlog -= 1;
            return [
              {
                job_id: jobId,
                job_kind: 'webhook_order_discovery',
                fence: 4,
                lease_until: '2026-09-11T00:01:00Z',
              },
            ] as unknown as T[];
          }
          if (query.includes('billing_processing_job_finish')) {
            events.push('billing-finish');
            return [
              { job_id: jobId, state: 'completed', fence: 4 },
            ] as unknown as T[];
          }
          return [] as T[];
        },
      });
    },
  };

  const stopped = await handleMaintenanceRequest(
    new Request('http://local/maintenance/v1/billing/jobs/claim', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-job',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ limit: 10 }),
    }),
    {
      jobToken: 'test-job',
      workerId: 'test-worker',
      database: recoveryDatabase,
      backgroundProcessingEnabled: false,
    },
  );
  assertEquals(stopped.status, 503);
  assertEquals(backlog, 1);

  const resumed = await handleMaintenanceRequest(
    new Request('http://local/maintenance/v1/billing/jobs/claim', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-job',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ limit: 10 }),
    }),
    {
      jobToken: 'test-job',
      workerId: 'test-worker',
      database: recoveryDatabase,
      backgroundProcessingEnabled: true,
    },
  );
  assertEquals(resumed.status, 200);
  assertEquals((await resumed.json()).data.jobs.length, 1);
  assertEquals(backlog, 0);

  const finished = await handleMaintenanceRequest(
    new Request('http://local/maintenance/v1/billing/jobs/finish', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-job',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ job_id: jobId, fence: 4, state: 'completed' }),
    }),
    {
      jobToken: 'test-job',
      workerId: 'test-worker',
      database: recoveryDatabase,
    },
  );
  assertEquals(finished.status, 200);
  assertEquals(events, [
    'begin',
    'role',
    'billing-claim',
    'begin',
    'role',
    'billing-finish',
  ]);
});

Deno.test('maintenance performs provider I/O outside the settlement transaction', async () => {
  events.length = 0;
  const response = await handleMaintenanceRequest(
    new Request('http://local/maintenance/v1/billing/jobs/process', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-job',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ job_id: jobId, order_id: jobId, fence: 3 }),
    }),
    {
      jobToken: 'test-job',
      workerId: 'test-worker',
      database: database(),
      billingProviderAdapter: {
        async queryOrder(orderNo) {
          events.push(`provider-query:${orderNo}`);
          return {
            status: 'found',
            facts: {
              status: 'paid',
              provider_user_id: 'provider-user',
              external_plan_id: 'plan-monthly',
              product_type: 'subscription',
              sku_ids: [],
              purchase_months: 1,
              total_amount: '19.90',
              show_amount: '19.90',
              currency: 'CNY',
              custom_order_id: 'checkout-1',
            },
          };
        },
      },
    },
  );
  assertEquals(response.status, 200);
  assertEquals(events, [
    'begin',
    'role',
    'billing-target',
    'provider-query:provider-order-1',
    'begin',
    'role',
    'billing-verify',
  ]);
});

Deno.test('maintenance discovers a webhook order before verification', async () => {
  events.length = 0;
  const discoveryDatabase: TestDatabase = {
    async begin<T>(callback: (transaction: TestTransaction) => Promise<T>) {
      events.push('begin');
      return callback({
        async unsafe<T extends TestRow = TestRow>(query: string) {
          if (query.startsWith('set local role')) {
            events.push('role');
            return [] as T[];
          }
          if (query.includes('billing_webhook_discovery_target')) {
            events.push('billing-discovery-target');
            return [
              {
                order_id: jobId,
                provider_account_id: accountId,
                provider_order_no: 'provider-order-discovery',
              },
            ] as unknown as T[];
          }
          if (query.includes('billing_order_link_checkout')) {
            events.push('billing-link');
            return [{ order_id: jobId, linked: true }] as unknown as T[];
          }
          if (query.includes('billing_order_verify_and_settle')) {
            events.push('billing-verify');
            return [
              {
                order_id: jobId,
                verification_status: 'verified',
                entitlement_status: 'granted',
                decision_code: 'granted',
              },
            ] as unknown as T[];
          }
          return [] as T[];
        },
      });
    },
  };
  const response = await handleMaintenanceRequest(
    new Request('http://local/maintenance/v1/billing/jobs/discover', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-job',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ job_id: jobId, fence: 3 }),
    }),
    {
      jobToken: 'test-job',
      workerId: 'test-worker',
      database: discoveryDatabase,
      automaticSettlementEnabled: true,
      billingProviderAdapter: {
        async queryOrder(orderNo) {
          events.push(`provider-query:${orderNo}`);
          return {
            status: 'found',
            facts: {
              status: 'paid',
              provider_user_id: 'provider-user',
              external_plan_id: 'plan-monthly',
              product_type: 'subscription',
              sku_ids: [],
              purchase_months: 1,
              total_amount: '9.90',
              show_amount: '9.90',
              currency: 'CNY',
              custom_order_id: 'checkout-1',
            },
          };
        },
      },
    },
  );
  assertEquals(response.status, 200);
  assertEquals(events, [
    'begin',
    'role',
    'billing-discovery-target',
    'provider-query:provider-order-discovery',
    'begin',
    'role',
    'billing-link',
    'begin',
    'role',
    'billing-verify',
  ]);
});

Deno.test('maintenance run dispatches a claimed discovery job', async () => {
  events.length = 0;
  const runDatabase: TestDatabase = {
    async begin<T>(callback: (transaction: TestTransaction) => Promise<T>) {
      events.push('begin');
      return callback({
        async unsafe<T extends TestRow = TestRow>(query: string) {
          if (query.startsWith('set local role')) {
            events.push('role');
            return [] as T[];
          }
          if (query.includes('billing_processing_job_claim')) {
            events.push('billing-claim');
            return [
              { job_id: jobId, job_kind: 'webhook_order_discovery', fence: 3 },
            ] as unknown as T[];
          }
          if (query.includes('billing_webhook_discovery_target')) {
            events.push('billing-discovery-target');
            return [
              {
                order_id: jobId,
                provider_account_id: accountId,
                provider_order_no: 'provider-order-run',
              },
            ] as unknown as T[];
          }
          if (query.includes('billing_order_link_checkout')) {
            events.push('billing-link');
            return [{ order_id: jobId, linked: false }] as unknown as T[];
          }
          if (query.includes('billing_order_verify_and_settle')) {
            events.push('billing-verify');
            return [
              { order_id: jobId, decision_code: 'unlinked_order' },
            ] as unknown as T[];
          }
          return [] as T[];
        },
      });
    },
  };
  const response = await handleMaintenanceRequest(
    new Request('http://local/maintenance/v1/billing/jobs/run', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-job',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ limit: 1 }),
    }),
    {
      jobToken: 'test-job',
      workerId: 'test-worker',
      database: runDatabase,
      automaticSettlementEnabled: true,
      billingProviderAdapter: {
        async queryOrder(orderNo) {
          events.push(`provider-query:${orderNo}`);
          return {
            status: 'found',
            facts: {
              status: 'paid',
              external_plan_id: 'plan-monthly',
              product_type: 'subscription',
              sku_ids: [],
              purchase_months: 1,
              total_amount: '9.90',
              show_amount: '9.90',
              currency: 'CNY',
            },
          };
        },
      },
    },
  );
  assertEquals(response.status, 200);
  assertEquals(events, [
    'begin',
    'role',
    'billing-claim',
    'begin',
    'role',
    'billing-discovery-target',
    'provider-query:provider-order-run',
    'begin',
    'role',
    'billing-link',
    'begin',
    'role',
    'billing-verify',
  ]);
});

Deno.test('maintenance gates Auth deletion on provider success before checkpoint advance', async () => {
  events.length = 0;
  const response = await handleMaintenanceRequest(
    new Request('http://local/maintenance/v1/deletion-jobs/auth', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-job',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ job_id: jobId, fence: 2, lease_fence: 1 }),
    }),
    {
      jobToken: 'test-job',
      workerId: 'test-worker',
      database: database(),
      authAdapter: {
        async deleteUser(value) {
          events.push(`auth-delete:${value}`);
        },
      },
    },
  );
  assertEquals(response.status, 200);
  assertEquals(events, [
    'begin',
    'role',
    'auth-target',
    'begin',
    'role',
    'auth-prepare',
    `auth-delete:${userId}`,
    'begin',
    'role',
    'delete-step',
  ]);
});
