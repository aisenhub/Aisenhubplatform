/// <reference lib="deno.ns" />

import postgres from 'npm:postgres@3.4.3';

import {
  createSupabaseStorageAdapter,
  type StorageAdapter,
} from '../_shared/storage.ts';
import { readBoundedBody, UploadFault } from '../_shared/upload.ts';

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
  readonly jobToken?: string;
  readonly workerId?: string;
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

function context(workerId: string, id: string) {
  return [crypto.randomUUID(), workerId, 1, id];
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
  const code = error instanceof Error ? error.message : 'provider_error';
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
