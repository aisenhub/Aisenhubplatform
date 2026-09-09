import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { join } from 'node:path';
import { createHmac, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import postgres from 'postgres';

const execFileAsync = promisify(execFile);
const root = process.cwd();
const cli = join(root, 'node_modules', 'supabase', 'dist', 'supabase.js');
const { stdout } = await execFileAsync(
  process.execPath,
  [cli, 'status', '-o', 'env'],
  {
    cwd: root,
  },
);
const status = Object.fromEntries(
  stdout
    .split('\n')
    .map((line) => /^([A-Z0-9_]+)="(.*)"$/u.exec(line))
    .filter((match) => match)
    .map((match) => [match[1], match[2]]),
);
const authUrl = status.API_URL;
const publishableKey = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
const serviceKey = status.SERVICE_ROLE_KEY;
const databaseUrl = status.DB_URL;
const apiUrl = 'http://127.0.0.1:8790';
const platformSecret = 'm4-04-local-platform-secret';
if (!authUrl || !publishableKey || !serviceKey || !databaseUrl)
  throw new Error(
    'M4-04 Local probe requires Auth, Storage and database status',
  );

const sql = postgres(databaseUrl, {
  max: 4,
  prepare: false,
  onnotice: () => undefined,
});
const platformId = crypto.randomUUID();
const accountId = crypto.randomUUID();
const keyId = crypto.randomUUID();
const platformCode = `m4-04-${platformId.slice(0, 8)}`;
const presentedKey = `phk_v1_${keyId}_m4-04-local`;
const keyHmac = createHmac('sha256', platformSecret)
  .update(`1:platform-key:${keyId}:${presentedKey}`)
  .digest('hex');
const password = `M4-04-${randomBytes(16).toString('hex')}!`;
const email = `m4-04-${crypto.randomUUID()}@example.test`;
let userId;
let apiProcess;

function assertStatus(response, expected, label) {
  assert.equal(
    response.status,
    expected,
    `${label}: expected ${expected}, got ${response.status}`,
  );
}

async function authRequest(path, options = {}) {
  const response = await fetch(`${authUrl}${path}`, {
    ...options,
    headers: {
      apikey: publishableKey,
      'content-type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  return { response, body: await response.json().catch(() => null) };
}

async function apiRequest(path, options = {}) {
  return fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'X-Platform-Key': presentedKey,
      ...(options.headers ?? {}),
    },
  });
}

let accessToken;
async function startApi() {
  apiProcess = spawn(
    'D:\\APP\\Codex\\Deno\\bin\\deno.exe',
    [
      'run',
      '--allow-env',
      '--allow-net',
      '--allow-read',
      '--allow-import',
      'supabase/functions/account-api/index.ts',
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        SUPABASE_URL: authUrl,
        SUPABASE_PUBLISHABLE_KEY: publishableKey,
        SUPABASE_SECRET_KEY: serviceKey,
        ACCOUNT_API_DB_URL: databaseUrl,
        PLATFORM_KEY_HMAC_SECRET: platformSecret,
        ACCOUNT_API_PORT: '8790',
      },
      stdio: 'ignore',
    },
  );
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(
        `${apiUrl}/functions/v1/account-api/v1/plans`,
        {
          headers: { 'X-Platform-Key': presentedKey },
        },
      );
      if (response.status) return;
    } catch {
      // The local Deno process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('M4-04 Local Account API did not become ready');
}

async function cleanup() {
  await sql`delete from storage.objects where bucket_id = 'platform-config-files' and name like ${`${platformId}/%`}`.catch(
    () => undefined,
  );
  await sql`delete from public.audit_logs where platform_id = ${platformId}`.catch(
    () => undefined,
  );
  await sql`delete from private.idempotency_keys where platform_id = ${platformId}`.catch(
    () => undefined,
  );
  await sql`delete from private.file_write_attempts where platform_id = ${platformId}`.catch(
    () => undefined,
  );
  await sql`delete from public.platform_config_files where platform_id = ${platformId}`.catch(
    () => undefined,
  );
  await sql`delete from public.platform_file_policies where platform_id = ${platformId}`.catch(
    () => undefined,
  );
  await sql`delete from public.platform_accounts where id = ${accountId}`.catch(
    () => undefined,
  );
  await sql`delete from private.platform_api_keys where platform_id = ${platformId}`.catch(
    () => undefined,
  );
  await sql`delete from public.platforms where id = ${platformId}`.catch(
    () => undefined,
  );
  if (userId)
    await fetch(`${authUrl}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    }).catch(() => undefined);
  await sql.end({ timeout: 5 }).catch(() => undefined);
  if (apiProcess && !apiProcess.killed) apiProcess.kill();
}

try {
  await startApi();
  const signup = await authRequest('/auth/v1/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  assertStatus(signup.response, 200, 'M4-04 signup');
  userId = signup.body?.user?.id;
  accessToken = signup.body?.access_token;
  assert.ok(userId && accessToken, 'M4-04 signup returns a session');
  await sql`grant account_executor to postgres`;
  await sql`insert into public.platforms (id, code, name, status, allow_activation) values (${platformId}, ${platformCode}, 'M4-04 fixture', 'active', true)`;
  await sql`insert into private.platform_api_keys (id, platform_id, name, key_hmac, hmac_key_version, key_prefix, key_suffix, creation_operation_id) values (${keyId}, ${platformId}, 'fixture', ${keyHmac}, 1, 'phk_v1', 'm4-04', ${crypto.randomUUID()})`;
  await sql`insert into public.platform_accounts (id, platform_id, user_id, status) values (${accountId}, ${platformId}, ${userId}, 'active')`;
  await sql`insert into public.platform_file_policies (platform_id, max_file_bytes, max_files, max_total_bytes) values (${platformId}, 64, 10, 640)`;

  const intentResponse = await apiRequest(
    '/functions/v1/account-api/v1/config-files/upload-intent',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'intent-1',
      },
      body: JSON.stringify({
        name: 'config.ini',
        size: 11,
        content_type: 'text/plain',
        purpose: 'config',
      }),
    },
  );
  assertStatus(intentResponse, 201, 'M4-04 upload intent');
  const intent = (await intentResponse.json()).data;
  assert.equal(
    intent.upload_path,
    `/v1/config-files/${intent.file_id}/content`,
  );
  assert.equal(
    'storage_path' in intent,
    false,
    'intent does not expose Storage path',
  );

  const content = Buffer.from('hello world');
  const uploadResponse = await apiRequest(
    `/functions/v1/account-api${intent.upload_path}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(content.byteLength),
        'Idempotency-Key': 'content-1',
      },
      body: content,
    },
  );
  assertStatus(uploadResponse, 202, 'M4-04 content upload');
  const uploaded = (await uploadResponse.json()).data;
  assert.equal(uploaded.status, 'active');
  assert.equal(uploaded.write_outcome, 'confirmed');
  assert.equal(uploaded.size, content.byteLength);
  const [file] =
    await sql`select status, write_outcome, actual_size_bytes, sha256 from public.platform_config_files where id = ${intent.file_id}`;
  assert.deepEqual(
    {
      status: file.status,
      write_outcome: file.write_outcome,
      size: Number(file.actual_size_bytes),
    },
    { status: 'active', write_outcome: 'confirmed', size: content.byteLength },
  );
  const [object] =
    await sql`select name, metadata->>'size' as size from storage.objects where bucket_id = 'platform-config-files' and name like ${`${platformId}/${accountId}/%`}`;
  assert.equal(object.name, `${platformId}/${accountId}/${intent.file_id}`);
  assert.equal(Number(object.size), content.byteLength);

  const sameContentRetry = await apiRequest(
    `/functions/v1/account-api${intent.upload_path}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Idempotency-Key': 'content-2',
      },
      body: content,
    },
  );
  assertStatus(sameContentRetry, 202, 'same content retry');
  const differentContentRetry = await apiRequest(
    `/functions/v1/account-api${intent.upload_path}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Idempotency-Key': 'content-3',
      },
      body: Buffer.from('different'),
    },
  );
  assertStatus(differentContentRetry, 409, 'different content conflict');

  const oversizedIntentResponse = await apiRequest(
    '/functions/v1/account-api/v1/config-files/upload-intent',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'intent-2',
      },
      body: JSON.stringify({
        name: 'too-small.ini',
        size: 4,
        content_type: 'text/plain',
        purpose: 'config',
      }),
    },
  );
  assertStatus(oversizedIntentResponse, 201, 'oversized fixture intent');
  const oversizedIntent = (await oversizedIntentResponse.json()).data;
  const oversized = await apiRequest(
    `/functions/v1/account-api${oversizedIntent.upload_path}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': '5',
        'Idempotency-Key': 'content-4',
      },
      body: Buffer.from('12345'),
    },
  );
  assertStatus(oversized, 413, 'oversized body before Storage');
  const [oversizedFile] =
    await sql`select status, write_outcome from public.platform_config_files where id = ${oversizedIntent.file_id}`;
  assert.deepEqual(
    {
      status: oversizedFile.status,
      write_outcome: oversizedFile.write_outcome,
    },
    { status: 'receiving', write_outcome: 'not_started' },
  );
  const [objectCount] =
    await sql`select count(*)::integer as count from storage.objects where bucket_id = 'platform-config-files' and name like ${`${platformId}/%`}`;
  assert.equal(
    Number(objectCount.count),
    1,
    'rejected body created no second object',
  );

  console.log(
    JSON.stringify({
      boundedUploadAndFinalize: 'PASS',
      storagePathPrivateAndImmutable: 'PASS',
      sameContentRetry: 'PASS',
      differentContentConflict: 'PASS',
      oversizedBeforeStorage: 'PASS',
    }),
  );
} finally {
  await cleanup();
}
