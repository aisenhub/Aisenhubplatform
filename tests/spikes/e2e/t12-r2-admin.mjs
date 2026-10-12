import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const require = createRequire(import.meta.url);
const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const playwrightStore = join(repositoryRoot, 'node_modules', '.pnpm');
const playwrightPackage = readdirSync(playwrightStore).find((name) =>
  /^playwright@\d/u.test(name),
);
if (!playwrightPackage)
  throw new Error('Playwright package is not installed in the workspace');
const { chromium } = require(
  join(playwrightStore, playwrightPackage, 'node_modules', 'playwright'),
);

const authUrl = process.env.SUPABASE_LOCAL_URL;
const anonKey = process.env.SUPABASE_LOCAL_ANON_KEY;
const databaseUrl = process.env.SUPABASE_DB_URL;
const appUrl = (
  process.env.T12_ADMIN_APP_URL ?? 'http://localhost:3001'
).replace(/\/$/u, '');
const allowSystemAdminSwap = process.env.T12_ALLOW_SYSTEM_ADMIN_SWAP === '1';

if (!authUrl || !anonKey || !databaseUrl)
  throw new Error(
    'T12 browser probe requires SUPABASE_LOCAL_URL, SUPABASE_LOCAL_ANON_KEY, and SUPABASE_DB_URL',
  );
if (!allowSystemAdminSwap)
  throw new Error(
    'T12 browser probe requires T12_ALLOW_SYSTEM_ADMIN_SWAP=1 for an isolated Local system_admin fixture',
  );

const sql = postgres(databaseUrl, {
  max: 4,
  prepare: false,
  onnotice: () => undefined,
});
const platformId = crypto.randomUUID();
const otherPlatformId = crypto.randomUUID();
const platformAccountId = crypto.randomUUID();
const paginationAccountIds = Array.from({ length: 21 }, () =>
  crypto.randomUUID(),
);
const configPlatformKeyId = crypto.randomUUID();
const planId = crypto.randomUUID();
const platformCode = `t12-r2-browser-${crypto.randomUUID()}`;
const otherPlatformCode = `t12-r2-other-${crypto.randomUUID()}`;
const email = `t12-r2-browser-${crypto.randomUUID()}@example.test`;
const password = `T12-R2-${randomBytes(16).toString('hex')}!`;
const lifecycleEmail = `t12-r2-lifecycle-${crypto.randomUUID()}@example.test`;
let userId;
let factorId;
let lifecycleUserId;
let lifecycleRequestId;
let lifecycleJobId;
let configId;
let configVersionId;
let configSubmissionId;
let feedbackId;
let previousSystemAdmin;
let browser;
let page;

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

async function authRequest(path, token, options = {}) {
  const response = await fetch(`${authUrl}${path}`, {
    ...options,
    headers: {
      apikey: anonKey,
      'content-type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => null);
  return { response, body };
}

async function browserRequest(path, options = {}) {
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
      return { status: response.status, payload };
    },
    {
      path,
      method: options.method ?? 'GET',
      body: options.body ?? undefined,
      headers: options.headers ?? { Accept: 'application/json' },
    },
  );
}

async function signupAndEnroll() {
  const signup = await authRequest('/auth/v1/signup', null, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  assertStatus(signup.response.status, 200, 'Local admin signup');
  userId = signup.body?.user?.id;
  const accessToken = signup.body?.access_token;
  assert.ok(userId && accessToken, 'signup must return user and session');

  const enroll = await authRequest('/auth/v1/factors', accessToken, {
    method: 'POST',
    body: JSON.stringify({
      factor_type: 'totp',
      friendly_name: 't12-r2-browser',
    }),
  });
  assertStatus(enroll.response.status, 200, 'Local TOTP enrollment');
  factorId = enroll.body?.id;
  const secret = enroll.body?.totp?.secret;
  assert.ok(
    factorId && secret,
    'TOTP enrollment must return factor and secret',
  );

  const challenge = await authRequest(
    `/auth/v1/factors/${factorId}/challenge`,
    accessToken,
    { method: 'POST', body: '{}' },
  );
  assertStatus(challenge.response.status, 200, 'Local TOTP challenge');
  const verify = await authRequest(
    `/auth/v1/factors/${factorId}/verify`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        challenge_id: challenge.body?.id,
        code: totp(secret),
      }),
    },
  );
  assertStatus(verify.response.status, 200, 'Local TOTP verification');
  const passwordLogin = await authRequest(
    '/auth/v1/token?grant_type=password',
    null,
    {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    },
  );
  assertStatus(
    passwordLogin.response.status,
    200,
    `Local password login (${JSON.stringify(passwordLogin.body?.msg ?? passwordLogin.body?.error)})`,
  );
  return { secret };
}

async function createFixtures() {
  const [admin] = await sql`
    select s.user_id, u.email
    from private.system_admin s
    left join auth.users u on u.id = s.user_id
    where s.singleton_id = 1
  `;
  previousSystemAdmin = admin?.email?.startsWith('t12-r2-browser-')
    ? null
    : (admin?.user_id ?? null);
  await sql`
    insert into private.system_admin (user_id)
    values (${userId})
    on conflict (singleton_id) do update set user_id = excluded.user_id
  `;
  await sql`
    insert into public.platforms (id, code, name, status, allow_activation)
    values (${platformId}, ${platformCode}, 'T12 R2 Browser', 'active', true)
  `;
  await sql`
    insert into public.platforms (id, code, name, status, allow_activation)
    values (${otherPlatformId}, ${otherPlatformCode}, 'T12 R2 Other Platform', 'active', true)
  `;
  await sql`
    insert into public.plans (id, platform_id, code, name, kind, features)
    values (${planId}, ${platformId}, 'free', 'Free', 'free', ${sql.json({ config_slot_limit: 3 })})
  `;
  await sql`
    insert into public.platform_accounts (id, platform_id, user_id, status)
    values (${platformAccountId}, ${platformId}, ${userId}, 'active')
  `;
  await sql`
    insert into public.platform_profiles (
      platform_account_id, display_name, avatar_url, bio, locale, timezone
    ) values (
      ${platformAccountId}, 'T12 Workbench User', 'https://example.invalid/t12-avatar.png',
      'T12 Account 360 profile', 'zh-CN', 'Asia/Shanghai'
    )
  `;
  for (const [index, accountId] of paginationAccountIds.entries()) {
    await sql`
      insert into public.platform_accounts (
        id, platform_id, user_id, status, closed_at, anonymized_at, created_at, updated_at
      ) values (
        ${accountId}, ${platformId}, null, 'closed',
        now() - (${index + 1} * interval '1 minute'),
        now() - (${index + 1} * interval '1 minute'),
        now() - (${index + 1} * interval '1 minute'),
        now() - (${index + 1} * interval '1 minute')
      )
    `;
  }
  await sql`
    update public.platforms
    set default_plan_id = ${planId}
    where id = ${platformId}
  `;

  const [configSession] = await sql`
    select id
    from auth.sessions
    where user_id = ${userId}
    order by created_at desc
    limit 1
  `;
  assert.ok(
    configSession?.id,
    'Config fixture requires an active Auth session',
  );
  await sql`
    insert into private.platform_api_keys (
      id, platform_id, name, key_hmac, hmac_key_version, key_prefix, key_suffix,
      creation_operation_id
    ) values (
      ${configPlatformKeyId}, ${platformId}, 'T12 Config fixture key',
      ${'c'.repeat(64)}, 1, 't12-config', 'fixture', ${crypto.randomUUID()}
    )
  `;

  const accountContext = [
    userId,
    configSession.id,
    platformId,
    configPlatformKeyId,
  ];
  const [createdConfig] = await sql.unsafe(
    'select * from private.config_create(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::text, $7::text)',
    [
      ...accountContext,
      crypto.randomUUID(),
      'T12 Config Resource',
      'Phase 03 governance fixture',
    ],
  );
  configId = createdConfig?.config_id;
  assert.ok(configId, 'T12 Config fixture must be created');

  for (const [index, schemaVersion] of [
    [1, '1'],
    [2, '2'],
  ]) {
    const [version] = await sql.unsafe(
      'select * from private.config_version_intent_create(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid, $7::text, $8::bigint, $9::text, $10::text, $11::text, $12::text, $13::text)',
      [
        ...accountContext,
        crypto.randomUUID(),
        configId,
        `t12-config-v${index}.json`,
        700000,
        'application/json',
        't12.config',
        schemaVersion,
        `T12 Version ${index}`,
        `t12-version-${index}`,
      ],
    );
    assert.ok(
      version?.version_id && version?.file_id,
      `T12 Version ${index} fixture`,
    );
    await sql`
      update public.platform_config_files
      set status = 'active', write_outcome = 'confirmed', actual_size_bytes = 700000,
          sha256 = ${String(index).repeat(64)}, uploaded_at = now()
      where id = ${version.file_id}
    `;
    await sql.unsafe(
      'select * from private.config_version_activate(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid, $7::uuid)',
      [...accountContext, crypto.randomUUID(), configId, version.version_id],
    );
    configVersionId = version.version_id;
  }
  const [submission] = await sql.unsafe(
    'select * from private.config_gallery_submission_create(row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context, $6::uuid, $7::uuid)',
    [...accountContext, crypto.randomUUID(), configId, configVersionId],
  );
  configSubmissionId = submission?.submission_id;
  assert.ok(
    configSubmissionId,
    'T12 Gallery submission fixture must be pending',
  );
  feedbackId = crypto.randomUUID();
  await sql`
    insert into public.platform_feedback (
      id, platform_id, platform_account_id, user_id,
      author_display_name_snapshot, contact_allowed, contact_email_snapshot,
      category, title, body, status, client_context, submitted_at
    ) values (
      ${feedbackId}, ${platformId}, ${platformAccountId}, ${userId},
      'T12 Feedback User', true, ${email},
      'bug', 'T12 Feedback', 'T12 browser feedback governance fixture',
      'new', ${sql.json({ route: '/t12-feedback' })}, now()
    )
  `;
  await sql`
    insert into public.platform_feedback_events (
      platform_id, feedback_id, event_type, actor_user_id, metadata
    ) values (${platformId}, ${feedbackId}, 'submitted', ${userId}, '{}'::jsonb)
  `;
  const lifecycleSignup = await authRequest('/auth/v1/signup', null, {
    method: 'POST',
    body: JSON.stringify({ email: lifecycleEmail, password }),
  });
  assertStatus(
    lifecycleSignup.response.status,
    200,
    'Local lifecycle target signup',
  );
  lifecycleUserId = lifecycleSignup.body?.user?.id;
  assert.ok(lifecycleUserId, 'lifecycle target signup must return a user');
  lifecycleRequestId = crypto.randomUUID();
  await sql`
    insert into private.deletion_requests (
      id, user_id, request_session_id, state, requested_at
    ) values (
      ${lifecycleRequestId}, ${lifecycleUserId}, ${crypto.randomUUID()},
      'pending_admin', now()
    )
  `;
}

async function runBrowserFlow(secret) {
  browser = await chromium.launch({
    channel: process.env.T12_BROWSER_CHANNEL ?? 'chrome',
    headless: true,
    args: ['--no-proxy-server'],
  });
  const context = await browser.newContext();
  page = await context.newPage();
  page.setDefaultTimeout(10_000);
  const securityStatusResponses = [];
  page.on('response', (response) => {
    if (response.url().includes('/api/v1/admin/api/v1/security/status'))
      securityStatusResponses.push(response.status());
  });
  await page.goto(`${appUrl}/admin/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('load');
  await page.waitForTimeout(250);
  await page.getByLabel('管理员邮箱').fill(email);
  await page.getByLabel('密码').fill(password);
  const [loginResponse] = await Promise.all([
    page.waitForResponse((response) =>
      response.url().endsWith('/api/auth/login'),
    ),
    page.getByRole('button', { name: '登录' }).click(),
  ]);
  assertStatus(loginResponse.status(), 200, 'browser admin login');
  await page.waitForURL(/\/admin\/mfa$/u, { waitUntil: 'domcontentloaded' });

  await page
    .getByText('请输入认证器中的 6 位验证码。', { exact: true })
    .waitFor({ state: 'visible' })
    .catch(async () => {
      const bodyText = (await page.locator('body').innerText()).slice(0, 500);
      throw new Error(
        `MFA enrollment screen was not reached: url=${page.url()}, status=${securityStatusResponses.join(',') || 'none'}, body=${bodyText}`,
      );
    });

  const aal1 = await browserRequest(
    `/api/v1/admin/api/v1/platforms/${platformId}/plans`,
  );
  assertStatus(aal1.status, 403, 'AAL1 Admin API rejection');
  assert.equal(aal1.payload?.error?.code, 'MFA_REQUIRED');
  const aal1Status = await browserRequest(
    '/api/v1/admin/api/v1/security/status',
  );
  assertStatus(aal1Status.status, 200, 'AAL1 Admin security status');
  assert.equal(aal1Status.payload?.data?.current_aal, 'aal1');

  await page.getByLabel('验证码').fill(totp(secret));
  const [mfaResponse] = await Promise.all([
    page.waitForResponse((response) =>
      response.url().endsWith('/api/auth/mfa/verify'),
    ),
    page.getByRole('button', { name: '验证并继续' }).click(),
  ]);
  assertStatus(mfaResponse.status(), 200, 'browser admin MFA verification');
  await page.waitForURL(/\/admin$/u);
  await page.getByRole('heading', { name: '概览' }).waitFor({
    state: 'visible',
  });

  const cookiesBeforeLogout = await context.cookies();
  const proofCookie = cookiesBeforeLogout.find(
    (cookie) => cookie.name === 'aisenhub-admin-recent-auth-proof',
  );
  assert.ok(proofCookie, 'MFA must issue the recent-auth proof cookie');
  assert.equal(proofCookie.httpOnly, true);
  assert.equal(proofCookie.sameSite, 'Strict');
  const accessCookie = cookiesBeforeLogout.find(
    (cookie) => cookie.name === 'aisenhub-admin-session',
  );
  assert.ok(accessCookie, 'MFA flow must retain the elevated admin session');

  const aal2 = await browserRequest(
    `/api/v1/admin/api/v1/platforms/${platformId}/plans`,
  );
  assertStatus(aal2.status, 200, 'AAL2 Admin API access');
  assert.equal(aal2.payload?.data?.[0]?.code, 'free');
  const aal2Status = await browserRequest(
    '/api/v1/admin/api/v1/security/status',
  );
  assertStatus(aal2Status.status, 200, 'AAL2 Admin security status');
  assert.equal(aal2Status.payload?.data?.current_aal, 'aal2');

  const loadPlansResponsePromise = page.waitForResponse((response) =>
    response
      .url()
      .endsWith(`/api/v1/admin/api/v1/platforms/${platformId}/plans`),
  );
  await page.goto(`${appUrl}/admin/platforms/${platformId}/plans`, {
    waitUntil: 'domcontentloaded',
  });
  await page.locator('[data-test="platform-plans-page"]').waitFor({
    state: 'visible',
  });
  const loadPlansResponse = await loadPlansResponsePromise;
  assertStatus(loadPlansResponse.status(), 200, 'browser admin plan list');
  await page.locator('[data-test="plan-create-open"]').click();
  await page.locator('[data-test="plan-editor-code"]').fill('browser-pro');
  await page.locator('[data-test="plan-editor-name"]').fill('Browser Pro');
  await page.locator('[data-test="plan-editor-config-slot-limit"]').fill('2');
  const [createPlanResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response
          .url()
          .endsWith(`/api/v1/admin/api/v1/platforms/${platformId}/plans`) &&
        response.request().method() === 'POST',
    ),
    page.locator('[data-test="plan-editor-submit"]').click(),
  ]);
  assertStatus(createPlanResponse.status(), 201, 'browser admin plan create');
  await page.getByText('browser-pro', { exact: true }).waitFor({
    state: 'visible',
  });
  const [createdPlan] = await sql`
    select code, name, kind, status, features
    from public.plans
    where platform_id = ${platformId} and code = 'browser-pro'
  `;
  assert.equal(createdPlan.code, 'browser-pro');
  assert.equal(createdPlan.name, 'Browser Pro');
  assert.equal(createdPlan.kind, 'paid');
  assert.equal(createdPlan.status, 'active');
  assert.equal(createdPlan.features?.config_slot_limit, 2);

  await sql`
    update private.admin_step_up
    set expires_at = verified_at + interval '1 second'
    where user_id = ${userId}
  `;
  await new Promise((resolve) => setTimeout(resolve, 1_200));

  await page.goto(`${appUrl}/admin/platforms/${platformId}/plans`, {
    waitUntil: 'domcontentloaded',
  });
  await page.locator('[data-test="commerce-offers-panel"]').waitFor({
    state: 'visible',
  });
  await page
    .getByLabel('Offer Plan')
    .selectOption({ label: 'browser-pro · Browser Pro' });
  await page.getByLabel('Offer code').fill('browser-seven-day');
  await page.getByLabel('Offer 名称').fill('Browser Seven Day');
  await page.getByLabel('期限数值').fill('7');
  await page.getByLabel('期限单位').selectOption('day');
  const commerceOfferPostStatuses = [];
  const commerceOfferPath = `/api/v1/admin/api/v1/platforms/${platformId}/commerce/offers`;
  page.on('response', (response) => {
    if (
      response.url().endsWith(commerceOfferPath) &&
      response.request().method() === 'POST'
    )
      commerceOfferPostStatuses.push(response.status());
  });
  const [expiredCommerceProof] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response
          .url()
          .endsWith(
            `/api/v1/admin/api/v1/platforms/${platformId}/commerce/offers`,
          ) && response.request().method() === 'POST',
    ),
    page.getByRole('button', { name: '创建 Offer' }).click(),
  ]);
  assertStatus(
    expiredCommerceProof.status(),
    403,
    'expired Commerce Offer proof',
  );
  assert.equal(
    (await expiredCommerceProof.json()).error?.code,
    'RECENT_MFA_REQUIRED',
  );
  await page.locator('[data-test="recent-mfa-panel"]').waitFor({
    state: 'visible',
  });
  const [offersBeforeCommerceStepUp] = await sql`
    select count(*)::integer as count
    from public.platform_commercial_offers
    where platform_id = ${platformId} and code = 'browser-seven-day'
  `;
  assert.equal(
    offersBeforeCommerceStepUp.count,
    0,
    'Commerce step-up must not create the Offer before explicit retry',
  );
  const waitForCommerceTotpMs = 31_000 - (Date.now() % 30_000);
  await new Promise((resolve) => setTimeout(resolve, waitForCommerceTotpMs));
  await page.locator('[data-test="recent-mfa-code"]').fill(totp(secret));
  const [commerceMfaResponse] = await Promise.all([
    page.waitForResponse((response) =>
      response.url().endsWith('/api/auth/mfa/verify'),
    ),
    page.locator('[data-test="recent-mfa-submit"]').click(),
  ]);
  assertStatus(
    commerceMfaResponse.status(),
    200,
    'Commerce recent MFA verification',
  );
  await page.locator('[data-test="recent-mfa-panel"]').waitFor({
    state: 'detached',
  });
  const [offersAfterCommerceStepUp] = await sql`
    select count(*)::integer as count
    from public.platform_commercial_offers
    where platform_id = ${platformId} and code = 'browser-seven-day'
  `;
  assert.equal(
    offersAfterCommerceStepUp.count,
    0,
    'successful Commerce step-up must not auto-replay the original write',
  );
  const [commerceOfferCreated, commerceOfferReloaded] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response
          .url()
          .endsWith(
            `/api/v1/admin/api/v1/platforms/${platformId}/commerce/offers`,
          ) && response.request().method() === 'POST',
    ),
    page.waitForResponse(
      (response) =>
        response.url().endsWith(commerceOfferPath) &&
        response.request().method() === 'GET',
    ),
    page.getByRole('button', { name: '创建 Offer' }).click(),
  ]);
  const commerceOfferCreatedBody = await commerceOfferCreated.json();
  const commerceOfferReloadedBody = await commerceOfferReloaded.json();
  await page.waitForTimeout(250);
  const [offerAfterExplicitRetry] = await sql`
    select count(*)::integer as count
    from public.platform_commercial_offers
    where platform_id = ${platformId} and code = 'browser-seven-day'
  `;
  const [offerAuditAfterExplicitRetry] = await sql`
    select count(*)::integer as count
    from public.audit_logs
    where platform_id = ${platformId}
      and event_type = 'commerce.offer_saved'
  `;
  assertStatus(
    commerceOfferCreated.status(),
    201,
    `Commerce Offer explicit retry (${commerceOfferCreatedBody?.error?.code ?? 'no-error'}; posts=${commerceOfferPostStatuses.join(',')}; offers=${offerAfterExplicitRetry.count}; audits=${offerAuditAfterExplicitRetry.count})`,
  );
  assertStatus(
    commerceOfferReloaded.status(),
    200,
    `Commerce Offer reload (${commerceOfferReloadedBody?.error?.code ?? 'no-error'})`,
  );
  assert.ok(
    commerceOfferReloadedBody?.data?.some?.(
      (offer) => offer?.offer_code === 'browser-seven-day',
    ),
    `Commerce Offer reload must include browser-seven-day: ${JSON.stringify(commerceOfferReloadedBody?.data ?? null)}`,
  );
  await page
    .getByText('browser-seven-day · browser-pro / Browser Pro', { exact: true })
    .waitFor({
      state: 'visible',
    });

  await sql`
    update private.admin_step_up
    set expires_at = verified_at + interval '1 second'
    where user_id = ${userId}
  `;
  await new Promise((resolve) => setTimeout(resolve, 1_200));

  const loadKeysResponsePromise = page.waitForResponse(
    (response) =>
      response
        .url()
        .endsWith(`/api/v1/admin/api/v1/platforms/${platformId}/keys`) &&
      response.request().method() === 'GET',
  );
  await page.goto(
    `${appUrl}/admin/platforms/${platformId}/settings/integration`,
    {
      waitUntil: 'domcontentloaded',
    },
  );
  await page.locator('[data-test="platform-integration-page"]').waitFor({
    state: 'visible',
  });
  await page.locator('[data-test="platform-keys-section"]').waitFor({
    state: 'visible',
  });
  assert.match(
    await page
      .locator('[data-test="platform-integration-step-consumer-runtime"]')
      .innerText(),
    /需外部验证/u,
    'target-platform runtime verification must not be auto-completed centrally',
  );
  const loadKeysResponse = await loadKeysResponsePromise;
  assertStatus(loadKeysResponse.status(), 200, 'browser admin key list');
  const [keyCountBeforeStepUp] = await sql`
    select count(*)::integer as count
    from private.platform_api_keys
    where platform_id = ${platformId}
  `;
  await page.locator('[data-test="platform-key-open-create"]').click();
  const [expiredProofResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response
          .url()
          .endsWith(`/api/v1/admin/api/v1/platforms/${platformId}/keys`) &&
        response.request().method() === 'POST',
    ),
    page.locator('[data-test="confirm-action-submit"]').click(),
  ]);
  assertStatus(
    expiredProofResponse.status(),
    403,
    'expired recent proof on critical key create',
  );
  assert.equal(
    (await expiredProofResponse.json()).error?.code,
    'RECENT_MFA_REQUIRED',
  );
  await page.locator('[data-test="recent-mfa-panel"]').waitFor({
    state: 'visible',
  });
  await page.locator('[data-test="recent-mfa-code"]').fill(totp(secret));
  const [recentMfaResponse] = await Promise.all([
    page.waitForResponse((response) =>
      response.url().endsWith('/api/auth/mfa/verify'),
    ),
    page.locator('[data-test="recent-mfa-submit"]').click(),
  ]);
  assertStatus(recentMfaResponse.status(), 200, 'recent MFA verification');
  await page.locator('[data-test="recent-mfa-panel"]').waitFor({
    state: 'detached',
  });
  const [notAutoSubmitted] = await sql`
    select count(*)::integer as count
    from private.platform_api_keys
    where platform_id = ${platformId}
  `;
  assert.equal(
    notAutoSubmitted.count,
    keyCountBeforeStepUp.count,
    'step-up must not replay the write',
  );
  const [proofKeyResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response
          .url()
          .endsWith(`/api/v1/admin/api/v1/platforms/${platformId}/keys`) &&
        response.request().method() === 'POST',
    ),
    page.locator('[data-test="confirm-action-submit"]').click(),
  ]);
  assertStatus(
    proofKeyResponse.status(),
    201,
    'explicit post-step-up key submit',
  );

  await page.goto(`${appUrl}/admin/platforms/${platformId}/files`, {
    waitUntil: 'domcontentloaded',
  });
  await page.locator('[data-test="config-resource-center"]').waitFor({
    state: 'visible',
  });
  await page
    .locator('[data-test="config-review-reason"]')
    .fill('T12 approve fixture');
  await page.locator('[data-test="config-review-approve"]').click();
  const [approveResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response
          .url()
          .endsWith(
            `/api/v1/admin/api/v1/platforms/${platformId}/config-reviews/${configSubmissionId}/review`,
          ) && response.request().method() === 'POST',
    ),
    page.locator('[data-test="confirm-action-submit"]').click(),
  ]);
  assertStatus(approveResponse.status(), 200, 'Config Gallery approval');
  const [approvedEntry] = await sql`
    select status, published_version_id
    from public.platform_config_gallery_entries
    where platform_id = ${platformId} and config_id = ${configId}
  `;
  assert.equal(approvedEntry.status, 'approved');
  assert.equal(approvedEntry.published_version_id, configVersionId);
  await page.keyboard.press('Escape');

  await page.locator('[data-test="config-resource-open"]').click();
  await page.locator('[data-test="config-governance-reason"]').waitFor({
    state: 'visible',
  });

  async function governConfig(action, buttonTest, expectedStatus) {
    await page
      .locator('[data-test="config-governance-reason"]')
      .fill(`T12 ${action} fixture`);
    await page.locator(`[data-test="${buttonTest}"]`).click();
    const [response] = await Promise.all([
      page.waitForResponse(
        (candidate) =>
          candidate
            .url()
            .endsWith(
              `/api/v1/admin/api/v1/platforms/${platformId}/config-resources/${configId}/gallery-governance`,
            ) && candidate.request().method() === 'POST',
      ),
      page.locator('[data-test="confirm-action-submit"]').click(),
    ]);
    assertStatus(response.status(), 200, `Config Gallery ${action}`);
    const [entry] = await sql`
      select status
      from public.platform_config_gallery_entries
      where platform_id = ${platformId} and config_id = ${configId}
    `;
    assert.equal(entry.status, expectedStatus);
    await page.keyboard.press('Escape');
    await page.locator('[data-test="confirm-action-submit"]').waitFor({
      state: 'hidden',
    });
  }

  await governConfig('remove', 'config-governance-remove', 'removed');
  const [personalConfigAfterRemove] = await sql`
    select status from public.platform_configs
    where platform_id = ${platformId} and id = ${configId}
  `;
  assert.equal(personalConfigAfterRemove.status, 'active');
  await governConfig('restore', 'config-governance-restore', 'approved');
  await governConfig('block', 'config-governance-block', 'blocked');

  await page.goto(`${appUrl}/admin/platforms/${platformId}/feedback`, {
    waitUntil: 'domcontentloaded',
  });
  await page
    .locator('[data-test="feedback-page"]')
    .waitFor({ state: 'visible' });
  await page
    .locator('[data-test="feedback-table"]')
    .waitFor({ state: 'visible' });
  assert.match(
    await page.locator('[data-test="feedback-table"]').innerText(),
    /T12 Feedback/u,
  );
  await page.locator('[data-test="feedback-open-detail"]').click();
  await page
    .locator('[data-test="feedback-detail"]')
    .waitFor({ state: 'visible' });
  await page
    .locator('[data-test="feedback-status-reason"]')
    .fill('T12 triage started');
  const [feedbackStatusResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response
          .url()
          .endsWith(
            `/api/v1/admin/api/v1/platforms/${platformId}/feedback/${feedbackId}/status`,
          ) && response.request().method() === 'POST',
    ),
    page.locator('[data-test="feedback-status-update"]').click(),
  ]);
  assertStatus(feedbackStatusResponse.status(), 200, 'Feedback status update');
  const [reviewingFeedback] = await sql`
    select status, row_version
    from public.platform_feedback
    where id = ${feedbackId}
  `;
  assert.equal(reviewingFeedback.status, 'reviewing');
  assert.equal(Number(reviewingFeedback.row_version), 2);
  const crossPlatformFeedback = await browserRequest(
    `/api/v1/admin/api/v1/platforms/${crypto.randomUUID()}/feedback/${feedbackId}`,
  );
  assertStatus(
    crossPlatformFeedback.status,
    404,
    'Feedback cross-platform IDOR',
  );
  await page.keyboard.press('Escape');
  await page
    .locator('[data-test="feedback-row"] input[type="checkbox"]')
    .check();
  await sql`
    update private.admin_step_up
    set expires_at = verified_at + interval '1 second'
    where user_id = ${userId}
  `;
  await new Promise((resolve) => setTimeout(resolve, 1_200));
  await page.locator('[data-test="feedback-batch-delete"]').click();
  await page
    .locator('[data-test="confirm-action-reason"]')
    .fill('T12 duplicate feedback');
  const [feedbackDeleteExpired] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response
          .url()
          .endsWith(
            `/api/v1/admin/api/v1/platforms/${platformId}/feedback/batch-delete`,
          ) && response.request().method() === 'POST',
    ),
    page.locator('[data-test="confirm-action-submit"]').click(),
  ]);
  assertStatus(
    feedbackDeleteExpired.status(),
    403,
    'expired recent proof on Feedback batch delete',
  );
  assert.equal(
    (await feedbackDeleteExpired.json()).error?.code,
    'RECENT_MFA_REQUIRED',
  );
  await page
    .locator('[data-test="recent-mfa-panel"]')
    .waitFor({ state: 'visible' });
  const waitForFeedbackTotpMs = 31_000 - (Date.now() % 30_000);
  await new Promise((resolve) => setTimeout(resolve, waitForFeedbackTotpMs));
  await page.locator('[data-test="recent-mfa-code"]').fill(totp(secret));
  const [feedbackMfaResponse] = await Promise.all([
    page.waitForResponse((response) =>
      response.url().endsWith('/api/auth/mfa/verify'),
    ),
    page.locator('[data-test="recent-mfa-submit"]').click(),
  ]);
  assertStatus(feedbackMfaResponse.status(), 200, 'Feedback recent MFA');
  await page
    .locator('[data-test="recent-mfa-panel"]')
    .waitFor({ state: 'detached' });
  const [feedbackBeforeExplicitDelete] = await sql`
    select status from public.platform_feedback where id = ${feedbackId}
  `;
  assert.equal(
    feedbackBeforeExplicitDelete.status,
    'reviewing',
    'Feedback step-up must not replay the destructive write',
  );
  const [feedbackDeleteResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response
          .url()
          .endsWith(
            `/api/v1/admin/api/v1/platforms/${platformId}/feedback/batch-delete`,
          ) && response.request().method() === 'POST',
    ),
    page.locator('[data-test="confirm-action-submit"]').click(),
  ]);
  assertStatus(
    feedbackDeleteResponse.status(),
    202,
    'explicit Feedback delete resubmit',
  );
  const [deletedFeedback] = await sql`
    select status, body, contact_email_snapshot, platform_account_id, user_id
    from public.platform_feedback where id = ${feedbackId}
  `;
  assert.equal(deletedFeedback.status, 'deleted');
  assert.equal(deletedFeedback.body, null);
  assert.equal(deletedFeedback.contact_email_snapshot, null);
  assert.equal(deletedFeedback.platform_account_id, null);
  assert.equal(deletedFeedback.user_id, null);
  await page.keyboard.press('Escape');

  await sql`
    update private.admin_step_up
    set expires_at = verified_at + interval '1 second'
    where user_id = ${userId}
  `;
  await new Promise((resolve) => setTimeout(resolve, 1_200));
  await page.goto(`${appUrl}/admin/platforms`, {
    waitUntil: 'domcontentloaded',
  });
  const platformRow = page
    .locator('[data-test="platform-directory-row"]')
    .filter({ hasText: platformCode });
  await platformRow.locator('[data-test="platform-capacity-open"]').click();
  await page.locator('[data-test="platform-capacity-dialog"]').waitFor({
    state: 'visible',
  });
  await page.locator('[data-test="platform-capacity-input"]').fill('1');
  await page.locator('[data-test="platform-capacity-save"]').click();
  const [expiredCapacityResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response
          .url()
          .endsWith(
            `/api/v1/admin/api/v1/platforms/${platformId}/file-policy`,
          ) && response.request().method() === 'PATCH',
    ),
    page.locator('[data-test="confirm-action-submit"]').click(),
  ]);
  assertStatus(expiredCapacityResponse.status(), 403, 'expired capacity proof');
  assert.equal(
    (await expiredCapacityResponse.json()).error?.code,
    'RECENT_MFA_REQUIRED',
  );
  await page.locator('[data-test="recent-mfa-panel"]').waitFor({
    state: 'visible',
  });
  const waitForNextTotpMs = 31_000 - (Date.now() % 30_000);
  await new Promise((resolve) => setTimeout(resolve, waitForNextTotpMs));
  await page.locator('[data-test="recent-mfa-code"]').fill(totp(secret));
  const [capacityMfaResponse] = await Promise.all([
    page.waitForResponse((response) =>
      response.url().endsWith('/api/auth/mfa/verify'),
    ),
    page.locator('[data-test="recent-mfa-submit"]').click(),
  ]);
  assertStatus(capacityMfaResponse.status(), 200, 'capacity recent MFA');
  await page.locator('[data-test="recent-mfa-panel"]').waitFor({
    state: 'detached',
  });
  const [capacityBeforeExplicitResubmit] = await sql`
    select coalesce(max_platform_total_bytes, 1073741824::bigint) as capacity
    from public.platform_file_policies where platform_id = ${platformId}
  `;
  assert.notEqual(
    Number(capacityBeforeExplicitResubmit?.capacity ?? 1073741824),
    1048576,
    'step-up must not replay the capacity mutation',
  );
  const [capacityResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response
          .url()
          .endsWith(
            `/api/v1/admin/api/v1/platforms/${platformId}/file-policy`,
          ) && response.request().method() === 'PATCH',
    ),
    page.locator('[data-test="confirm-action-submit"]').click(),
  ]);
  assertStatus(capacityResponse.status(), 200, 'explicit capacity resubmit');
  const [capacityFacts] = await sql`
    select p.max_platform_total_bytes as capacity,
      coalesce(sum(f.reserved_bytes) filter (where f.status <> 'deleted'), 0)::bigint as reserved
    from public.platform_file_policies p
    left join public.platform_config_files f on f.platform_id = p.platform_id
    where p.platform_id = ${platformId}
    group by p.max_platform_total_bytes
  `;
  assert.equal(Number(capacityFacts.capacity), 1048576);
  assert.ok(Number(capacityFacts.reserved) >= 1400000);
  const [versionHistory] = await sql`
    select count(*)::integer as count
    from public.platform_config_versions
    where platform_id = ${platformId} and config_id = ${configId}
  `;
  assert.equal(
    versionHistory.count,
    2,
    'capacity downgrade keeps Version history',
  );
  const capacityRead = await browserRequest(
    `/api/v1/admin/api/v1/platforms/${platformId}/file-policy`,
  );
  assertStatus(capacityRead.status, 200, 'capacity read after update');
  assert.equal(capacityRead.payload?.data?.platform_over_capacity, true);

  if (previousSystemAdmin) {
    await sql`
      update private.system_admin set user_id = ${previousSystemAdmin}
      where singleton_id = 1
    `;
  } else {
    await sql`delete from private.system_admin where singleton_id = 1`;
  }
  try {
    const nonAdminStatus = await browserRequest(
      '/api/v1/admin/api/v1/security/status',
    );
    assertStatus(nonAdminStatus.status, 403, 'AAL2 non-admin status');
    assert.equal(nonAdminStatus.payload?.error?.code, 'ADMIN_REQUIRED');
    const nonAdmin = await browserRequest(
      '/api/v1/admin/api/v1/platforms?limit=100',
    );
    assertStatus(nonAdmin.status, 403, 'AAL2 non-admin API rejection');
    assert.equal(nonAdmin.payload?.error?.code, 'ADMIN_REQUIRED');
    await page.goto(`${appUrl}/admin`, { waitUntil: 'domcontentloaded' });
    await page
      .locator('[data-test="admin-security-not-admin"]')
      .waitFor({ state: 'visible' });
    assert.equal(
      await page.locator('[data-test="admin-shell"]').count(),
      0,
      'non-admin must not render the Admin shell or its child pages',
    );
  } finally {
    await sql`
      insert into private.system_admin (user_id)
      values (${userId})
      on conflict (singleton_id) do update set user_id = excluded.user_id
    `;
  }

  let failSecurityStatus = true;
  const securityStatusRoute = '**/api/v1/admin/api/v1/security/status';
  await page.route(securityStatusRoute, async (route) => {
    if (failSecurityStatus) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'AUTHORIZATION_UNAVAILABLE' },
        }),
      });
      return;
    }
    await route.continue();
  });
  const [securityUnavailable] = await Promise.all([
    page.waitForResponse((response) =>
      response.url().endsWith('/api/v1/admin/api/v1/security/status'),
    ),
    page.goto(`${appUrl}/admin`, { waitUntil: 'domcontentloaded' }),
  ]);
  assertStatus(
    securityUnavailable.status(),
    503,
    'security status unavailable',
  );
  await page
    .locator('[data-test="admin-security-unavailable"]')
    .waitFor({ state: 'visible' });
  assert.equal(
    await page.locator('[data-test="admin-shell"]').count(),
    0,
    'Admin children must stay unrendered when status is unavailable',
  );
  assert.ok(
    (await context.cookies()).some(
      (cookie) => cookie.name === 'aisenhub-admin-session',
    ),
    'status failure must preserve the admin session for retry',
  );
  const [securityRecovered] = await Promise.all([
    page.waitForResponse((response) =>
      response.url().endsWith('/api/v1/admin/api/v1/security/status'),
    ),
    (async () => {
      failSecurityStatus = false;
      await page.locator('[data-test="admin-security-retry"]').click();
    })(),
  ]);
  assertStatus(securityRecovered.status(), 200, 'security status retry');
  await page.getByRole('heading', { name: '概览' }).waitFor({
    state: 'visible',
  });
  await page.unroute(securityStatusRoute);

  let failPlansRead = true;
  const plansRoute = `**/api/v1/admin/api/v1/platforms/${platformId}/plans`;
  await page.route(plansRoute, async (route) => {
    if (route.request().method() === 'GET' && failPlansRead) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'AUTHORIZATION_UNAVAILABLE' },
        }),
      });
      return;
    }
    await route.continue();
  });
  const plansPageUrl = `${appUrl}/admin/platforms/${platformId}/plans`;
  const [unavailableResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response
          .url()
          .endsWith(`/api/v1/admin/api/v1/platforms/${platformId}/plans`) &&
        response.request().method() === 'GET',
    ),
    page.goto(plansPageUrl, { waitUntil: 'domcontentloaded' }),
  ]);
  assertStatus(unavailableResponse.status(), 503, 'upstream unavailable');
  const recoverableError = page.locator('[data-test="recoverable-error"]');
  await recoverableError.waitFor({ state: 'visible' });
  assert.match(await recoverableError.innerText(), /计划列表暂时不可用/u);
  assert.equal(
    new URL(page.url()).pathname,
    `/admin/platforms/${platformId}/plans`,
  );
  assert.ok(
    (await context.cookies()).some(
      (cookie) => cookie.name === 'aisenhub-admin-session',
    ),
    'upstream failure must preserve the admin session',
  );
  const [recoveredPlansResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response
          .url()
          .endsWith(`/api/v1/admin/api/v1/platforms/${platformId}/plans`) &&
        response.request().method() === 'GET',
    ),
    (async () => {
      failPlansRead = false;
      await page.locator('[data-test="async-retry"]').click();
    })(),
  ]);
  assertStatus(recoveredPlansResponse.status(), 200, 'retry after 503');
  await page.locator('[data-test="plans-table-section"]').waitFor({
    state: 'visible',
  });
  await page.unroute(plansRoute);

  const architectureBehavior = await runArchitectureBehaviorMatrix(secret);
  const responsiveA11y = await runResponsiveA11yMatrix();

  await page.getByRole('button', { name: '退出登录' }).click();
  await page.waitForURL(/\/admin\/login$/u);
  const cookiesAfterLogout = await context.cookies();
  assert.equal(
    cookiesAfterLogout.some(
      (cookie) => cookie.name === 'aisenhub-admin-session',
    ),
    false,
  );
  assert.equal(
    cookiesAfterLogout.some(
      (cookie) => cookie.name === 'aisenhub-admin-recent-auth-proof',
    ),
    false,
  );

  const oldJwt = await fetch(`${authUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${accessCookie.value}` },
  });
  assert.ok(
    oldJwt.status === 401 || oldJwt.status === 403,
    `logout must reject old JWT, got ${oldJwt.status}`,
  );
  const afterLogout = await browserRequest(
    `/api/v1/admin/api/v1/platforms/${platformId}/plans`,
  );
  assertStatus(afterLogout.status, 401, 'BFF rejection after logout');
  await page.goto(`${appUrl}/admin`, { waitUntil: 'domcontentloaded' });
  await page
    .waitForFunction(() => window.location.pathname === '/admin/login')
    .catch(async () => {
      const bodyText = (await page.locator('body').innerText()).slice(0, 500);
      throw new Error(
        `Anonymous Admin shell was not redirected: url=${page.url()}, status=${securityStatusResponses.at(-1) ?? 'none'}, body=${bodyText}`,
      );
    });

  return {
    login: 'PASS',
    aal1Rejected: 'PASS',
    aal1Status: 'PASS',
    browserMfa: 'PASS',
    aal2Status: 'PASS',
    expiredProofStepUp: 'PASS',
    stepUpExplicitResubmit: 'PASS',
    aal2NonAdminRejected: 'PASS',
    nonAdminShellBlocked: 'PASS',
    statusUnavailableRetry: 'PASS',
    upstreamFailureRetry: 'PASS',
    httpOnlyProof: 'PASS',
    sensitiveWrite: 'PASS',
    configReviewGovernance: 'PASS',
    feedbackGovernance: 'PASS',
    feedbackDeleteStepUp: 'PASS',
    globalCapacityStepUp: 'PASS',
    overCapacityNoDelete: 'PASS',
    architectureBehavior,
    responsiveA11y,
    logoutOldJwtRejected: 'PASS',
    anonymousShellRedirect: 'PASS',
  };
}

async function runArchitectureBehaviorMatrix(secret) {
  await sql`
    insert into public.platform_feedback (
      platform_id, platform_account_id, user_id, category, title, body, status, submitted_at
    ) values (
      ${platformId}, ${platformAccountId}, ${userId}, 'other',
      'T12 Account 360 feedback', 'Account workbench summary fixture', 'new', now()
    )
  `;
  const identityRequests = [];
  const observeIdentityRequest = (request) => {
    if (
      request.method() === 'GET' &&
      request.url().includes('/api/v1/admin/api/v1/accounts')
    )
      identityRequests.push(request.url());
  };
  page.on('request', observeIdentityRequest);
  try {
    const initialIdentityResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/admin/api/v1/accounts') &&
        response.request().method() === 'GET',
    );
    await page.goto(`${appUrl}/admin/accounts`, {
      waitUntil: 'domcontentloaded',
    });
    await page.locator('[data-test="admin-central-accounts"]').waitFor({
      state: 'visible',
    });
    await initialIdentityResponse;
    const initialRequestCount = identityRequests.length;
    const search = page.locator('[data-test="accounts-search-input"]');
    await search.fill('typed-but-not-submitted');
    await page.waitForTimeout(250);
    assert.equal(
      identityRequests.length,
      initialRequestCount,
      'typing in global identity search must not issue requests before submit',
    );

    const committedQuery = email.slice(0, 12);
    await search.fill(committedQuery);
    const submitted = page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/admin/api/v1/accounts') &&
        response.url().includes(encodeURIComponent(committedQuery)) &&
        response.request().method() === 'GET',
    );
    await page.getByRole('button', { name: '检索' }).click();
    await submitted;
    await page.waitForURL(
      (url) => url.searchParams.get('q') === committedQuery,
    );
    assert.equal(
      identityRequests.length,
      initialRequestCount + 1,
      'one search submit must issue exactly one global identity request',
    );

    const scoped = page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/admin/api/v1/accounts') &&
        response.url().includes(`platform_id=${platformId}`) &&
        response.request().method() === 'GET',
    );
    await page
      .locator('[data-test="accounts-platform-selector"]')
      .selectOption(platformId);
    await scoped;
    await page.waitForURL(
      (url) => url.searchParams.get('platform') === platformId,
    );
    assert.equal(
      identityRequests.length,
      initialRequestCount + 2,
      'platform scope change must issue one identity request, not platform fan-out',
    );

    const uidSearch = page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/admin/api/v1/accounts') &&
        response.url().includes(encodeURIComponent(userId)) &&
        response.url().includes(`platform_id=${platformId}`) &&
        response.request().method() === 'GET',
    );
    await search.fill(userId);
    await page.getByRole('button', { name: '检索' }).click();
    await uidSearch;
    await page.waitForURL(
      (url) =>
        url.searchParams.get('q') === userId &&
        url.searchParams.get('platform') === platformId,
    );
    assert.equal(
      identityRequests.length,
      initialRequestCount + 3,
      'UID search submit must issue exactly one global identity request',
    );
    const identityDetailLink = page
      .locator(`[data-test="identity-detail-link-${userId}"]`)
      .first();
    await identityDetailLink.waitFor({ state: 'visible' });
    await identityDetailLink.click();
    await page.waitForURL(`**/admin/accounts/${userId}`);
    await page.locator('[data-test="identity-detail-page"]').waitFor({
      state: 'visible',
    });
    const accountDeepLink = page
      .getByRole('link', { name: /进入平台账户/u })
      .first();
    await accountDeepLink.waitFor({ state: 'visible' });
    await accountDeepLink.click();
    await page.waitForURL(
      `**/admin/platforms/${platformId}/accounts/${platformAccountId}`,
    );
    await page.locator('[data-test="account-workbench-page"]').waitFor({
      state: 'visible',
    });
  } finally {
    page.off('request', observeIdentityRequest);
  }

  assert.match(
    await page.locator('[data-test="account-workbench-overview"]').innerText(),
    /T12 Workbench User|Global Identity email/u,
    'Account 360 must expose the platform profile and read-only identity summary',
  );
  assert.match(
    await page
      .locator('[data-test="account-workbench-entitlement"]')
      .innerText(),
    /Free|active/u,
    'Account 360 must expose the current Plan/Subscription projection',
  );
  assert.match(
    await page.locator('[data-test="account-workbench-config"]').innerText(),
    /Active 1/u,
    'Account 360 must expose the authoritative Config summary',
  );
  assert.match(
    await page.locator('[data-test="account-workbench-feedback"]').innerText(),
    /有效反馈 1/u,
    'Account 360 must expose the authoritative Feedback summary',
  );
  const crossPlatformAccount = await browserRequest(
    `/api/v1/admin/api/v1/platforms/${otherPlatformId}/accounts/${platformAccountId}`,
  );
  assertStatus(
    crossPlatformAccount.status,
    404,
    'Account 360 cross-platform IDOR',
  );

  await page
    .locator('[data-test="account-tags-input"]')
    .fill(' VIP, follow-up ');
  const [tagsResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response
          .url()
          .endsWith(
            `/api/v1/admin/api/v1/platforms/${platformId}/accounts/${platformAccountId}/tags`,
          ) && response.request().method() === 'PUT',
    ),
    page.locator('[data-test="account-tags-save"]').click(),
  ]);
  assertStatus(tagsResponse.status(), 200, 'Account 360 tags replace');
  const [supportTags] = await sql`
    select array_agg(tag order by tag) as tags
    from public.platform_account_admin_tags
    where platform_id = ${platformId} and platform_account_id = ${platformAccountId}
  `;
  assert.deepEqual(supportTags.tags, ['follow-up', 'vip']);

  await page
    .locator('[data-test="account-note-input"]')
    .fill('T12 support note');
  const [noteResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response
          .url()
          .endsWith(
            `/api/v1/admin/api/v1/platforms/${platformId}/accounts/${platformAccountId}/notes`,
          ) && response.request().method() === 'POST',
    ),
    page.locator('[data-test="account-note-add"]').click(),
  ]);
  assertStatus(noteResponse.status(), 201, 'Account 360 note append');
  await page.getByText('T12 support note', { exact: true }).waitFor({
    state: 'visible',
  });

  await sql`
    update private.admin_step_up
    set expires_at = verified_at + interval '1 second'
    where user_id = ${userId}
  `;
  await new Promise((resolve) => setTimeout(resolve, 1_200));
  await page.locator('[data-test="account-workbench-toggle"]').click();
  await page
    .locator('[data-test="confirm-action-reason"]')
    .fill('T12 account risk review');
  const [expiredAccountProof] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response
          .url()
          .endsWith(
            `/api/v1/admin/api/v1/platforms/${platformId}/accounts/${platformAccountId}/suspend`,
          ) && response.request().method() === 'POST',
    ),
    page.locator('[data-test="confirm-action-submit"]').click(),
  ]);
  assertStatus(
    expiredAccountProof.status(),
    403,
    'expired Account governance proof',
  );
  assert.equal(
    (await expiredAccountProof.json()).error?.code,
    'RECENT_MFA_REQUIRED',
  );
  await page.locator('[data-test="recent-mfa-panel"]').waitFor({
    state: 'visible',
  });
  const waitForAccountTotpMs = 31_000 - (Date.now() % 30_000);
  await new Promise((resolve) => setTimeout(resolve, waitForAccountTotpMs));
  await page.locator('[data-test="recent-mfa-code"]').fill(totp(secret));
  const [accountMfaResponse] = await Promise.all([
    page.waitForResponse((response) =>
      response.url().endsWith('/api/auth/mfa/verify'),
    ),
    page.locator('[data-test="recent-mfa-submit"]').click(),
  ]);
  assertStatus(
    accountMfaResponse.status(),
    200,
    'Account governance recent MFA',
  );
  await page.locator('[data-test="recent-mfa-panel"]').waitFor({
    state: 'detached',
  });
  const [accountBeforeExplicitSubmit] = await sql`
    select status from public.platform_accounts where id = ${platformAccountId}
  `;
  assert.equal(
    accountBeforeExplicitSubmit.status,
    'active',
    'Account step-up must not replay the governance write',
  );
  await page
    .locator('[data-test="confirm-action-reason"]')
    .fill('T12 account risk review');
  const [accountSuspendResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response
          .url()
          .endsWith(
            `/api/v1/admin/api/v1/platforms/${platformId}/accounts/${platformAccountId}/suspend`,
          ) && response.request().method() === 'POST',
    ),
    page.locator('[data-test="confirm-action-submit"]').click(),
  ]);
  assertStatus(
    accountSuspendResponse.status(),
    200,
    'explicit Account suspend resubmit',
  );
  await page.getByText('T12 account risk review', { exact: true }).waitFor({
    state: 'visible',
  });
  const [governanceEvent] = await sql`
    select action, reason
    from public.platform_account_governance_events
    where platform_id = ${platformId} and platform_account_id = ${platformAccountId}
    order by created_at desc, id desc
    limit 1
  `;
  assert.deepEqual(governanceEvent, {
    action: 'suspend',
    reason: 'T12 account risk review',
  });

  await page.locator('[data-test="account-workbench-toggle"]').click();
  await page
    .locator('[data-test="confirm-action-reason"]')
    .fill('T12 account review completed');
  const [accountRestoreResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response
          .url()
          .endsWith(
            `/api/v1/admin/api/v1/platforms/${platformId}/accounts/${platformAccountId}/restore`,
          ) && response.request().method() === 'POST',
    ),
    page.locator('[data-test="confirm-action-submit"]').click(),
  ]);
  assertStatus(
    accountRestoreResponse.status(),
    200,
    'Account restore after governance test',
  );

  const [accountFilterFacts] = await sql`
    select a.status as account_status, p.display_name, s.plan_id,
      s.status as subscription_status, platform.default_plan_id
    from public.platform_accounts a
    join public.platforms platform on platform.id = a.platform_id
    left join public.platform_profiles p on p.platform_account_id = a.id
    left join public.subscriptions s
      on s.platform_id = a.platform_id and s.platform_account_id = a.id
    where a.platform_id = ${platformId} and a.id = ${platformAccountId}
  `;
  assert.deepEqual(accountFilterFacts, {
    account_status: 'active',
    display_name: 'T12 Workbench User',
    plan_id: null,
    subscription_status: 'active',
    default_plan_id: planId,
  });
  const directFilteredAccounts = await browserRequest(
    `/api/v1/admin/api/v1/platforms/${platformId}/accounts?limit=20&q=${encodeURIComponent('T12 Workbench User')}&status=active&plan_id=${planId}&subscription_status=active`,
  );
  assertStatus(
    directFilteredAccounts.status,
    200,
    'Account list direct combined filters',
  );
  assert.equal(
    directFilteredAccounts.payload?.data?.length,
    1,
    'Account list direct combined filters must return one account',
  );
  assert.equal(
    directFilteredAccounts.payload?.data?.[0]?.platform_account_id,
    platformAccountId,
    'Account list direct combined filters must return the expected account',
  );

  const accountListResponse = page.waitForResponse(
    (response) =>
      response
        .url()
        .includes(`/api/v1/admin/api/v1/platforms/${platformId}/accounts?`) &&
      response.request().method() === 'GET',
  );
  await page.goto(`${appUrl}/admin/platforms/${platformId}/accounts`, {
    waitUntil: 'domcontentloaded',
  });
  await accountListResponse;
  await page
    .locator('[data-test="accounts-table"]')
    .waitFor({ state: 'visible' });
  assert.equal(
    await page.locator('[data-test^="account-row-"]').count(),
    20,
    'Account list first page must be bounded to 20 rows',
  );
  const nextAccountPageResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).searchParams.has('cursor') &&
      response
        .url()
        .includes(`/api/v1/admin/api/v1/platforms/${platformId}/accounts`) &&
      response.request().method() === 'GET',
  );
  await page.locator('[data-test="accounts-next-page"]').click();
  const secondPagePayload = await (await nextAccountPageResponse).json();
  assert.equal(
    secondPagePayload?.data?.length,
    2,
    'Account list API second page must advance without overlap',
  );
  await page.waitForURL((url) => Boolean(url.searchParams.get('cursor')));
  await page
    .locator('[data-test="accounts-table"]')
    .waitFor({ state: 'visible' });
  assert.equal(
    await page.locator('[data-test^="account-row-"]').count(),
    2,
    'Account list second page must advance without overlap',
  );
  await page.getByRole('button', { name: '返回首页' }).click();
  await page.waitForURL((url) => !url.searchParams.get('cursor'));

  await page.locator('[data-test="accounts-query"]').fill('T12 Workbench User');
  await page
    .locator('[data-test="accounts-status-filter"]')
    .selectOption('active');
  await page.locator('[data-test="accounts-plan-filter"]').selectOption(planId);
  await page
    .locator('[data-test="accounts-subscription-filter"]')
    .selectOption('active');
  const filteredAccountsResponse = page.waitForResponse(
    (response) =>
      response
        .url()
        .includes(`/api/v1/admin/api/v1/platforms/${platformId}/accounts`) &&
      new URL(response.url()).searchParams.get('q') === 'T12 Workbench User' &&
      new URL(response.url()).searchParams.get('status') === 'active' &&
      new URL(response.url()).searchParams.get('plan_id') === planId &&
      new URL(response.url()).searchParams.get('subscription_status') ===
        'active' &&
      response.request().method() === 'GET',
  );
  await page.locator('[data-test="accounts-query-submit"]').click();
  const filteredAccountsPayload = await (await filteredAccountsResponse).json();
  assert.equal(
    filteredAccountsPayload?.data?.length,
    1,
    'Account list API filters must return the single matching account',
  );
  assert.equal(
    filteredAccountsPayload?.data?.[0]?.platform_account_id,
    platformAccountId,
    'Account list API filters must return the expected Platform Account',
  );
  await page.waitForURL(
    (url) =>
      url.searchParams.get('q') === 'T12 Workbench User' &&
      url.searchParams.get('status') === 'active' &&
      url.searchParams.get('plan_id') === planId &&
      url.searchParams.get('subscription_status') === 'active',
  );
  await page
    .locator(`[data-test="account-row-${platformAccountId}"]`)
    .waitFor({ state: 'visible' });
  assert.equal(
    await page
      .locator(`[data-test="account-row-${platformAccountId}"]`)
      .count(),
    1,
    'Account filters must run server-side before cursor pagination',
  );

  const lifecycleDetail = await browserRequest(
    `/api/v1/admin/api/v1/accounts/${lifecycleUserId}`,
  );
  assertStatus(
    lifecycleDetail.status,
    200,
    `lifecycle target detail (${JSON.stringify(lifecycleDetail.payload?.error ?? null)})`,
  );
  assert.equal(
    lifecycleDetail.payload?.data?.deletion?.request?.state,
    'pending_admin',
    'lifecycle target must expose the pending deletion request',
  );
  await page.goto(`${appUrl}/admin/accounts/${lifecycleUserId}`, {
    waitUntil: 'domcontentloaded',
  });
  await page.locator('[data-test="identity-detail-page"]').waitFor({
    state: 'visible',
  });
  await page.locator('[data-test="identity-detail-start"]').waitFor({
    state: 'visible',
  });
  await page.locator('[data-test="identity-detail-start"]').click();
  const [startDeletionResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/v1/admin/api/v1/deletion-jobs') &&
        response.request().method() === 'POST',
    ),
    page.locator('[data-test="confirm-action-submit"]').click(),
  ]);
  assertStatus(
    startDeletionResponse.status(),
    202,
    'Identity detail Global Delete start',
  );
  const startDeletionPayload = await startDeletionResponse.json();
  lifecycleJobId = startDeletionPayload?.data?.job_id;
  assert.ok(lifecycleJobId, 'Global Delete start must return a job ID');
  await page.locator('[data-test="confirm-action-cancel"]').click();
  const [startedJob] = await sql`
    select state, checkpoint, retry_count
    from private.deletion_jobs
    where id = ${lifecycleJobId}
  `;
  assert.deepEqual(startedJob, {
    state: 'pending',
    checkpoint: 'created',
    retry_count: 0,
  });

  await sql`
    update private.deletion_jobs
    set state = 'blocked', last_error_code = 't12_browser_blocked'
    where id = ${lifecycleJobId}
  `;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('[data-test="identity-detail-retry"]').waitFor({
    state: 'visible',
  });
  await page.locator('[data-test="identity-detail-retry"]').click();
  const [retryDeletionResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response
          .url()
          .endsWith(
            `/api/v1/admin/api/v1/deletion-jobs/${lifecycleJobId}/retry`,
          ) && response.request().method() === 'POST',
    ),
    page.locator('[data-test="confirm-action-submit"]').click(),
  ]);
  assertStatus(
    retryDeletionResponse.status(),
    202,
    'Identity detail Global Delete retry',
  );
  await page.locator('[data-test="confirm-action-cancel"]').click();
  const [retriedJob] = await sql`
    select state, retry_count, last_error_code
    from private.deletion_jobs
    where id = ${lifecycleJobId}
  `;
  assert.deepEqual(retriedJob, {
    state: 'retry',
    retry_count: 1,
    last_error_code: null,
  });

  await page.goto(
    `${appUrl}/admin/operations?job_id=${lifecycleJobId}&q=retry&legacy=drop-me`,
    { waitUntil: 'domcontentloaded' },
  );
  await page.waitForURL((url) => {
    return (
      url.pathname === '/admin/accounts/deletion-jobs' &&
      url.searchParams.get('job_id') === lifecycleJobId &&
      url.searchParams.get('q') === 'retry' &&
      url.searchParams.get('legacy') === null
    );
  });
  await page.locator('[data-test="deletion-jobs-page"]').waitFor({
    state: 'visible',
  });
  assert.equal(
    await page.locator('[data-test="admin-nav-operations"]').count(),
    0,
    'Operations must no longer exist as a top-level navigation item',
  );

  await page.goto(`${appUrl}/admin/billing/orders?status=manual_review`, {
    waitUntil: 'domcontentloaded',
  });
  await page.locator('[data-test="central-billing-page"]').waitFor({
    state: 'visible',
  });
  await page.locator('[data-test="commerce-summary-panel"]').waitFor({
    state: 'visible',
  });
  assert.equal(
    await page.getByLabel('Billing 状态').inputValue(),
    'manual_review',
    'Billing deep link must hydrate the status filter from URL',
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('[data-test="central-billing-page"]').waitFor({
    state: 'visible',
  });
  assert.equal(
    await page.getByLabel('Billing 状态').inputValue(),
    'manual_review',
    'Billing URL filter must survive a full browser refresh',
  );

  await page.locator('[data-test="platform-switcher-trigger"]').click();
  await page.getByLabel('搜索平台').fill(platformCode);
  await page
    .locator('[data-test="platform-switcher-dropdown"]')
    .getByRole('option')
    .filter({ hasText: platformCode })
    .click();
  await page.waitForURL(`**/admin/platforms/${platformId}/billing`);
  await page.locator('[data-test="commerce-summary-panel"]').waitFor({
    state: 'visible',
  });
  await page.locator('[data-test="platform-switcher-trigger"]').click();
  await page
    .locator('[data-test="platform-switcher-dropdown"]')
    .getByRole('button', { name: /所有平台/u })
    .click();
  await page.waitForURL('**/admin/billing/orders');

  await page.goto(`${appUrl}/admin/platforms/${platformId}/accounts`, {
    waitUntil: 'domcontentloaded',
  });
  assert.equal(
    await page.locator('[data-test="admin-nav-audit"]').count(),
    0,
    'Platform scope must not expose the Global audit navigation item',
  );
  await page.locator('[data-test="platform-switcher-trigger"]').click();
  await page
    .locator('[data-test="platform-switcher-dropdown"]')
    .getByRole('button', { name: /所有平台/u })
    .click();
  await page.waitForURL('**/admin/accounts');
  await page.locator('[data-test="admin-nav-audit"]').click();
  await page.waitForURL('**/admin/audit');

  await page.goto(`${appUrl}/admin/accounts`, {
    waitUntil: 'domcontentloaded',
  });
  await page.locator('[data-test="platform-switcher-trigger"]').click();
  await page.getByLabel('搜索平台').fill(platformCode);
  const switcherDropdown = page.locator(
    '[data-test="platform-switcher-dropdown"]',
  );
  const scopedPlatformOption = switcherDropdown
    .getByRole('option')
    .filter({ hasText: platformCode });
  await scopedPlatformOption.waitFor({ state: 'visible' });
  await scopedPlatformOption.click();
  await page.waitForURL(`**/admin/platforms/${platformId}/accounts`);

  await page.locator('[data-test="platform-switcher-trigger"]').click();
  await page
    .locator('[data-test="platform-switcher-dropdown"]')
    .getByRole('button', { name: /所有平台/u })
    .click();
  await page.waitForURL('**/admin/accounts');

  await page.goto(`${appUrl}/admin/platforms/${platformId}/billing`, {
    waitUntil: 'domcontentloaded',
  });
  await page.locator('[data-test="commerce-summary-panel"]').waitFor({
    state: 'visible',
  });

  await page.goto(`${appUrl}/admin/platforms/${platformId}/plans`, {
    waitUntil: 'domcontentloaded',
  });
  await page.locator('[data-test="commerce-offers-panel"]').waitFor({
    state: 'visible',
  });
  await page.goto(`${appUrl}/admin/platforms/${platformId}/subscriptions`, {
    waitUntil: 'domcontentloaded',
  });
  await page.locator('[data-test="commerce-entitlement-list"]').waitFor({
    state: 'visible',
  });
  await page.goto(
    `${appUrl}/admin/platforms/${platformId}/redemption-batches`,
    {
      waitUntil: 'domcontentloaded',
    },
  );
  await page.locator('[data-test="campaign-code-detail"]').waitFor({
    state: 'visible',
  });

  await page.goto(`${appUrl}/admin/platforms/${platformId}/billing`, {
    waitUntil: 'domcontentloaded',
  });
  await page.locator('[data-test="platform-switcher-trigger"]').click();
  await page
    .locator('[data-test="platform-switcher-dropdown"]')
    .getByRole('button', { name: /所有平台/u })
    .click();
  await page.waitForURL('**/admin/billing/orders');

  return {
    identitySubmitSingleRequest: 'PASS',
    identityPlatformScopeSingleRequest: 'PASS',
    identityUidDetailAccountDeepLink: 'PASS',
    accountWorkbenchDetail: 'PASS',
    accountWorkbenchSupport: 'PASS',
    accountWorkbenchGovernance: 'PASS',
    accountWorkbenchPagination: 'PASS',
    accountWorkbenchFilters: 'PASS',
    accountWorkbenchIdor: 'PASS',
    identityDeletionStart: 'PASS',
    identityDeletionRetry: 'PASS',
    operationsCompatibilityRedirect: 'PASS',
    billingUrlHydration: 'PASS',
    billingRefreshPersistence: 'PASS',
    accountsEquivalentScopeSwitch: 'PASS',
    billingEquivalentScopeSwitch: 'PASS',
    commerceSummarySurfaces: 'PASS',
    commerceCatalogSurface: 'PASS',
    commerceEntitlementSurface: 'PASS',
    commerceCampaignSurface: 'PASS',
    commerceRecentMfaNoReplay: 'PASS',
    platformScopeIsolation: 'PASS',
  };
}

async function runResponsiveA11yMatrix() {
  const routes = [
    { label: 'Admin Shell', path: '/admin' },
    { label: 'Platforms', path: '/admin/platforms' },
    { label: 'Global Identities', path: '/admin/accounts' },
    { label: 'Identity Detail', path: `/admin/accounts/${userId}` },
    { label: 'Deletion Jobs', path: '/admin/accounts/deletion-jobs' },
    { label: 'Global Billing Orders', path: '/admin/billing/orders' },
    {
      label: 'Platform Workspace',
      path: `/admin/platforms/${platformId}`,
    },
    {
      label: 'Accounts',
      path: `/admin/platforms/${platformId}/accounts`,
    },
    {
      label: 'Account 360',
      path: `/admin/platforms/${platformId}/accounts/${platformAccountId}`,
    },
    {
      label: 'Platform Billing',
      path: `/admin/platforms/${platformId}/billing`,
    },
    { label: 'Plans', path: `/admin/platforms/${platformId}/plans` },
    {
      label: 'Subscriptions',
      path: `/admin/platforms/${platformId}/subscriptions`,
    },
    { label: 'Files', path: `/admin/platforms/${platformId}/files` },
    {
      label: 'Settings',
      path: `/admin/platforms/${platformId}/settings`,
    },
    {
      label: 'Integration Settings',
      path: `/admin/platforms/${platformId}/settings/integration`,
    },
    {
      label: 'Redemption Batches',
      path: `/admin/platforms/${platformId}/redemption-batches`,
    },
    { label: 'Audit', path: '/admin/audit' },
    { label: 'Consumer Lab', path: '/admin/consumer-lab' },
    { label: 'Security', path: '/admin/security' },
    { label: 'MFA', path: '/admin/mfa' },
  ];
  const viewports = [320, 375, 390, 768, 1440];
  const observations = [];

  for (const width of viewports) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      await page.goto(`${appUrl}${route.path}`, {
        waitUntil: 'domcontentloaded',
      });
      await page.waitForTimeout(150);
      const audit = await page.evaluate(() => {
        const isVisible = (element) => {
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            rect.width > 0 &&
            rect.height > 0
          );
        };
        const accessibleName = (element) =>
          element.getAttribute('aria-label') ||
          element.getAttribute('title') ||
          element.textContent?.replace(/\s+/gu, ' ').trim() ||
          '';
        const interactive = Array.from(
          document.querySelectorAll('button, a, summary'),
        ).filter(isVisible);
        const missingNames = interactive
          .filter((element) => !accessibleName(element))
          .map((element) => element.outerHTML.slice(0, 180));
        const fields = Array.from(
          document.querySelectorAll('input, textarea, select'),
        ).filter(isVisible);
        const unlabeledFields = fields
          .filter(
            (field) =>
              !field.labels?.length &&
              !field.getAttribute('aria-label') &&
              !field.getAttribute('aria-labelledby'),
          )
          .map((field) => field.outerHTML.slice(0, 180));
        const tablesWithoutHeaders = Array.from(
          document.querySelectorAll('table'),
        )
          .filter((table) => !table.querySelector('th'))
          .map((table) => table.outerHTML.slice(0, 180));
        const isInsideHorizontalScroller = (element) => {
          let parent = element.parentElement;
          while (parent) {
            const overflowX = window.getComputedStyle(parent).overflowX;
            if (overflowX === 'auto' || overflowX === 'scroll') return true;
            parent = parent.parentElement;
          }
          return false;
        };
        return {
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          overflowing: Array.from(document.querySelectorAll('*'))
            .filter(
              (element) =>
                !isInsideHorizontalScroller(element) &&
                element.getBoundingClientRect().right >
                  document.documentElement.clientWidth + 1,
            )
            .map((element) => ({
              tag: element.tagName,
              test: element.getAttribute('data-test'),
              className: element.getAttribute('class'),
              right: Math.round(element.getBoundingClientRect().right),
            }))
            .slice(0, 5),
          missingNames,
          unlabeledFields,
          tablesWithoutHeaders,
        };
      });
      assert.ok(
        audit.overflowing.length === 0,
        `${route.label} at ${width}px has page overflow: ${audit.scrollWidth}/${audit.clientWidth} ${JSON.stringify(audit.overflowing)}`,
      );
      assert.deepEqual(
        audit.missingNames,
        [],
        `${route.label} at ${width}px has unnamed visible controls`,
      );
      assert.deepEqual(
        audit.unlabeledFields,
        [],
        `${route.label} at ${width}px has unlabeled visible fields`,
      );
      assert.deepEqual(
        audit.tablesWithoutHeaders,
        [],
        `${route.label} at ${width}px has a table without headers`,
      );
      observations.push(`${route.label}@${width}`);
    }
  }

  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(`${appUrl}/admin/platforms`, {
    waitUntil: 'domcontentloaded',
  });
  const createTrigger = page.locator('[data-test="platform-create-open"]');
  await createTrigger.focus();
  await createTrigger.click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ state: 'visible' });
  assert.ok(
    await dialog.evaluate((element) =>
      element.contains(document.activeElement),
    ),
    'platform create dialog must move focus inside the dialog',
  );
  await dialog.getByRole('button', { name: '取消' }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(
    await page.evaluate(() => document.activeElement?.dataset.test),
    'platform-create-open',
    'closing platform dialog must restore focus to its trigger',
  );

  await page.goto(`${appUrl}/admin`, { waitUntil: 'domcontentloaded' });
  await page.locator('body').click({ position: { x: 2, y: 2 } });
  let tabStops = 0;
  for (let index = 0; index < 16; index += 1) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const element = document.activeElement;
      return Boolean(
        element &&
        element !== document.body &&
        element !== document.documentElement,
      );
    });
    if (focused) tabStops += 1;
  }
  assert.ok(
    tabStops > 0,
    'keyboard Tab must reach an interactive Admin control',
  );

  return {
    viewports: viewports.join(','),
    routes: observations.length,
    overflow: 'PASS',
    semanticControls: 'PASS',
    dialogFocus: 'PASS',
    tabNavigation: 'PASS',
  };
}

try {
  const { secret } = await signupAndEnroll();
  await createFixtures();
  const result = await runBrowserFlow(secret);
  console.log(JSON.stringify(result));
} finally {
  if (browser) await browser.close().catch(() => undefined);
  if (platformId) {
    await sql`delete from public.audit_logs where platform_id = ${platformId}`.catch(
      () => undefined,
    );
    await sql`delete from private.admin_idempotency where platform_id = ${platformId}`.catch(
      () => undefined,
    );
    await sql`delete from private.idempotency_keys where platform_id = ${platformId}`.catch(
      () => undefined,
    );
    await sql`delete from private.platform_api_keys where platform_id = ${platformId}`.catch(
      () => undefined,
    );
    await sql`delete from public.redemption_codes where platform_id = ${platformId}`.catch(
      () => undefined,
    );
    await sql`delete from public.redemption_code_batches where platform_id = ${platformId}`.catch(
      () => undefined,
    );
    await sql`delete from public.platform_feedback_labels where platform_id = ${platformId}`.catch(
      () => undefined,
    );
    await sql`delete from public.platform_feedback_events where platform_id = ${platformId}`.catch(
      () => undefined,
    );
    await sql`delete from public.platform_feedback_attachments where platform_id = ${platformId}`.catch(
      () => undefined,
    );
    await sql`delete from public.platform_feedback where platform_id = ${platformId}`.catch(
      () => undefined,
    );
    await sql`delete from public.platform_config_usage_events where platform_id = ${platformId}`.catch(
      () => undefined,
    );
    await sql`delete from public.platform_config_likes where platform_id = ${platformId}`.catch(
      () => undefined,
    );
    await sql`delete from public.platform_config_gallery_entries where platform_id = ${platformId}`.catch(
      () => undefined,
    );
    await sql`delete from public.platform_config_gallery_submissions where platform_id = ${platformId}`.catch(
      () => undefined,
    );
    await sql`update public.platform_configs set current_version_id = null where platform_id = ${platformId}`.catch(
      () => undefined,
    );
    await sql`delete from public.platform_config_versions where platform_id = ${platformId}`.catch(
      () => undefined,
    );
    await sql`delete from public.platform_configs where platform_id = ${platformId}`.catch(
      () => undefined,
    );
    await sql`delete from public.platform_config_files where platform_id = ${platformId}`.catch(
      () => undefined,
    );
    await sql`delete from public.platform_file_policies where platform_id = ${platformId}`.catch(
      () => undefined,
    );
    await sql`delete from public.platform_account_admin_tags where platform_id = ${platformId}`.catch(
      () => undefined,
    );
    await sql`delete from public.platform_account_admin_notes where platform_id = ${platformId}`.catch(
      () => undefined,
    );
    await sql`delete from public.platform_account_governance_events where platform_id = ${platformId}`.catch(
      () => undefined,
    );
    await sql`delete from public.subscriptions where platform_id = ${platformId}`.catch(
      () => undefined,
    );
    await sql`delete from public.platform_accounts where platform_id = ${platformId}`.catch(
      () => undefined,
    );
    await sql`delete from public.platform_subscription_config where platform_id = ${platformId}`.catch(
      () => undefined,
    );
    await sql`update public.platforms set default_plan_id = null where id = ${platformId}`.catch(
      () => undefined,
    );
    await sql`delete from public.plans where platform_id = ${platformId}`.catch(
      () => undefined,
    );
    await sql`delete from public.platform_auth_origins where platform_id = ${platformId}`.catch(
      () => undefined,
    );
    await sql`delete from public.platforms where id = ${platformId}`.catch(
      () => undefined,
    );
    await sql`delete from public.platforms where id = ${otherPlatformId}`.catch(
      () => undefined,
    );
  }
  if (lifecycleJobId) {
    await sql`delete from public.audit_logs where target_id = ${lifecycleJobId}`.catch(
      () => undefined,
    );
    await sql`delete from private.deletion_jobs where id = ${lifecycleJobId}`.catch(
      () => undefined,
    );
  }
  if (lifecycleRequestId) {
    await sql`delete from private.deletion_requests where id = ${lifecycleRequestId}`.catch(
      () => undefined,
    );
  }
  if (lifecycleUserId) {
    await sql`delete from private.identity_lifecycle where user_id = ${lifecycleUserId}`.catch(
      () => undefined,
    );
    await sql`delete from auth.sessions where user_id = ${lifecycleUserId}`.catch(
      () => undefined,
    );
    await sql`delete from auth.identities where user_id = ${lifecycleUserId}`.catch(
      () => undefined,
    );
    await sql`delete from auth.users where id = ${lifecycleUserId}`.catch(
      () => undefined,
    );
  }
  if (previousSystemAdmin) {
    await sql`
      update private.system_admin set user_id = ${previousSystemAdmin}
      where singleton_id = 1
    `.catch(() => undefined);
  } else {
    await sql`delete from private.system_admin where singleton_id = 1`.catch(
      () => undefined,
    );
  }
  if (userId) {
    await sql`delete from private.admin_step_up where user_id = ${userId}`.catch(
      () => undefined,
    );
    await sql`delete from private.admin_idempotency where admin_user_id = ${userId}`.catch(
      () => undefined,
    );
    await sql`delete from private.user_recent_auth_proofs where user_id = ${userId}`.catch(
      () => undefined,
    );
    await sql`delete from auth.mfa_challenges where factor_id in
      (select id from auth.mfa_factors where user_id = ${userId})`.catch(
      () => undefined,
    );
    await sql`delete from auth.mfa_factors where user_id = ${userId}`.catch(
      () => undefined,
    );
    await sql`delete from auth.identities where user_id = ${userId}`.catch(
      () => undefined,
    );
    await sql`delete from auth.sessions where user_id = ${userId}`.catch(
      () => undefined,
    );
    await sql`delete from auth.users where id = ${userId}`.catch(
      () => undefined,
    );
  }
  await sql.end({ timeout: 5 }).catch(() => undefined);
}
