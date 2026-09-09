import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import postgres from 'postgres';

const execFileAsync = promisify(execFile);
const repositoryRoot = process.cwd();
const require = createRequire(import.meta.url);
const playwrightStore = join(repositoryRoot, 'node_modules', '.pnpm');
const playwrightPackage = readdirSync(playwrightStore).find((name) =>
  /^playwright@\d/u.test(name),
);
if (!playwrightPackage)
  throw new Error('Playwright package is not installed in the workspace');
const { chromium } = require(
  join(playwrightStore, playwrightPackage, 'node_modules', 'playwright'),
);

const localStatus = await (async () => {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      join(repositoryRoot, 'node_modules', 'supabase', 'dist', 'supabase.js'),
      'status',
      '-o',
      'env',
    ],
    { cwd: repositoryRoot },
  );
  return Object.fromEntries(
    stdout
      .split('\n')
      .map((line) => /^([A-Z0-9_]+)="(.*)"$/u.exec(line))
      .filter((match) => match)
      .map((match) => [match[1], match[2]]),
  );
})();

const authUrl = localStatus.API_URL;
const anonKey = localStatus.ANON_KEY;
const publishableKey = localStatus.PUBLISHABLE_KEY;
const databaseUrl = localStatus.DB_URL;
const platformSecret =
  process.env.T16_PLATFORM_KEY_HMAC_SECRET ??
  'local-fixture-only-t16-r2-not-a-credential';
const redemptionSecret =
  process.env.T16_REDEMPTION_HMAC_SECRET ??
  'local-fixture-only-t16-r2-redemption-not-a-credential';
const mailpitContainer =
  process.env.SUPABASE_MAILPIT_CONTAINER ??
  'supabase_inbucket_aisenhub-platform-auth-local';
const centralUrl = 'http://127.0.0.1:8789';
const consumerAUrl = 'http://127.0.0.1:3110';
const consumerBUrl = 'http://127.0.0.1:3111';
const adminUrl = 'http://127.0.0.1:3112';
const denoPath = 'D:\\APP\\Codex\\Deno\\bin\\deno.exe';
const consumerDirectory = process.env.T16_CONSUMER_DIR?.trim() ?? '';

if (!authUrl || !anonKey || !publishableKey || !databaseUrl)
  throw new Error(
    'T16 browser probe requires Local Supabase status with Auth, publishable key and database URL',
  );

const sql = postgres(databaseUrl, {
  max: 6,
  prepare: false,
  onnotice: () => undefined,
});
const userEmail = `t16-r2-user-${crypto.randomUUID()}@example.test`;
const adminEmail = `t16-r2-admin-${crypto.randomUUID()}@example.test`;
const userPassword = `T16-R2-user-${randomBytes(16).toString('hex')}!`;
const adminPassword = `T16-R2-admin-${randomBytes(16).toString('hex')}!`;
const platformAId = crypto.randomUUID();
const platformBId = crypto.randomUUID();
const planAId = crypto.randomUUID();
const planBId = crypto.randomUUID();
const paidPlanAId = crypto.randomUUID();
const paidPlanBId = crypto.randomUUID();
const batchAId = crypto.randomUUID();
const batchBId = crypto.randomUUID();
const codeAId = crypto.randomUUID();
const codeBId = crypto.randomUUID();
const keyAId = crypto.randomUUID();
const keyBId = crypto.randomUUID();
const platformACode = `t16-r2-a-${platformAId.slice(0, 8)}`;
const platformBCode = `t16-r2-b-${platformBId.slice(0, 8)}`;
const presentedKeyA = `phk_v1_${keyAId}_t16-r2-a`;
const presentedKeyB = `phk_v1_${keyBId}_t16-r2-b`;
const redemptionCodeA = 'T6R2A23456789';
const redemptionCodeB = 'T6R2B23456789';
const keyHmac = (keyId, presentedKey) =>
  createHmac('sha256', platformSecret)
    .update(`1:platform-key:${keyId}:${presentedKey}`)
    .digest('hex');
const redemptionHmac = (platformId, code) =>
  createHmac('sha256', redemptionSecret)
    .update(
      `redeem:v1:platform:${platformId}:key:1:code:${code.replaceAll('-', '')}`,
    )
    .digest('hex');
let userId;
let adminId;
let previousSystemAdmin;
let browser;
const processes = [];
let cleaningUp = false;

function assertStatus(actual, expected, label) {
  assert.equal(
    actual,
    expected,
    `${label}: expected ${expected}, got ${actual}`,
  );
}

function decodeBase32(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = value
    .replace(/=+$/u, '')
    .toUpperCase()
    .split('')
    .map((character) => {
      const index = alphabet.indexOf(character);
      assert.notEqual(index, -1, 'TOTP secret must be valid base32');
      return index.toString(2).padStart(5, '0');
    })
    .join('');
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8)
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

function totp(secret, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 1000 / 30);
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

async function waitForUrl(url, label) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.status) return;
    } catch {
      // The process is still starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error(`${label} did not become ready`);
}

function startProcess(command, args, env, label) {
  const isWindowsCommand = command.endsWith('.cmd');
  const child = spawn(
    isWindowsCommand ? (process.env.ComSpec ?? 'cmd.exe') : command,
    isWindowsCommand ? ['/d', '/s', '/c', [command, ...args].join(' ')] : args,
    {
      cwd: repositoryRoot,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let output = '';
  child.stdout?.on('data', (chunk) => {
    output = `${output}${chunk}`.slice(-4000);
  });
  child.stderr?.on('data', (chunk) => {
    output = `${output}${chunk}`.slice(-4000);
  });
  processes.push(child);
  child.once('exit', (code) => {
    if (!cleaningUp && code !== null && code !== 0)
      console.error(
        `${label} exited before cleanup with code ${code}: ${output}`,
      );
  });
  return child;
}

async function startLocalServices() {
  startProcess(
    denoPath,
    [
      'run',
      '--allow-env',
      '--allow-net',
      '--allow-read',
      '--allow-import',
      'supabase/functions/account-api/index.ts',
    ],
    {
      SUPABASE_URL: authUrl,
      SUPABASE_PUBLISHABLE_KEY: publishableKey,
      SUPABASE_SECRET_KEY: localStatus.SERVICE_ROLE_KEY,
      ACCOUNT_API_DB_URL: databaseUrl,
      PLATFORM_KEY_HMAC_SECRET: platformSecret,
      REDEMPTION_HMAC_SECRET: redemptionSecret,
      REDEMPTION_HMAC_KEY_VERSION: '1',
      ACCOUNT_API_PORT: '8789',
    },
    'Account API',
  );
  await waitForUrl(
    `${centralUrl}/functions/v1/account-api/v1/plans`,
    'Account API',
  );

  const appEnv = {
    SUPABASE_URL: authUrl,
    SUPABASE_PUBLISHABLE_KEY: publishableKey,
    ACCOUNT_API_URL: centralUrl,
    NODE_ENV: process.env.T16_NODE_ENV ?? 'development',
  };
  const consumerStartArgs = consumerDirectory
    ? ['--dir', consumerDirectory, 'start']
    : ['--filter', 'template-preview', 'start'];
  startProcess(
    'pnpm.cmd',
    consumerStartArgs,
    {
      ...appEnv,
      PORT: '3110',
      PLATFORM_KEY: presentedKeyA,
      CONSUMER_ORIGIN: consumerAUrl,
    },
    'Consumer A',
  );
  startProcess(
    'pnpm.cmd',
    consumerStartArgs,
    {
      ...appEnv,
      PORT: '3111',
      PLATFORM_KEY: presentedKeyB,
      CONSUMER_ORIGIN: consumerBUrl,
    },
    'Consumer B',
  );
  startProcess(
    'pnpm.cmd',
    ['--filter', 'admin', 'start'],
    { ...appEnv, PORT: '3112', ADMIN_ORIGIN: adminUrl },
    'Admin',
  );
  await Promise.all([
    waitForUrl(`${consumerAUrl}/login`, 'Consumer A'),
    waitForUrl(`${consumerBUrl}/login`, 'Consumer B'),
    waitForUrl(`${adminUrl}/admin/login`, 'Admin'),
  ]);
}

async function signup(email, password) {
  const result = await authRequest('/auth/v1/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  assertStatus(result.response.status, 200, `signup ${email}`);
  const id = result.body?.user?.id;
  const accessToken = result.body?.access_token;
  assert.ok(id && accessToken, 'signup must return user and session');
  return { id, accessToken };
}

async function enrollTotp(accessToken, email) {
  const enroll = await authRequest('/auth/v1/factors', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ factor_type: 'totp', friendly_name: email }),
  });
  assertStatus(enroll.response.status, 200, 'TOTP enrollment');
  const factorId = enroll.body?.id;
  const secret = enroll.body?.totp?.secret;
  assert.ok(
    factorId && secret,
    'TOTP enrollment must return factor and secret',
  );
  const challenge = await authRequest(
    `/auth/v1/factors/${factorId}/challenge`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: '{}',
    },
  );
  assertStatus(challenge.response.status, 200, 'TOTP challenge');
  const verify = await authRequest(`/auth/v1/factors/${factorId}/verify`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      challenge_id: challenge.body?.id,
      code: totp(secret),
    }),
  });
  assertStatus(verify.response.status, 200, 'TOTP verification');
  return { factorId, secret };
}

async function createFixtures() {
  const user = await signup(userEmail, userPassword);
  userId = user.id;
  const admin = await signup(adminEmail, adminPassword);
  adminId = admin.id;
  const adminTotp = await enrollTotp(admin.accessToken, adminEmail);
  const [systemAdmin] = await sql`
    select user_id from private.system_admin where singleton_id = 1
  `;
  previousSystemAdmin = systemAdmin?.user_id ?? null;
  await sql`grant account_executor to postgres`;
  await sql`grant admin_executor to postgres`;
  await sql`
    insert into private.system_admin (user_id)
    values (${adminId})
    on conflict (singleton_id) do update set user_id = excluded.user_id
  `;
  for (const [
    id,
    code,
    planId,
    paidPlanId,
    keyId,
    presentedKey,
    name,
    batchId,
    redemptionCode,
    redemptionCodeId,
  ] of [
    [
      platformAId,
      platformACode,
      planAId,
      paidPlanAId,
      keyAId,
      presentedKeyA,
      'T16 R2 A',
      batchAId,
      redemptionCodeA,
      codeAId,
    ],
    [
      platformBId,
      platformBCode,
      planBId,
      paidPlanBId,
      keyBId,
      presentedKeyB,
      'T16 R2 B',
      batchBId,
      redemptionCodeB,
      codeBId,
    ],
  ]) {
    await sql`
      insert into public.platforms (id, code, name, status, allow_activation)
      values (${id}, ${code}, ${name}, 'active', true)
    `;
    await sql`
      insert into public.plans (id, platform_id, code, name, kind, features)
      values
        (${planId}, ${id}, 'free', 'Free', 'free', ${sql.json({})}),
        (${paidPlanId}, ${id}, 'pro', 'Pro', 'paid', ${sql.json({ quota: 10 })})
    `;
    await sql`update public.platforms set default_plan_id = ${planId} where id = ${id}`;
    await sql`
      insert into private.platform_api_keys
        (id, platform_id, name, key_hmac, hmac_key_version, key_prefix, key_suffix, creation_operation_id)
      values
        (${keyId}, ${id}, ${name}, ${keyHmac(keyId, presentedKey)}, 1, 'phk_v1', ${presentedKey.slice(-8)}, ${crypto.randomUUID()})
    `;
    await sql`
      insert into public.redemption_code_batches
        (id, platform_id, plan_id, name, quantity, duration_value, duration_unit,
         expires_at, status, delivery_deadline, delivered_at, delivery_session_id,
         delivery_receipt_hmac, created_by, creation_operation_id)
      values
        (${batchId}, ${id}, ${paidPlanId}, 'T16 R2 browser fixture', 1, 30, 'day',
         now() + interval '30 days', 'active', now() + interval '1 day', now(),
         ${crypto.randomUUID()}, ${createHmac('sha256', redemptionSecret)
           .update(`delivery:v1:platform:${id}:receipt:${batchId}`)
           .digest('hex')}, ${adminId}, ${crypto.randomUUID()})
    `;
    await sql`
      insert into public.redemption_codes
        (id, platform_id, batch_id, plan_id, code_hmac, hmac_key_version,
         code_prefix, code_suffix)
      values
        (${redemptionCodeId}, ${id}, ${batchId}, ${paidPlanId},
         ${redemptionHmac(id, redemptionCode)}, 1,
         ${redemptionCode.slice(0, 8)}, ${redemptionCode.slice(-4)})
    `;
    await sql`
      insert into public.platform_file_policies
        (platform_id, max_file_bytes, max_files, max_total_bytes)
      values (${id}, 64, 10, 640)
    `;
  }
  return adminTotp;
}

function csrfToken(page) {
  return page.evaluate(
    () =>
      document.cookie
        .split('; ')
        .find((entry) => entry.startsWith('aisenhub-consumer-csrf='))
        ?.split('=')[1] ?? '',
  );
}

async function browserRequest(page, path, options = {}) {
  return page.evaluate(
    async ({ path: requestPath, method, body, headers }) => {
      const response = await fetch(requestPath, {
        method,
        headers,
        body,
        credentials: 'same-origin',
        signal: AbortSignal.timeout(10_000),
      });
      const text = await response.text();
      let payload = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = { raw: text };
      }
      return {
        status: response.status,
        payload,
        headers: Object.fromEntries(response.headers.entries()),
      };
    },
    {
      path,
      method: options.method ?? 'GET',
      body: options.body,
      headers: options.headers ?? { Accept: 'application/json' },
    },
  );
}

async function loginConsumer(page, baseUrl, platformId) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('邮箱').fill(userEmail);
  await page.getByLabel('密码').fill(userPassword);
  const [response] = await Promise.all([
    page.waitForResponse((item) => item.url().endsWith('/api/auth/login')),
    page.getByRole('button', { name: '登录' }).click(),
  ]);
  assertStatus(response.status(), 200, `consumer login ${baseUrl}`);
  await page.waitForURL(/\/subscription$/u, { waitUntil: 'domcontentloaded' });
  const csrf = await csrfToken(page);
  const activated = await browserRequest(page, '/api/v1/account/activate', {
    method: 'POST',
    headers: {
      Origin: baseUrl,
      'X-CSRF-Token': csrf,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  assertStatus(activated.status, 200, `activate ${baseUrl}`);
  const principal = await browserRequest(page, '/api/v1/account/principal');
  assertStatus(principal.status, 200, `principal ${baseUrl}`);
  assert.equal(principal.payload?.data?.platform_id, platformId);
  assert.equal(principal.payload?.data?.account_status, 'active');
}

async function exercisePublicTemplateRoutes(page, baseUrl) {
  const routes = [
    ['/', 'Consumer application shell'],
    ['/pricing', 'Plans are public, account data is not.'],
    ['/login', 'Consumer login'],
    ['/signup', 'Create account'],
    ['/forgot-password', 'Forgot password'],
    ['/update-password', 'Set new password'],
  ];
  for (const [path, heading] of routes) {
    const response = await page.goto(`${baseUrl}${path}`, {
      waitUntil: 'domcontentloaded',
    });
    assert.equal(response?.status(), 200, `template route ${path}`);
    await page.getByRole('heading', { name: heading, exact: true }).waitFor();
  }
}

async function exerciseAuthResponsive(page, baseUrl, routes) {
  for (const width of [320, 375, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of routes) {
      const response = await page.goto(`${baseUrl}${path}`, {
        waitUntil: 'domcontentloaded',
      });
      assert.equal(
        response?.status(),
        200,
        `responsive route ${path} at ${width}px`,
      );
      const metrics = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      assert.ok(
        metrics.scrollWidth <= metrics.clientWidth + 1,
        `horizontal overflow at ${width}px on ${path}`,
      );
      await page.keyboard.press('Tab');
      assert.notEqual(
        await page.evaluate(() => document.activeElement?.tagName),
        'BODY',
        `keyboard focus did not enter the form at ${width}px on ${path}`,
      );
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

async function exerciseAuthenticatedTemplateRoutes(page, baseUrl) {
  const routes = [
    ['/subscription', 'Subscription'],
    ['/account', 'Account settings'],
    ['/files', 'Configuration files'],
  ];
  for (const [path, heading] of routes) {
    const response = await page.goto(`${baseUrl}${path}`, {
      waitUntil: 'domcontentloaded',
    });
    assert.equal(
      response?.status(),
      200,
      `authenticated template route ${path}`,
    );
    await page.getByRole('heading', { name: heading, exact: true }).waitFor();
  }
}

async function readMailpitToken(email) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const { stdout } = await execFileAsync('docker', [
      'exec',
      mailpitContainer,
      'wget',
      '-qO-',
      'http://127.0.0.1:8025/api/v1/messages',
    ]);
    const messages = JSON.parse(stdout).messages ?? [];
    const message = messages.find((item) =>
      item.To?.some((recipient) => recipient.Address === email),
    );
    if (message?.ID) {
      const { stdout: raw } = await execFileAsync('docker', [
        'exec',
        mailpitContainer,
        'wget',
        '-qO-',
        `http://127.0.0.1:8025/api/v1/message/${message.ID}`,
      ]);
      const tokenHash = /token_hash=([A-Za-z0-9._~-]+)/u.exec(raw)?.[1];
      if (tokenHash) return tokenHash;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error(
    `Local Mailpit did not produce an email token_hash for ${email}`,
  );
}

async function exerciseSubscriptionAndFiles(page, baseUrl, redemptionCode) {
  const csrf = await csrfToken(page);
  const beforeRedeem = await browserRequest(page, '/api/v1/subscription');
  assertStatus(beforeRedeem.status, 200, 'subscription read');
  assert.equal(beforeRedeem.payload?.data?.plan?.code, 'free');

  const redeemed = await browserRequest(page, '/api/v1/subscription/redeem', {
    method: 'POST',
    headers: {
      Origin: baseUrl,
      'X-CSRF-Token': csrf,
      'Content-Type': 'application/json',
      'Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify({ code: redemptionCode }),
  });
  assertStatus(redeemed.status, 200, 'subscription redeem');
  assert.equal(redeemed.payload?.data?.plan?.code, 'pro');

  const content = 't16-r2 browser file';
  const intent = await browserRequest(
    page,
    '/api/v1/config-files/upload-intent',
    {
      method: 'POST',
      headers: {
        Origin: baseUrl,
        'X-CSRF-Token': csrf,
        'Content-Type': 'application/json',
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        name: 't16-r2.ini',
        size: content.length,
        content_type: 'text/plain',
        purpose: 'config',
      }),
    },
  );
  assertStatus(intent.status, 201, 'file upload intent');
  const fileId = intent.payload?.data?.file_id;
  const uploadPath = intent.payload?.data?.upload_path;
  assert.ok(
    fileId && uploadPath,
    'file upload intent returns private file path',
  );

  const upload = await browserRequest(page, `/api${uploadPath}`, {
    method: 'PUT',
    headers: {
      Origin: baseUrl,
      'X-CSRF-Token': csrf,
      'Content-Type': 'application/octet-stream',
      'Idempotency-Key': crypto.randomUUID(),
    },
    body: content,
  });
  assertStatus(upload.status, 202, 'file content upload');
  assert.equal(upload.payload?.data?.write_outcome, 'confirmed');
  assert.equal(upload.payload?.data?.status, 'active');

  const listed = await browserRequest(page, '/api/v1/config-files?limit=20');
  assertStatus(listed.status, 200, 'file list');
  assert.ok(
    listed.payload?.data?.items?.some((item) => item.file_id === fileId),
    'uploaded file is listed through the BFF',
  );
  await page.goto(`${baseUrl}/files`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Configuration files' }).waitFor();
  await page.getByRole('heading', { name: 'Budget status' }).waitFor();
  await page
    .getByText(/已占用 · .*可用/u)
    .first()
    .waitFor();
  const fileRow = page.locator('.file-row').filter({ hasText: 't16-r2.ini' });
  await fileRow.getByRole('button', { name: '删除', exact: true }).waitFor();
  const downloaded = await browserRequest(
    page,
    `/api/v1/config-files/${fileId}/content`,
  );
  assertStatus(downloaded.status, 200, 'file download');
  assert.equal(downloaded.payload?.raw, content);

  const [removed] = await Promise.all([
    page.waitForResponse((item) =>
      item.url().endsWith(`/api/v1/config-files/${fileId}`),
    ),
    fileRow.getByRole('button', { name: '删除', exact: true }).click(),
  ]);
  assertStatus(removed.status(), 202, 'file delete request');
  await page
    .getByText(
      '删除请求已接受；deleting 期间预算仍占用，确认完成前不会显示为已释放。',
      { exact: true },
    )
    .waitFor();
}

async function exerciseAccount(page, baseUrl) {
  await page.goto(`${baseUrl}/account`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Account settings' }).waitFor();
  await page.getByLabel('显示名称').fill('T16 R2 browser user');
  await page.getByLabel('简介').fill('Local browser regression');
  const [profileResponse] = await Promise.all([
    page.waitForResponse((item) => item.url().endsWith('/api/v1/profile')),
    page.getByRole('button', { name: '保存资料' }).click(),
  ]);
  assertStatus(profileResponse.status(), 200, 'browser Profile PATCH');

  await page
    .getByLabel('JSON Merge Patch')
    .fill('{"theme":"dark","browser":true}');
  const [preferencesResponse] = await Promise.all([
    page.waitForResponse((item) => item.url().endsWith('/api/v1/preferences')),
    page.getByRole('button', { name: '保存偏好' }).click(),
  ]);
  assertStatus(preferencesResponse.status(), 200, 'browser Preferences PATCH');

  const csrf = await csrfToken(page);
  const noCsrf = await browserRequest(page, '/api/v1/profile', {
    method: 'PATCH',
    headers: { Origin: baseUrl, 'Content-Type': 'application/json' },
    body: JSON.stringify({ bio: 'must reject' }),
  });
  assertStatus(noCsrf.status, 403, 'CSRF rejection');

  const stale = await browserRequest(page, '/api/v1/profile', {
    method: 'PATCH',
    headers: {
      Origin: baseUrl,
      'X-CSRF-Token': csrf,
      'Content-Type': 'application/json',
      'If-Match': 'W/"0"',
    },
    body: JSON.stringify({ bio: 'must reject' }),
  });
  assertStatus(stale.status, 412, 'stale profile ETag rejection');

  const requested = await browserRequest(page, '/api/auth/reauth/start', {
    method: 'POST',
    headers: {
      Origin: baseUrl,
      'X-CSRF-Token': csrf,
      'Content-Type': 'application/json',
    },
  });
  assertStatus(requested.status, 200, 'consumer email reauth request');
  const tokenHash = await readMailpitToken(userEmail);
  await page.getByPlaceholder('粘贴 token_hash').fill(tokenHash);
  const [verifiedResponse] = await Promise.all([
    page.waitForResponse((item) =>
      item.url().endsWith('/api/auth/reauth/verify'),
    ),
    page.getByRole('button', { name: '验证并签发 proof' }).click(),
  ]);
  assertStatus(verifiedResponse.status(), 200, 'consumer email reauth verify');
  const cookies = await page.context().cookies();
  const proof = cookies.find(
    (cookie) => cookie.name === 'aisenhub-consumer-recent-auth-proof',
  );
  assert.ok(proof?.httpOnly, 'consumer proof must be HttpOnly');
  assert.equal(proof?.sameSite, 'Strict');

  const deleteRequest = await browserRequest(
    page,
    '/api/v1/identity/delete-request',
    {
      method: 'POST',
      headers: {
        Origin: baseUrl,
        'X-CSRF-Token': csrf,
        'Content-Type': 'application/json',
      },
      body: '{}',
    },
  );
  assertStatus(deleteRequest.status, 202, 'global delete request');
  const close = await browserRequest(page, '/api/v1/account/close', {
    method: 'POST',
    headers: {
      Origin: baseUrl,
      'X-CSRF-Token': csrf,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  assertStatus(close.status, 200, 'consumer account close');
  const protectedAfterClose = await browserRequest(page, '/api/v1/profile');
  assertStatus(
    protectedAfterClose.status,
    403,
    'closed account protected route',
  );
}

async function exerciseAdmin(page, adminTotp) {
  await page.goto(`${adminUrl}/admin/login`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('管理员邮箱').fill(adminEmail);
  await page.getByLabel('密码').fill(adminPassword);
  const [loginResponse] = await Promise.all([
    page.waitForResponse((item) => item.url().endsWith('/api/auth/login')),
    page.getByRole('button', { name: '登录' }).click(),
  ]);
  assertStatus(loginResponse.status(), 200, 'admin browser login');
  await page.waitForURL(/\/admin\/mfa$/u, { waitUntil: 'domcontentloaded' });
  await page
    .getByText('请输入认证器中的 6 位验证码。', { exact: true })
    .waitFor({ state: 'visible' });
  const aal1 = await browserRequest(
    page,
    `/api/v1/admin/api/v1/platforms/${platformAId}`,
  );
  assertStatus(aal1.status, 403, 'Admin AAL1 rejection');
  assert.equal(aal1.payload?.error?.code, 'MFA_REQUIRED');
  await page.getByLabel('验证码').fill(totp(adminTotp.secret));
  await page.getByRole('button', { name: '验证并继续' }).click();
  await page.waitForURL(/\/admin$/u, { waitUntil: 'domcontentloaded' });
  await page.goto(`${adminUrl}/admin/platforms`, {
    waitUntil: 'domcontentloaded',
  });
  await page.getByRole('heading', { name: 'Platform operations' }).waitFor();
  await page.getByRole('button', { name: platformACode, exact: true }).click();
  await page.waitForTimeout(1_000);
  await page
    .getByLabel('账户状态操作原因（必填，勿含个人信息）')
    .fill('T16 R2 browser suspend');
  const accountRow = page.locator('li').filter({ hasText: userId });
  await accountRow.getByRole('button', { name: '暂停', exact: true }).waitFor();
  const [suspendRequest] = await Promise.all([
    page.waitForRequest((item) => item.url().includes(`/accounts/`)),
    accountRow.getByRole('button', { name: '暂停', exact: true }).click(),
  ]);
  const suspendResponse = await suspendRequest.response();
  assert.ok(suspendResponse, 'Admin account suspend must return a response');
  assertStatus(suspendResponse.status(), 200, 'Admin account suspend');
  const audit = await browserRequest(
    page,
    '/api/v1/admin/api/v1/audit?q=account&limit=20',
  );
  assertStatus(audit.status, 200, 'Admin audit list');
  assert.ok(
    audit.payload?.data?.some((entry) => entry.action === 'account.suspend'),
    'Admin audit must expose the suspended account event without raw metadata',
  );
  await page.goto(`${adminUrl}/admin/entitlements`, {
    waitUntil: 'domcontentloaded',
  });
  await page.getByRole('heading', { name: 'Entitlements console' }).waitFor();
  await page.getByLabel('Platform ID').fill(platformAId);
  await page.getByRole('button', { name: '加载', exact: true }).click();
  await page.locator('#batch-plan').waitFor();
  await page.locator('#batch-plan').selectOption(paidPlanAId);
  await page.getByLabel('Batch name').fill('T16 R2 UI batch');
  await page.getByLabel('Batch quantity').fill('1');
  const [createBatchResponse] = await Promise.all([
    page.waitForResponse((item) =>
      item.url().endsWith('/api/v1/admin/api/v1/redemption-batches'),
    ),
    page
      .getByRole('button', { name: '生成 pending 批次（需近期 MFA）' })
      .click(),
  ]);
  assertStatus(createBatchResponse.status(), 201, 'Admin batch create UI');
  await page.getByText('仅本次响应显示的明文码', { exact: true }).waitFor();
  await page
    .getByText(
      '批次已创建为 pending_delivery；明文码仅在当前响应显示，先保存再确认交付。',
      { exact: true },
    )
    .waitFor();
  page.once('dialog', (dialog) => dialog.accept());
  const [confirmBatchResponse] = await Promise.all([
    page.waitForResponse((item) => item.url().includes('/confirm-delivery')),
    page
      .getByRole('button', { name: '确认 T16 R2 UI batch 已保存并交付' })
      .click(),
  ]);
  assertStatus(confirmBatchResponse.status(), 200, 'Admin batch confirm UI');
  await page
    .getByText('批次已确认交付；页面已清除本次明文码和 receipt。', {
      exact: true,
    })
    .waitFor();
  await page.getByText('仅本次响应显示的明文码', { exact: true }).waitFor({
    state: 'detached',
  });
  await page.waitForTimeout(250);
  return accountRow;
}

async function scanBrowserBundles() {
  const forbidden =
    /PLATFORM_KEY|PLATFORM_KEY_HMAC_SECRET|ACCOUNT_API_DB_URL|SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/iu;
  for (const app of [
    consumerDirectory || 'apps/template-preview',
    'apps/admin',
  ]) {
    const root = resolve(repositoryRoot, app, '.next', 'static');
    const stack = [root];
    while (stack.length) {
      const current = stack.pop();
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const path = join(current, entry.name);
        if (entry.isDirectory()) stack.push(path);
        else if (forbidden.test(readFileSync(path, 'utf8')))
          throw new Error(
            `server credential marker found in browser bundle: ${path}`,
          );
      }
    }
  }
}

async function cleanup() {
  cleaningUp = true;
  await sql`delete from public.audit_logs where platform_id = ${platformAId} or platform_id = ${platformBId}`.catch(
    () => undefined,
  );
  await sql`delete from public.subscription_events where platform_id = ${platformAId} or platform_id = ${platformBId}`.catch(
    () => undefined,
  );
  await sql`delete from public.subscription_grants where platform_id = ${platformAId} or platform_id = ${platformBId}`.catch(
    () => undefined,
  );
  await sql`delete from public.redemption_events where platform_id = ${platformAId} or platform_id = ${platformBId}`.catch(
    () => undefined,
  );
  await sql`delete from public.redemption_codes where platform_id = ${platformAId} or platform_id = ${platformBId}`.catch(
    () => undefined,
  );
  await sql`delete from public.redemption_code_batches where platform_id = ${platformAId} or platform_id = ${platformBId}`.catch(
    () => undefined,
  );
  await sql`delete from storage.objects where bucket_id = 'platform-config-files' and (name like ${`${platformAId}/%`} or name like ${`${platformBId}/%`})`.catch(
    () => undefined,
  );
  await sql`delete from public.platform_config_files where platform_id = ${platformAId} or platform_id = ${platformBId}`.catch(
    () => undefined,
  );
  await sql`delete from public.platform_file_policies where platform_id = ${platformAId} or platform_id = ${platformBId}`.catch(
    () => undefined,
  );
  await sql`delete from public.platform_accounts where platform_id = ${platformAId} or platform_id = ${platformBId}`.catch(
    () => undefined,
  );
  if (userId) {
    await sql`delete from private.user_recent_auth_proofs where user_id = ${userId}`.catch(
      () => undefined,
    );
    await sql`delete from private.deletion_jobs where user_id = ${userId}`.catch(
      () => undefined,
    );
    await sql`delete from private.deletion_requests where user_id = ${userId}`.catch(
      () => undefined,
    );
    await sql`delete from auth.sessions where user_id = ${userId}`.catch(
      () => undefined,
    );
    await sql`delete from auth.identities where user_id = ${userId}`.catch(
      () => undefined,
    );
    await sql`delete from auth.users where id = ${userId}`.catch(
      () => undefined,
    );
  }
  if (adminId) {
    await sql`delete from private.admin_step_up where user_id = ${adminId}`.catch(
      () => undefined,
    );
    await sql`delete from private.admin_idempotency where admin_user_id = ${adminId}`.catch(
      () => undefined,
    );
    await sql`delete from auth.mfa_challenges where factor_id in (select id from auth.mfa_factors where user_id = ${adminId})`.catch(
      () => undefined,
    );
    await sql`delete from auth.mfa_factors where user_id = ${adminId}`.catch(
      () => undefined,
    );
    await sql`delete from auth.sessions where user_id = ${adminId}`.catch(
      () => undefined,
    );
    await sql`delete from auth.identities where user_id = ${adminId}`.catch(
      () => undefined,
    );
    await sql`delete from auth.users where id = ${adminId}`.catch(
      () => undefined,
    );
  }
  if (previousSystemAdmin)
    await sql`update private.system_admin set user_id = ${previousSystemAdmin} where singleton_id = 1`.catch(
      () => undefined,
    );
  else
    await sql`delete from private.system_admin where singleton_id = 1`.catch(
      () => undefined,
    );
  await sql`delete from public.plans where platform_id = ${platformAId} or platform_id = ${platformBId}`.catch(
    () => undefined,
  );
  await sql`delete from private.platform_api_keys where platform_id = ${platformAId} or platform_id = ${platformBId}`.catch(
    () => undefined,
  );
  await sql`delete from public.platform_auth_origins where platform_id = ${platformAId} or platform_id = ${platformBId}`.catch(
    () => undefined,
  );
  await sql`delete from public.platforms where id = ${platformAId} or id = ${platformBId}`.catch(
    () => undefined,
  );
  for (const child of processes)
    if (child.pid)
      await execFileAsync('taskkill', [
        '/pid',
        String(child.pid),
        '/t',
        '/f',
      ]).catch(() => undefined);
  if (browser) await browser.close().catch(() => undefined);
  await sql.end({ timeout: 5 }).catch(() => undefined);
}

try {
  const adminTotp = await createFixtures();
  await startLocalServices();
  browser = await chromium.launch({
    channel: process.env.T16_BROWSER_CHANNEL ?? 'chrome',
    headless: true,
    args: ['--no-proxy-server'],
  });
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const adminContext = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  const adminPage = await adminContext.newPage();
  for (const page of [pageA, pageB, adminPage]) page.setDefaultTimeout(15_000);

  await exercisePublicTemplateRoutes(pageA, consumerAUrl);
  await exerciseAuthResponsive(pageA, consumerAUrl, [
    '/login',
    '/signup',
    '/forgot-password',
  ]);
  await loginConsumer(pageA, consumerAUrl, platformAId);
  await loginConsumer(pageB, consumerBUrl, platformBId);
  await exerciseAuthenticatedTemplateRoutes(pageA, consumerAUrl);
  await exerciseSubscriptionAndFiles(pageA, consumerAUrl, redemptionCodeA);
  await exerciseSubscriptionAndFiles(pageB, consumerBUrl, redemptionCodeB);
  const userCookiesA = await contextA.cookies();
  const userCookiesB = await contextB.cookies();
  const sessionA = userCookiesA.find(
    (cookie) => cookie.name === 'aisenhub-session',
  );
  const sessionB = userCookiesB.find(
    (cookie) => cookie.name === 'aisenhub-session',
  );
  assert.ok(
    sessionA?.value && sessionB?.value,
    'both browser contexts need sessions',
  );
  assert.notEqual(
    sessionA.value,
    sessionB.value,
    'browser contexts must isolate sessions',
  );

  const directWithAKey = await fetch(
    `${centralUrl}/functions/v1/account-api/v1/account/principal`,
    {
      headers: {
        Authorization: `Bearer ${sessionA.value}`,
        'X-Platform-Key': presentedKeyA,
      },
    },
  );
  assertStatus(directWithAKey.status, 200, 'A key principal');
  assert.equal(
    (await directWithAKey.json()).data.platform_id,
    platformAId,
    'A key cannot construct B principal',
  );

  await exerciseAuthResponsive(adminPage, adminUrl, ['/admin/login']);
  await exerciseAdmin(adminPage, adminTotp);
  const [suspendedRow] = await sql`
    select status from public.platform_accounts
    where platform_id = ${platformAId} and user_id = ${userId}
  `;
  assert.equal(suspendedRow?.status, 'suspended', 'Admin suspend must persist');
  const suspended = await browserRequest(pageA, '/api/v1/profile');
  assertStatus(suspended.status, 403, 'suspended account protected route');
  assert.equal(suspended.payload?.error?.code, 'ACCOUNT_SUSPENDED');

  // Reload the detail view so the restore assertion observes the persisted state,
  // even if the page's parallel detail refresh is still settling.
  await adminPage.goto(`${adminUrl}/admin/platforms`, {
    waitUntil: 'domcontentloaded',
  });
  await adminPage
    .getByRole('heading', { name: 'Platform operations' })
    .waitFor();
  await adminPage
    .getByRole('button', { name: platformACode, exact: true })
    .click();
  await adminPage
    .getByLabel('账户状态操作原因（必填，勿含个人信息）')
    .fill('T16 R2 browser restore');
  const suspendedAccountRow = adminPage
    .locator('li')
    .filter({ hasText: userId });
  await suspendedAccountRow
    .getByRole('button', { name: '恢复', exact: true })
    .waitFor();
  const [restoreResponse] = await Promise.all([
    adminPage.waitForResponse((item) => item.url().includes('/restore')),
    suspendedAccountRow
      .getByRole('button', { name: '恢复', exact: true })
      .click(),
  ]);
  assertStatus(restoreResponse.status(), 200, 'Admin account restore');
  await pageA.reload({ waitUntil: 'domcontentloaded' });
  await exerciseAccount(pageA, consumerAUrl);
  await scanBrowserBundles();

  console.log(
    JSON.stringify({
      independentContexts: 'PASS',
      platformKeyIsolation: 'PASS',
      templateRoutes: 'PASS',
      subscriptionRedemption: 'PASS',
      fileUploadDownloadDelete: 'PASS',
      fileBudgetUi: 'PASS',
      profilePreferences: 'PASS',
      csrfAndEtag: 'PASS',
      adminAal1AndSuspend: 'PASS',
      adminBatchConfirmationUi: 'PASS',
      ordinaryProof: 'PASS',
      closeDelete: 'PASS',
      browserBundleCredentials: 'PASS',
    }),
  );
} finally {
  await cleanup();
}
