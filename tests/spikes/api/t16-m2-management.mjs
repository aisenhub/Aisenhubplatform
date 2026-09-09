import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { createHmac, randomBytes } from 'node:crypto';
import postgres from 'postgres';

const execFileAsync = promisify(execFile);
const root = process.cwd();
const cli = join(root, 'node_modules', 'supabase', 'dist', 'supabase.js');
const status = Object.fromEntries(
  (
    await execFileAsync(process.execPath, [cli, 'status', '-o', 'env'], {
      cwd: root,
    })
  ).stdout
    .split('\n')
    .map((line) => /^([A-Z0-9_]+)="(.*)"$/u.exec(line))
    .filter((match) => match)
    .map((match) => [match[1], match[2]]),
);
const authUrl = status.API_URL;
const anonKey = status.ANON_KEY;
const serviceKey = status.SERVICE_ROLE_KEY;
const databaseUrl = status.DB_URL;
const apiUrl = 'http://127.0.0.1:8788';
const platformSecret = 't16-local-platform-secret';
if (!authUrl || !anonKey || !serviceKey || !databaseUrl)
  throw new Error('T16 Local management probe requires Supabase status values');

const sql = postgres(databaseUrl, {
  max: 6,
  prepare: false,
  onnotice: () => undefined,
});
const adminEmail = `t16-admin-${crypto.randomUUID()}@example.test`;
const userEmail = `t16-user-${crypto.randomUUID()}@example.test`;
const password = `T16-${randomBytes(16).toString('hex')}!`;
const platformCode = `t16-${crypto.randomUUID()}`;
let adminId;
let userId;
let platformId;
let platformKey;
let proofId;
let oldSystemAdmin;
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
      apikey: anonKey,
      'content-type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  return { response, body: await response.json().catch(() => null) };
}

function decodeBase32(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = value
    .replace(/=+$/u, '')
    .toUpperCase()
    .split('')
    .map((character) =>
      alphabet.indexOf(character).toString(2).padStart(5, '0'),
    )
    .join('');
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8)
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

function totp(secret) {
  const counter = Math.floor(Date.now() / 1000 / 30);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', decodeBase32(secret))
    .update(counterBuffer)
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];
  return String(code % 1_000_000).padStart(6, '0');
}

async function signup(email) {
  const result = await authRequest('/auth/v1/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  assertStatus(result.response, 200, 'Local management signup');
  assert.ok(result.body?.user?.id && result.body?.access_token);
  return { userId: result.body.user.id, accessToken: result.body.access_token };
}

async function promoteAdmin(account) {
  const factor = await authRequest('/auth/v1/factors', {
    method: 'POST',
    headers: { Authorization: `Bearer ${account.accessToken}` },
    body: JSON.stringify({
      factor_type: 'totp',
      friendly_name: 't16-management',
    }),
  });
  assertStatus(factor.response, 200, 'Local management TOTP enrollment');
  const challenge = await authRequest(
    `/auth/v1/factors/${factor.body.id}/challenge`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${account.accessToken}` },
    },
  );
  const verified = await authRequest(
    `/auth/v1/factors/${factor.body.id}/verify`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${account.accessToken}` },
      body: JSON.stringify({
        challenge_id: challenge.body.id,
        code: totp(factor.body.totp.secret),
      }),
    },
  );
  assertStatus(verified.response, 200, 'Local management TOTP verification');
  return { accessToken: verified.body.access_token, factorId: factor.body.id };
}

async function apiRequest(path, options = {}) {
  return fetch(`${apiUrl}${path}`, {
    ...options,
    headers: { ...(options.headers ?? {}) },
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
        SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
        ACCOUNT_API_DB_URL: databaseUrl,
        PLATFORM_KEY_HMAC_SECRET: platformSecret,
        ACCOUNT_API_PORT: '8788',
      },
      stdio: 'ignore',
    },
  );
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(
        `${apiUrl}/functions/v1/account-api/admin/api/v1/platforms`,
        {
          headers: { Authorization: 'invalid' },
        },
      );
      if (response.status) return;
    } catch {
      // The local Deno process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('T16 Local Account API did not become ready');
}

async function cleanup() {
  if (platformId) {
    await sql`delete from public.audit_logs where platform_id = ${platformId}`.catch(
      () => undefined,
    );
    await sql`delete from public.platform_accounts where platform_id = ${platformId}`.catch(
      () => undefined,
    );
    await sql`delete from public.platform_auth_origins where platform_id = ${platformId}`.catch(
      () => undefined,
    );
    await sql`delete from private.platform_api_keys where platform_id = ${platformId}`.catch(
      () => undefined,
    );
    await sql`delete from public.platforms where id = ${platformId}`.catch(
      () => undefined,
    );
  }
  if (proofId)
    await sql`delete from private.admin_step_up where id = ${proofId}`.catch(
      () => undefined,
    );
  if (oldSystemAdmin)
    await sql`update private.system_admin set user_id = ${oldSystemAdmin} where singleton_id = 1`.catch(
      () => undefined,
    );
  else
    await sql`delete from private.system_admin where singleton_id = 1`.catch(
      () => undefined,
    );
  for (const id of [adminId, userId]) {
    if (id)
      await fetch(`${authUrl}/auth/v1/admin/users/${id}`, {
        method: 'DELETE',
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      }).catch(() => undefined);
  }
  await sql.end({ timeout: 5 }).catch(() => undefined);
  if (apiProcess && !apiProcess.killed) apiProcess.kill();
}

try {
  await startApi();
  const admin = await signup(adminEmail);
  adminId = admin.userId;
  const user = await signup(userEmail);
  userId = user.userId;
  const elevated = await promoteAdmin(admin);
  const [existing] =
    await sql`select user_id from private.system_admin where singleton_id = 1`;
  oldSystemAdmin = existing?.user_id ?? null;
  await sql`grant admin_executor to postgres`;
  await sql`grant account_executor to postgres`;
  await sql`insert into private.system_admin (user_id) values (${adminId}) on conflict (singleton_id) do update set user_id = excluded.user_id`;

  const authHeaders = { Authorization: `Bearer ${elevated.accessToken}` };
  const createPlatform = await apiRequest(
    '/functions/v1/account-api/admin/api/v1/platforms',
    {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: platformCode,
        name: 'T16 Management',
        status: 'active',
        allow_activation: true,
      }),
    },
  );
  assertStatus(createPlatform, 201, 'Admin platform create');
  platformId = (await createPlatform.json()).data.platform_id;
  assert.match(platformId, /^[0-9a-f-]{36}$/iu);

  const list = await apiRequest(
    '/functions/v1/account-api/admin/api/v1/platforms',
    { headers: authHeaders },
  );
  assertStatus(list, 200, 'Admin platform list');
  assert.ok(
    (await list.json()).data.some((item) => item.platform_id === platformId),
  );
  const detail = await apiRequest(
    `/functions/v1/account-api/admin/api/v1/platforms/${platformId}`,
    { headers: authHeaders },
  );
  assertStatus(detail, 200, 'Admin platform detail');
  assert.equal((await detail.json()).data.code, platformCode);

  const origin = await apiRequest(
    `/functions/v1/account-api/admin/api/v1/platforms/${platformId}/origins`,
    {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        environment: 'local',
        origin: 'http://localhost:3000',
        oauth_callback_url: 'http://localhost:3000/auth/callback',
        password_reset_url: 'http://localhost:3000/update-password',
        email_confirmation_url: 'http://localhost:3000/auth/confirm',
      }),
    },
  );
  assertStatus(origin, 201, 'Admin origin create');

  const proof = await apiRequest(
    '/functions/v1/account-api/admin/api/v1/auth/recent-proof',
    {
      method: 'POST',
      headers: { ...authHeaders, 'X-Mfa-Factor-Id': elevated.factorId },
    },
  );
  assertStatus(proof, 201, 'Admin recent proof');
  proofId = (await proof.json()).data.proof_id;
  const key = await apiRequest(
    `/functions/v1/account-api/admin/api/v1/platforms/${platformId}/keys`,
    {
      method: 'POST',
      headers: {
        ...authHeaders,
        'X-Recent-Auth-Proof': proofId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'T16 BFF key' }),
    },
  );
  assertStatus(key, 201, 'Admin platform key create');
  const keyBody = await key.json();
  platformKey = keyBody.data.presented_key;
  assert.match(platformKey, /^phk_v1_/u);
  assert.equal(keyBody.data.key_hmac, undefined);
  const keys = await apiRequest(
    `/functions/v1/account-api/admin/api/v1/platforms/${platformId}/keys`,
    { headers: authHeaders },
  );
  assertStatus(keys, 200, 'Admin platform key list');
  assert.equal((await keys.json()).data[0].presented_key, undefined);

  const activate = await apiRequest(
    '/functions/v1/account-api/v1/account/activate',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user.accessToken}`,
        'X-Platform-Key': platformKey,
      },
    },
  );
  assertStatus(activate, 200, 'M2 user activate');
  const accountId = (await activate.json()).data.platform_account_id;
  const accounts = await apiRequest(
    `/functions/v1/account-api/admin/api/v1/platforms/${platformId}/accounts`,
    { headers: authHeaders },
  );
  assertStatus(accounts, 200, 'Admin account list');
  assert.ok(
    (await accounts.json()).data.some(
      (item) => item.platform_account_id === accountId,
    ),
  );
  const suspend = await apiRequest(
    `/functions/v1/account-api/admin/api/v1/platforms/${platformId}/accounts/${accountId}/suspend`,
    {
      method: 'POST',
      headers: { ...authHeaders, 'X-Recent-Auth-Proof': proofId },
      body: '{}',
    },
  );
  assertStatus(suspend, 200, 'Admin account suspend');
  assert.equal((await suspend.json()).data.account_status, 'suspended');
  const restore = await apiRequest(
    `/functions/v1/account-api/admin/api/v1/platforms/${platformId}/accounts/${accountId}/restore`,
    {
      method: 'POST',
      headers: authHeaders,
      body: '{}',
    },
  );
  assertStatus(restore, 200, 'Admin account restore');
  const close = await apiRequest(
    `/functions/v1/account-api/admin/api/v1/platforms/${platformId}/accounts/${accountId}/close`,
    {
      method: 'POST',
      headers: { ...authHeaders, 'X-Recent-Auth-Proof': proofId },
      body: '{}',
    },
  );
  assertStatus(close, 202, 'Admin account close');
  assert.equal((await close.json()).data.account_status, 'closed');
  console.log(
    JSON.stringify({
      platform: 'PASS',
      origin: 'PASS',
      keyIssue: 'PASS',
      keySecretNotListed: 'PASS',
      accountList: 'PASS',
      accountSuspendRestoreClose: 'PASS',
    }),
  );
} finally {
  await cleanup();
}
