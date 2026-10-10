// Browser-only regression probe: every API request uses synthetic fixtures.
// No Supabase credentials, actual writes, or production access are required.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(import.meta.url);
const store = join(root, 'node_modules', '.pnpm');
const pkg = readdirSync(store).find((name) => /^playwright@\d/u.test(name));
assert.ok(pkg, 'Reuse the installed workspace Playwright');
const { chromium } = require(join(store, pkg, 'node_modules/playwright'));
const origin = process.env.ADMIN_UX_APP_URL ?? 'http://localhost:3001';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const output = join(root, 'artifacts/admin-ux-review');
mkdirSync(output, { recursive: true });

const platformId = '11111111-1111-4111-8111-111111111111';
const accountId = '22222222-2222-4222-8222-222222222222';
const platform = {
  platform_id: platformId,
  name: '示例平台 · 产品工作区',
  code: 'example-platform',
  status: 'active',
  allow_activation: true,
};
const account = {
  platform_account_id: accountId,
  user_id: '33333333-3333-4333-8333-333333333333',
  status: 'active',
  created_at: '2026-10-01T08:00:00Z',
  updated_at: '2026-10-04T08:00:00Z',
  activated_at: '2026-10-01T08:00:00Z',
};
const auditId = '55555555-5555-4555-8555-555555555555';
const auditRequestId = '66666666-6666-4666-8666-666666666666';
const auditEntry = {
  id: auditId,
  request_id: auditRequestId,
  platform_id: platformId,
  platform_name: platform.name,
  platform_code: platform.code,
  platform_account_id: accountId,
  action: 'platform.updated',
  actor_type: 'admin',
  actor_id: '77777777-7777-4777-8777-777777777777',
  actor_display_name: '测试管理员',
  actor_email: 'admin@example.invalid',
  target_type: 'platform',
  target_id: platformId,
  outcome: null,
  created_at: '2026-10-10T09:30:00Z',
};
let failPlatforms = false;
let securityUnavailable = false;
let platformDelay = 0;
const writes = [];
const reads = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ reducedMotion: 'reduce' });
const page = await context.newPage();
page.setDefaultNavigationTimeout(120_000); // Allow a cold local Next.js compilation.
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));

await context.route('**/*', async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  if (url.origin !== new URL(origin).origin) return route.abort();
  if (!url.pathname.startsWith('/api/')) return route.continue();
  if (request.method() !== 'GET') {
    writes.push({ method: request.method(), path: url.pathname });
    return route.fulfill({
      status: 503,
      json: { error: { code: 'AUTHORIZATION_UNAVAILABLE' } },
    });
  }
  const path = url.pathname.replace('/api/v1/admin/api/v1', '');
  reads.push({ path, search: url.search });
  let data;
  if (path === '/security/status') {
    if (securityUnavailable)
      return route.fulfill({
        status: 503,
        json: { error: { code: 'AUTHORIZATION_UNAVAILABLE' } },
      });
    data = { current_aal: 'aal2' };
  } else if (path === '/platforms') {
    if (platformDelay)
      await new Promise((done) => setTimeout(done, platformDelay));
    if (failPlatforms)
      return route.fulfill({
        status: 503,
        json: { error: { code: 'AUTHORIZATION_UNAVAILABLE' } },
      });
    data =
      url.searchParams.get('q') === 'no-match'
        ? []
        : [
            platform,
            {
              ...platform,
              platform_id: '44444444-4444-4444-8444-444444444444',
              name: '示例停用平台',
              code: 'example-disabled',
              status: 'disabled',
            },
          ];
  } else if (path === `/platforms/${platformId}`) data = platform;
  else if (path === `/platforms/${platformId}/accounts`)
    data = url.searchParams.get('q') === 'no-match' ? [] : [account];
  else if (path === `/platforms/${platformId}/accounts/${accountId}`)
    data = account;
  else if (path === '/audit') {
    const noMatch =
      url.searchParams.get('q') === 'no-match' ||
      (url.searchParams.get('actor') &&
        url.searchParams.get('actor') !== auditEntry.actor_email) ||
      (url.searchParams.get('platform_id') &&
        url.searchParams.get('platform_id') !== platformId) ||
      (url.searchParams.get('action') &&
        url.searchParams.get('action') !== auditEntry.action) ||
      (url.searchParams.get('target_type') &&
        url.searchParams.get('target_type') !== auditEntry.target_type) ||
      (url.searchParams.get('outcome') &&
        url.searchParams.get('outcome') !== 'unrecorded');
    data = noMatch ? [] : [auditEntry];
  } else if (
    path === '/deletion-jobs' ||
    /\/(plans|keys|origins|redemption-batches)$/u.test(path)
  )
    data = [];
  else
    return route.fulfill({
      status: 503,
      json: { error: { code: 'AUTHORIZATION_UNAVAILABLE' } },
    });
  await route.fulfill({
    status: 200,
    json: {
      data,
      request_id: 'synthetic-ui-probe',
      next_cursor:
        path === '/audit' && data.length > 0 && !url.searchParams.has('cursor')
          ? auditId
          : null,
    },
  });
});

async function goto(path, test) {
  await page.goto(`${origin}${path}`, { waitUntil: 'domcontentloaded' });
  await page.locator(`[data-test="${test}"]`).waitFor();
  await page.evaluate(() => document.fonts.ready);
}

async function audit(label) {
  const result = await page.evaluate(() => {
    const visible = (el) => {
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return (
        box.width > 0 &&
        box.height > 0 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none'
      );
    };
    const insideScroller = (el) => {
      for (
        let parent = el.parentElement;
        parent;
        parent = parent.parentElement
      ) {
        if (['auto', 'scroll'].includes(getComputedStyle(parent).overflowX))
          return true;
      }
      return false;
    };
    const width = document.documentElement.clientWidth;
    const overflow = [...document.querySelectorAll('body *')]
      .filter(
        (el) =>
          visible(el) &&
          !insideScroller(el) &&
          el.getBoundingClientRect().right > width + 1,
      )
      .map(
        (el) => `${el.tagName}:${el.getAttribute('data-test') ?? el.className}`,
      )
      .slice(0, 8);
    const unnamed = [...document.querySelectorAll('button, a')]
      .filter(visible)
      .filter(
        (el) =>
          !el.getAttribute('aria-label') &&
          !el.getAttribute('title') &&
          !el.textContent?.trim(),
      )
      .map((el) => el.outerHTML.slice(0, 160));
    const unlabeled = [...document.querySelectorAll('input, select, textarea')]
      .filter(visible)
      .filter(
        (el) =>
          !el.labels?.length &&
          !el.getAttribute('aria-label') &&
          !el.getAttribute('aria-labelledby'),
      )
      .map((el) => el.outerHTML.slice(0, 160));
    return { overflow, unnamed, unlabeled };
  });
  assert.deepEqual(result, { overflow: [], unnamed: [], unlabeled: [] }, label);
}

try {
  reads.length = 0;
  await goto('/admin', 'admin-overview');
  await page.waitForTimeout(200);
  assert.equal(
    reads.filter((read) => read.path === '/audit').length,
    0,
    'Overview must not request audit data after audit de-coupling',
  );
  console.log('PASS: Overview no longer requests audit data');

  const routes = [
    ['/admin', 'admin-overview'],
    ['/admin/platforms', 'platform-directory-table'],
    [`/admin/platforms/${platformId}`, 'platform-overview'],
    [`/admin/platforms/${platformId}/accounts`, 'accounts-table-section'],
    [`/admin/platforms/${platformId}/settings`, 'platform-workspace'],
    [`/admin/platforms/${platformId}/plans`, 'platform-workspace'],
    [`/admin/platforms/${platformId}/subscriptions`, 'platform-workspace'],
    [`/admin/platforms/${platformId}/files`, 'platform-workspace'],
    [`/admin/platforms/${platformId}/redemption-batches`, 'platform-workspace'],
    [`/admin/platforms/${platformId}/settings/keys`, 'platform-workspace'],
    [`/admin/platforms/${platformId}/settings/origins`, 'platform-workspace'],
    ['/admin/billing', 'admin-shell'],
    ['/admin/accounts/deletion-jobs', 'admin-shell'],
    ['/admin/audit', 'admin-shell'],
    ['/admin/security', 'admin-shell'],
  ];
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 960 });
    for (const [path, test] of routes) {
      await goto(path, test);
      await audit(`${path}@${width}`);
      if (path === '/admin/platforms' && [1440, 390].includes(width)) {
        await page.screenshot({
          path: join(output, width === 1440 ? 'desktop.png' : 'mobile.png'),
          fullPage: true,
        });
      }
      if (path === '/admin' && width === 1440)
        await page.screenshot({
          path: join(output, 'overview.png'),
          fullPage: true,
        });
      if (path.endsWith('/accounts') && width === 1440)
        await page.screenshot({
          path: join(output, 'accounts.png'),
          fullPage: true,
        });
      if (path.endsWith('/accounts') && width === 390)
        await page.screenshot({
          path: join(output, 'accounts-mobile.png'),
          fullPage: true,
        });
    }
  }
  console.log(
    'PASS: responsive and semantic controls across 60 route/viewport combinations',
  );

  await page.setViewportSize({ width: 1440, height: 960 });
  await goto('/admin/platforms', 'platform-directory-table');
  await page.locator('[data-test="platform-switcher-trigger"]').click();
  const switcherDropdown = page.locator(
    '[data-test="platform-switcher-dropdown"]',
  );
  await switcherDropdown.waitFor();
  assert.equal(
    await switcherDropdown.getByText('查看完整平台目录 →').count(),
    0,
    'PlatformSwitcher no longer owns platform-directory navigation',
  );
  assert.equal(
    await switcherDropdown.getByText('所有平台（全局透镜）').count(),
    1,
    'Global scope remains available in PlatformSwitcher',
  );
  const switcherSearch = page.locator('[data-test="platform-switcher-search"]');
  await switcherSearch.fill('停用');
  assert.equal(
    await switcherDropdown.getByRole('option').count(),
    1,
    'PlatformSwitcher filters by platform name',
  );
  assert.match(
    await switcherDropdown.getByRole('option').innerText(),
    /示例停用平台/u,
  );
  await switcherSearch.fill('example-platform');
  assert.equal(
    await switcherDropdown.getByRole('option').count(),
    1,
    'PlatformSwitcher filters by platform code',
  );
  assert.match(
    await switcherDropdown.getByRole('option').innerText(),
    /示例平台 · 产品工作区/u,
  );
  await switcherSearch.fill('');
  assert.equal(
    await switcherDropdown.getByRole('option').count(),
    2,
    'Clearing PlatformSwitcher search restores loaded options',
  );
  await page.keyboard.press('Escape');
  await switcherDropdown.waitFor({ state: 'hidden' });

  await page.setViewportSize({ width: 390, height: 960 });
  await goto('/admin/platforms', 'platform-directory-table');
  await page.locator('[data-test="admin-sidebar-toggle"]').click();
  await page.locator('[data-test="platform-switcher-trigger"]').click();
  await switcherDropdown.waitFor();
  const switcherBox = await switcherDropdown.boundingBox();
  assert.ok(switcherBox, 'PlatformSwitcher dropdown has a measurable box');
  assert.ok(
    switcherBox.x >= 0 && switcherBox.x + switcherBox.width <= 390,
    'PlatformSwitcher dropdown stays inside the narrow viewport',
  );
  await page.keyboard.press('Escape');
  console.log(
    'PASS: PlatformSwitcher scope-only menu, search filtering and narrow viewport bounds',
  );

  await page.setViewportSize({ width: 390, height: 960 });
  for (const [path, test, selector] of [
    [
      '/admin/platforms',
      'platform-directory-table',
      '[data-test="platform-directory-scroll"]',
    ],
    [
      `/admin/platforms/${platformId}/accounts`,
      'accounts-table-section',
      '[data-test="accounts-table-section"] .data-table',
    ],
  ]) {
    await goto(path, test);
    const scroller = page.locator(selector);
    assert.ok(
      await scroller.evaluate((el) => el.scrollWidth > el.clientWidth),
      'Focused element owns horizontal scrolling',
    );
    await scroller.focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(
      (selector) => document.querySelector(selector).scrollLeft > 0,
      selector,
    );
    await page.screenshot({
      path: join(
        output,
        test === 'platform-directory-table'
          ? 'platform-scroll-focus.png'
          : 'account-scroll-focus.png',
      ),
      fullPage: true,
    });
    const actionTest =
      test === 'platform-directory-table'
        ? 'platform-directory-open'
        : `account-inspect-${accountId}`;
    let actionReached = false;
    for (let index = 0; index < 10; index += 1) {
      await page.keyboard.press('Tab');
      actionReached = await page.evaluate(
        (name) => document.activeElement?.dataset.test === name,
        actionTest,
      );
      if (actionReached) break;
    }
    assert.ok(
      actionReached,
      'Keyboard can reach the action in the rightmost column',
    );
  }
  console.log(
    'PASS: keyboard ArrowRight scrolls platform and account data viewports',
  );

  await page.setViewportSize({ width: 768, height: 960 });
  await goto('/admin/platforms', 'platform-directory-table');
  await page
    .getByRole('button', { name: '快速跳转（Ctrl 或 Command + K）' })
    .click();
  await page.getByRole('dialog').waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(
    await page.evaluate(() => document.activeElement?.dataset.test),
    'admin-command-trigger',
  );
  await page.keyboard.press('Control+k');
  await page.getByRole('dialog').waitFor();
  await page.keyboard.press('Escape');
  await page.locator('[data-test="admin-skip-link"]').focus();
  await page.keyboard.press('Enter');
  assert.equal(
    await page.evaluate(() => document.activeElement?.id),
    'admin-content',
  );

  await page
    .locator('[data-test="platform-directory-search"]')
    .fill('no-match');
  await page.locator('[data-test="platform-directory-search-submit"]').click();
  await page.locator('[data-test="platform-directory-empty"]').waitFor();
  assert.equal(new URL(page.url()).searchParams.get('q'), 'no-match');
  await page.locator('[data-test="platform-directory-empty-clear"]').click();
  await page.locator('[data-test="platform-directory-table"]').waitFor();
  failPlatforms = true;
  await page.locator('[data-test="platform-directory-refresh"]').click();
  await page
    .locator('[data-test="platform-directory-background-error"]')
    .waitFor();
  await page.screenshot({
    path: join(output, 'refresh-error.png'),
    fullPage: true,
  });
  assert.equal(
    await page.locator('[data-test="platform-directory-row"]').count(),
    2,
    'Refresh failure preserves rows',
  );
  failPlatforms = false;
  await page
    .locator('[data-test="platform-directory-background-retry"]')
    .click();
  await page
    .locator('[data-test="platform-directory-background-error"]')
    .waitFor({ state: 'hidden' });
  console.log('PASS: search URL, clear, background refresh failure and retry');

  await page.setViewportSize({ width: 1440, height: 960 });
  await goto('/admin/audit', 'audit-page');
  await page.locator('[data-test="audit-row"]').waitFor();
  const auditTableText = await page
    .locator('[data-test="audit-table"]')
    .innerText();
  assert.match(auditTableText, /测试管理员/u);
  assert.match(auditTableText, /示例平台 · 产品工作区/u);
  assert.match(auditTableText, /更新平台设置/u);
  assert.match(auditTableText, /未记录/u);
  assert.doesNotMatch(
    auditTableText,
    /platform\.updated|55555555-5555-4555-8555-555555555555/u,
    'Audit primary table keeps raw codes and UUIDs out of first-level reading',
  );

  await page.locator('[data-test="audit-next-page"]').click();
  await page.waitForURL((url) => url.searchParams.get('cursor') === auditId);
  await page
    .locator('[data-test="audit-actor-filter"]')
    .fill(auditEntry.actor_email);
  await page
    .locator('[data-test="audit-action-filter"]')
    .selectOption(auditEntry.action);
  await page
    .locator('[data-test="audit-target-filter"]')
    .selectOption('platform');
  await page
    .locator('[data-test="audit-outcome-filter"]')
    .selectOption('unrecorded');
  await page.locator('[data-test="audit-query-submit"]').click();
  await page.waitForURL((url) => {
    return (
      url.searchParams.get('actor') === auditEntry.actor_email &&
      url.searchParams.get('action') === auditEntry.action &&
      url.searchParams.get('target_type') === 'platform' &&
      url.searchParams.get('outcome') === 'unrecorded' &&
      !url.searchParams.has('cursor')
    );
  });
  await page.locator('[data-test="audit-row"]').waitFor();
  const lastAuditRead = reads.filter((read) => read.path === '/audit').at(-1);
  assert.ok(lastAuditRead, 'Audit filter submission sends a read');
  const lastAuditParams = new URLSearchParams(lastAuditRead.search);
  assert.equal(lastAuditParams.get('actor'), auditEntry.actor_email);
  assert.equal(lastAuditParams.get('action'), auditEntry.action);
  assert.equal(lastAuditParams.get('target_type'), 'platform');
  assert.equal(lastAuditParams.get('outcome'), 'unrecorded');
  assert.equal(lastAuditParams.get('cursor'), null);

  const inspectorTrigger = page.locator('[data-test="audit-open-inspector"]');
  await inspectorTrigger.focus();
  await inspectorTrigger.click();
  await page.locator('[data-test="audit-inspector"]').waitFor();
  const inspectorText = await page
    .locator('[data-test="audit-inspector"]')
    .innerText();
  assert.match(inspectorText, /测试管理员/u);
  assert.match(inspectorText, /示例平台 · 产品工作区/u);
  await page.locator('[data-test="audit-technical-details"]').click();
  const expandedInspectorText = await page
    .locator('[data-test="audit-inspector"]')
    .innerText();
  assert.match(expandedInspectorText, /platform\.updated/u);
  assert.match(expandedInspectorText, new RegExp(auditId, 'u'));
  assert.match(expandedInspectorText, new RegExp(auditRequestId, 'u'));
  await page.locator('[data-test="audit-inspector-close"]').click();
  await page
    .locator('[data-test="audit-inspector"]')
    .waitFor({ state: 'hidden' });
  assert.equal(
    await page.evaluate(() => document.activeElement?.dataset.test),
    'audit-open-inspector',
    'Audit inspector restores focus to its trigger',
  );

  await page.locator('[data-test="audit-query"]').fill('no-match');
  await page.locator('[data-test="audit-query-submit"]').click();
  await page.waitForURL((url) => url.searchParams.get('q') === 'no-match');
  await page.locator('[data-test="audit-empty-filter"]').waitFor();
  await page.locator('[data-test="audit-empty-clear"]').click();
  await page.locator('[data-test="audit-row"]').waitFor();
  console.log(
    'PASS: Audit business table, URL filters, cursor reset, inspector technical details and empty state',
  );

  await goto(
    `/admin/platforms/${platformId}/accounts`,
    'accounts-table-section',
  );
  await page.locator(`[data-test="account-inspect-${accountId}"]`).click();
  await page.locator('[data-test="resource-inspector"]').waitFor();
  assert.equal(new URL(page.url()).searchParams.get('selected'), accountId);
  await page.screenshot({
    path: join(output, 'inspector.png'),
    fullPage: true,
  });
  await page.locator('[data-test="resource-inspector-close-icon"]').click();
  await page
    .locator('[data-test="resource-inspector"]')
    .waitFor({ state: 'hidden' });
  assert.equal(new URL(page.url()).searchParams.get('selected'), null);
  await page.locator(`[data-test="account-close-${accountId}"]`).click();
  await page.getByRole('dialog').waitFor();
  assert.match(await page.getByRole('dialog').innerText(), /原因|理由/u);
  await page.screenshot({
    path: join(output, 'confirmation.png'),
    fullPage: true,
  });
  assert.equal(
    writes.length,
    0,
    'Opening sensitive confirmation never sends a write',
  );
  await page.keyboard.press('Escape');
  console.log('PASS: inspector deep link, closing and sensitive confirmation');

  await page.setViewportSize({ width: 390, height: 960 });
  await goto('/admin/platforms', 'platform-directory-table');
  await page.locator('[data-test="admin-sidebar-toggle"]').click();
  await page.getByRole('dialog').waitFor();
  await page.locator('[data-test="admin-nav-overview"]').click();
  await page.locator('[data-test="admin-overview"]').waitFor();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  console.log('PASS: mobile navigation closes after selecting a destination');

  securityUnavailable = true;
  await goto('/admin/platforms', 'admin-security-unavailable');
  assert.equal(await page.locator('[data-test="admin-shell"]').count(), 0);
  securityUnavailable = false;
  await page.locator('[data-test="admin-security-retry"]').click();
  await page.locator('[data-test="platform-directory-table"]').waitFor();
  platformDelay = 1500;
  await page.goto(`${origin}/admin/platforms`, {
    waitUntil: 'domcontentloaded',
  });
  await page.locator('[data-test="platform-directory"]').waitFor();
  await page
    .getByRole('status')
    .filter({ hasText: '正在加载平台目录' })
    .waitFor();
  await page.locator('[data-test="platform-directory-table"]').waitFor();
  assert.deepEqual(pageErrors, [], 'No browser runtime exceptions');
  assert.equal(
    writes.length,
    0,
    'No actual or simulated writes needed for this UX probe',
  );
  console.log(
    'PASS: fail-closed security, retry, loading and zero runtime exceptions',
  );
  console.log(`Screenshots: ${output}`);
} finally {
  await browser.close();
}
