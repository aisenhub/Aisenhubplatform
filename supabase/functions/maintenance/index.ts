/// <reference lib="deno.ns" />

import postgres from 'npm:postgres@3.4.3';

import {
  createSupabaseStorageAdapter,
  type StorageAdapter,
} from '../_shared/storage.ts';
import { readBoundedBody, UploadFault } from '../_shared/upload.ts';
import {
  createAfdianProviderAdapterFromEnv,
  normalizeAfdianOrder,
  toBillingOrderFacts,
} from '../_shared/afdian.ts';
import { billingSwitchEnabled } from '../_shared/billing.ts';
import { classifyBillingJobFailure } from '../../../packages/domain/src/contracts/billing.ts';

type Row = Record<string, unknown>;

type MaintenanceCapability = 'files' | 'identity' | 'billing';
type MaintenanceCapabilityTokens = Readonly<
  Partial<Record<MaintenanceCapability, string>>
>;

interface Transaction {
  unsafe<T extends Row = Row>(query: string, values?: unknown[]): Promise<T[]>;
  json(value: unknown): unknown;
}

interface Database {
  begin<T>(callback: (transaction: Transaction) => Promise<T>): Promise<T>;
}

interface MaintenanceDependencies {
  readonly database?: Database;
  readonly storageAdapter?: StorageAdapter;
  readonly authAdapter?: AuthAdminAdapter;
  readonly capabilityTokens?: MaintenanceCapabilityTokens;
  readonly workerId?: string;
  readonly billingProviderAdapter?: BillingProviderAdapter;
  readonly backgroundProcessingEnabled?: boolean;
  readonly automaticSettlementEnabled?: boolean;
  readonly billingAlertReceiver?: BillingAlertReceiver;
  readonly billingAlertThresholds?: Readonly<Record<string, number>>;
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
  listOrders?(page: number): Promise<{
    readonly status: 'found' | 'temporarily_unavailable';
    readonly orders?: readonly unknown[];
    readonly totalPage?: number;
  }>;
}

interface BillingAlertReceiver {
  deliver(alert: Row): Promise<void>;
}

const BILLING_ALERT_THRESHOLD_KEYS = new Set([
  'pending_age_seconds',
  'processing_age_seconds',
  'discovery_stale_seconds',
  'processing_stale_seconds',
  'expired_lease_count',
  'manual_review_count',
  'duplicate_payment_count',
  'retry_budget_exhausted_count',
  'refund_mismatch_count',
  'scheduler_failure_count',
]);

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const MAINTENANCE_PATHS: Readonly<
  Record<MaintenanceCapability, ReadonlySet<string>>
> = {
  files: new Set([
    '/maintenance/v1/files/cleanup',
    '/maintenance/v1/files/run',
    '/maintenance/v1/files/reconcile',
  ]),
  identity: new Set([
    '/maintenance/v1/idempotency/cleanup',
    '/maintenance/v1/deletion-jobs/claim',
    '/maintenance/v1/deletion-jobs/step',
    '/maintenance/v1/deletion-jobs/files',
    '/maintenance/v1/deletion-jobs/auth',
    '/maintenance/v1/accounts/retention',
  ]),
  billing: new Set([
    '/maintenance/v1/billing/jobs/claim',
    '/maintenance/v1/billing/jobs/run',
    '/maintenance/v1/billing/alerts/evaluate',
    '/maintenance/v1/billing/jobs/requeue-contract',
    '/maintenance/v1/billing/jobs/requeue',
    '/maintenance/v1/billing/jobs/finish',
    '/maintenance/v1/billing/jobs/process',
    '/maintenance/v1/billing/jobs/discover',
    '/maintenance/v1/billing/reconciliation/page',
  ]),
};

const MAINTENANCE_TOKEN_ENV: Readonly<Record<MaintenanceCapability, string>> = {
  files: 'MAINTENANCE_FILES_TOKEN',
  identity: 'MAINTENANCE_IDENTITY_TOKEN',
  billing: 'MAINTENANCE_BILLING_TOKEN',
};

function maintenanceCapability(path: string): MaintenanceCapability | null {
  for (const capability of ['files', 'identity', 'billing'] as const) {
    if (MAINTENANCE_PATHS[capability].has(path)) return capability;
  }
  return null;
}

function maintenanceToken(
  capability: MaintenanceCapability,
  dependencies: MaintenanceDependencies,
): string | undefined {
  return (
    dependencies.capabilityTokens?.[capability] ??
    Deno.env.get(MAINTENANCE_TOKEN_ENV[capability])
  );
}

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

function billingAlertReceiver(): BillingAlertReceiver | undefined {
  const target = Deno.env.get('BILLING_ALERT_WEBHOOK_URL')?.trim();
  if (!target) return undefined;
  return {
    async deliver(alert) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const delivered = await fetch(target, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ event: 'billing.alert', alert }),
          signal: controller.signal,
        });
        if (!delivered.ok)
          throw new Error(`ALERT_RECEIVER_HTTP_${delivered.status}`);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError')
          throw new Error('ALERT_RECEIVER_TIMEOUT');
        throw error;
      } finally {
        clearTimeout(timer);
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

function billingContext(
  workerId: string,
  requestId: string,
  jobId: string,
  fencingToken: number,
) {
  return [jobId, workerId, fencingToken, requestId];
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

function alertThresholds(value: unknown): Record<string, number> {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('INVALID_INPUT');
  const result: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    const numeric = typeof raw === 'number' ? raw : Number.NaN;
    if (
      !BILLING_ALERT_THRESHOLD_KEYS.has(key) ||
      !Number.isFinite(numeric) ||
      numeric <= 0
    )
      throw new Error('INVALID_INPUT');
    result[key] = numeric;
  }
  return result;
}

type BillingAlertEvaluation = {
  readonly observedCount: number;
  readonly activeCount: number;
  readonly recoveredCount: number;
  readonly deliveredCount: number;
  readonly pendingDeliveryCount: number;
  readonly receiverStatus: 'delivered' | 'not_configured' | 'failed';
  readonly receiverFailures: readonly string[];
  readonly alerts: readonly Row[];
};

async function evaluateBillingAlerts(
  input: Record<string, unknown>,
  dependencies: MaintenanceDependencies,
  id: string,
): Promise<BillingAlertEvaluation> {
  if (Object.keys(input).some((key) => key !== 'thresholds'))
    throw new Error('INVALID_INPUT');
  const requestedThresholds = alertThresholds(input.thresholds);
  const thresholds = {
    ...(dependencies.billingAlertThresholds ?? {}),
    ...requestedThresholds,
  };
  alertThresholds(thresholds);
  const workerId =
    dependencies.workerId ??
    Deno.env.get('MAINTENANCE_WORKER_ID') ??
    `maintenance-${crypto.randomUUID()}`;
  const db = dependencies.database ?? database();
  const jobContext = billingContext(workerId, id, crypto.randomUUID(), 1);
  const rows = await withJobRole(db, (transaction) =>
    transaction.unsafe<Row>(
      'select * from private.billing_alerts_evaluate(row($1::uuid,$2::text,$3::bigint,$4::uuid)::private.job_context, $5::jsonb)',
      [...jobContext, transaction.json(thresholds)],
    ),
  );
  const receiver = dependencies.billingAlertReceiver ?? billingAlertReceiver();
  const receiverFailures: string[] = [];
  let deliveredCount = 0;
  for (const alert of rows) {
    if (alert.needs_delivery !== true || !receiver) continue;
    try {
      await receiver.deliver(alert);
      await withJobRole(db, (transaction) =>
        transaction.unsafe<Row>(
          'select * from private.billing_alert_delivery_update(row($1::uuid,$2::text,$3::bigint,$4::uuid)::private.job_context, $5::uuid, $6::text, null::text)',
          [...jobContext, alert.alert_id, 'delivered'],
        ),
      );
      deliveredCount += 1;
    } catch (error) {
      const code = errorCode(error);
      receiverFailures.push(code);
      try {
        await withJobRole(db, (transaction) =>
          transaction.unsafe<Row>(
            'select * from private.billing_alert_delivery_update(row($1::uuid,$2::text,$3::bigint,$4::uuid)::private.job_context, $5::uuid, $6::text, $7::text)',
            [...jobContext, alert.alert_id, 'failed', code],
          ),
        );
      } catch (deliveryError) {
        receiverFailures.push(errorCode(deliveryError));
      }
    }
  }
  const pendingDeliveryCount =
    rows.filter((alert) => alert.needs_delivery === true).length -
    deliveredCount;
  return {
    observedCount: rows.length,
    activeCount: rows.filter((alert) => alert.status === 'active').length,
    recoveredCount: rows.filter((alert) => alert.status === 'recovered').length,
    deliveredCount,
    pendingDeliveryCount: Math.max(0, pendingDeliveryCount),
    receiverStatus:
      receiverFailures.length > 0
        ? 'failed'
        : receiver
          ? 'delivered'
          : 'not_configured',
    receiverFailures,
    alerts: rows,
  };
}

async function billingAlertsEvaluate(
  request: Request,
  dependencies: MaintenanceDependencies,
  id: string,
): Promise<Response> {
  const input = await jsonBody(request);
  const result = await evaluateBillingAlerts(input, dependencies, id);
  return response(200, {
    observed_count: result.observedCount,
    active_count: result.activeCount,
    recovered_count: result.recoveredCount,
    delivered_count: result.deliveredCount,
    pending_delivery_count: result.pendingDeliveryCount,
    receiver_status: result.receiverStatus,
    receiver_failures: result.receiverFailures,
    alerts: result.alerts,
    request_id: id,
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
  const jobContext = billingContext(workerId, id, jobId, fence);
  const [result] = await withJobRole(db, (transaction) =>
    transaction.unsafe<Row>(
      'select * from private.billing_processing_job_finish(row($1::uuid,$2::text,$3::bigint,$4::uuid)::private.job_context, $5::uuid, $6::bigint, $7::text, $8::text, $9::text)',
      [...jobContext, jobId, fence, state, errorClass, errorCodeValue],
    ),
  );
  return response(200, { result: result ?? null, request_id: id });
}

async function billingJobRequeueContract(
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
  const [result] = await withJobRole(db, (transaction) =>
    transaction.unsafe<Row>(
      'select * from private.billing_processing_job_requeue_contract(row($1::uuid,$2::text,$3::bigint,$4::uuid)::private.job_context, $5::uuid)',
      [...jobContext, jobId],
    ),
  );
  return response(200, { result: result ?? null, request_id: id });
}

async function billingJobRequeue(
  request: Request,
  dependencies: MaintenanceDependencies,
  id: string,
): Promise<Response> {
  const input = await jsonBody(request);
  const jobId = uuid(input.job_id);
  const operationId = uuid(input.operation_id);
  const reason = typeof input.reason === 'string' ? input.reason : null;
  if (
    !jobId ||
    !operationId ||
    !reason ||
    reason.length < 1 ||
    reason.length > 1024 ||
    Object.keys(input).some(
      (key) => !['job_id', 'operation_id', 'reason'].includes(key),
    )
  )
    return response(400, { error: { code: 'INVALID_INPUT' }, request_id: id });
  const workerId =
    dependencies.workerId ??
    Deno.env.get('MAINTENANCE_WORKER_ID') ??
    `maintenance-${crypto.randomUUID()}`;
  const db = dependencies.database ?? database();
  const jobContext = context(workerId, id);
  const [result] = await withJobRole(db, (transaction) =>
    transaction.unsafe<Row>(
      'select * from private.billing_processing_job_requeue(row($1::uuid,$2::text,$3::bigint,$4::uuid)::private.job_context, $5::uuid, $6::uuid, $7::text)',
      [...jobContext, jobId, operationId, reason],
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
  const adapter =
    dependencies.billingProviderAdapter ?? createAfdianProviderAdapterFromEnv();
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
  const jobContext = billingContext(workerId, id, jobId, fence);
  try {
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
    if (observed.status !== 'found') {
      const failure = classifyBillingJobFailure(
        observed.status === 'not_found'
          ? 'PROVIDER_ORDER_NOT_FOUND'
          : 'PROVIDER_UNAVAILABLE',
      );
      const result = await finishBillingJob(
        db,
        jobContext,
        jobId,
        fence,
        failure.state,
        failure.error_class,
        failure.error_code,
      );
      return response(200, { result, request_id: id });
    }
    let facts: Record<string, unknown>;
    if (observed.facts) {
      facts = observed.facts;
    } else {
      const normalized = normalizeAfdianOrder(observed.order);
      if (!normalized) {
        const failure = classifyBillingJobFailure('PROVIDER_RESPONSE_INVALID');
        const result = await finishBillingJob(
          db,
          jobContext,
          jobId,
          fence,
          failure.state,
          failure.error_class,
          failure.error_code,
        );
        return response(200, { result, request_id: id });
      }
      facts = toBillingOrderFacts(normalized);
    }
    const [result] = await withJobRole(db, (transaction) =>
      transaction.unsafe<Row>(
        'select * from private.billing_order_verify_and_settle(row($1::uuid,$2::text,$3::bigint,$4::uuid)::private.job_context, $5::uuid, $6::uuid, $7::bigint, $8::jsonb)',
        [...jobContext, jobId, orderId, fence, transaction.json(facts)],
      ),
    );
    return response(200, { result: result ?? null, request_id: id });
  } catch (error) {
    const failure = classifyBillingJobFailure(errorCode(error));
    if (failure.error_code === 'FENCE_CONFLICT')
      return response(503, {
        error: { code: 'JOB_UNAVAILABLE' },
        request_id: id,
      });
    try {
      const result = await finishBillingJob(
        db,
        jobContext,
        jobId,
        fence,
        failure.state,
        failure.error_class,
        failure.error_code,
      );
      return response(200, { result, request_id: id });
    } catch {
      return response(503, {
        error: { code: 'JOB_PROCESSING_FAILED' },
        request_id: id,
      });
    }
  }
}

async function finishBillingJob(
  db: Database,
  jobContext: readonly unknown[],
  jobId: string,
  fence: number,
  state: 'retryable' | 'completed' | 'manual_review',
  errorClass: string | null,
  errorCodeValue: string | null,
): Promise<Row | null> {
  const [result] = await withJobRole(db, (transaction) =>
    transaction.unsafe<Row>(
      'select * from private.billing_processing_job_finish(row($1::uuid,$2::text,$3::bigint,$4::uuid)::private.job_context, $5::uuid, $6::bigint, $7::text, $8::text, $9::text)',
      [...jobContext, jobId, fence, state, errorClass, errorCodeValue],
    ),
  );
  return result ?? null;
}

async function billingJobDiscover(
  request: Request,
  dependencies: MaintenanceDependencies,
  id: string,
): Promise<Response> {
  const input = await jsonBody(request);
  const jobId = uuid(input.job_id);
  const fence = Number(input.fence);
  if (
    !jobId ||
    !Number.isSafeInteger(fence) ||
    Object.keys(input).some((key) => !['job_id', 'fence'].includes(key))
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
  const adapter =
    dependencies.billingProviderAdapter ?? createAfdianProviderAdapterFromEnv();
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
  const jobContext = billingContext(workerId, id, jobId, fence);
  try {
    const [target] = await withJobRole(db, (transaction) =>
      transaction.unsafe<Row>(
        'select * from private.billing_webhook_discovery_target(row($1::uuid,$2::text,$3::bigint,$4::uuid)::private.job_context, $5::uuid, $6::bigint)',
        [...jobContext, jobId, fence],
      ),
    );
    if (!target)
      return response(503, {
        error: { code: 'JOB_UNAVAILABLE' },
        request_id: id,
      });

    // Provider network I/O is deliberately outside the database transaction.
    const observed = await adapter.queryOrder(String(target.provider_order_no));
    if (observed.status !== 'found') {
      const failure = classifyBillingJobFailure(
        observed.status === 'not_found'
          ? 'PROVIDER_ORDER_NOT_FOUND'
          : 'PROVIDER_UNAVAILABLE',
      );
      const result = await finishBillingJob(
        db,
        jobContext,
        jobId,
        fence,
        failure.state,
        failure.error_class,
        failure.error_code,
      );
      return response(200, { result, request_id: id });
    }

    let facts: Record<string, unknown>;
    if (observed.facts) {
      facts = observed.facts;
    } else {
      const normalized = normalizeAfdianOrder(observed.order);
      if (!normalized) {
        const result = await finishBillingJob(
          db,
          jobContext,
          jobId,
          fence,
          'manual_review',
          'provider_contract',
          'PROVIDER_RESPONSE_INVALID',
        );
        return response(200, { result, request_id: id });
      }
      facts = toBillingOrderFacts(normalized);
    }
    const customOrderId =
      typeof facts.custom_order_id === 'string' ? facts.custom_order_id : null;
    try {
      await withJobRole(db, (transaction) =>
        transaction.unsafe<Row>(
          'select * from private.billing_order_link_checkout(row($1::uuid,$2::text,$3::bigint,$4::uuid)::private.job_context, $5::uuid, $6::uuid, $7::bigint, $8::text)',
          [...jobContext, jobId, target.order_id, fence, customOrderId],
        ),
      );
    } catch (error) {
      throw new Error(`checkout_link_${errorCode(error)}`);
    }
    let result: Row | undefined;
    try {
      [result] = await withJobRole(db, (transaction) =>
        transaction.unsafe<Row>(
          'select * from private.billing_order_verify_and_settle(row($1::uuid,$2::text,$3::bigint,$4::uuid)::private.job_context, $5::uuid, $6::uuid, $7::bigint, $8::jsonb)',
          [
            ...jobContext,
            jobId,
            target.order_id,
            fence,
            transaction.json(facts),
          ],
        ),
      );
    } catch (error) {
      throw new Error(`settlement_${errorCode(error)}`);
    }
    return response(200, { result: result ?? null, request_id: id });
  } catch (error) {
    const failure = classifyBillingJobFailure(errorCode(error));
    if (failure.error_code === 'FENCE_CONFLICT')
      return response(503, {
        error: { code: 'JOB_UNAVAILABLE' },
        request_id: id,
      });
    try {
      const result = await finishBillingJob(
        db,
        jobContext,
        jobId,
        fence,
        failure.state,
        failure.error_class,
        failure.error_code,
      );
      return response(200, { result, request_id: id });
    } catch {
      return response(503, {
        error: { code: 'JOB_PROCESSING_FAILED' },
        request_id: id,
      });
    }
  }
}

async function billingReconciliationPage(
  request: Request,
  dependencies: MaintenanceDependencies,
  id: string,
): Promise<Response> {
  const input = await jsonBody(request);
  const providerAccountId =
    input.provider_account_id === undefined
      ? null
      : uuid(input.provider_account_id);
  if (
    (input.provider_account_id !== undefined && !providerAccountId) ||
    Object.keys(input).some((key) => key !== 'provider_account_id')
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
  const adapter =
    dependencies.billingProviderAdapter ?? createAfdianProviderAdapterFromEnv();
  if (!adapter?.listOrders)
    return response(503, {
      error: { code: 'PROVIDER_NOT_CONFIGURED' },
      request_id: id,
    });
  const workerId =
    dependencies.workerId ??
    Deno.env.get('MAINTENANCE_WORKER_ID') ??
    `maintenance-${crypto.randomUUID()}`;
  const db = dependencies.database ?? database();
  const jobContext = context(workerId, id);
  let target: Row | undefined;
  try {
    [target] = await withJobRole(db, (transaction) =>
      transaction.unsafe<Row>(
        'select * from private.billing_reconciliation_page_target(row($1::uuid,$2::text,$3::bigint,$4::uuid)::private.job_context, $5::uuid)',
        [...jobContext, providerAccountId],
      ),
    );
  } catch (error) {
    return response(503, {
      error: { code: errorCode(error) },
      request_id: id,
    });
  }
  if (!target)
    return response(200, {
      result: null,
      status: 'NO_ACTIVE_PROVIDER',
      request_id: id,
    });
  const providerId = uuid(target.provider_account_id);
  const page = Number(target.page_number);
  const expectedVersion = Number(target.expected_version);
  if (
    !providerId ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion < 0
  )
    return response(503, {
      error: { code: 'RECONCILIATION_CURSOR_INVALID' },
      request_id: id,
    });

  let observed: Awaited<
    ReturnType<NonNullable<BillingProviderAdapter['listOrders']>>
  >;
  try {
    observed = await adapter.listOrders(page);
  } catch {
    observed = { status: 'temporarily_unavailable' };
  }
  const recordFailure = async (code: string): Promise<Row | null> => {
    try {
      const [result] = await withJobRole(db, (transaction) =>
        transaction.unsafe<Row>(
          'select * from private.billing_reconciliation_page_failure(row($1::uuid,$2::text,$3::bigint,$4::uuid)::private.job_context, $5::uuid, $6::integer, $7::bigint, $8::text)',
          [...jobContext, providerId, page, expectedVersion, code],
        ),
      );
      return result ?? null;
    } catch (error) {
      if (errorCode(error) === 'cursor_conflict') return null;
      throw error;
    }
  };
  if (
    observed.status !== 'found' ||
    !observed.orders ||
    !Number.isSafeInteger(observed.totalPage) ||
    (observed.totalPage as number) < page
  ) {
    const failure = await recordFailure(
      observed.status === 'found'
        ? 'PROVIDER_RESPONSE_INVALID'
        : 'PROVIDER_UNAVAILABLE',
    );
    if (!failure)
      return response(409, {
        error: { code: 'CURSOR_CONFLICT' },
        request_id: id,
      });
    return response(503, {
      error: {
        code:
          observed.status === 'found'
            ? 'PROVIDER_RESPONSE_INVALID'
            : 'PROVIDER_UNAVAILABLE',
      },
      result: failure,
      request_id: id,
    });
  }
  const totalPage = observed.totalPage as number;
  const nextPage = page < totalPage ? page + 1 : null;
  try {
    const [result] = await withJobRole(db, (transaction) =>
      transaction.unsafe<Row>(
        'select * from private.billing_reconciliation_page_ingest(row($1::uuid,$2::text,$3::bigint,$4::uuid)::private.job_context, $5::uuid, $6::integer, $7::bigint, $8::integer, $9::jsonb)',
        [
          ...jobContext,
          providerId,
          page,
          expectedVersion,
          nextPage,
          transaction.json(observed.orders),
        ],
      ),
    );
    return response(200, { result: result ?? null, request_id: id });
  } catch (error) {
    const code = errorCode(error);
    return response(code === 'cursor_conflict' ? 409 : 503, {
      error: { code: code === 'cursor_conflict' ? 'CURSOR_CONFLICT' : code },
      request_id: id,
    });
  }
}

async function billingJobRun(
  request: Request,
  dependencies: MaintenanceDependencies,
  id: string,
): Promise<Response> {
  const input = await jsonBody(request);
  const limit = input.limit === undefined ? 5 : Number(input.limit);
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 20 ||
    Object.keys(input).some((key) => key !== 'limit')
  )
    return response(400, { error: { code: 'INVALID_INPUT' }, request_id: id });
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
  const workerId =
    dependencies.workerId ??
    Deno.env.get('MAINTENANCE_WORKER_ID') ??
    `maintenance-${crypto.randomUUID()}`;
  const db = dependencies.database ?? database();
  const results: Array<Record<string, unknown>> = [];
  try {
    const alertEvaluation = await evaluateBillingAlerts({}, dependencies, id);
    results.push({
      job_kind: 'billing_alert_evaluation',
      status: alertEvaluation.receiverStatus,
      observed_count: alertEvaluation.observedCount,
      active_count: alertEvaluation.activeCount,
      recovered_count: alertEvaluation.recoveredCount,
      pending_delivery_count: alertEvaluation.pendingDeliveryCount,
      receiver_failures: alertEvaluation.receiverFailures,
    });
  } catch (error) {
    results.push({
      job_kind: 'billing_alert_evaluation',
      status: 'failed',
      error: errorCode(error),
    });
  }
  const automaticSettlementEnabled =
    dependencies.automaticSettlementEnabled ??
    billingSwitchEnabled('BILLING_AUTO_SETTLEMENT_ENABLED');
  const discoveryAdapter =
    dependencies.billingProviderAdapter ?? createAfdianProviderAdapterFromEnv();
  if (automaticSettlementEnabled && discoveryAdapter?.listOrders) {
    const discoveryResponse = await billingReconciliationPage(
      new Request('http://local/maintenance/v1/billing/reconciliation/page', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
      { ...dependencies, workerId, billingProviderAdapter: discoveryAdapter },
      requestId(),
    );
    results.push({
      job_kind: 'provider_reconciliation_page',
      status: discoveryResponse.status,
    });
  }
  const claimed = await withJobRole(db, (transaction) =>
    transaction.unsafe<Row>(
      'select * from private.billing_processing_job_claim(row($1::uuid,$2::text,$3::bigint,$4::uuid)::private.job_context, $5::integer)',
      [...context(workerId, id), limit],
    ),
  );
  for (const job of claimed) {
    const jobId = uuid(job.job_id);
    const fence = Number(job.fence);
    if (!jobId || !Number.isSafeInteger(fence)) {
      results.push({ job_kind: job.job_kind, status: 'invalid_claim' });
      continue;
    }
    if (job.job_kind === 'webhook_order_discovery') {
      const jobResponse = await billingJobDiscover(
        new Request('http://local/maintenance/v1/billing/jobs/discover', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ job_id: jobId, fence }),
        }),
        { ...dependencies, workerId },
        requestId(),
      );
      results.push({ job_kind: job.job_kind, status: jobResponse.status });
      continue;
    }
    const orderId = uuid(job.billing_order_id);
    if (!orderId) {
      const result = await finishBillingJob(
        db,
        billingContext(workerId, id, jobId, fence),
        jobId,
        fence,
        'manual_review',
        'worker',
        'MISSING_BILLING_ORDER',
      );
      results.push({ job_kind: job.job_kind, status: result?.state ?? null });
      continue;
    }
    const jobResponse = await billingJobProcess(
      new Request('http://local/maintenance/v1/billing/jobs/process', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ job_id: jobId, order_id: orderId, fence }),
      }),
      { ...dependencies, workerId },
      requestId(),
    );
    results.push({ job_kind: job.job_kind, status: jobResponse.status });
  }
  return response(200, { processed: results.length, results, request_id: id });
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
  const path = new URL(request.url).pathname;
  const capability = maintenanceCapability(path);
  if (!capability)
    return response(404, { error: { code: 'NOT_FOUND' }, request_id: id });
  const expected = maintenanceToken(capability, dependencies);
  if (!expected || bearer(request) !== expected)
    return response(401, { error: { code: 'UNAUTHORIZED' }, request_id: id });
  if (request.method !== 'POST')
    return response(405, {
      error: { code: 'METHOD_NOT_ALLOWED' },
      request_id: id,
    });
  try {
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
    if (path === '/maintenance/v1/billing/jobs/run')
      return await billingJobRun(request, dependencies, id);
    if (path === '/maintenance/v1/billing/alerts/evaluate')
      return await billingAlertsEvaluate(request, dependencies, id);
    if (path === '/maintenance/v1/billing/jobs/requeue-contract')
      return await billingJobRequeueContract(request, dependencies, id);
    if (path === '/maintenance/v1/billing/jobs/requeue')
      return await billingJobRequeue(request, dependencies, id);
    if (path === '/maintenance/v1/billing/jobs/finish')
      return await billingJobFinish(request, dependencies, id);
    if (path === '/maintenance/v1/billing/jobs/process')
      return await billingJobProcess(request, dependencies, id);
    if (path === '/maintenance/v1/billing/jobs/discover')
      return await billingJobDiscover(request, dependencies, id);
    if (path === '/maintenance/v1/billing/reconciliation/page')
      return await billingReconciliationPage(request, dependencies, id);
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
