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
  await assertPageText('Admin control center');

  const cookiesBeforeLogout = await context.cookies(appUrl);
  const proofCookie = cookiesBeforeLogout.find(
    (cookie) => cookie.name === 'aisenhub-recent-auth-proof',
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

  await page.goto(`${appUrl}/admin/entitlements`, {
    waitUntil: 'domcontentloaded',
  });
  await page.getByLabel('Platform ID').fill(platformId);
  const [loadPlansResponse] = await Promise.all([
    page.waitForResponse((response) =>
      response
        .url()
        .endsWith(`/api/v1/admin/api/v1/platforms/${platformId}/plans`),
    ),
    page.getByRole('button', { name: '加载' }).click(),
  ]);
  assertStatus(loadPlansResponse.status(), 200, 'browser admin plan list');
  await assertPageText(
    '已加载；所有写入仍由中央 Account API 和数据库领域函数执行。',
  );
  await page.locator('input[aria-label="Plan code"]').fill('browser-pro');
  await page.locator('input[aria-label="Plan name"]').fill('Browser Pro');
  const [createPlanResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response
          .url()
          .endsWith(`/api/v1/admin/api/v1/platforms/${platformId}/plans`) &&
        response.request().method() === 'POST',
    ),
    page.getByRole('button', { name: '创建计划' }).click(),
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
      (cookie) => cookie.name === 'aisenhub-recent-auth-proof',
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
    logoutOldJwtRejected: 'PASS',
  };
}

async function assertPageText(text) {
  await page.getByText(text, { exact: true }).waitFor({ state: 'visible' });
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
