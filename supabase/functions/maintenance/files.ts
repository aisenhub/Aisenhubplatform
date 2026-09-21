/// <reference lib="deno.ns" />

import {
  type Row,
  type MaintenanceDependencies,
  database,
  storageAdapter,
  jsonBody,
  uuid,
  context,
  withJobRole,
  errorCode,
  response,
} from './core.ts';

export async function cleanupFileId(
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

export async function cleanupFile(
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

export async function runCleanup(
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

export async function cleanupIdempotency(
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

export async function reconcile(
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
