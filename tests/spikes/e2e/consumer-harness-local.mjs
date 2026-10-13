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
const redemptionCodeA = 'A'.repeat(31);
const redemptionCodeB = 'B'.repeat(31);

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
        (${fixture.planId}, ${fixture.platformId}, 'free', 'Free', 'free', ${sql.json({ config_slot_limit: 3 })}),
        (${fixture.paidPlanId}, ${fixture.platformId}, 'pro', 'Pro', 'paid', ${sql.json({ advanced_config: true, config_slot_limit: 3 })})
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
         ${fixture.redemptionCode.slice(0, 4)}, ${fixture.redemptionCode.slice(-4)})
    `;
    await sql`
      insert into public.platform_file_policies
        (platform_id, enabled, max_file_bytes, max_platform_total_bytes)
      values (${fixture.platformId}, true, 128, 1048576)
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

async function binaryMutation(page, baseUrl, path, bytes, headers = {}) {
  const csrf = await csrfFor(page);
  return page.evaluate(
    async ({ requestPath, origin, csrfToken, byteValues, requestHeaders }) => {
      const response = await fetch(requestPath, {
        method: 'PUT',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          Origin: origin,
          'X-CSRF-Token': csrfToken,
          ...requestHeaders,
        },
        body: new Uint8Array(byteValues),
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
    {
      requestPath: path,
      origin: baseUrl,
      csrfToken: csrf,
      byteValues: [...bytes],
      requestHeaders: headers,
    },
  );
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
  const offers = await pageRequest(page, '/api/v1/commerce/offers');
  assert.equal(offers.status, 200, 'public commerce offers');
  assert.ok(Array.isArray(offers.body?.data), 'offers must be an array');
  assert.ok(
    offers.body.data.every(
      (item) =>
        typeof item?.offer_id === 'string' &&
        typeof item?.code === 'string' &&
        typeof item?.name === 'string' &&
        item?.price &&
        typeof item?.price?.currency === 'string' &&
        item?.term &&
        typeof item?.reason === 'string',
    ),
    'Offer contract fields must be readable through the Harness',
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
  const redeemKey = randomUUID();
  const redeem = await mutation(page, baseUrl, '/api/v1/subscription/redeem', {
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': redeemKey,
    },
    body: JSON.stringify({ code }),
  });
  assert.equal(redeem.status, 200, 'subscription redeem');
  assert.equal(redeem.body?.data?.plan?.code, 'pro');

  const invalidKey = `harness-invalid-${expectedPlatformId}`;
  const invalidOptions = {
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': invalidKey,
    },
    body: JSON.stringify({ code: 'C'.repeat(31) }),
  };
  const invalidRedeem = await mutation(
    page,
    baseUrl,
    '/api/v1/subscription/redeem',
    invalidOptions,
  );
  assert.equal(invalidRedeem.body?.error?.code, 'INVALID_CODE');
  const [account] =
    await sql`select id from public.platform_accounts where platform_id = ${expectedPlatformId}`;
  const [firstLimit] =
    await sql`select sum(hit_count) as hit_count from private.rate_limit_windows
    where key_hash = extensions.digest(convert_to(${`${expectedPlatformId}:${account.id}:redeem_subscription_code`}, 'utf8'), 'sha256')`;
  assert.equal(
    Number(firstLimit?.hit_count),
    2,
    'failed redemption persists its rate-limit count',
  );
  await mutation(page, baseUrl, '/api/v1/subscription/redeem', invalidOptions);
  const [replayedLimit] =
    await sql`select sum(hit_count) as hit_count from private.rate_limit_windows
    where key_hash = extensions.digest(convert_to(${`${expectedPlatformId}:${account.id}:redeem_subscription_code`}, 'utf8'), 'sha256')`;
  assert.equal(
    Number(replayedLimit?.hit_count),
    2,
    'same rejected intent replays without recounting',
  );
  async function exhaustWindow(key, limit) {
    await sql`insert into private.rate_limit_windows
      (key_hash, window_started_at, window_seconds, hit_count, limit_count, expires_at)
      select extensions.digest(convert_to(${key}, 'utf8'), 'sha256'),
        date_trunc('minute', now()) + minute * interval '1 minute', 60, ${limit}, ${limit},
        date_trunc('minute', now()) + (minute + 1) * interval '1 minute'
      from generate_series(0, 2) as minute
      on conflict (key_hash, window_started_at) do update set hit_count = excluded.hit_count`;
  }
  // Cover adjacent windows so the assertion does not race the wall-clock minute.
  await exhaustWindow(
    `${expectedPlatformId}:${account.id}:redeem_subscription_code`,
    5,
  );
  const limitedRedeem = await mutation(
    page,
    baseUrl,
    '/api/v1/subscription/redeem',
    {
      ...invalidOptions,
      headers: {
        ...invalidOptions.headers,
        'Idempotency-Key': `${invalidKey}-limited`,
      },
    },
  );
  assert.equal(limitedRedeem.status, 429, 'redemption limit fails closed');
  assert.equal(limitedRedeem.body?.error?.code, 'RATE_LIMITED');
  await sql`update private.rate_limit_windows set hit_count = 0
    where key_hash = extensions.digest(convert_to(${`${expectedPlatformId}:${account.id}:redeem_subscription_code`}, 'utf8'), 'sha256')`;
  await exhaustWindow(`${expectedPlatformId}:redeem_subscription_code`, 300);
  const platformLimited = await mutation(
    page,
    baseUrl,
    '/api/v1/subscription/redeem',
    {
      ...invalidOptions,
      headers: {
        ...invalidOptions.headers,
        'Idempotency-Key': `${invalidKey}-platform-limit`,
      },
    },
  );
  assert.equal(
    platformLimited.status,
    429,
    'platform limit protects other accounts too',
  );
  const successReplay = await mutation(
    page,
    baseUrl,
    '/api/v1/subscription/redeem',
    {
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': redeemKey,
      },
      body: JSON.stringify({ code }),
    },
  );
  assert.equal(
    successReplay.status,
    200,
    'completed success replays after counters are exhausted',
  );

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

  const configCreate = await mutation(page, baseUrl, '/api/v1/configs', {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Harness Config',
      description: 'OPT-007 Phase 02',
    }),
  });
  assert.equal(configCreate.status, 201, 'Config create');
  const configId = configCreate.body?.data?.config_id;
  assert.ok(configId, 'Config create must return config_id');
  assert.ok(configCreate.headers.etag, 'Config create must expose ETag');

  const configList = await pageRequest(page, '/api/v1/configs?limit=20');
  assert.equal(configList.status, 200, 'Config list');
  assert.ok(
    configList.body?.data?.items?.some((item) => item.config_id === configId),
    'created Config must be listed',
  );
  const configRead = await pageRequest(page, `/api/v1/configs/${configId}`);
  assert.equal(configRead.status, 200, 'Config read');
  assert.ok(configRead.headers.etag, 'Config read must expose ETag');
  const originalConfigEtag = configRead.headers.etag;
  const configPatch = await mutation(
    page,
    baseUrl,
    `/api/v1/configs/${configId}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'If-Match': originalConfigEtag,
      },
      body: JSON.stringify({ description: 'Updated through Consumer Harness' }),
    },
  );
  assert.equal(configPatch.status, 200, 'Config PATCH');
  const staleConfigPatch = await mutation(
    page,
    baseUrl,
    `/api/v1/configs/${configId}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'If-Match': originalConfigEtag,
      },
      body: JSON.stringify({ description: 'stale Config write' }),
    },
  );
  assert.equal(staleConfigPatch.status, 412, 'stale Config If-Match');

  const configContent = `consumer-harness-config:${expectedPlatformId}`;
  const versionIntent = await mutation(
    page,
    baseUrl,
    `/api/v1/configs/${configId}/versions/upload-intent`,
    {
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': randomUUID(),
      },
      body: JSON.stringify({
        name: 'harness-config.json',
        size: configContent.length,
        content_type: 'application/json',
        schema_key: 'harness.config',
        schema_version: '1',
        changelog: 'Initial Harness Version',
      }),
    },
  );
  assert.equal(versionIntent.status, 201, 'Config Version upload intent');
  const versionId = versionIntent.body?.data?.version_id;
  const versionFileId = versionIntent.body?.data?.file_id;
  const versionUploadPath = versionIntent.body?.data?.upload_path;
  assert.ok(
    versionId && versionFileId && versionUploadPath,
    'Version intent ids/path',
  );
  const versionUpload = await mutation(
    page,
    baseUrl,
    `/api${versionUploadPath}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Idempotency-Key': randomUUID(),
      },
      body: configContent,
    },
  );
  assert.equal(versionUpload.status, 202, 'Config Version binary upload');

  const configAfterUpload = await pageRequest(
    page,
    `/api/v1/configs/${configId}`,
  );
  assert.equal(
    configAfterUpload.status,
    200,
    'Config read after Version upload',
  );
  assert.equal(
    configAfterUpload.body?.data?.current_version_id,
    versionId,
    'completed Version upload must advance current_version_id',
  );
  const versionList = await pageRequest(
    page,
    `/api/v1/configs/${configId}/versions`,
  );
  assert.equal(versionList.status, 200, 'Config Version list');
  assert.ok(
    versionList.body?.data?.items?.some(
      (item) => item.version_id === versionId,
    ),
    'uploaded Version must be listed',
  );
  const ownerVersionContent = await pageRequest(
    page,
    `/api/v1/configs/${configId}/versions/${versionId}/content`,
  );
  assert.equal(
    ownerVersionContent.status,
    200,
    'owner Version content download',
  );
  assert.equal(
    ownerVersionContent.body?.raw,
    configContent,
    'owner Version bytes',
  );

  const gallerySubmission = await mutation(
    page,
    baseUrl,
    `/api/v1/configs/${configId}/gallery-submissions`,
    {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version_id: versionId }),
    },
  );
  assert.equal(gallerySubmission.status, 201, 'Gallery submission');
  assert.equal(gallerySubmission.body?.data?.status, 'pending');
  const beforeApproval = await pageRequest(
    page,
    `/api/v1/config-gallery/${configId}`,
  );
  assert.equal(beforeApproval.status, 404, 'pending submission is not public');

  const [pendingSubmission] = await sql`
    select id
    from public.platform_config_gallery_submissions
    where platform_id = ${expectedPlatformId}
      and config_id = ${configId}
      and version_id = ${versionId}
      and status = 'pending'
  `;
  assert.ok(pendingSubmission?.id, 'pending Gallery submission fixture');
  await sql`
    update public.platform_config_gallery_submissions
    set status = 'approved', reviewed_at = now(), review_reason = 'Consumer Harness Phase 02 fixture'
    where id = ${pendingSubmission.id}
  `;
  await sql`
    insert into public.platform_config_gallery_entries
      (config_id, platform_id, published_version_id, approved_submission_id, status, approved_at)
    values
      (${configId}, ${expectedPlatformId}, ${versionId}, ${pendingSubmission.id}, 'approved', now())
  `;

  const galleryList = await pageRequest(
    page,
    '/api/v1/config-gallery?limit=20',
  );
  assert.equal(galleryList.status, 200, 'Gallery list after approval');
  assert.ok(
    galleryList.body?.data?.items?.some((item) => item.config_id === configId),
    'approved Config must appear in Gallery',
  );
  const galleryRead = await pageRequest(
    page,
    `/api/v1/config-gallery/${configId}`,
  );
  assert.equal(galleryRead.status, 200, 'Gallery detail after approval');
  assert.equal(galleryRead.body?.data?.published_version_id, versionId);

  const liked = await mutation(
    page,
    baseUrl,
    `/api/v1/config-gallery/${configId}/like`,
    {
      method: 'PUT',
    },
  );
  assert.equal(liked.status, 200, 'Gallery like');
  assert.equal(liked.body?.data?.liked, true);
  assert.equal(liked.body?.data?.like_count, 1);
  const unliked = await mutation(
    page,
    baseUrl,
    `/api/v1/config-gallery/${configId}/like`,
    { method: 'DELETE' },
  );
  assert.equal(unliked.status, 200, 'Gallery unlike');
  assert.equal(unliked.body?.data?.liked, false);
  assert.equal(unliked.body?.data?.like_count, 0);

  const galleryDownload = await pageRequest(
    page,
    `/api/v1/config-gallery/${configId}/content`,
  );
  assert.equal(galleryDownload.status, 200, 'Gallery content download');
  assert.equal(
    galleryDownload.body?.raw,
    configContent,
    'Gallery content bytes',
  );
  const [{ count: downloadCount }] = await sql`
    select count(*)::integer as count
    from public.platform_config_usage_events
    where platform_id = ${expectedPlatformId}
      and config_id = ${configId}
      and event_type = 'download_completed'
  `;
  assert.equal(
    downloadCount,
    1,
    'completed Gallery download records one usage fact',
  );

  const applyKey = randomUUID();
  const applyOne = await mutation(
    page,
    baseUrl,
    `/api/v1/config-gallery/${configId}/apply`,
    {
      headers: { 'Idempotency-Key': applyKey },
    },
  );
  assert.equal(applyOne.status, 200, 'Gallery apply delivery');
  assert.equal(
    applyOne.body?.raw,
    configContent,
    'apply returns approved Version bytes',
  );
  const applyRepeat = await mutation(
    page,
    baseUrl,
    `/api/v1/config-gallery/${configId}/apply`,
    { headers: { 'Idempotency-Key': applyKey } },
  );
  assert.equal(applyRepeat.status, 200, 'repeated Gallery apply delivery');
  assert.equal(
    applyRepeat.body?.raw,
    configContent,
    'repeated apply safely redelivers bytes',
  );
  const [{ count: applyCount }] = await sql`
    select count(*)::integer as count
    from public.platform_config_usage_events
    where platform_id = ${expectedPlatformId}
      and config_id = ${configId}
      and event_type = 'apply_delivery_completed'
  `;
  assert.equal(
    applyCount,
    1,
    'repeated apply key deduplicates central usage fact',
  );

  const textFeedback = await mutation(page, baseUrl, '/api/v1/feedback', {
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': randomUUID(),
    },
    body: JSON.stringify({
      category: 'idea',
      title: 'Text-only Harness Feedback',
      body: 'A text-only feedback submission.',
      contact_allowed: false,
      client_context: { route: '/settings', app_version: 'harness' },
    }),
  });
  assert.equal(textFeedback.status, 201, 'text-only Feedback create');
  const textFeedbackId = textFeedback.body?.data?.feedback_id;
  assert.ok(textFeedbackId, 'text-only Feedback id');
  const textSubmit = await mutation(
    page,
    baseUrl,
    `/api/v1/feedback/${textFeedbackId}/submit`,
    { headers: { 'Content-Type': 'application/json' }, body: '{}' },
  );
  assert.equal(textSubmit.status, 200, 'text-only Feedback submit');
  assert.equal(textSubmit.body?.data?.status, 'new');

  const imageFeedback = await mutation(page, baseUrl, '/api/v1/feedback', {
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': randomUUID(),
    },
    body: JSON.stringify({
      category: 'bug',
      title: 'Image Harness Feedback',
      body: 'Feedback with a private PNG attachment.',
      contact_allowed: true,
      client_context: {
        route: '/feedback',
        app_version: 'harness',
        browser: 'playwright',
      },
    }),
  });
  assert.equal(imageFeedback.status, 201, 'image Feedback create');
  const feedbackId = imageFeedback.body?.data?.feedback_id;
  assert.ok(feedbackId, 'image Feedback id');
  const pngBytes = Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3,
  ]);
  const attachmentIntent = await mutation(
    page,
    baseUrl,
    `/api/v1/feedback/${feedbackId}/attachments/upload-intent`,
    {
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': randomUUID(),
      },
      body: JSON.stringify({
        name: 'harness.png',
        size: pngBytes.length,
        content_type: 'image/png',
      }),
    },
  );
  assert.equal(attachmentIntent.status, 201, 'Feedback attachment intent');
  const attachmentId = attachmentIntent.body?.data?.attachment_id;
  const attachmentUploadPath = attachmentIntent.body?.data?.upload_path;
  assert.ok(
    attachmentId && attachmentUploadPath,
    'Feedback attachment id/path',
  );
  const prematureSubmit = await mutation(
    page,
    baseUrl,
    `/api/v1/feedback/${feedbackId}/submit`,
    { headers: { 'Content-Type': 'application/json' }, body: '{}' },
  );
  assert.equal(
    prematureSubmit.status,
    409,
    'unsettled attachment blocks submit',
  );
  assert.equal(
    prematureSubmit.body?.error?.code,
    'FEEDBACK_ATTACHMENT_NOT_READY',
  );
  const badMagic = await binaryMutation(
    page,
    baseUrl,
    `/api${attachmentUploadPath}`,
    new Uint8Array(pngBytes.length).fill(0x41),
    { 'Content-Type': 'image/png', 'Idempotency-Key': randomUUID() },
  );
  assert.equal(badMagic.status, 415, 'Feedback image magic mismatch');
  const uploadedAttachment = await binaryMutation(
    page,
    baseUrl,
    `/api${attachmentUploadPath}`,
    pngBytes,
    { 'Content-Type': 'image/png', 'Idempotency-Key': randomUUID() },
  );
  assert.equal(uploadedAttachment.status, 202, 'Feedback image upload');
  assert.equal(uploadedAttachment.body?.data?.status, 'active');
  const submittedFeedback = await mutation(
    page,
    baseUrl,
    `/api/v1/feedback/${feedbackId}/submit`,
    { headers: { 'Content-Type': 'application/json' }, body: '{}' },
  );
  assert.equal(submittedFeedback.status, 200, 'Feedback submit after upload');
  assert.equal(submittedFeedback.body?.data?.status, 'new');
  const feedbackRead = await pageRequest(
    page,
    `/api/v1/feedback/${feedbackId}`,
  );
  assert.equal(feedbackRead.status, 200, 'submitted Feedback remains readable');
  assert.equal(feedbackRead.body?.data?.attachments?.length, 1);
  const [feedbackState] = await sql`
    select f.status, f.contact_email_snapshot,
      (select count(*)::integer
       from public.platform_feedback_attachments a
       where a.feedback_id = f.id and a.status = 'active') as attachment_count
    from public.platform_feedback f
    where f.platform_id = ${expectedPlatformId} and f.id = ${feedbackId}
  `;
  assert.equal(feedbackState?.status, 'new');
  assert.equal(
    feedbackState?.contact_email_snapshot,
    userEmail,
    'Feedback contact email comes from server-confirmed Auth identity',
  );
  assert.equal(feedbackState?.attachment_count, 1);

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
  return { configId, versionId, versionFileId, feedbackId };
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
  await sql`delete from private.rate_limit_windows
    where key_hash = extensions.digest(convert_to(${`${platformAId}:redeem_subscription_code`}, 'utf8'), 'sha256')
       or key_hash = extensions.digest(convert_to(${`${platformBId}:redeem_subscription_code`}, 'utf8'), 'sha256')
       or key_hash in (
      select extensions.digest(convert_to(platform_id::text || ':' || id::text || ':redeem_subscription_code', 'utf8'), 'sha256')
      from public.platform_accounts where platform_id = ${platformAId} or platform_id = ${platformBId}
    )`.catch(() => {});
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
  await sql`delete from public.platform_config_usage_events where platform_id = ${platformAId} or platform_id = ${platformBId}`.catch(
    () => {},
  );
  await sql`delete from public.platform_config_likes where platform_id = ${platformAId} or platform_id = ${platformBId}`.catch(
    () => {},
  );
  await sql`delete from public.platform_config_gallery_entries where platform_id = ${platformAId} or platform_id = ${platformBId}`.catch(
    () => {},
  );
  await sql`delete from public.platform_config_gallery_submissions where platform_id = ${platformAId} or platform_id = ${platformBId}`.catch(
    () => {},
  );
  await sql`update public.platform_configs set current_version_id = null where platform_id = ${platformAId} or platform_id = ${platformBId}`.catch(
    () => {},
  );
  await sql`delete from public.platform_config_versions where platform_id = ${platformAId} or platform_id = ${platformBId}`.catch(
    () => {},
  );
  await sql`delete from public.platform_configs where platform_id = ${platformAId} or platform_id = ${platformBId}`.catch(
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

  const resultA = await exerciseHarness(
    pageA,
    contextA,
    harnessAUrl,
    platformAId,
    redemptionCodeA,
  );
  const resultB = await exerciseHarness(
    pageB,
    contextB,
    harnessBUrl,
    platformBId,
    redemptionCodeB,
  );

  const crossConfigFromB = await pageRequest(
    pageB,
    `/api/v1/configs/${resultA.configId}`,
  );
  assert.equal(
    crossConfigFromB.status,
    404,
    'cross-platform Config IDOR fails closed',
  );
  const crossGalleryFromB = await pageRequest(
    pageB,
    `/api/v1/config-gallery/${resultA.configId}`,
  );
  assert.equal(
    crossGalleryFromB.status,
    404,
    'cross-platform Gallery IDOR fails closed',
  );
  const crossConfigFromA = await pageRequest(
    pageA,
    `/api/v1/configs/${resultB.configId}`,
  );
  assert.equal(
    crossConfigFromA.status,
    404,
    'reverse cross-platform Config IDOR fails closed',
  );
  const crossFeedbackFromB = await pageRequest(
    pageB,
    `/api/v1/feedback/${resultA.feedbackId}`,
  );
  assert.equal(
    crossFeedbackFromB.status,
    404,
    'cross-platform Feedback IDOR fails closed',
  );
  const crossFeedbackFromA = await pageRequest(
    pageA,
    `/api/v1/feedback/${resultB.feedbackId}`,
  );
  assert.equal(
    crossFeedbackFromA.status,
    404,
    'reverse cross-platform Feedback IDOR fails closed',
  );

  for (const [page, baseUrl, result, platformId] of [
    [pageA, harnessAUrl, resultA, platformAId],
    [pageB, harnessBUrl, resultB, platformBId],
  ]) {
    const deleted = await mutation(
      page,
      baseUrl,
      `/api/v1/configs/${result.configId}`,
      { method: 'DELETE' },
    );
    assert.equal(deleted.status, 202, 'Config delete request');
    assert.equal(deleted.body?.data?.status, 'deleting');
    const hiddenGallery = await pageRequest(
      page,
      `/api/v1/config-gallery/${result.configId}`,
    );
    assert.equal(
      hiddenGallery.status,
      404,
      'deleted-requested Config leaves Gallery immediately',
    );
    const [fileState] = await sql`
      select status, resource_kind
      from public.platform_config_files
      where platform_id = ${platformId} and id = ${result.versionFileId}
    `;
    assert.equal(fileState?.resource_kind, 'config_version');
    assert.equal(
      fileState?.status,
      'deleting',
      'Config delete hands Version file to cleanup',
    );
  }
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
        configResources: 'PASS',
        galleryUsageAndIsolation: 'PASS',
        feedbackSubmissionAndIsolation: 'PASS',
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
