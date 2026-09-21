/// <reference lib="deno.ns" />

import {
  type Row,
  type MaintenanceDependencies,
  database,
  authAdminAdapter,
  jsonBody,
  uuid,
  context,
  withJobRole,
  errorCode,
  response,
} from './core.ts';
import { cleanupFileId } from './files.ts';

export async function deletionJobClaim(
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

export async function deletionJobStep(
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

export async function deletionJobFiles(
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

export async function deletionJobAuth(
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
