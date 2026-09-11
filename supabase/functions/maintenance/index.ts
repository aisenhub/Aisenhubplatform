/// <reference lib="deno.ns" />

import postgres from 'npm:postgres@3.4.3';

import {
  createSupabaseStorageAdapter,
  type StorageAdapter,
} from '../_shared/storage.ts';
import { readBoundedBody, UploadFault } from '../_shared/upload.ts';
import {
  normalizeAfdianOrder,
  toBillingOrderFacts,
} from '../_shared/afdian.ts';
import { billingSwitchEnabled } from '../_shared/billing.ts';

type Row = Record<string, unknown>;

interface Transaction {
  unsafe<T extends Row = Row>(query: string, values?: unknown[]): Promise<T[]>;
}

interface Database {
  begin<T>(callback: (transaction: Transaction) => Promise<T>): Promise<T>;
}

interface MaintenanceDependencies {
  readonly database?: Database;
  readonly storageAdapter?: StorageAdapter;
  readonly authAdapter?: AuthAdminAdapter;
  readonly jobToken?: string;
  readonly workerId?: string;
  readonly billingProviderAdapter?: BillingProviderAdapter;
  readonly backgroundProcessingEnabled?: boolean;
  readonly automaticSettlementEnabled?: boolean;
}

interface AuthAdminAdapter {
  deleteUser(userId: string): Promise<void>;
}

interface BillingProviderAdapter {
  queryOrder(providerOrderNo: string): Promise<{
    readonly status: 'found' | 'not_found' | 'temporarily_unavailable';
    readonly order?: unknown;
    readonly facts?: Record<string, unknown>;
  }>;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const databases = new Map<string, Database>();

function requestId(): string {
  return crypto.randomUUID();
}

function database(): Database {
  const cached = databases.get('job');
  if (cached) return cached;
  const url =
    Deno.env.get('MAINTENANCE_DB_URL') ??
    Deno.env.get('SUPABASE_DB_URL') ??
    Deno.env.get('ACCOUNT_API_DB_URL');
  if (!url) throw new Error('MAINTENANCE_NOT_CONFIGURED');
  const connection = postgres(url, {
    max: 4,
    prepare: false,
    connect_timeout: 5,
  }) as unknown as Database;
  databases.set('job', connection);
  return connection;
}

function storageAdapter(): StorageAdapter {
  return createSupabaseStorageAdapter();
}

function authAdminAdapter(): AuthAdminAdapter {
  const baseUrl = Deno.env.get('SUPABASE_URL')?.replace(/\/$/u, '');
  const secret = Deno.env.get('SUPABASE_SECRET_KEY');
  if (!baseUrl || !secret) throw new Error('AUTH_NOT_CONFIGURED');
  return {
    async deleteUser(userId) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      let response: Response;
      try {
        response = await fetch(
          `${baseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
          {
            method: 'DELETE',
            headers: {
              apikey: secret,
              Authorization: `Bearer ${secret}`,
            },
            signal: controller.signal,
          },
        );
      } catch {
        throw new Error('PROVIDER_TIMEOUT');
      } finally {
        clearTimeout(timer);
      }
      if (!response.ok) {
        await response.text();
        throw new Error(`AUTH_DELETE_FAILED_${response.status}`);
      }
    },
  };
}

function bearer(request: Request): string | null {
  const value = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/u.exec(value);
  return match?.[1] ?? null;
}

async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  const { bytes } = await readBoundedBody(request, 4096);
  const text = new TextDecoder().decode(bytes);
  let value: unknown;
  try {
    value = JSON.parse(text || '{}');
  } catch {
    throw new Error('INVALID_INPUT');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('INVALID_INPUT');
  return value as Record<string, unknown>;
}

function uuid(value: unknown): string | null {
  return typeof value === 'string' && UUID.test(value) ? value : null;
}

function context(workerId: string, id: string, fencingToken = 1) {
  return [crypto.randomUUID(), workerId, fencingToken, id];
}

async function withJobRole<T>(
  db: Database,
  callback: (transaction: Transaction) => Promise<T>,
): Promise<T> {
  return db.begin(async (transaction) => {
    await transaction.unsafe('set local role job_executor');
    return callback(transaction);
  });
}

function errorCode(error: unknown): string {
  const code =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null
        ? 'message' in error && typeof error.message === 'string'
          ? error.message
          : 'code' in error && typeof error.code === 'string'
            ? error.code
            : 'provider_error'
        : 'provider_error';
  return /^[a-z0-9_.-]{1,128}$/iu.test(code) ? code : 'provider_error';
}

function response(status: number, data: unknown): Response {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function cleanupFileId(
  dependencies: MaintenanceDependencies,
  id: string,
  fileId: string,
): Promise<Response> {
  const workerId =
    dependencies.workerId ??
    Deno.env.get('MAINTENANCE_WORKER_ID') ??
    `maintenance-${crypto.randomUUID()}`;
  const jobContext = context(workerId, id);
  const db = dependencies.database ?? database();
  const [claimed] = await withJobRole(db, async (transaction) => {
    return transaction.unsafe<Row>(
      'select * from private.file_cleanup_claim(row($1::uuid,$2::text,$3::bigint,$4::uuid)::private.job_context, $5::uuid, 60)',
      [...jobContext, fileId],
    );
  });
  if (!claimed) return response(503, { error: { code: 'JOB_UNAVAILABLE' } });

  const action = String(claimed.action ?? '');
  if (action !== 'remove')
    return response(action === 'busy' ? 409 : 200, {
      file_id: fileId,
      action,
      status: claimed.status ?? null,
      write_outcome: claimed.write_outcome ?? null,
    });

  let outcome: 'removed' | 'failed' | 'unknown' = 'removed';
  let failure: string | null = null;
  try {
    await (dependencies.storageAdapter ?? storageAdapter()).remove({
      bucket: 'platform-config-files',
      path: String(claimed.storage_path),
      timeoutMs: 5000,
    });
  } catch (error) {
    failure = errorCode(error);
    outcome = failure === 'PROVIDER_TIMEOUT' ? 'unknown' : 'failed';
  }

  const [finished] = await withJobRole(db, async (transaction) => {
    return transaction.unsafe<Row>(
      'select * from private.file_cleanup_finish(row($1::uuid,$2::text,$3::bigint,$4::uuid)::private.job_context, $5::uuid, $6::bigint, $7::text, $8::text)',
      [...jobContext, fileId, claimed.fencing_token, outcome, failure],
    );
  });
  if (!finished)
    return response(503, {
      error: { code: 'JOB_UNAVAILABLE' },
      file_id: fileId,
    });
  return response(outcome === 'removed' ? 200 : 503, {
    file_id: finished.file_id ?? fileId,
    status: finished.status ?? null,
    outcome,
    retry_count: finished.retry_count ?? null,
    next_attempt_at: finished.next_attempt_at ?? null,
  });
}

async function cleanupFile(
  request: Request,
  dependencies: MaintenanceDependencies,
  id: string,
): Promise<Response> {
  const input = await jsonBody(request);
  const fileId = uuid(input.file_id);
  if (!fileId || Object.keys(input).some((key) => key !== 'file_id'))
    return response(400, { error: { code: 'INVALID_INPUT' }, request_id: id });
  return cleanupFileId(dependencies, id, fileId);
}

async function runCleanup(
  request: Request,
  dependencies: MaintenanceDependencies,
  id: string,
): Promise<Response> {
  const input = await jsonBody(request);
  if (Object.keys(input).length !== 0)
    return response(400, { error: { code: 'INVALID_INPUT' }, request_id: id });
  const db = dependencies.database ?? database();
  const candidates = await withJobRole(db, (transaction) =>
    transaction.unsafe<Row>(
      'select * from private.file_cleanup_candidates(null::uuid, 20)',
    ),
  );
  const results: unknown[] = [];
  let failed = false;
  for (const candidate of candidates) {
    const fileId = uuid(candidate.file_id);
    if (!fileId) continue;
    const result = await cleanupFileId(dependencies, id, fileId);
    if (result.status >= 500) failed = true;
    results.push(await result.json());
  }
  return response(failed ? 503 : 200, { processed: results.length, results });
}

async function cleanupIdempotency(
  request: Request,
  dependencies: MaintenanceDependencies,
  id: string,
): Promise<Response> {
  const input = await jsonBody(request);
  if (Object.keys(input).length !== 0)
    return response(400, { error: { code: 'INVALID_INPUT' }, request_id: id });
  const workerId =
    dependencies.workerId ??
    Deno.env.get('MAINTENANCE_WORKER_ID') ??
    `maintenance-${crypto.randomUUID()}`;
  const db = dependencies.database ?? database();
  const jobContext = context(workerId, id);
  const [result] = await withJobRole(db, (transaction) =>
    transaction.unsafe<Row>(
      'select * from private.idempotency_cleanup(row($1::uuid,$2::text,$3::bigint,$4::uuid)::private.job_context, null::timestamptz, 100)',
      [...jobContext],
    ),
  );
  return response(200, {
    deleted: result ?? { user_deleted: 0, admin_deleted: 0 },
  });
}

async function reconcile(
  request: Request,
  dependencies: MaintenanceDependencies,
  id: string,
): Promise<Response> {
  const input = await jsonBody(request);
  if (Object.keys(input).length !== 0)
    return response(400, { error: { code: 'INVALID_INPUT' }, request_id: id });
  const workerId =
    dependencies.workerId ??
    Deno.env.get('MAINTENANCE_WORKER_ID') ??
    `maintenance-${crypto.randomUUID()}`;
  const db = dependencies.database ?? database();
  const jobContext = context(workerId, id);
  const rows = await withJobRole(db, async (transaction) =>
    transaction.unsafe<Row>(
      'select * from private.file_reconcile_step(row($1::uuid,$2::text,$3::bigint,$4::uuid)::private.job_context, $5::uuid, $6::integer)',
      [...jobContext, null, 20],
    ),
  );
  return response(200, { issues: rows });
}

async function deletionJobClaim(
  request: Request,
  dependencies: MaintenanceDependencies,
  id: string,
): Promise<Response> {
  const input = await jsonBody(request);
  const jobId = uuid(input.job_id);
  if (!jobId || Object.keys(input).some((key) => key !== 'job_id'))
    return response(400, { error: { code: 'INVALID_INPUT' }, request_id: id });
  const workerId =
    dependencies.workerId ??
    Deno.env.get('MAINTENANCE_WORKER_ID') ??
    `maintenance-${crypto.randomUUID()}`;
  const db = dependencies.database ?? database();
  const jobContext = context(workerId, id);
  const [claim] = await withJobRole(db, (transaction) =>
    transaction.unsafe<Row>(
      'select * from private.deletion_job_claim(row($1::uuid,$2::text,$3::bigint,$4::uuid)::private.job_context, $5::uuid, 60)',
      [...jobContext, jobId],
    ),
  );
  return response(claim ? 200 : 409, claim ?? { job_id: jobId, state: 'busy' });
}

async function deletionJobStep(
  request: Request,
  dependencies: MaintenanceDependencies,
  id: string,
): Promise<Response> {
  const input = await jsonBody(request);
  const jobId = uuid(input.job_id);
  const fence = Number(input.fence);
  const leaseFence = Number(input.lease_fence);
  const step = typeof input.step === 'string' ? input.step : null;
  const outcome = typeof input.outcome === 'string' ? input.outcome : null;
  const errorCode =
    input.error_code === undefined ? null : String(input.error_code);
  if (
    !jobId ||
    !Number.isSafeInteger(fence) ||
    !Number.isSafeInteger(leaseFence) ||
    !step ||
    !outcome ||
    Object.keys(input).some(
      (key) =>
        ![
          'job_id',
          'fence',
          'lease_fence',
          'step',
          'outcome',
          'error_code',
        ].includes(key),
    )
  )
    return response(400, { error: { code: 'INVALID_INPUT' }, request_id: id });
  const workerId =
    dependencies.workerId ??
    Deno.env.get('MAINTENANCE_WORKER_ID') ??
    `maintenance-${crypto.randomUUID()}`;
  const db = dependencies.database ?? database();
  const jobContext = context(workerId, id, fence);
  let stepOutcome = outcome;
  let stepErrorCode = errorCode;
  if (step === 'files_blocked' && outcome === 'completed') {
    const [guard] = await withJobRole(db, (transaction) =>
      transaction.unsafe<Row>(
        'select * from private.deletion_job_backup_barrier_guard(row($1::uuid,$2::text,$3::bigint,$4::uuid)::private.job_context, $5::uuid, $6::bigint)',
        [...jobContext, jobId, leaseFence],
      ),
    );
    if (guard && guard.can_proceed === false) {
      stepOutcome = 'blocked';
      stepErrorCode = String(guard.error_code ?? 'backup_barrier');
    }
  }
  const [result] = await withJobRole(db, (transaction) =>
    transaction.unsafe<Row>(
      'select * from private.deletion_job_step(row($1::uuid,$2::text,$3::bigint,$4::uuid)::private.job_context, $5::uuid, $6::bigint, $7::text, $8::text, $9::text)',
      [...jobContext, jobId, leaseFence, step, stepOutcome, stepErrorCode],
    ),
  );
  return response(200, result ?? { job_id: jobId, state: 'unknown' });
}

async function deletionJobFiles(
  request: Request,
  dependencies: MaintenanceDependencies,
  id: string,
): Promise<Response> {
  const input = await jsonBody(request);
  const jobId = uuid(input.job_id);
  const fence = Number(input.fence);
  const leaseFence = Number(input.lease_fence);
  if (
    !jobId ||
    !Number.isSafeInteger(fence) ||
    !Number.isSafeInteger(leaseFence) ||
    Object.keys(input).some(
      (key) => !['job_id', 'fence', 'lease_fence'].includes(key),
    )
  )
    return response(400, { error: { code: 'INVALID_INPUT' }, request_id: id });
  const workerId =
    dependencies.workerId ??
    Deno.env.get('MAINTENANCE_WORKER_ID') ??
    `maintenance-${crypto.randomUUID()}`;
  const db = dependencies.database ?? database();
  const jobContext = context(workerId, id, fence);
  const files = await withJobRole(db, (transaction) =>
    transaction.unsafe<Row>(
      'select * from private.deletion_job_file_list(row($1::uuid,$2::text,$3::bigint,$4::uuid)::private.job_context, $5::uuid, $6::bigint)',
      [...jobContext, jobId, leaseFence],
    ),
  );
  let failed = false;
  for (const file of files) {
    if (file.write_outcome !== 'confirmed') {
      failed = true;
      break;
    }
    const fileId = uuid(file.file_id);
    if (!fileId) continue;
    const result = await cleanupFileId(dependencies, id, fileId);
    if (result.status >= 500) failed = true;
  }
  const [step] = await withJobRole(db, (transaction) =>
    transaction.unsafe<Row>(
      'select * from private.deletion_job_step(row($1::uuid,$2::text,$3::bigint,$4::uuid)::private.job_context, $5::uuid, $6::bigint, $7::text, $8::text, $9::text)',
      [
        ...jobContext,
        jobId,
        leaseFence,
        'personal_data_cleared',
        failed ? 'blocked' : 'completed',
        failed ? 'storage_cleanup_pending' : null,
      ],
    ),
  );
  return response(failed ? 503 : 200, {
    job_id: jobId,
    files_seen: files.length,
    step: step ?? null,
  });
}

async function deletionJobAuth(
  request: Request,
  dependencies: MaintenanceDependencies,
  id: string,
): Promise<Response> {
  const input = await jsonBody(request);
  const jobId = uuid(input.job_id);
  const fence = Number(input.fence);
  const leaseFence = Number(input.lease_fence);
  if (
    !jobId ||
    !Number.isSafeInteger(fence) ||
    !Number.isSafeInteger(leaseFence) ||
    Object.keys(input).some(
      (key) => !['job_id', 'fence', 'lease_fence'].includes(key),
    )
  )
    return response(400, { error: { code: 'INVALID_INPUT' }, request_id: id });
  const workerId =
    dependencies.workerId ??
    Deno.env.get('MAINTENANCE_WORKER_ID') ??
    `maintenance-${crypto.randomUUID()}`;
  const db = dependencies.database ?? database();
  const jobContext = context(workerId, id, fence);
  const [target] = await withJobRole(db, (transaction) =>
    transaction.unsafe<Row>(
      'select * from private.deletion_job_auth_target(row($1::uuid,$2::text,$3::bigint,$4::uuid)::private.job_context, $5::uuid, $6::bigint)',
      [...jobContext, jobId, leaseFence],
    ),
  );
  const userId = uuid(target?.user_id);
  if (!userId)
    return response(503, { error: { code: 'AUTHORIZATION_UNAVAILABLE' } });
  await withJobRole(db, (transaction) =>
    transaction.unsafe<Row>(
      'select * from private.deletion_job_auth_prepare(row($1::uuid,$2::text,$3::bigint,$4::uuid)::private.job_context, $5::uuid, $6::bigint)',
      [...jobContext, jobId, leaseFence],
    ),
  );
  let failureCode: string | null = null;
  try {
    await (dependencies.authAdapter ?? authAdminAdapter()).deleteUser(userId);
  } catch (error) {
    failureCode = errorCode(error);
  }
  const [step] = await withJobRole(db, (transaction) =>
    transaction.unsafe<Row>(
      'select * from private.deletion_job_step(row($1::uuid,$2::text,$3::bigint,$4::uuid)::private.job_context, $5::uuid, $6::bigint, $7::text, $8::text, $9::text)',
      [
        ...jobContext,
        jobId,
        leaseFence,
        'auth_deleted',
        failureCode ? 'blocked' : 'completed',
        failureCode,
      ],
    ),
  );
  return response(failureCode ? 503 : 200, {
    job_id: jobId,
    user_id: userId,
    error_code: failureCode,
    step: step ?? null,
  });
}

async function billingJobClaim(
  request: Request,
  dependencies: MaintenanceDependencies,
  id: string,
): Promise<Response> {
  if (
    !(
      dependencies.backgroundProcessingEnabled ??
      billingSwitchEnabled('BILLING_BACKGROUND_PROCESSING_ENABLED')
    )
  )
    return response(503, {
      error: { code: 'BILLING_PROCESSING_DISABLED' },
      request_id: id,
    });
  const input = await jsonBody(request);
  const limit = input.limit === undefined ? 20 : Number(input.limit);
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    Object.keys(input).some((key) => key !== 'limit')
  )
    return response(400, { error: { code: 'INVALID_INPUT' }, request_id: id });
  const workerId =
    dependencies.workerId ??
    Deno.env.get('MAINTENANCE_WORKER_ID') ??
    `maintenance-${crypto.randomUUID()}`;
  const db = dependencies.database ?? database();
  const jobContext = context(workerId, id);
  const jobs = await withJobRole(db, (transaction) =>
    transaction.unsafe<Row>(
      'select * from private.billing_processing_job_claim(row($1::uuid,$2::text,$3::bigint,$4::uuid)::private.job_context, $5::integer)',
      [...jobContext, limit],
    ),
  );
  return response(200, { jobs, request_id: id });
}

async function billingJobFinish(
  request: Request,
  dependencies: MaintenanceDependencies,
  id: string,
): Promise<Response> {
  const input = await jsonBody(request);
  const jobId = uuid(input.job_id);
  const fence = Number(input.fence);
  const state = typeof input.state === 'string' ? input.state : null;
  const errorClass =
    input.error_class === undefined ? null : String(input.error_class);
  const errorCodeValue =
    input.error_code === undefined ? null : String(input.error_code);
  if (
    !jobId ||
    !Number.isSafeInteger(fence) ||
    !state ||
    !['retryable', 'completed', 'manual_review'].includes(state) ||
    Object.keys(input).some(
      (key) =>
        !['job_id', 'fence', 'state', 'error_class', 'error_code'].includes(
          key,
        ),
    )
  )
    return response(400, { error: { code: 'INVALID_INPUT' }, request_id: id });
  const workerId =
    dependencies.workerId ??
    Deno.env.get('MAINTENANCE_WORKER_ID') ??
    `maintenance-${crypto.randomUUID()}`;
  const db = dependencies.database ?? database();
  const jobContext = context(workerId, id, fence);
  const [result] = await withJobRole(db, (transaction) =>
    transaction.unsafe<Row>(
      'select * from private.billing_processing_job_finish(row($1::uuid,$2::text,$3::bigint,$4::uuid)::private.job_context, $5::uuid, $6::bigint, $7::text, $8::text, $9::text)',
      [...jobContext, jobId, fence, state, errorClass, errorCodeValue],
    ),
  );
  return response(200, { result: result ?? null, request_id: id });
}

async function billingJobProcess(
  request: Request,
  dependencies: MaintenanceDependencies,
  id: string,
): Promise<Response> {
  const input = await jsonBody(request);
  const jobId = uuid(input.job_id);
  const orderId = uuid(input.order_id);
  const fence = Number(input.fence);
  if (
    !jobId ||
    !orderId ||
    !Number.isSafeInteger(fence) ||
    Object.keys(input).some(
      (key) => !['job_id', 'order_id', 'fence'].includes(key),
    )
  )
    return response(400, { error: { code: 'INVALID_INPUT' }, request_id: id });
  if (
    !(
      dependencies.automaticSettlementEnabled ??
      billingSwitchEnabled('BILLING_AUTO_SETTLEMENT_ENABLED')
    )
  )
    return response(503, {
      error: { code: 'BILLING_SETTLEMENT_DISABLED' },
      request_id: id,
    });
  const adapter = dependencies.billingProviderAdapter;
  if (!adapter)
    return response(503, {
      error: { code: 'PROVIDER_NOT_CONFIGURED' },
      request_id: id,
    });
  const workerId =
    dependencies.workerId ??
    Deno.env.get('MAINTENANCE_WORKER_ID') ??
    `maintenance-${crypto.randomUUID()}`;
  const db = dependencies.database ?? database();
  const jobContext = context(workerId, id, fence);
  const [target] = await withJobRole(db, (transaction) =>
    transaction.unsafe<Row>(
      'select * from private.billing_order_query_target(row($1::uuid,$2::text,$3::bigint,$4::uuid)::private.job_context, $5::uuid, $6::uuid, $7::bigint)',
      [...jobContext, jobId, orderId, fence],
    ),
  );
  if (!target)
    return response(503, {
      error: { code: 'JOB_UNAVAILABLE' },
      request_id: id,
    });

  // Provider network I/O is deliberately outside the database transaction.
  const observed = await adapter.queryOrder(String(target.provider_order_no));
  let facts: Record<string, unknown>;
  if (observed.status !== 'found') {
    facts = { status: 'pending' };
  } else if (observed.facts) {
    facts = observed.facts;
  } else {
    const normalized = normalizeAfdianOrder(observed.order);
    if (!normalized)
      return response(503, {
        error: { code: 'PROVIDER_RESPONSE_INVALID' },
        request_id: id,
      });
    facts = toBillingOrderFacts(normalized);
  }
  const [result] = await withJobRole(db, (transaction) =>
    transaction.unsafe<Row>(
      'select * from private.billing_order_verify_and_settle(row($1::uuid,$2::text,$3::bigint,$4::uuid)::private.job_context, $5::uuid, $6::uuid, $7::bigint, $8::jsonb)',
      [...jobContext, jobId, orderId, fence, JSON.stringify(facts)],
    ),
  );
  return response(200, { result: result ?? null, request_id: id });
}

async function retentionRun(
  request: Request,
  dependencies: MaintenanceDependencies,
  id: string,
): Promise<Response> {
  const input = await jsonBody(request);
  if (Object.keys(input).length !== 0)
    return response(400, { error: { code: 'INVALID_INPUT' }, request_id: id });
  const workerId =
    dependencies.workerId ??
    Deno.env.get('MAINTENANCE_WORKER_ID') ??
    `maintenance-${crypto.randomUUID()}`;
  const db = dependencies.database ?? database();
  const jobContext = context(workerId, id);
  const candidates = await withJobRole(db, (transaction) =>
    transaction.unsafe<Row>(
      'select * from private.account_retention_candidates(null::timestamptz, null::uuid, 20)',
    ),
  );
  const results: unknown[] = [];
  for (const candidate of candidates) {
    const accountId = uuid(candidate.platform_account_id);
    if (!accountId) continue;
    const [result] = await withJobRole(db, (transaction) =>
      transaction.unsafe<Row>(
        'select * from private.account_retention_cleanup(row($1::uuid,$2::text,$3::bigint,$4::uuid)::private.job_context, $5::uuid, null::timestamptz, 60)',
        [...jobContext, accountId],
      ),
    );
    if (result) results.push(result);
  }
  return response(200, { processed: results.length, results });
}

export async function handleMaintenanceRequest(
  request: Request,
  dependencies: MaintenanceDependencies = {},
): Promise<Response> {
  const id = requestId();
  const expected =
    dependencies.jobToken ?? Deno.env.get('MAINTENANCE_JOB_TOKEN');
  if (!expected || bearer(request) !== expected)
    return response(401, { error: { code: 'UNAUTHORIZED' }, request_id: id });
  if (request.method !== 'POST')
    return response(405, {
      error: { code: 'METHOD_NOT_ALLOWED' },
      request_id: id,
    });
  try {
    const path = new URL(request.url).pathname;
    if (path === '/maintenance/v1/files/cleanup')
      return await cleanupFile(request, dependencies, id);
    if (path === '/maintenance/v1/files/run')
      return await runCleanup(request, dependencies, id);
    if (path === '/maintenance/v1/files/reconcile')
      return await reconcile(request, dependencies, id);
    if (path === '/maintenance/v1/idempotency/cleanup')
      return await cleanupIdempotency(request, dependencies, id);
    if (path === '/maintenance/v1/deletion-jobs/claim')
      return await deletionJobClaim(request, dependencies, id);
    if (path === '/maintenance/v1/deletion-jobs/step')
      return await deletionJobStep(request, dependencies, id);
    if (path === '/maintenance/v1/deletion-jobs/files')
      return await deletionJobFiles(request, dependencies, id);
    if (path === '/maintenance/v1/deletion-jobs/auth')
      return await deletionJobAuth(request, dependencies, id);
    if (path === '/maintenance/v1/billing/jobs/claim')
      return await billingJobClaim(request, dependencies, id);
    if (path === '/maintenance/v1/billing/jobs/finish')
      return await billingJobFinish(request, dependencies, id);
    if (path === '/maintenance/v1/billing/jobs/process')
      return await billingJobProcess(request, dependencies, id);
    if (path === '/maintenance/v1/accounts/retention')
      return await retentionRun(request, dependencies, id);
    return response(404, { error: { code: 'NOT_FOUND' }, request_id: id });
  } catch (error) {
    const code = errorCode(error);
    const status =
      error instanceof UploadFault
        ? error.status
        : code === 'INVALID_INPUT'
          ? 400
          : 503;
    return response(status, {
      error: { code },
      request_id: id,
    });
  }
}

if (import.meta.main) {
  const port = Number.parseInt(Deno.env.get('MAINTENANCE_PORT') ?? '8001', 10);
  Deno.serve({ port }, (request) => handleMaintenanceRequest(request));
}
