/// <reference lib="deno.ns" />

import {
  createAfdianProviderAdapterFromEnv,
  normalizeAfdianOrder,
  toBillingOrderFacts,
} from '../_shared/afdian.ts';
import { billingSwitchEnabled } from '../_shared/billing.ts';
import { classifyBillingJobFailure } from '../../../packages/domain/src/contracts/billing.ts';
import {
  type Row,
  type Database,
  type MaintenanceDependencies,
  type BillingProviderAdapter,
  requestId,
  database,
  jsonBody,
  uuid,
  context,
  billingContext,
  withJobRole,
  errorCode,
  response,
} from './core.ts';
import { evaluateBillingAlerts } from './alerts.ts';

export async function billingJobClaim(
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

export async function billingJobFinish(
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

export async function billingJobRequeueContract(
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

export async function billingJobRequeue(
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

export async function billingJobProcess(
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

export async function billingJobDiscover(
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

export async function billingReconciliationPage(
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

export async function billingJobRun(
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
