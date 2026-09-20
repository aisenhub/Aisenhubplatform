/// <reference lib="deno.ns" />

import { UploadFault } from '../_shared/upload.ts';
import {
  type MaintenanceDependencies,
  requestId,
  bearer,
  errorCode,
  response,
} from './core.ts';
import { billingAlertsEvaluate } from './alerts.ts';
import {
  cleanupFile,
  runCleanup,
  cleanupIdempotency,
  reconcile,
} from './files.ts';
import {
  deletionJobClaim,
  deletionJobStep,
  deletionJobFiles,
  deletionJobAuth,
} from './identity.ts';
import {
  billingJobClaim,
  billingJobRun,
  billingJobRequeueContract,
  billingJobRequeue,
  billingJobFinish,
  billingJobProcess,
  billingJobDiscover,
  billingReconciliationPage,
} from './billing.ts';
import { retentionRun } from './retention.ts';

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
