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
const planId = crypto.randomUUID();
const platformCode = `t12-r2-browser-${crypto.randomUUID()}`;
const email = `t12-r2-browser-${crypto.randomUUID()}@example.test`;
const password = `T12-R2-${randomBytes(16).toString('hex')}!`;
let userId;
let factorId;
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
    insert into public.plans (id, platform_id, code, name, kind, features)
    values (${planId}, ${platformId}, 'free', 'Free', 'free', ${sql.json({})})
  `;
  await sql`
    update public.platforms
    set default_plan_id = ${planId}
    where id = ${platformId}
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
    .waitFor({ state: 'visible' });

  const aal1 = await browserRequest(
    `/api/v1/admin/api/v1/platforms/${platformId}/plans`,
  );
  assertStatus(aal1.status, 403, 'AAL1 Admin API rejection');
  assert.equal(aal1.payload?.error?.code, 'MFA_REQUIRED');

  await page.getByLabel('验证码').fill(totp(secret));
  await page.getByRole('button', { name: '验证并继续' }).click();
  await page.waitForURL(/\/admin$/u);
  await assertPageText('管理员总览');

  const cookiesBeforeLogout = await context.cookies(appUrl);
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
    select code, name, kind, status
    from public.plans
    where platform_id = ${platformId} and code = 'browser-pro'
  `;
  assert.deepEqual(createdPlan, {
    code: 'browser-pro',
    name: 'Browser Pro',
    kind: 'paid',
    status: 'active',
  });

  const responsiveA11y = await runResponsiveA11yMatrix();

  await page.getByRole('button', { name: '退出登录' }).click();
  await page.waitForURL(/\/admin\/login$/u);
  const cookiesAfterLogout = await context.cookies(appUrl);
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

  return {
    login: 'PASS',
    aal1Rejected: 'PASS',
    browserMfa: 'PASS',
    httpOnlyProof: 'PASS',
    sensitiveWrite: 'PASS',
    responsiveA11y,
    logoutOldJwtRejected: 'PASS',
  };
}

async function assertPageText(text) {
  await page.getByText(text, { exact: true }).waitFor({ state: 'visible' });
}

async function runResponsiveA11yMatrix() {
  const routes = [
    { label: 'Admin Shell', path: '/admin' },
    { label: 'Platforms', path: '/admin/platforms' },
    {
      label: 'Platform Workspace',
      path: `/admin/platforms/${platformId}`,
    },
    {
      label: 'Accounts',
      path: `/admin/platforms/${platformId}/accounts`,
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
      label: 'Settings Keys',
      path: `/admin/platforms/${platformId}/settings/keys`,
    },
    {
      label: 'Redemption Batches',
      path: `/admin/platforms/${platformId}/redemption-batches`,
    },
    { label: 'Operations', path: '/admin/operations' },
    { label: 'Audit', path: '/admin/audit' },
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
        return {
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          overflowing: Array.from(document.querySelectorAll('*'))
            .map((element) => ({
              tag: element.tagName,
              test: element.getAttribute('data-test'),
              className: element.getAttribute('class'),
              right: Math.round(element.getBoundingClientRect().right),
            }))
            .filter(
              (element) =>
                element.right > document.documentElement.clientWidth + 1,
            )
            .slice(0, 5),
          missingNames,
          unlabeledFields,
          tablesWithoutHeaders,
        };
      });
      assert.ok(
        audit.scrollWidth <= audit.clientWidth + 1,
        `${route.label} at ${width}px overflows: ${audit.scrollWidth}/${audit.clientWidth} ${JSON.stringify(audit.overflowing)}`,
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
