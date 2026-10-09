import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
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
      .filter(Boolean)
      .map((match) => [match[1], match[2]]),
  );
})();

const authUrl = localStatus.API_URL;
const anonKey = localStatus.ANON_KEY;
const publishableKey = localStatus.PUBLISHABLE_KEY;
const databaseUrl = localStatus.DB_URL;
if (!authUrl || !anonKey || !publishableKey || !databaseUrl)
  throw new Error(
    'Consumer Harness E2E requires Local Supabase Auth, publishable key and DB URL',
  );

const serviceRoleKey = localStatus.SERVICE_ROLE_KEY;
const platformSecret =
  process.env.CONSUMER_HARNESS_PLATFORM_KEY_HMAC_SECRET ??
  'local-fixture-only-consumer-harness-platform-key-secret';
const redemptionSecret =
  process.env.CONSUMER_HARNESS_REDEMPTION_HMAC_SECRET ??
  'local-fixture-only-consumer-harness-redemption-secret';
const denoPath = process.env.DENO_BIN?.trim() || 'deno';
const centralUrl = 'http://127.0.0.1:8789';
const harnessAUrl = 'http://127.0.0.1:3110';
const harnessBUrl = 'http://127.0.0.1:3111';

const userEmail = `consumer-harness-${randomUUID()}@example.test`;
const fixtureOwnerEmail = `consumer-harness-owner-${randomUUID()}@example.test`;
const userPassword = `Harness-user-${randomBytes(16).toString('hex')}!`;
const fixtureOwnerPassword = `Harness-owner-${randomBytes(16).toString('hex')}!`;
const platformAId = randomUUID();
const platformBId = randomUUID();
const platformAPlanId = randomUUID();
const platformBPlanId = randomUUID();
const platformAPaidPlanId = randomUUID();
const platformBPaidPlanId = randomUUID();
const platformAKeyId = randomUUID();
const platformBKeyId = randomUUID();
const platformABatchId = randomUUID();
const platformBBatchId = randomUUID();
const platformACodeId = randomUUID();
const platformBCodeId = randomUUID();
const platformACode = `harness-a-${platformAId.slice(0, 8)}`;
const platformBCode = `harness-b-${platformBId.slice(0, 8)}`;
const presentedKeyA = `phk_v1_${platformAKeyId}_harness-a`;
const presentedKeyB = `phk_v1_${platformBKeyId}_harness-b`;
const redemptionCodeA = 'HARNESSA23456789';
const redemptionCodeB = 'HARNESSB23456789';

const sql = postgres(databaseUrl, {
  max: 4,
  prepare: false,
  onnotice: () => {},
});
const children = [];
let browser;
let userId;
let fixtureOwnerId;
let cleaningUp = false;

function keyHmac(keyId, presentedKey) {
  return createHmac('sha256', platformSecret)
    .update(`1:platform-key:${keyId}:${presentedKey}`)
    .digest('hex');
}

function redemptionHmac(platformId, code) {
  return createHmac('sha256', redemptionSecret)
    .update(
      `redeem:v1:platform:${platformId}:key:1:code:${code.replaceAll('-', '')}`,
    )
    .digest('hex');
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

async function signup(email, password) {
  const result = await authRequest('/auth/v1/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  assert.equal(result.response.status, 200, `signup ${email}`);
  assert.ok(result.body?.user?.id, `signup ${email} must return user`);
  return result.body.user.id;
}

function startProcess(command, args, env, label) {
  const child = spawn(command, args, {
    cwd: repositoryRoot,
    env: { ...process.env, ...env },
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout?.on('data', (chunk) => {
    output = `${output}${chunk}`.slice(-4000);
  });
  child.stderr?.on('data', (chunk) => {
    output = `${output}${chunk}`.slice(-4000);
  });
  child.once('exit', (code) => {
    if (!cleaningUp && code !== null && code !== 0)
      console.error(`${label} exited with ${code}: ${output}`);
  });
  children.push(child);
  return child;
}

async function waitForUrl(url, label, expectedStatus = 200) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.status === expectedStatus) return;
    } catch {
      // Process still starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error(`${label} did not become ready`);
}

async function createFixtures() {
  userId = await signup(userEmail, userPassword);
  fixtureOwnerId = await signup(fixtureOwnerEmail, fixtureOwnerPassword);

  for (const fixture of [
    {
      platformId: platformAId,
      platformCode: platformACode,
      planId: platformAPlanId,
      paidPlanId: platformAPaidPlanId,
      keyId: platformAKeyId,
      presentedKey: presentedKeyA,
      name: 'Consumer Harness A',
      batchId: platformABatchId,
      redemptionCode: redemptionCodeA,
      redemptionCodeId: platformACodeId,
    },
    {
      platformId: platformBId,
      platformCode: platformBCode,
      planId: platformBPlanId,
      paidPlanId: platformBPaidPlanId,
      keyId: platformBKeyId,
      presentedKey: presentedKeyB,
      name: 'Consumer Harness B',
      batchId: platformBBatchId,
      redemptionCode: redemptionCodeB,
      redemptionCodeId: platformBCodeId,
    },
  ]) {
    await sql`
      insert into public.platforms (id, code, name, status, allow_activation)
      values (${fixture.platformId}, ${fixture.platformCode}, ${fixture.name}, 'active', true)
    `;
    await sql`
      insert into public.plans (id, platform_id, code, name, kind, features)
      values
        (${fixture.planId}, ${fixture.platformId}, 'free', 'Free', 'free', ${sql.json({})}),
        (${fixture.paidPlanId}, ${fixture.platformId}, 'pro', 'Pro', 'paid', ${sql.json({ advanced_config: true })})
    `;
    await sql`
      update public.platforms
      set default_plan_id = ${fixture.planId}
      where id = ${fixture.platformId}
    `;
    await sql`
      insert into private.platform_api_keys
        (id, platform_id, name, key_hmac, hmac_key_version, key_prefix, key_suffix, creation_operation_id)
      values
        (${fixture.keyId}, ${fixture.platformId}, ${fixture.name}, ${keyHmac(fixture.keyId, fixture.presentedKey)}, 1, 'phk_v1', ${fixture.presentedKey.slice(-8)}, ${randomUUID()})
    `;
    await sql`
      insert into public.redemption_code_batches
        (id, platform_id, plan_id, name, quantity, duration_value, duration_unit,
         expires_at, status, delivery_deadline, delivered_at, delivery_session_id,
         delivery_receipt_hmac, created_by, creation_operation_id)
      values
        (${fixture.batchId}, ${fixture.platformId}, ${fixture.paidPlanId}, 'Consumer Harness fixture', 1, 30, 'day',
         now() + interval '30 days', 'active', now() + interval '1 day', now(),
         ${randomUUID()}, ${createHmac('sha256', redemptionSecret)
           .update(
             `delivery:v1:platform:${fixture.platformId}:receipt:${fixture.batchId}`,
           )
           .digest('hex')}, ${fixtureOwnerId}, ${randomUUID()})
    `;
    await sql`
      insert into public.redemption_codes
        (id, platform_id, batch_id, plan_id, code_hmac, hmac_key_version, code_prefix, code_suffix)
      values
        (${fixture.redemptionCodeId}, ${fixture.platformId}, ${fixture.batchId}, ${fixture.paidPlanId},
         ${redemptionHmac(fixture.platformId, fixture.redemptionCode)}, 1,
         ${fixture.redemptionCode.slice(0, 8)}, ${fixture.redemptionCode.slice(-4)})
    `;
    await sql`
      insert into public.platform_file_policies
        (platform_id, max_file_bytes, max_files, max_total_bytes)
      values (${fixture.platformId}, 128, 10, 1280)
    `;
  }
}

async function startServices() {
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
      SUPABASE_SECRET_KEY: serviceRoleKey,
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
    401,
  );

  for (const [url, key] of [
    [harnessAUrl, presentedKeyA],
    [harnessBUrl, presentedKeyB],
  ]) {
    const parsed = new URL(url);
    startProcess(
      process.execPath,
      ['tests/consumer-harness/server.mjs'],
      {
        HARNESS_ORIGIN: url,
        HARNESS_PORT: parsed.port,
        SUPABASE_URL: authUrl,
        SUPABASE_PUBLISHABLE_KEY: publishableKey,
        ACCOUNT_API_URL: centralUrl,
        ACCOUNT_PLATFORM_KEY: key,
      },
      `Harness ${parsed.port}`,
    );
    await waitForUrl(url, `Harness ${parsed.port}`);
  }
}

async function pageRequest(page, path, options = {}) {
  return page.evaluate(
    async ({ requestPath, init }) => {
      const response = await fetch(requestPath, {
        ...init,
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const text = await response.text();
      let body;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = { raw: text };
      }
      return {
        status: response.status,
        body,
        headers: Object.fromEntries(response.headers.entries()),
      };
    },
    { requestPath: path, init: options },
  );
}

async function login(page, baseUrl) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('邮箱').fill(userEmail);
  await page.getByLabel('密码').fill(userPassword);
  const responsePromise = page.waitForResponse((response) =>
    response.url().endsWith('/api/auth/login'),
  );
  await page.getByRole('button', { name: '登录', exact: true }).click();
  const response = await responsePromise;
  assert.equal(response.status(), 200, `login ${baseUrl}`);
}

async function csrfFor(page) {
  return page.evaluate(() => {
    const entry = document.cookie
      .split('; ')
      .find((candidate) => candidate.startsWith('aisenhub-harness-csrf='));
    return entry ? decodeURIComponent(entry.split('=').slice(1).join('=')) : '';
  });
}

async function mutation(page, baseUrl, path, init = {}) {
  const csrf = await csrfFor(page);
  return pageRequest(page, path, {
    ...init,
    method: init.method ?? 'POST',
    headers: {
      Origin: baseUrl,
      'X-CSRF-Token': csrf,
      ...(init.headers ?? {}),
    },
  });
}

async function exerciseHarness(
  page,
  context,
  baseUrl,
  expectedPlatformId,
  code,
) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  const publicPlans = await pageRequest(page, '/api/v1/plans');
  assert.equal(publicPlans.status, 200, 'public plans');
  const products = await pageRequest(page, '/api/v1/subscription/products');
  assert.equal(products.status, 200, 'public subscription products');
  assert.ok(Array.isArray(products.body?.data), 'products must be an array');
  assert.ok(
    products.body.data.every(
      (item) =>
        typeof item?.code === 'string' &&
        typeof item?.name === 'string' &&
        typeof item?.currency === 'string' &&
        item?.term &&
        typeof item?.reason === 'string',
    ),
    'product contract fields must be readable through the Harness',
  );

  await login(page, baseUrl);
  const cookies = await context.cookies();
  const access = cookies.find(
    (item) => item.name === 'aisenhub-harness-access',
  );
  const refresh = cookies.find(
    (item) => item.name === 'aisenhub-harness-refresh',
  );
  const csrf = cookies.find((item) => item.name === 'aisenhub-harness-csrf');
  assert.equal(access?.httpOnly, true, 'access cookie must be HttpOnly');
  assert.equal(refresh?.httpOnly, true, 'refresh cookie must be HttpOnly');
  assert.equal(
    csrf?.httpOnly,
    false,
    'CSRF cookie must remain browser-readable',
  );
  assert.equal(
    (await page.evaluate(() => document.cookie)).includes(
      'aisenhub-harness-access=',
    ),
    false,
    'browser JavaScript must not see the access token',
  );

  const activate = await mutation(page, baseUrl, '/api/v1/account/activate', {
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(activate.status, 200, 'account activate');
  const principal = await pageRequest(page, '/api/v1/account/principal');
  assert.equal(principal.status, 200, 'principal');
  assert.equal(principal.body?.data?.platform_id, expectedPlatformId);
  assert.equal(principal.body?.data?.account_status, 'active');

  const wrongOriginCookies = (await context.cookies())
    .map((item) => `${item.name}=${item.value}`)
    .join('; ');
  const wrongOrigin = await fetch(`${baseUrl}/api/v1/profile`, {
    method: 'PATCH',
    headers: {
      Cookie: wrongOriginCookies,
      Origin: 'http://127.0.0.1:3999',
      'X-CSRF-Token': await csrfFor(page),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ bio: 'wrong origin' }),
  });
  assert.equal(wrongOrigin.status, 403, 'wrong Origin must fail closed');

  const noCsrf = await fetch(`${baseUrl}/api/v1/profile`, {
    method: 'PATCH',
    headers: {
      Cookie: wrongOriginCookies,
      Origin: baseUrl,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ bio: 'missing csrf' }),
  });
  assert.equal(noCsrf.status, 403, 'missing CSRF must fail closed');

  const subscriptionBefore = await pageRequest(page, '/api/v1/subscription');
  assert.equal(subscriptionBefore.status, 200, 'subscription read');
  assert.equal(subscriptionBefore.body?.data?.plan?.code, 'free');
  const redeem = await mutation(page, baseUrl, '/api/v1/subscription/redeem', {
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': randomUUID(),
    },
    body: JSON.stringify({ code }),
  });
  assert.equal(redeem.status, 200, 'subscription redeem');
  assert.equal(redeem.body?.data?.plan?.code, 'pro');

  const protectedFeature = await pageRequest(
    page,
    '/api/protected/advanced-config',
  );
  assert.equal(
    protectedFeature.status,
    200,
    'fail-closed feature helper after grant',
  );

  const profile = await pageRequest(page, '/api/v1/profile');
  assert.equal(profile.status, 200, 'profile GET');
  assert.ok(profile.headers.etag, 'profile GET must expose ETag');
  const profilePatch = await mutation(page, baseUrl, '/api/v1/profile', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'If-Match': profile.headers.etag,
    },
    body: JSON.stringify({
      display_name: 'Harness User',
      bio: 'Contract probe',
    }),
  });
  assert.equal(profilePatch.status, 200, 'profile PATCH');
  const staleProfile = await mutation(page, baseUrl, '/api/v1/profile', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'If-Match': profile.headers.etag,
    },
    body: JSON.stringify({ bio: 'stale write' }),
  });
  assert.equal(staleProfile.status, 412, 'stale profile If-Match');

  const preferences = await pageRequest(page, '/api/v1/preferences');
  assert.equal(preferences.status, 200, 'preferences GET');
  assert.ok(preferences.headers.etag, 'preferences GET must expose ETag');
  const preferencePatch = await mutation(page, baseUrl, '/api/v1/preferences', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'If-Match': preferences.headers.etag,
    },
    body: JSON.stringify({ theme: 'dark', harness: true }),
  });
  assert.equal(preferencePatch.status, 200, 'preferences PATCH');

  const fileContent = 'consumer-harness-file';
  const intent = await mutation(
    page,
    baseUrl,
    '/api/v1/config-files/upload-intent',
    {
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': randomUUID(),
      },
      body: JSON.stringify({
        name: 'harness.ini',
        size: fileContent.length,
        content_type: 'text/plain',
        purpose: 'config',
      }),
    },
  );
  assert.equal(intent.status, 201, 'file upload intent');
  const fileId = intent.body?.data?.file_id;
  const uploadPath = intent.body?.data?.upload_path;
  assert.ok(fileId && uploadPath, 'upload intent must return file id/path');
  const upload = await mutation(page, baseUrl, `/api${uploadPath}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Idempotency-Key': randomUUID(),
    },
    body: fileContent,
  });
  assert.equal(upload.status, 202, 'binary upload');
  const listed = await pageRequest(page, '/api/v1/config-files?limit=20');
  assert.equal(listed.status, 200, 'file list');
  assert.ok(
    listed.body?.data?.items?.some((item) => item.file_id === fileId),
    'uploaded file must be listed',
  );
  const downloaded = await pageRequest(
    page,
    `/api/v1/config-files/${fileId}/content`,
  );
  assert.equal(downloaded.status, 200, 'file download');
  assert.equal(downloaded.body?.raw, fileContent, 'download content');
  const removed = await mutation(
    page,
    baseUrl,
    `/api/v1/config-files/${fileId}`,
    {
      method: 'DELETE',
      headers: { 'Idempotency-Key': randomUUID() },
    },
  );
  assert.equal(removed.status, 202, 'file delete request');

  await sql`
    update public.platform_accounts
    set status = 'suspended'
    where platform_id = ${expectedPlatformId} and user_id = ${userId}
  `;
  const suspended = await pageRequest(page, '/api/v1/profile');
  assert.equal(suspended.status, 403, 'suspended account protected route');
  assert.equal(suspended.body?.error?.code, 'ACCOUNT_SUSPENDED');
  await sql`
    update public.platform_accounts
    set status = 'active'
    where platform_id = ${expectedPlatformId} and user_id = ${userId}
  `;
}

async function exerciseSessionTerminal(page, context, baseUrl) {
  const csrf = await csrfFor(page);
  const logout = await pageRequest(page, '/api/auth/logout', {
    method: 'POST',
    headers: { Origin: baseUrl, 'X-CSRF-Token': csrf },
  });
  assert.equal(logout.status, 200, 'logout');
  const afterLogout = await pageRequest(page, '/api/v1/account/principal');
  assert.equal(afterLogout.status, 401, 'protected request after logout');

  await login(page, baseUrl);
  const currentCsrf = await csrfFor(page);
  await context.addCookies([
    {
      name: 'aisenhub-harness-refresh',
      value: 'invalid-refresh-token',
      url: baseUrl,
      httpOnly: true,
      sameSite: 'Strict',
    },
  ]);
  const invalidRefresh = await pageRequest(page, '/api/auth/refresh', {
    method: 'POST',
    headers: { Origin: baseUrl, 'X-CSRF-Token': currentCsrf },
  });
  assert.equal(invalidRefresh.status, 401, 'invalid refresh must fail closed');
  const terminalCookies = await context.cookies();
  assert.equal(
    terminalCookies.some((item) => item.name === 'aisenhub-harness-access'),
    false,
    'invalid refresh must clear access cookie',
  );
  assert.equal(
    terminalCookies.some((item) => item.name === 'aisenhub-harness-refresh'),
    false,
    'invalid refresh must clear refresh cookie',
  );
}

async function cleanup() {
  cleaningUp = true;
  await sql`delete from public.audit_logs where platform_id = ${platformAId} or platform_id = ${platformBId}`.catch(
    () => {},
  );
  await sql`delete from public.subscription_events where platform_id = ${platformAId} or platform_id = ${platformBId}`.catch(
    () => {},
  );
  await sql`delete from public.subscription_grants where platform_id = ${platformAId} or platform_id = ${platformBId}`.catch(
    () => {},
  );
  await sql`delete from public.redemption_events where platform_id = ${platformAId} or platform_id = ${platformBId}`.catch(
    () => {},
  );
  await sql`delete from public.redemption_codes where platform_id = ${platformAId} or platform_id = ${platformBId}`.catch(
    () => {},
  );
  await sql`delete from public.redemption_code_batches where platform_id = ${platformAId} or platform_id = ${platformBId}`.catch(
    () => {},
  );
  await sql`delete from storage.objects where bucket_id = 'platform-config-files' and (name like ${`${platformAId}/%`} or name like ${`${platformBId}/%`})`.catch(
    () => {},
  );
  await sql`delete from public.platform_config_files where platform_id = ${platformAId} or platform_id = ${platformBId}`.catch(
    () => {},
  );
  await sql`delete from public.platform_file_policies where platform_id = ${platformAId} or platform_id = ${platformBId}`.catch(
    () => {},
  );
  await sql`delete from public.platform_accounts where platform_id = ${platformAId} or platform_id = ${platformBId}`.catch(
    () => {},
  );
  await sql`delete from public.plans where platform_id = ${platformAId} or platform_id = ${platformBId}`.catch(
    () => {},
  );
  await sql`delete from private.platform_api_keys where platform_id = ${platformAId} or platform_id = ${platformBId}`.catch(
    () => {},
  );
  await sql`delete from public.platforms where id = ${platformAId} or id = ${platformBId}`.catch(
    () => {},
  );
  for (const id of [userId, fixtureOwnerId].filter(Boolean)) {
    await sql`delete from auth.sessions where user_id = ${id}`.catch(() => {});
    await sql`delete from auth.identities where user_id = ${id}`.catch(
      () => {},
    );
    await sql`delete from auth.users where id = ${id}`.catch(() => {});
  }
  if (browser) await browser.close().catch(() => {});
  for (const child of children) {
    if (!child.pid) continue;
    if (process.platform === 'win32')
      await execFileAsync('taskkill', [
        '/pid',
        String(child.pid),
        '/t',
        '/f',
      ]).catch(() => {});
    else {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {}
    }
  }
  await sql.end({ timeout: 5 }).catch(() => {});
}

try {
  await createFixtures();
  await startServices();
  browser = await chromium.launch({
    channel: process.env.CONSUMER_HARNESS_BROWSER_CHANNEL ?? 'chrome',
    headless: true,
    args: ['--no-proxy-server'],
  });
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  await exerciseHarness(
    pageA,
    contextA,
    harnessAUrl,
    platformAId,
    redemptionCodeA,
  );
  await exerciseHarness(
    pageB,
    contextB,
    harnessBUrl,
    platformBId,
    redemptionCodeB,
  );
  const cookiesA = await contextA.cookies();
  const cookiesB = await contextB.cookies();
  assert.notEqual(
    cookiesA.find((item) => item.name === 'aisenhub-harness-access')?.value,
    cookiesB.find((item) => item.name === 'aisenhub-harness-access')?.value,
    'independent browser contexts must not share access tokens',
  );

  await exerciseSessionTerminal(pageA, contextA, harnessAUrl);
  console.log(
    JSON.stringify(
      {
        harnessProcess: 'PASS',
        authCookiesAndCsrf: 'PASS',
        platformIsolation: 'PASS',
        accountActivation: 'PASS',
        subscriptionRedeem: 'PASS',
        profilePreferencesEtag: 'PASS',
        binaryFiles: 'PASS',
        suspendedFailClosed: 'PASS',
        logoutAndInvalidRefresh: 'PASS',
      },
      null,
      2,
    ),
  );
} finally {
  await cleanup();
}
