import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import postgres from 'postgres';

const execFileAsync = promisify(execFile);
const root = process.cwd();
const cli = join(root, 'node_modules', 'supabase', 'dist', 'supabase.js');
const { stdout } = await execFileAsync(
  process.execPath,
  [cli, 'status', '-o', 'env'],
  { cwd: root },
);
const status = Object.fromEntries(
  stdout
    .split('\n')
    .map((line) => /^([A-Z0-9_]+)="(.*)"$/u.exec(line))
    .filter(Boolean)
    .map((match) => [match[1], match[2]]),
);
if (
  !status.API_URL ||
  !status.ANON_KEY ||
  !status.SERVICE_ROLE_KEY ||
  !status.DB_URL
)
  throw new Error('M4-10 G4-L probe requires Local Auth, Storage and database');

const sql = postgres(status.DB_URL, {
  max: 4,
  prepare: false,
  onnotice: () => undefined,
});
const platformId = crypto.randomUUID();
const accountId = crypto.randomUUID();
const fileId = crypto.randomUUID();
const requestId = crypto.randomUUID();
const jobId = crypto.randomUUID();
const sessionId = crypto.randomUUID();
const workerUrl = 'http://127.0.0.1:8792';
const jobToken = `m4-10-job-${crypto.randomUUID()}`;
const email = `m4-10-${crypto.randomUUID()}@example.test`;
const password = `M4-10-${crypto.randomUUID()}!`;
const storagePath = `${platformId}/${accountId}/${fileId}`;
let userId;
let worker;
let workerErrors = '';

async function storageRequest(path, init = {}) {
  return fetch(`${status.API_URL}/storage/v1/object/${path}`, {
    ...init,
    headers: {
      apikey: status.SERVICE_ROLE_KEY,
      Authorization: `Bearer ${status.SERVICE_ROLE_KEY}`,
      ...(init.headers ?? {}),
    },
  });
}

async function startWorker() {
  worker = spawn(
    'D:\\APP\\Codex\\Deno\\bin\\deno.exe',
    [
      'run',
      '--allow-env',
      '--allow-net',
      '--allow-read',
      '--allow-import',
      'supabase/functions/maintenance/index.ts',
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        SUPABASE_URL: status.API_URL,
        SUPABASE_SECRET_KEY: status.SERVICE_ROLE_KEY,
        MAINTENANCE_DB_URL: status.DB_URL,
        MAINTENANCE_JOB_TOKEN: jobToken,
        MAINTENANCE_PORT: '8792',
        MAINTENANCE_WORKER_ID: 'm4-10-g4-l-worker',
      },
      stdio: ['ignore', 'ignore', 'pipe'],
    },
  );
  worker.stderr?.on('data', (chunk) => {
    workerErrors += String(chunk);
  });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(
        `${workerUrl}/maintenance/v1/files/reconcile`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${jobToken}`,
            'content-type': 'application/json',
          },
          body: '{}',
        },
      );
      if (response.status) return;
    } catch {
      // Worker is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `M4-10 maintenance worker did not become ready: ${workerErrors}`,
  );
}

async function workerRequest(path, body) {
  const response = await fetch(`${workerUrl}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${jobToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  assert.equal(
    response.status < 500,
    true,
    `${path}: ${JSON.stringify(payload)}\n${workerErrors}`,
  );
  return payload.data;
}

async function claim() {
  return workerRequest('/maintenance/v1/deletion-jobs/claim', {
    job_id: jobId,
  });
}

async function step(claimed, name) {
  return workerRequest('/maintenance/v1/deletion-jobs/step', {
    job_id: jobId,
    fence: Number(claimed.fence),
    lease_fence: Number(claimed.lease_fence),
    step: name,
    outcome: 'completed',
  });
}

try {
  await sql`grant job_executor to postgres`;
  const signup = await fetch(`${status.API_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: status.ANON_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(signup.status, 200);
  userId = (await signup.json()).user.id;
  await sql`insert into public.platforms (id, code, name, status, allow_activation) values (${platformId}, ${`m4-10-${platformId.slice(0, 8)}`}, 'M4-10 G4-L fixture', 'active', true)`;
  await sql`insert into public.platform_accounts (id, platform_id, user_id, status) values (${accountId}, ${platformId}, ${userId}, 'active')`;
  await sql`insert into public.platform_profiles (platform_account_id, display_name, metadata) values (${accountId}, 'fixture user', ${sql.json({ private: true })})`;
  await sql`insert into public.platform_preferences (platform_account_id, preferences) values (${accountId}, ${sql.json({ private: true })})`;
  await sql`insert into private.identity_lifecycle (user_id, state) values (${userId}, 'deleting')`;
  await storageRequest(`platform-config-files/${storagePath}`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain', 'x-upsert': 'false' },
    body: 'global-delete-fixture',
  }).then((response) => assert.equal(response.status, 200));
  await sql`insert into public.platform_config_files
    (id, platform_id, platform_account_id, original_name, storage_path, mime_type,
     purpose, requested_size_bytes, actual_size_bytes, sha256, reserved_bytes,
     reserved_count, status, write_outcome, intent_expires_at, uploaded_at)
    values (${fileId}, ${platformId}, ${accountId}, 'global.ini', ${storagePath},
      'text/plain', 'config', 20, 20, ${'a'.repeat(64)}, 20, 1, 'active',
      'confirmed', now(), now())`;
  await sql`insert into private.deletion_requests (id, user_id, request_session_id, state, approved_at) values (${requestId}, ${userId}, ${sessionId}, 'approved', now())`;
  await sql`insert into private.deletion_jobs (id, request_id, user_id, state, checkpoint) values (${jobId}, ${requestId}, ${userId}, 'pending', 'created')`;
  await startWorker();

  let claimed = await claim();
  assert.equal(claimed.checkpoint, 'created');
  await step(claimed, 'sessions_revoked');
  claimed = await claim();
  await step(claimed, 'accounts_closed');
  claimed = await claim();
  await step(claimed, 'files_blocked');
  claimed = await claim();
  const files = await workerRequest('/maintenance/v1/deletion-jobs/files', {
    job_id: jobId,
    fence: Number(claimed.fence),
    lease_fence: Number(claimed.lease_fence),
  });
  assert.equal(files.files_seen, 1);
  claimed = await claim();
  await step(claimed, 'history_anonymized');
  claimed = await claim();
  const auth = await workerRequest('/maintenance/v1/deletion-jobs/auth', {
    job_id: jobId,
    fence: Number(claimed.fence),
    lease_fence: Number(claimed.lease_fence),
  });
  assert.equal(auth.user_id, userId);

  const [job] =
    await sql`select state, checkpoint from private.deletion_jobs where id = ${jobId}`;
  assert.deepEqual(job, { state: 'completed', checkpoint: 'auth_deleted' });
  const [account] =
    await sql`select status, user_id, anonymized_at from public.platform_accounts where id = ${accountId}`;
  assert.equal(account.status, 'closed');
  assert.equal(account.user_id, null);
  assert.ok(account.anonymized_at);
  const [file] =
    await sql`select status, reserved_bytes from public.platform_config_files where id = ${fileId}`;
  assert.deepEqual(
    { status: file.status, reserved: Number(file.reserved_bytes) },
    { status: 'deleted', reserved: 0 },
  );
  const [objectCount] =
    await sql`select count(*)::integer as count from storage.objects where bucket_id = 'platform-config-files' and name = ${storagePath}`;
  assert.equal(Number(objectCount.count), 0);
  const [authCount] =
    await sql`select count(*)::integer as count from auth.users where id = ${userId}`;
  assert.equal(Number(authCount.count), 0);
  const [lifecycleCount] =
    await sql`select count(*)::integer as count from private.identity_lifecycle where user_id = ${userId}`;
  assert.equal(Number(lifecycleCount.count), 0);
  console.log(
    JSON.stringify({
      globalDeleteCheckpointRecovery: 'PASS',
      storageObjectRemovalAndBudgetRelease: 'PASS',
      authDeletionAndTombstone: 'PASS',
      foreignKeySafeFinalState: 'PASS',
    }),
  );
} finally {
  await storageRequest(`platform-config-files/${storagePath}`, {
    method: 'DELETE',
  }).catch(() => undefined);
  await sql`delete from public.audit_logs where platform_id = ${platformId}`.catch(
    () => undefined,
  );
  await sql`delete from private.deletion_jobs where id = ${jobId}`.catch(
    () => undefined,
  );
  await sql`delete from private.deletion_requests where id = ${requestId}`.catch(
    () => undefined,
  );
  await sql`delete from private.job_leases where job_kind = 'global_delete' and resource_id = ${jobId}`.catch(
    () => undefined,
  );
  await sql`delete from public.platform_config_files where id = ${fileId}`.catch(
    () => undefined,
  );
  await sql`delete from public.platform_accounts where id = ${accountId}`.catch(
    () => undefined,
  );
  await sql`delete from public.platforms where id = ${platformId}`.catch(
    () => undefined,
  );
  if (userId) {
    await fetch(`${status.API_URL}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers: {
        apikey: status.SERVICE_ROLE_KEY,
        Authorization: `Bearer ${status.SERVICE_ROLE_KEY}`,
      },
    }).catch(() => undefined);
  }
  await sql.end({ timeout: 5 }).catch(() => undefined);
  if (worker && !worker.killed) worker.kill();
}
