/// <reference lib="deno.ns" />

import {
  type Row,
  type MaintenanceDependencies,
  database,
  jsonBody,
  uuid,
  context,
  withJobRole,
  response,
} from './core.ts';

export async function retentionRun(
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
