/// <reference lib="deno.ns" />

import { assertEquals } from 'jsr:@std/assert@1';

import { handleMaintenanceRequest } from './index.ts';

const fileId = '00000000-0000-4000-8000-000000000001';
const jobId = '00000000-0000-4000-8000-000000000002';
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
