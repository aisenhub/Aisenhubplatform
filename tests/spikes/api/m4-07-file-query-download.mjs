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
  { cwd: root },
);
const status = Object.fromEntries(
  stdout
    .split('\n')
    .map((line) => /^([A-Z0-9_]+)="(.*)"$/u.exec(line))
    .filter(Boolean)
    .map((match) => [match[1], match[2]]),
);
const authUrl = status.API_URL;
const publishableKey = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
const serviceKey = status.SERVICE_ROLE_KEY;
const databaseUrl = status.DB_URL;
const apiUrl = 'http://127.0.0.1:8791';
const platformSecret = 'm4-07-local-platform-secret';
if (!authUrl || !publishableKey || !serviceKey || !databaseUrl)
  throw new Error('M4-07 Local probe requires local status');

const sql = postgres(databaseUrl, {
  max: 4,
  prepare: false,
  onnotice: () => undefined,
});
const platformId = crypto.randomUUID();
const accountId = crypto.randomUUID();
const keyId = crypto.randomUUID();
const otherPlatformId = crypto.randomUUID();
const otherAccountId = crypto.randomUUID();
const otherKeyId = crypto.randomUUID();
const presentedKey = `phk_v1_${keyId}_m4-07-local`;
const otherPresentedKey = `phk_v1_${otherKeyId}_m4-07-local`;
const keyHmac = createHmac('sha256', platformSecret)
  .update(`1:platform-key:${keyId}:${presentedKey}`)
  .digest('hex');
const otherKeyHmac = createHmac('sha256', platformSecret)
  .update(`1:platform-key:${otherKeyId}:${otherPresentedKey}`)
  .digest('hex');
const email = `m4-07-${crypto.randomUUID()}@example.test`;
const password = `M4-07-${randomBytes(16).toString('hex')}!`;
let userId;
let accessToken;
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
async function apiRequest(path, options = {}, key = presentedKey) {
  return fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'X-Platform-Key': key,
      ...(options.headers ?? {}),
    },
  });
}
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
        ACCOUNT_API_PORT: '8791',
      },
      stdio: ['ignore', 'ignore', 'pipe'],
    },
  );
  apiProcess.stderr.on('data', (chunk) => process.stderr.write(chunk));
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(
        `${apiUrl}/functions/v1/account-api/v1/plans`,
        { headers: { 'X-Platform-Key': presentedKey } },
      );
      if (response.status) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('M4-07 Account API did not become ready');
}
async function cleanup() {
  await sql`delete from storage.objects where bucket_id = 'platform-config-files' and name like ${`${platformId}/%`}`.catch(
    () => undefined,
  );
  await sql`delete from public.audit_logs where platform_id in (${platformId}, ${otherPlatformId})`.catch(
    () => undefined,
  );
  await sql`delete from private.idempotency_keys where platform_id in (${platformId}, ${otherPlatformId})`.catch(
    () => undefined,
  );
  await sql`delete from private.file_write_attempts where platform_id in (${platformId}, ${otherPlatformId})`.catch(
    () => undefined,
  );
  await sql`delete from public.platform_config_files where platform_id in (${platformId}, ${otherPlatformId})`.catch(
    () => undefined,
  );
  await sql`delete from public.platform_file_policies where platform_id in (${platformId}, ${otherPlatformId})`.catch(
    () => undefined,
  );
  await sql`delete from public.platform_accounts where id in (${accountId}, ${otherAccountId})`.catch(
    () => undefined,
  );
  await sql`delete from private.platform_api_keys where id in (${keyId}, ${otherKeyId})`.catch(
    () => undefined,
  );
  await sql`delete from public.platforms where id in (${platformId}, ${otherPlatformId})`.catch(
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
  let signup;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    signup = await authRequest('/auth/v1/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (signup.response.status === 200) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assertStatus(signup.response, 200, 'M4-07 signup');
  userId = signup.body?.user?.id;
  accessToken = signup.body?.access_token;
  assert.ok(userId && accessToken, 'M4-07 signup returns a session');
  await sql`grant account_executor to postgres`;
  await sql`insert into public.platforms (id, code, name) values (${platformId}, ${`m4-07-${platformId.slice(0, 8)}`}, 'M4-07 fixture'), (${otherPlatformId}, ${`m4-07-${otherPlatformId.slice(0, 8)}`}, 'M4-07 other')`;
  await sql`insert into private.platform_api_keys (id, platform_id, name, key_hmac, hmac_key_version, key_prefix, key_suffix, creation_operation_id) values (${keyId}, ${platformId}, 'fixture', ${keyHmac}, 1, 'phk_v1', 'm4-07', ${crypto.randomUUID()}), (${otherKeyId}, ${otherPlatformId}, 'other', ${otherKeyHmac}, 1, 'phk_v1', 'm4-07', ${crypto.randomUUID()})`;
  await sql`insert into public.platform_accounts (id, platform_id, user_id) values (${accountId}, ${platformId}, ${userId}), (${otherAccountId}, ${otherPlatformId}, ${userId})`;
  await sql`insert into public.platform_file_policies (platform_id, max_file_bytes, max_files, max_total_bytes) values (${platformId}, 64, 10, 640), (${otherPlatformId}, 64, 10, 640)`;
  const intentResponse = await apiRequest(
    '/functions/v1/account-api/v1/config-files/upload-intent',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'm4-07-intent',
      },
      body: JSON.stringify({
        name: 'safe settings.ini',
        size: 5,
        content_type: 'text/plain',
        purpose: 'config',
      }),
    },
  );
  assertStatus(intentResponse, 201, 'M4-07 intent');
  const fileId = (await intentResponse.json()).data.file_id;
  const upload = await apiRequest(
    `/functions/v1/account-api/v1/config-files/${fileId}/content`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Idempotency-Key': 'm4-07-content',
      },
      body: Buffer.from('hello'),
    },
  );
  assertStatus(upload, 202, 'M4-07 upload');
  const list = await apiRequest(
    '/functions/v1/account-api/v1/config-files?limit=20',
  );
  assertStatus(list, 200, 'M4-07 list');
  const listBody = (await list.json()).data;
  assert.equal(listBody.items[0].file_id, fileId);
  assert.equal(listBody.items[0].reserved_bytes, 5);
  const detail = await apiRequest(
    `/functions/v1/account-api/v1/config-files/${fileId}`,
  );
  assertStatus(detail, 200, 'M4-07 detail');
  assert.equal((await detail.json()).data.status, 'active');
  const download = await apiRequest(
    `/functions/v1/account-api/v1/config-files/${fileId}/content`,
  );
  assertStatus(download, 200, 'M4-07 download');
  assert.equal(
    download.headers.get('content-type'),
    'application/octet-stream',
  );
  assert.match(download.headers.get('content-disposition') ?? '', /attachment/);
  assert.equal(download.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(download.headers.get('cache-control'), 'private, no-store');
  assert.equal(await download.text(), 'hello');
  const crossPlatform = await apiRequest(
    `/functions/v1/account-api/v1/config-files/${fileId}/content`,
    {},
    otherPresentedKey,
  );
  if (crossPlatform.status !== 404)
    console.error(
      'cross-platform response',
      await crossPlatform.clone().text(),
    );
  assertStatus(crossPlatform, 404, 'M4-07 cross platform download');
  await sql`update public.platform_accounts set status = 'suspended' where id = ${accountId}`;
  const suspended = await apiRequest(
    `/functions/v1/account-api/v1/config-files/${fileId}/content`,
  );
  assertStatus(suspended, 403, 'M4-07 suspended download');
  await sql`update public.platform_accounts set status = 'active' where id = ${accountId}`;
  await fetch(
    `${authUrl}/storage/v1/object/platform-config-files/${platformId}/${accountId}/${fileId}`,
    {
      method: 'DELETE',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    },
  );
  const missing = await apiRequest(
    `/functions/v1/account-api/v1/config-files/${fileId}/content`,
  );
  assertStatus(missing, 503, 'M4-07 missing object');
  const [audits] =
    await sql`select count(*)::integer as count from public.audit_logs where platform_id = ${platformId} and event_type in ('file.download_authorized', 'file.download_stream_completed', 'file.download_failed')`;
  assert.ok(
    Number(audits.count) >= 4,
    'download authorization, completion and failure are audited',
  );
  console.log(
    JSON.stringify({
      fileListAndState: 'PASS',
      secureDownload: 'PASS',
      crossTenantAndSuspendedDenied: 'PASS',
      missingObjectAlertAudit: 'PASS',
    }),
  );
} finally {
  await cleanup();
}
