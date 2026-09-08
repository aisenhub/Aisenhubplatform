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
if (!status.API_URL || !status.SERVICE_ROLE_KEY || !status.DB_URL)
  throw new Error(
    'M4-05 maintenance probe requires Local Auth, Storage and database',
  );

const sql = postgres(status.DB_URL, {
  max: 4,
  prepare: false,
  onnotice: () => undefined,
});
const platformId = crypto.randomUUID();
const accountId = crypto.randomUUID();
const userEmail = `m4-05-worker-${crypto.randomUUID()}@example.test`;
const password = `M4-05-${crypto.randomUUID()}!`;
const fileId = crypto.randomUUID();
const storagePath = `${platformId}/${accountId}/${fileId}`;
const jobToken = `m4-05-job-${crypto.randomUUID()}`;
const workerUrl = 'http://127.0.0.1:8791';
let userId;
let worker;

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
        MAINTENANCE_PORT: '8791',
      },
      stdio: 'ignore',
    },
  );
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
  throw new Error('M4-05 maintenance worker did not become ready');
}

try {
  const signup = await fetch(`${status.API_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: status.ANON_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email: userEmail, password }),
  });
  assert.equal(signup.status, 200);
  userId = (await signup.json()).user.id;
  await sql`insert into public.platforms (id, code, name, status, allow_activation) values (${platformId}, ${`m4-05-worker-${platformId.slice(0, 8)}`}, 'M4-05 worker fixture', 'active', true)`;
  await sql`insert into public.platform_accounts (id, platform_id, user_id, status) values (${accountId}, ${platformId}, ${userId}, 'active')`;
  await storageRequest('platform-config-files/' + storagePath, {
    method: 'POST',
    headers: { 'content-type': 'text/plain', 'x-upsert': 'false' },
    body: 'worker-fixture',
  }).then((response) => assert.equal(response.status, 200));
  await sql`insert into public.platform_config_files
    (id, platform_id, platform_account_id, original_name, storage_path,
     mime_type, purpose, requested_size_bytes, actual_size_bytes, sha256,
     reserved_bytes, reserved_count, status, write_outcome, intent_expires_at,
     uploaded_at)
    values (${fileId}, ${platformId}, ${accountId}, 'worker.ini', ${storagePath},
      'text/plain', 'config', 14, 14, ${'f'.repeat(64)}, 14, 1,
      'deleting', 'confirmed', now(), now())`;
  await startWorker();
  const response = await fetch(`${workerUrl}/maintenance/v1/files/cleanup`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${jobToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ file_id: fileId }),
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.data.status, 'deleted');
  const [file] =
    await sql`select status, reserved_bytes from public.platform_config_files where id = ${fileId}`;
  assert.deepEqual(
    { status: file.status, reserved: Number(file.reserved_bytes) },
    { status: 'deleted', reserved: 0 },
  );
  const [objectCount] =
    await sql`select count(*)::integer as count from storage.objects where bucket_id = 'platform-config-files' and name = ${storagePath}`;
  assert.equal(Number(objectCount.count), 0);
  console.log(
    JSON.stringify({
      workerAuthAndDispatch: 'PASS',
      storageDeleteOutsideTransaction: 'PASS',
      finalizeAndRelease: 'PASS',
    }),
  );
} finally {
  await storageRequest('platform-config-files/' + storagePath, {
    method: 'DELETE',
  }).catch(() => undefined);
  await sql`delete from public.audit_logs where platform_id = ${platformId}`.catch(
    () => undefined,
  );
  await sql`delete from private.job_leases where job_kind = 'file_cleanup' and resource_id = ${fileId}`.catch(
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
  if (userId)
    await fetch(`${status.API_URL}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers: {
        apikey: status.SERVICE_ROLE_KEY,
        Authorization: `Bearer ${status.SERVICE_ROLE_KEY}`,
      },
    }).catch(() => undefined);
  await sql.end({ timeout: 5 }).catch(() => undefined);
  if (worker && !worker.killed) worker.kill();
}
