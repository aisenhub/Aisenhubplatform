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

async function assertTechnicalDetailIsNotSummary(locator, code, label) {
  const summaryText = await locator.evaluate((element) => {
    const clone = element.cloneNode(true);
    clone.querySelectorAll('details').forEach((details) => details.remove());
    return clone.textContent ?? '';
  });
  assert.equal(
    summaryText.includes(code),
    false,
    `${label} technical code must stay out of user-facing copy`,
  );
  assert.equal(
    await locator.locator('details').getByText(code, { exact: true }).count(),
    1,
    `${label} technical code must remain available in technical details`,
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
    : ['--dir', join(repositoryRoot, 'apps', 'template-preview'), 'start'];
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
    ['/', '把账户任务做得清楚、可恢复'],
    ['/pricing', '选择适合你的工作区'],
    ['/login', '登录你的账户'],
    ['/signup', '创建账户'],
    ['/forgot-password', '找回密码'],
    ['/update-password', '设置新密码'],
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
    ['/subscription', '订阅与兑换'],
    ['/account', '账户设置'],
    ['/files', '配置文件'],
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
  await page.getByRole('heading', { name: '配置文件' }).waitFor();
  await page.getByRole('heading', { name: '当前使用情况' }).waitFor();
  await page
    .getByText(/可用/u)
    .first()
    .waitFor();
  const fileRow = page
    .locator('.consumer-row')
    .filter({ hasText: 't16-r2.ini' });
  await fileRow.getByRole('button', { name: '删除', exact: true }).waitFor();
  const downloaded = await browserRequest(
    page,
    `/api/v1/config-files/${fileId}/content`,
  );
  assertStatus(downloaded.status, 200, 'file download');
  assert.equal(downloaded.payload?.raw, content);

  await fileRow.getByRole('button', { name: '删除', exact: true }).click();
  const [removed] = await Promise.all([
    page.waitForResponse((item) =>
      item.url().endsWith(`/api/v1/config-files/${fileId}`),
    ),
    page.locator('[data-test="confirm-action-submit"]').click(),
  ]);
  assertStatus(removed.status(), 202, 'file delete request');
  await page
    .locator('[data-test="confirm-action-dialog"]')
    .getByRole('button', { name: '已受理', exact: true })
    .waitFor();
}

async function exerciseAccount(page, baseUrl) {
  await page.goto(`${baseUrl}/account`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '账户设置' }).waitFor();
  await page.getByLabel('显示名称').fill('T16 R2 browser user');
  await page.getByLabel('简介').fill('Local browser regression');
  const [profileResponse] = await Promise.all([
    page.waitForResponse((item) => item.url().endsWith('/api/v1/profile')),
    page.getByRole('button', { name: '保存资料' }).click(),
  ]);
  assertStatus(profileResponse.status(), 200, 'browser Profile PATCH');

  await page.getByLabel('JSON Merge Patch').waitFor();
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

  await page
    .getByRole('button', { name: '提交全局删除请求', exact: true })
    .click();
  const sensitiveDialog = page.locator('[data-test="confirm-action-dialog"]');
  const [mfaRequired] = await Promise.all([
    page.waitForResponse((item) =>
      item.url().endsWith('/api/v1/identity/delete-request'),
    ),
    sensitiveDialog.locator('[data-test="confirm-action-submit"]').click(),
  ]);
  assertStatus(mfaRequired.status(), 403, 'global delete MFA requirement');
  const [reauthRequested] = await Promise.all([
    page.waitForResponse((item) =>
      item.url().endsWith('/api/auth/reauth/start'),
    ),
    sensitiveDialog
      .getByRole('button', { name: '发送验证邮件', exact: true })
      .click(),
  ]);
  assertStatus(reauthRequested.status(), 200, 'consumer email reauth request');
  const tokenHash = await readMailpitToken(userEmail);
  await page.getByPlaceholder('粘贴 token_hash').fill(tokenHash);
  const [verifiedResponse] = await Promise.all([
    page.waitForResponse((item) =>
      item.url().endsWith('/api/auth/reauth/verify'),
    ),
    page.getByRole('button', { name: '验证并回到确认', exact: true }).click(),
  ]);
  assertStatus(verifiedResponse.status(), 200, 'consumer email reauth verify');
  const cookies = await page.context().cookies();
  const proof = cookies.find(
    (cookie) => cookie.name === 'aisenhub-consumer-recent-auth-proof',
  );
  assert.ok(proof?.httpOnly, 'consumer proof must be HttpOnly');
  assert.equal(proof?.sameSite, 'Strict');

  const deleteEndpoint = `${baseUrl}/api/v1/identity/delete-request`;
  let abortedDeleteCount = 0;
  await page.route(deleteEndpoint, async (route) => {
    if (route.request().method() === 'POST') {
      abortedDeleteCount += 1;
      await route.abort('failed');
      return;
    }
    await route.continue();
  });
  await sensitiveDialog.locator('[data-test="confirm-action-submit"]').click();
  await sensitiveDialog.getByText('结果待确认', { exact: true }).waitFor();
  assert.equal(
    abortedDeleteCount,
    1,
    'network unknown must not automatically submit a second delete request',
  );
  await sensitiveDialog
    .locator('[data-test="confirm-action-check-unknown"]')
    .click();
  await sensitiveDialog.getByText('结果仍待确认', { exact: true }).waitFor();
  await page.unroute(deleteEndpoint);
  await sensitiveDialog.locator('[data-test="confirm-action-cancel"]').click();

  await page
    .getByRole('button', { name: '提交全局删除请求', exact: true })
    .click();
  const [deleteRequest] = await Promise.all([
    page.waitForResponse((item) =>
      item.url().endsWith('/api/v1/identity/delete-request'),
    ),
    sensitiveDialog.locator('[data-test="confirm-action-submit"]').click(),
  ]);
  assertStatus(deleteRequest.status(), 202, 'global delete request');
  await sensitiveDialog
    .getByRole('button', { name: '已受理', exact: true })
    .waitFor();
  await sensitiveDialog.locator('[data-test="confirm-action-cancel"]').click();

  await page.getByRole('button', { name: '关闭当前账户', exact: true }).click();
  const closeDialog = page.locator('[data-test="confirm-action-dialog"]');
  const [close] = await Promise.all([
    page.waitForResponse((item) =>
      item.url().endsWith('/api/v1/account/close'),
    ),
    closeDialog.locator('[data-test="confirm-action-submit"]').click(),
  ]);
  assertStatus(close.status(), 200, 'consumer account close');
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
  await exerciseAdminErrorCopyMatrix(page);
  await exerciseFilesStateMatrix(page, adminTotp);
  await exerciseSettingsLifecycleMatrix(page);
  await page.goto(`${adminUrl}/admin/platforms`, {
    waitUntil: 'domcontentloaded',
  });
  await page.getByRole('heading', { name: '平台目录' }).waitFor();
  await page.goto(`${adminUrl}/admin/platforms/${platformAId}/accounts`, {
    waitUntil: 'domcontentloaded',
  });
  await page.getByRole('heading', { name: '平台账户' }).waitFor();
  const adminAccounts = await browserRequest(
    page,
    `/api/v1/admin/api/v1/platforms/${platformAId}/accounts?limit=100`,
  );
  assertStatus(adminAccounts.status, 200, 'Admin account list');
  const platformAccountId = adminAccounts.payload?.data?.find(
    (account) => account.user_id === userId,
  )?.platform_account_id;
  assert.ok(platformAccountId, 'Admin account list includes browser account');
  const accountRow = page.locator(
    `[data-test="account-row-${platformAccountId}"]`,
  );
  await accountRow.getByRole('button', { name: '暂停', exact: true }).waitFor();
  await accountRow.getByRole('button', { name: '暂停', exact: true }).click();
  await page
    .locator('[data-test="confirm-action-reason"]')
    .fill('T16 R2 browser suspend');
  const [suspendRequest] = await Promise.all([
    page.waitForRequest((item) => item.url().includes(`/accounts/`)),
    page.locator('[data-test="confirm-action-submit"]').click(),
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
  await page.goto(
    `${adminUrl}/admin/platforms/${platformAId}/redemption-batches`,
    {
      waitUntil: 'domcontentloaded',
    },
  );
  await page.getByRole('heading', { name: '兑换批次' }).waitFor();
  await page.locator('#batch-plan').waitFor();
  await exerciseBatchReplayUi(page);
  await page.locator('#batch-plan').selectOption(paidPlanAId);
  await page.locator('#batch-name').fill('T16 R2 UI batch');
  await page.locator('#batch-quantity').fill('1');
  const [createBatchResponse] = await Promise.all([
    page.waitForResponse((item) =>
      item.url().endsWith('/api/v1/admin/api/v1/redemption-batches'),
    ),
    (async () => {
      await page.getByRole('button', { name: '复核并创建' }).click();
      await page.locator('[data-test="confirm-action-submit"]').click();
    })(),
  ]);
  assertStatus(createBatchResponse.status(), 201, 'Admin batch create UI');
  await page.getByText('兑换码明文仅显示这一次', { exact: true }).waitFor();
  await page.getByText('批次已创建，等待交付确认', { exact: true }).waitFor();
  const createPayload = await createBatchResponse.json();
  const createdBatchId = createPayload?.data?.batch_id;
  assert.ok(createdBatchId, 'Admin batch create returns batch ID');
  await page.locator('[data-test="one-time-secret-acknowledge"]').click();
  const batchRow = page.locator(`[data-test="batch-row-${createdBatchId}"]`);
  await batchRow.getByRole('button', { name: '确认交付' }).click();
  const [confirmBatchResponse] = await Promise.all([
    page.waitForResponse((item) => item.url().includes('/confirm-delivery')),
    page.locator('[data-test="confirm-action-submit"]').click(),
  ]);
  assertStatus(confirmBatchResponse.status(), 200, 'Admin batch confirm UI');
  await page
    .locator('[data-test="batches-notice"]')
    .getByText('交付已确认', { exact: true })
    .waitFor();
  await page
    .locator('[data-test="one-time-secret-panel"]')
    .waitFor({ state: 'detached' });
  await page.waitForTimeout(250);
  return platformAccountId;
}

async function exerciseBatchReplayUi(page) {
  const endpoint = `${adminUrl}/api/v1/admin/api/v1/redemption-batches`;
  let postCount = 0;
  await page.route(endpoint, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    postCount += 1;
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'application/json',
        'x-request-id': crypto.randomUUID(),
      },
      body: JSON.stringify({
        data: {
          batch_id: batchAId,
          status: 'pending_delivery',
          quantity: 1,
          creation_state: 'replayed_existing',
        },
        request_id: crypto.randomUUID(),
      }),
    });
  });

  try {
    await page.locator('#batch-plan').selectOption(paidPlanAId);
    await page.locator('#batch-name').fill('T16 R2 replay UI');
    await page.locator('#batch-quantity').fill('1');
    await page.getByRole('button', { name: '复核并创建' }).click();
    const [response] = await Promise.all([
      page.waitForResponse(
        (item) => item.url() === endpoint && item.request().method() === 'POST',
      ),
      page.locator('[data-test="confirm-action-submit"]').click(),
    ]);
    assertStatus(response.status(), 200, 'Admin replayed batch UI response');
    assert.equal(postCount, 1, 'replayed batch UI must submit only once');
    await page.getByText('批次已存在，明文无法恢复', { exact: true }).waitFor();
    assert.equal(
      await page.locator('[data-test="one-time-secret-panel"]').count(),
      0,
      'replayed batch UI must not render plaintext secret panel',
    );
    assert.equal(
      await page.locator('[data-test="confirm-action-check-unknown"]').count(),
      1,
      'replayed batch UI must expose explicit state check',
    );
  } finally {
    await page.unroute(endpoint);
  }
  await page.locator('[data-test="confirm-action-cancel"]').click();
}

async function exerciseAdminErrorCopyMatrix(page) {
  const directoryEndpoint = '/api/v1/admin/api/v1/platforms';
  const directoryRoute = (url) => new URL(url).pathname === directoryEndpoint;
  await page.route(directoryRoute, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 429,
      headers: {
        'content-type': 'application/json',
        'x-request-id': crypto.randomUUID(),
      },
      body: JSON.stringify({
        error: { code: 'RATE_LIMITED', message: 'RATE_LIMITED' },
        request_id: crypto.randomUUID(),
      }),
    });
  });
  try {
    await page.goto(`${adminUrl}/admin/platforms`, {
      waitUntil: 'domcontentloaded',
    });
    await page.getByRole('heading', { name: '平台目录' }).waitFor();
    await page
      .getByText('请求过于频繁，请稍后重试。', { exact: false })
      .waitFor();
    await assertTechnicalDetailIsNotSummary(
      page.locator('[data-test="recoverable-error"]'),
      'RATE_LIMITED',
      'rate limit',
    );
  } finally {
    await page.unroute(directoryRoute);
  }

  const workspaceEndpoint = `/api/v1/admin/api/v1/platforms/${platformAId}`;
  const workspaceRoute = (url) => new URL(url).pathname === workspaceEndpoint;
  await page.route(workspaceRoute, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 503,
      headers: {
        'content-type': 'application/json',
        'x-request-id': crypto.randomUUID(),
      },
      body: JSON.stringify({
        error: {
          code: 'AUTHORIZATION_UNAVAILABLE',
          message: 'AUTHORIZATION_UNAVAILABLE',
        },
        request_id: crypto.randomUUID(),
      }),
    });
  });
  try {
    await page.goto(`${adminUrl}/admin/platforms/${platformAId}`, {
      waitUntil: 'domcontentloaded',
    });
    await page
      .getByText('服务暂时不可用，请稍后重试。', { exact: false })
      .waitFor();
    await assertTechnicalDetailIsNotSummary(
      page.locator('[data-test="recoverable-error"]'),
      'AUTHORIZATION_UNAVAILABLE',
      'authorization',
    );
  } finally {
    await page.unroute(workspaceRoute);
  }

  await page.goto(`${adminUrl}/admin/platforms/${platformAId}/settings`, {
    waitUntil: 'domcontentloaded',
  });
  await page.getByRole('heading', { name: '平台设置' }).waitFor();
  let settingsPatchMode = 'conflict';
  let settingsPatchCount = 0;
  await page.route(workspaceRoute, async (route) => {
    if (route.request().method() !== 'PATCH') {
      await route.continue();
      return;
    }
    settingsPatchCount += 1;
    if (settingsPatchMode === 'unknown') {
      await route.abort('failed');
      return;
    }
    await route.fulfill({
      status: 409,
      headers: {
        'content-type': 'application/json',
        'x-request-id': crypto.randomUUID(),
      },
      body: JSON.stringify({
        error: {
          code: 'IDEMPOTENCY_CONFLICT',
          message: 'IDEMPOTENCY_CONFLICT',
        },
        request_id: crypto.randomUUID(),
      }),
    });
  });
  try {
    await page.locator('[data-test="platform-settings-toggle"]').click();
    await page.locator('[data-test="confirm-action-submit"]').click();
    await page
      .getByText('这项操作与已有请求冲突，请检查当前状态后再决定是否重试。', {
        exact: false,
      })
      .waitFor();
    await assertTechnicalDetailIsNotSummary(
      page.locator('[data-test="confirm-action-error"]'),
      'IDEMPOTENCY_CONFLICT',
      'conflict',
    );
    assert.equal(settingsPatchCount, 1, 'settings conflict must submit once');
    await page.locator('[data-test="confirm-action-cancel"]').click();

    settingsPatchMode = 'unknown';
    await page.locator('[data-test="platform-settings-toggle"]').click();
    await page.locator('[data-test="confirm-action-submit"]').click();
    await page.getByText('平台状态结果待确认', { exact: true }).waitFor();
    assert.equal(
      settingsPatchCount,
      2,
      'settings network unknown must not automatically resubmit',
    );
    await page.locator('[data-test="confirm-action-check-unknown"]').click();
    await page.getByText('已请求重新读取平台状态', { exact: true }).waitFor();
    assert.equal(
      settingsPatchCount,
      2,
      'settings state check must not resubmit the original mutation',
    );
    await page.locator('[data-test="confirm-action-cancel"]').click();
  } finally {
    await page.unroute(workspaceRoute);
  }
}

async function exerciseFilesStateMatrix(page, adminTotp) {
  const filesEndpoint = '/api/v1/admin/api/v1/config-files';
  const policyEndpoint = `/api/v1/admin/api/v1/platforms/${platformAId}/file-policy`;
  const activeFileId = crypto.randomUUID();
  const receivingFileId = crypto.randomUUID();
  const storingFileId = crypto.randomUUID();
  const deletingFileId = crypto.randomUUID();
  const unknownFileId = crypto.randomUUID();
  const deletedFileId = crypto.randomUUID();
  const now = new Date().toISOString();
  const file = (fileId, name, status, writeOutcome, reservedBytes) => ({
    file_id: fileId,
    platform_id: platformAId,
    platform_account_id: null,
    original_name: name,
    mime_type: 'application/json',
    status,
    write_outcome: writeOutcome,
    reserved_bytes: reservedBytes,
    reserved_count: 1,
    actual_size_bytes: status === 'active' ? reservedBytes : null,
    created_at: now,
    updated_at: now,
    cancel_requested_at: null,
  });
  const files = [
    file(activeFileId, 'active.json', 'active', 'confirmed', 128),
    file(receivingFileId, 'receiving.json', 'receiving', 'pending', 256),
    file(storingFileId, 'storing.json', 'storing', 'pending', 384),
    file(deletingFileId, 'deleting.json', 'deleting', 'confirmed', 512),
    file(unknownFileId, 'unknown.json', 'receiving', 'unknown', 640),
    file(deletedFileId, 'deleted.json', 'deleted', 'confirmed', 768),
  ];
  let filesResponseCompleted = false;
  let unknownDeleteCount = 0;
  let downloadRequestCount = 0;
  let downloadMode = 'storage-error';
  let policyPatchCount = 0;
  let policyPatchMode = 'mfa';
  const filesRoute = (url) => new URL(url).pathname === filesEndpoint;
  const policyRoute = (url) => new URL(url).pathname === policyEndpoint;
  const downloadEndpoint = `${filesEndpoint}/${activeFileId}/content`;
  const downloadRoute = (url) => new URL(url).pathname === downloadEndpoint;
  const unknownDetailEndpoint = `${filesEndpoint}/${unknownFileId}`;
  const unknownDetailRoute = (url) =>
    new URL(url).pathname === unknownDetailEndpoint;
  await page.route(filesRoute, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1200));
    filesResponseCompleted = true;
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'application/json',
        'x-request-id': crypto.randomUUID(),
      },
      body: JSON.stringify({
        data: files,
        next_cursor: null,
        request_id: crypto.randomUUID(),
      }),
    });
  });
  await page.route(policyRoute, async (route) => {
    if (route.request().method() === 'PATCH') {
      policyPatchCount += 1;
      const isMfa = policyPatchMode === 'mfa';
      await route.fulfill({
        status: isMfa ? 403 : 409,
        headers: {
          'content-type': 'application/json',
          'x-request-id': crypto.randomUUID(),
        },
        body: JSON.stringify({
          error: {
            code: isMfa ? 'RECENT_MFA_REQUIRED' : 'IDEMPOTENCY_CONFLICT',
            message: isMfa ? 'RECENT_MFA_REQUIRED' : 'IDEMPOTENCY_CONFLICT',
          },
          request_id: crypto.randomUUID(),
        }),
      });
      return;
    }
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'application/json',
        'x-request-id': crypto.randomUUID(),
      },
      body: JSON.stringify({
        data: {
          enabled: true,
          max_file_bytes: 1048576,
          max_files: 20,
          max_total_bytes: 4096,
          reserved_bytes: 2304,
          reserved_count: 6,
          available_bytes: 1792,
          available_count: 14,
          over_quota: true,
          updated_at: now,
        },
        request_id: crypto.randomUUID(),
      }),
    });
  });
  await page.route(downloadRoute, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    downloadRequestCount += 1;
    const isMfa = downloadMode === 'mfa';
    await route.fulfill({
      status: isMfa ? 403 : 503,
      headers: {
        'content-type': 'application/json',
        'x-request-id': crypto.randomUUID(),
      },
      body: JSON.stringify({
        error: {
          code: isMfa ? 'MFA_REQUIRED' : 'STORAGE_UNAVAILABLE',
          message: isMfa ? 'MFA_REQUIRED' : 'STORAGE_UNAVAILABLE',
        },
        request_id: crypto.randomUUID(),
      }),
    });
  });
  await page.route(unknownDetailRoute, async (route) => {
    if (route.request().method() === 'DELETE') {
      unknownDeleteCount += 1;
      await route.abort('failed');
      return;
    }
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'application/json',
        'x-request-id': crypto.randomUUID(),
      },
      body: JSON.stringify({
        data: files.find((item) => item.file_id === unknownFileId),
        request_id: crypto.randomUUID(),
      }),
    });
  });
  try {
    await page.goto(`${adminUrl}/admin/platforms/${platformAId}/files`, {
      waitUntil: 'domcontentloaded',
    });
    await page.getByRole('heading', { name: '配置文件' }).waitFor();
    await page.getByText('Usage / Policy', { exact: true }).waitFor();
    await page.getByText('当前使用量高于策略', { exact: true }).waitFor();
    assert.equal(
      filesResponseCompleted,
      false,
      'policy must become usable while file list response is delayed',
    );
    await page.getByText('文件状态', { exact: true }).waitFor();
    await page.getByText('正在接收', { exact: true }).waitFor();
    await page.getByText('正在写入', { exact: true }).waitFor();
    await page.getByText('删除处理中', { exact: true }).waitFor();
    await page.getByText('正在确认写入结果', { exact: true }).waitFor();
    await page.getByText('已删除', { exact: true }).waitFor();
    await page.getByText('预算仍以服务端状态为准', { exact: false }).waitFor();

    const activeRow = page.locator(
      `[data-test="platform-file-row-${activeFileId}"]`,
    );
    const receivingRow = page.locator(
      `[data-test="platform-file-row-${receivingFileId}"]`,
    );
    const deletingRow = page.locator(
      `[data-test="platform-file-row-${deletingFileId}"]`,
    );
    const unknownRow = page.locator(
      `[data-test="platform-file-row-${unknownFileId}"]`,
    );
    const deletedRow = page.locator(
      `[data-test="platform-file-row-${deletedFileId}"]`,
    );
    assert.equal(
      await activeRow
        .locator(`[data-test="platform-file-download-${activeFileId}"]`)
        .isDisabled(),
      false,
      'active confirmed file must allow download',
    );
    assert.equal(
      await receivingRow
        .locator(`[data-test="platform-file-download-${receivingFileId}"]`)
        .isDisabled(),
      true,
      'receiving file must not allow download',
    );
    assert.equal(
      await deletingRow
        .locator(`[data-test="platform-file-delete-${deletingFileId}"]`)
        .isDisabled(),
      true,
      'deleting file must not allow a second delete',
    );
    assert.equal(
      await unknownRow
        .locator(`[data-test="platform-file-delete-${unknownFileId}"]`)
        .isDisabled(),
      false,
      'unknown write outcome keeps a controlled delete decision with server state',
    );
    assert.equal(
      await deletedRow
        .locator(`[data-test="platform-file-delete-${deletedFileId}"]`)
        .isDisabled(),
      true,
      'deleted file must not allow another delete',
    );

    const downloadError = page.locator(
      '[data-test="platform-files-download-error"]',
    );
    await activeRow
      .locator(`[data-test="platform-file-download-${activeFileId}"]`)
      .click();
    await downloadError
      .getByText('服务暂时不可用，请稍后重试。', { exact: false })
      .waitFor();
    const downloadSummary = await downloadError.evaluate((element) => {
      const clone = element.cloneNode(true);
      clone.querySelectorAll('details').forEach((details) => details.remove());
      return clone.textContent ?? '';
    });
    assert.equal(
      downloadSummary.includes('STORAGE_UNAVAILABLE'),
      false,
      'download technical code must stay out of the user-facing summary',
    );
    assert.equal(
      await downloadError
        .locator('details')
        .getByText('STORAGE_UNAVAILABLE', { exact: true })
        .count(),
      1,
      'download technical code must remain available in technical details',
    );
    assert.equal(
      downloadRequestCount,
      1,
      'download storage failure must submit exactly once',
    );

    downloadMode = 'mfa';
    const [mfaDownloadResponse] = await Promise.all([
      page.waitForResponse((response) => {
        const requestUrl = new URL(response.url());
        return (
          requestUrl.pathname === downloadEndpoint &&
          response.request().method() === 'GET'
        );
      }),
      activeRow
        .locator(`[data-test="platform-file-download-${activeFileId}"]`)
        .click(),
    ]);
    assert.equal(mfaDownloadResponse.status(), 403, 'download MFA response');
    await page
      .locator('[data-test="platform-files-download-step-up"]')
      .getByText('下载需要近期 MFA', { exact: false })
      .waitFor();
    assert.equal(
      downloadRequestCount,
      2,
      'download MFA response must not be automatically replayed',
    );

    await page.goto(`${adminUrl}/admin/platforms/${platformAId}/files`, {
      waitUntil: 'domcontentloaded',
    });
    const policyPanel = page.locator('[data-test="platform-file-policy"]');
    await policyPanel
      .locator('[data-test="platform-file-policy-save"]')
      .click();
    await policyPanel.locator('[data-test="recent-mfa-panel"]').waitFor();
    assert.equal(
      policyPatchCount,
      1,
      'policy save must submit once before MFA step-up',
    );
    await policyPanel
      .locator('[data-test="recent-mfa-code"]')
      .fill(totp(adminTotp.secret));
    await policyPanel.locator('[data-test="recent-mfa-submit"]').click();
    const policySave = policyPanel.locator(
      '[data-test="platform-file-policy-save"]',
    );
    await policyPanel
      .locator('[data-test="recent-mfa-panel"]')
      .waitFor({ state: 'detached' });
    assert.equal(
      await policySave.isDisabled(),
      false,
      'policy save must become explicitly available after MFA verification',
    );

    policyPatchMode = 'conflict';
    await policySave.click();
    const policyError = page.locator(
      '[data-test="platform-file-policy-error"]',
    );
    await policyError
      .getByText('这项操作与已有请求冲突', { exact: false })
      .waitFor();
    const policySummary = await policyError.evaluate((element) => {
      const clone = element.cloneNode(true);
      clone.querySelectorAll('details').forEach((details) => details.remove());
      return clone.textContent ?? '';
    });
    assert.equal(
      policySummary.includes('IDEMPOTENCY_CONFLICT'),
      false,
      'policy conflict code must stay out of the user-facing summary',
    );
    assert.equal(
      await policyError
        .locator('details')
        .getByText('IDEMPOTENCY_CONFLICT', { exact: true })
        .count(),
      1,
      'policy conflict code must remain available in technical details',
    );
    assert.equal(
      policyPatchCount,
      2,
      'policy conflict must not trigger an automatic retry',
    );

    await unknownRow
      .locator(`[data-test="platform-file-delete-${unknownFileId}"]`)
      .click();
    await page
      .locator('[data-test="confirm-action-reason"]')
      .fill('T16 R2 unknown file delete');
    await page.locator('[data-test="confirm-action-submit"]').click();
    await page.getByText('删除结果待确认', { exact: false }).waitFor();
    assert.equal(
      unknownDeleteCount,
      1,
      'unknown file delete must submit exactly once',
    );
    await page.locator('[data-test="confirm-action-check-unknown"]').click();
    await page
      .getByText('当前状态未证明原请求结果', { exact: false })
      .waitFor();
    assert.equal(
      unknownDeleteCount,
      1,
      'unknown file state check must not automatically resubmit delete',
    );
    await page.locator('[data-test="confirm-action-cancel"]').click();
  } finally {
    await page.unroute(filesRoute);
    await page.unroute(policyRoute);
    await page.unroute(downloadRoute);
    await page.unroute(unknownDetailRoute);
  }
}

async function exerciseSettingsLifecycleMatrix(page) {
  const originEndpoint = `/api/v1/admin/api/v1/platforms/${platformAId}/origins`;
  const originId = crypto.randomUUID();
  const createdOriginId = crypto.randomUUID();
  const origin = {
    origin_id: originId,
    platform_id: platformAId,
    environment: 'local',
    origin: 'http://127.0.0.1:3110',
    oauth_callback_url: 'http://127.0.0.1:3110/auth/callback',
    password_reset_url: 'http://127.0.0.1:3110/auth/reset',
    email_confirmation_url: 'http://127.0.0.1:3110/auth/confirm',
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const createdOrigin = {
    ...origin,
    origin_id: createdOriginId,
    origin: 'https://t16-r2.example.test',
    oauth_callback_url: 'https://t16-r2.example.test/auth/callback',
    password_reset_url: 'https://t16-r2.example.test/auth/reset',
    email_confirmation_url: 'https://t16-r2.example.test/auth/confirm',
  };
  let originCreateCount = 0;
  let originCreated = false;
  let originListMode = 'success';
  const originRoute = (url) => new URL(url).pathname === originEndpoint;
  await page.route(originRoute, async (route) => {
    if (route.request().method() === 'POST') {
      originCreateCount += 1;
      originCreated = true;
      await route.fulfill({
        status: 201,
        headers: {
          'content-type': 'application/json',
          'x-request-id': crypto.randomUUID(),
        },
        body: JSON.stringify({
          data: createdOrigin,
          request_id: crypto.randomUUID(),
        }),
      });
      return;
    }
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    if (originListMode === 'unavailable') {
      await route.fulfill({
        status: 503,
        headers: {
          'content-type': 'application/json',
          'x-request-id': crypto.randomUUID(),
        },
        body: JSON.stringify({
          error: {
            code: 'STORAGE_UNAVAILABLE',
            message: 'STORAGE_UNAVAILABLE',
          },
          request_id: crypto.randomUUID(),
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'application/json',
        'x-request-id': crypto.randomUUID(),
      },
      body: JSON.stringify({
        data: originCreated ? [origin, createdOrigin] : [origin],
        request_id: crypto.randomUUID(),
      }),
    });
  });
  try {
    await page.goto(
      `${adminUrl}/admin/platforms/${platformAId}/settings/origins`,
      {
        waitUntil: 'domcontentloaded',
      },
    );
    await page.getByRole('heading', { name: 'Origins', exact: true }).waitFor();
    await page.getByText(origin.origin, { exact: true }).waitFor();
    await page.locator('[data-test="platform-origin-open-create"]').click();
    await page.locator('#origin-value').fill('not-a-url');
    await page.locator('[data-test="platform-origin-create-submit"]').click();
    await page
      .getByText('Origin 必须是 http 或 https URL。', { exact: true })
      .waitFor();
    await page.locator('#origin-value').fill(createdOrigin.origin);
    await page
      .locator('#origin-oauth-callback')
      .fill(createdOrigin.oauth_callback_url);
    await page
      .locator('#origin-password-reset')
      .fill(createdOrigin.password_reset_url);
    await page
      .locator('#origin-confirmation')
      .fill(createdOrigin.email_confirmation_url);
    await page.locator('[data-test="platform-origin-create-submit"]').click();
    await page.getByText(createdOrigin.origin, { exact: true }).waitFor();
    assert.equal(originCreateCount, 1, 'Origin create must submit once');

    originListMode = 'unavailable';
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Origins', exact: true }).waitFor();
    const originError = page.locator('[data-test="recoverable-error"]');
    await originError
      .getByText('服务暂时不可用，请稍后重试。', { exact: false })
      .waitFor();
    await assertTechnicalDetailIsNotSummary(
      originError,
      'STORAGE_UNAVAILABLE',
      'origin list unavailable',
    );
    originListMode = 'success';
    await originError.locator('[data-test="async-retry"]').click();
    await page.getByText(createdOrigin.origin, { exact: true }).waitFor();
  } finally {
    await page.unroute(originRoute);
  }

  const keyEndpoint = `/api/v1/admin/api/v1/platforms/${platformAId}/keys`;
  const initialKeyId = crypto.randomUUID();
  const createdKeyId = crypto.randomUUID();
  const keySecret = `phk_v1_${createdKeyId}_t16-r2-created`;
  const keyNow = new Date().toISOString();
  const initialKey = {
    key_id: initialKeyId,
    platform_id: platformAId,
    name: 'T16 R2 initial key',
    hmac_key_version: 1,
    key_prefix: 'phk_v1',
    key_suffix: 'initial',
    status: 'active',
    expires_at: null,
    revoked_at: null,
    creation_operation_id: crypto.randomUUID(),
    created_at: keyNow,
    deployment_confirmed_at: null,
    deployment_confirmed_by: null,
  };
  let keyCreated = false;
  let keyDeployed = false;
  let keyRevoked = false;
  let keyCreateCount = 0;
  let keyListMode = 'success';
  const createdKey = () => ({
    key_id: createdKeyId,
    platform_id: platformAId,
    name: 'BFF key',
    hmac_key_version: 1,
    key_prefix: 'phk_v1',
    key_suffix: 'created',
    status: keyRevoked ? 'revoked' : 'active',
    expires_at: null,
    revoked_at: keyRevoked ? keyNow : null,
    creation_operation_id: crypto.randomUUID(),
    created_at: keyNow,
    deployment_confirmed_at: keyDeployed ? keyNow : null,
    deployment_confirmed_by: keyDeployed ? adminId : null,
  });
  const keyRoute = (url) =>
    new URL(url).pathname.startsWith(`${keyEndpoint}/`) ||
    new URL(url).pathname === keyEndpoint;
  await page.route(keyRoute, async (route) => {
    const method = route.request().method();
    const pathname = new URL(route.request().url()).pathname;
    if (method === 'GET' && pathname === keyEndpoint) {
      if (keyListMode === 'unavailable') {
        await route.fulfill({
          status: 503,
          headers: {
            'content-type': 'application/json',
            'x-request-id': crypto.randomUUID(),
          },
          body: JSON.stringify({
            error: {
              code: 'AUTHORIZATION_UNAVAILABLE',
              message: 'AUTHORIZATION_UNAVAILABLE',
            },
            request_id: crypto.randomUUID(),
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        headers: {
          'content-type': 'application/json',
          'x-request-id': crypto.randomUUID(),
        },
        body: JSON.stringify({
          data: keyCreated ? [initialKey, createdKey()] : [initialKey],
          request_id: crypto.randomUUID(),
        }),
      });
      return;
    }
    if (method === 'POST' && pathname === keyEndpoint) {
      keyCreateCount += 1;
      keyCreated = true;
      await route.fulfill({
        status: 201,
        headers: {
          'content-type': 'application/json',
          'x-request-id': crypto.randomUUID(),
        },
        body: JSON.stringify({
          data: { ...createdKey(), presented_key: keySecret },
          request_id: crypto.randomUUID(),
        }),
      });
      return;
    }
    if (
      method === 'POST' &&
      pathname === `${keyEndpoint}/${createdKeyId}/confirm-deployment`
    ) {
      keyDeployed = true;
      await route.fulfill({
        status: 200,
        headers: {
          'content-type': 'application/json',
          'x-request-id': crypto.randomUUID(),
        },
        body: JSON.stringify({
          data: createdKey(),
          request_id: crypto.randomUUID(),
        }),
      });
      return;
    }
    if (
      method === 'POST' &&
      pathname === `${keyEndpoint}/${createdKeyId}/revoke`
    ) {
      keyRevoked = true;
      await route.fulfill({
        status: 200,
        headers: {
          'content-type': 'application/json',
          'x-request-id': crypto.randomUUID(),
        },
        body: JSON.stringify({
          data: createdKey(),
          request_id: crypto.randomUUID(),
        }),
      });
      return;
    }
    await route.continue();
  });
  try {
    await page.goto(
      `${adminUrl}/admin/platforms/${platformAId}/settings/keys`,
      {
        waitUntil: 'domcontentloaded',
      },
    );
    await page
      .getByRole('heading', { name: 'Platform Keys', exact: true })
      .waitFor();
    await page.locator('[data-test="platform-key-open-create"]').click();
    await page.locator('[data-test="confirm-action-submit"]').click();
    await page.locator('[data-test="one-time-secret-panel"]').waitFor();
    assert.equal(
      await page.getByText(keySecret, { exact: true }).count(),
      1,
      'created Platform Key secret must be shown once',
    );
    assert.equal(keyCreateCount, 1, 'Platform Key create must submit once');
    await page.locator('[data-test="one-time-secret-acknowledge"]').click();
    await page
      .locator('[data-test="one-time-secret-panel"]')
      .waitFor({ state: 'detached' });
    assert.equal(
      (await page.locator('body').innerText()).includes(keySecret),
      false,
      'acknowledged Platform Key secret must leave the DOM',
    );

    const createdKeyRow = page
      .locator('[data-test="platform-key-rows"] article')
      .filter({ hasText: 'BFF key' });
    await createdKeyRow.getByRole('button', { name: '确认已部署' }).click();
    const [deploymentResponse] = await Promise.all([
      page.waitForResponse((item) =>
        item.url().endsWith('/confirm-deployment'),
      ),
      page.locator('[data-test="confirm-action-submit"]').click(),
    ]);
    assertStatus(deploymentResponse.status(), 200, 'Platform Key deployment');
    await createdKeyRow.getByText('已确认部署', { exact: false }).waitFor();
    await page.locator('[data-test="confirm-action-cancel"]').click();

    await createdKeyRow.getByRole('button', { name: '撤销' }).click();
    const [revokeResponse] = await Promise.all([
      page.waitForResponse((item) => item.url().endsWith('/revoke')),
      page.locator('[data-test="confirm-action-submit"]').click(),
    ]);
    assertStatus(revokeResponse.status(), 200, 'Platform Key revoke');
    await createdKeyRow.getByText('revoked', { exact: true }).waitFor();
    await page.locator('[data-test="confirm-action-cancel"]').click();

    keyListMode = 'unavailable';
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page
      .getByRole('heading', { name: 'Platform Keys', exact: true })
      .waitFor();
    const keyError = page.locator('[data-test="recoverable-error"]');
    await keyError
      .getByText('服务暂时不可用，请稍后重试。', { exact: false })
      .waitFor();
    await assertTechnicalDetailIsNotSummary(
      keyError,
      'AUTHORIZATION_UNAVAILABLE',
      'platform key list unavailable',
    );
    keyListMode = 'success';
    await keyError.locator('[data-test="async-retry"]').click();
    await createdKeyRow.getByText('revoked', { exact: true }).waitFor();
  } finally {
    await page.unroute(keyRoute);
  }
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
  const pageC = await contextA.newPage();
  const adminPage = await adminContext.newPage();
  for (const page of [pageA, pageB, pageC, adminPage])
    page.setDefaultTimeout(15_000);

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
  await loginConsumer(pageC, consumerAUrl, platformAId);
  await pageC.goto(`${consumerAUrl}/subscription`, {
    waitUntil: 'domcontentloaded',
  });
  await pageC.getByRole('heading', { name: '订阅与兑换' }).waitFor();
  await pageC.getByRole('heading', { name: 'Pro', exact: true }).waitFor();
  await pageA.goto(`${consumerAUrl}/subscription`, {
    waitUntil: 'domcontentloaded',
  });
  await pageA.getByRole('heading', { name: '订阅与兑换' }).waitFor();
  await Promise.all([
    pageA.waitForURL(/\/login$/u, { waitUntil: 'domcontentloaded' }),
    pageA.getByRole('button', { name: '退出登录', exact: true }).click(),
  ]);
  await pageC
    .getByText(/请登录后继续|登录已失效/u)
    .first()
    .waitFor();
  await loginConsumer(pageA, consumerAUrl, platformAId);
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
  const platformAccountId = await exerciseAdmin(adminPage, adminTotp);
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
  await adminPage.getByRole('heading', { name: '平台目录' }).waitFor();
  await adminPage.goto(`${adminUrl}/admin/platforms/${platformAId}/accounts`, {
    waitUntil: 'domcontentloaded',
  });
  await adminPage.getByRole('heading', { name: '平台账户' }).waitFor();
  const suspendedAccountRow = adminPage.locator(
    `[data-test="account-row-${platformAccountId}"]`,
  );
  await suspendedAccountRow
    .getByRole('button', { name: '恢复', exact: true })
    .waitFor();
  await suspendedAccountRow
    .getByRole('button', { name: '恢复', exact: true })
    .click();
  await adminPage
    .locator('[data-test="confirm-action-reason"]')
    .fill('T16 R2 browser restore');
  const [restoreResponse] = await Promise.all([
    adminPage.waitForResponse((item) => item.url().includes('/restore')),
    adminPage.locator('[data-test="confirm-action-submit"]').click(),
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
      adminErrorCopyMatrix: 'PASS',
      filesStateMatrix: 'PASS',
      settingsLifecycleMatrix: 'PASS',
      batchReplayBoundaryUi: 'PASS',
      adminBatchConfirmationUi: 'PASS',
      multiTabTerminal: 'PASS',
      networkUnknownSensitiveMutation: 'PASS',
      ordinaryProof: 'PASS',
      closeDelete: 'PASS',
      browserBundleCredentials: 'PASS',
    }),
  );
} finally {
  await cleanup();
}
