import { readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const root = process.cwd();
const isWindows = process.platform === 'win32';
const pnpm = isWindows ? 'pnpm.cmd' : 'pnpm';
const deno = process.env.DENO_BIN?.trim() || (isWindows ? 'deno.exe' : 'deno');
const evidence = [];
const children = new Set();

function localUrl(value, name) {
  if (!value) return;
  if (
    !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/iu.test(
      value,
    )
  )
    throw new Error(`TASK-0801-NEG: ${name} is not a localhost URL`);
}

function verifyLocalEnvironment() {
  localUrl(process.env.SUPABASE_URL, 'SUPABASE_URL');
  localUrl(process.env.NEXT_PUBLIC_SITE_URL, 'NEXT_PUBLIC_SITE_URL');
  localUrl(process.env.SUPABASE_LOCAL_URL, 'SUPABASE_LOCAL_URL');
  localUrl(process.env.ACCOUNT_API_URL, 'ACCOUNT_API_URL');
  if (process.env.SUPABASE_PROJECT_REF)
    throw new Error(
      'TASK-0801-NEG: SUPABASE_PROJECT_REF is set for a Local run',
    );
  if (
    process.env.SUPABASE_DB_URL &&
    !/^postgres(?:ql)?:\/\/(?:[^@/]+@)?(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\//iu.test(
      process.env.SUPABASE_DB_URL,
    )
  )
    throw new Error(
      'TASK-0801-NEG: SUPABASE_DB_URL is not a localhost database URL',
    );
  for (const [name, value] of Object.entries(process.env)) {
    if (
      name.endsWith('_DB_URL') &&
      value &&
      !/^postgres(?:ql)?:\/\/(?:[^@/]+@)?(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\//iu.test(
        value,
      )
    )
      throw new Error(`TASK-0801-NEG: ${name} is not a localhost database URL`);
  }
}

function childEnvironment(extra = {}) {
  const env = { ...process.env, ...extra };
  for (const name of Object.keys(env)) {
    if (/^(?:STAGING|HOSTED)_/iu.test(name)) delete env[name];
  }
  return env;
}

function run(label, command, args = [], extra = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: childEnvironment(extra),
    stdio: 'inherit',
    shell: isWindows && command === pnpm,
  });
  const code = result.status ?? 1;
  evidence.push({ label, command: [command, ...args].join(' '), code });
  if (code !== 0) throw new Error(`TASK-0801 failed: ${label} (exit ${code})`);
}

function runPnpm(label, args, extra = {}) {
  run(label, pnpm, args, extra);
}

function localSupabaseStatus() {
  const result = spawnSync(pnpm, ['exec', 'supabase', 'status', '-o', 'env'], {
    cwd: root,
    env: childEnvironment(),
    encoding: 'utf8',
    shell: isWindows,
  });
  if (result.status !== 0)
    throw new Error('TASK-0801 could not read Local Supabase status');
  const values = {};
  for (const line of result.stdout.split(/\r?\n/u)) {
    const match = /^([A-Z0-9_]+)="(.*)"$/u.exec(line.trim());
    if (match) values[match[1]] = match[2];
  }
  return values;
}

function restartLocalKong() {
  const config = readFileSync(
    path.join(root, 'supabase', 'config.toml'),
    'utf8',
  );
  const project = /^project_id\s*=\s*"([^"]+)"/mu.exec(config)?.[1];
  if (!project)
    throw new Error('TASK-0801 could not identify Local Supabase project');
  const result = spawnSync('docker', ['restart', `supabase_kong_${project}`], {
    cwd: root,
    stdio: 'ignore',
  });
  if (result.status !== 0)
    throw new Error(
      'TASK-0801 could not restart the Local Supabase Kong container',
    );
}

async function waitForLocalAuth(apiUrl) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${apiUrl}/auth/v1/health`);
      if (response.status < 500) return;
    } catch {
      // The local containers can take a few seconds after db reset to accept HTTP.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('TASK-0801 Local Supabase Auth did not become ready');
}

function assertNoPlaceholderApiTest() {
  const packageJson = JSON.parse(
    readFileSync(path.join(root, 'package.json'), 'utf8'),
  );
  const placeholder = String(packageJson.scripts?.['test:api'] ?? '');
  if (!placeholder.includes('not-enabled.mjs')) return;
  console.log(
    'TASK-0801-NEG: placeholder test:api detected and deliberately not counted as PASS; explicit API/Edge suites are used instead.',
  );
  evidence.push({
    label: 'placeholder test:api guard',
    command: 'package.json scripts.test:api',
    code: 'NOT_RUN (placeholder rejected)',
  });
}

function waitForHttp(url, child, label) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 60_000;
    const timer = setInterval(async () => {
      if (Date.now() > deadline) {
        clearInterval(timer);
        reject(new Error(`${label} did not become ready`));
        return;
      }
      try {
        const response = await fetch(url);
        if (response.status >= 200 && response.status < 500) {
          clearInterval(timer);
          resolve();
        }
      } catch {
        if (child.exitCode !== null) {
          clearInterval(timer);
          reject(new Error(`${label} exited before becoming ready`));
        }
      }
    }, 250);
  });
}

function terminateChild(child) {
  if (!child || child.exitCode !== null) return;
  if (isWindows && child.pid) {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
    });
    return;
  }
  child.kill();
}

async function startAccountApiForT12(env) {
  const child = spawn(
    deno,
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
      env: childEnvironment({
        SUPABASE_URL: env.SUPABASE_LOCAL_URL,
        SUPABASE_PUBLISHABLE_KEY: env.SUPABASE_LOCAL_PUBLISHABLE_KEY,
        SUPABASE_SECRET_KEY: env.SUPABASE_LOCAL_SECRET_KEY,
        ACCOUNT_API_DB_URL: env.SUPABASE_DB_URL,
        PLATFORM_KEY_HMAC_SECRET:
          'local-fixture-only-task-0801-platform-secret',
        REDEMPTION_HMAC_SECRET:
          'local-fixture-only-task-0801-redemption-secret',
        REDEMPTION_HMAC_KEY_VERSION: '1',
        ACCOUNT_API_PORT: '8789',
      }),
      stdio: 'ignore',
      shell: false,
    },
  );
  children.add(child);
  await waitForHttp('http://127.0.0.1:8789/v1/plans', child, 'Account API');
  return child;
}

async function startAdminForT12(env) {
  const adminEnv = {
    ...env,
    SUPABASE_URL: env.SUPABASE_LOCAL_URL,
    NEXT_PUBLIC_SUPABASE_URL: env.SUPABASE_LOCAL_URL,
    SUPABASE_PUBLISHABLE_KEY: env.SUPABASE_LOCAL_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: env.SUPABASE_LOCAL_PUBLISHABLE_KEY,
    SUPABASE_ANON_KEY: env.SUPABASE_LOCAL_ANON_KEY,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: env.SUPABASE_LOCAL_ANON_KEY,
    ACCOUNT_API_URL: 'http://127.0.0.1:8789',
  };
  const child = spawn(pnpm, ['--filter', 'admin', 'start'], {
    cwd: root,
    env: childEnvironment({
      ...adminEnv,
      PORT: '3001',
      ADMIN_ORIGIN: 'http://127.0.0.1:3001',
    }),
    stdio: 'ignore',
    shell: isWindows,
  });
  children.add(child);
  await waitForHttp('http://127.0.0.1:3001/admin/login', child, 'Admin app');
  return child;
}

function stopChildren() {
  for (const child of children) terminateChild(child);
}

const formatTargets = [
  'package.json',
  'tooling/scripts/src/task-0801.mjs',
  'tests/spikes/e2e/t16-r2-account.mjs',
  'tests/spikes/sql/bill-05-settlement-concurrency.mjs',
  'apps/template-preview/app/subscription/page.tsx',
  'apps/admin/features/billing/central-billing-page.tsx',
  'apps/admin/components/platform-context/platform-header.tsx',
  'apps/admin/components/platform-context/platform-switcher.tsx',
  'apps/admin/features/platform-settings/platform-settings-page.tsx',
  'apps/admin/app/globals.css',
  'supabase/functions/maintenance/index.ts',
  'supabase/functions/maintenance/index.test.ts',
  'supabase/functions/account-api/index.ts',
  'supabase/functions/account-api/index.test.ts',
  'docs/reference/contracts/admin.openapi.json',
];

async function main() {
  verifyLocalEnvironment();
  assertNoPlaceholderApiTest();

  runPnpm('start Local Supabase', ['db:start']);
  runPnpm('reset Local database', ['db:reset', '--', '--yes']);
  restartLocalKong();
  const local = localSupabaseStatus();
  await waitForLocalAuth(local.API_URL);
  const localEnv = {
    SUPABASE_LOCAL_URL: local.API_URL,
    SUPABASE_LOCAL_ANON_KEY: local.ANON_KEY,
    SUPABASE_LOCAL_PUBLISHABLE_KEY: local.PUBLISHABLE_KEY,
    SUPABASE_LOCAL_SECRET_KEY: local.SERVICE_ROLE_KEY,
    SUPABASE_DB_URL: local.DB_URL,
    DENO_BIN: deno,
  };

  runPnpm('task changed-file format check', [
    'exec',
    'oxfmt',
    '--check',
    ...formatTargets,
  ]);
  runPnpm('lint', ['lint']);
  runPnpm('typecheck', ['typecheck']);
  runPnpm('build', ['build'], localEnv);
  runPnpm('domain unit tests', ['--filter', '@kit/domain', 'test:unit']);
  runPnpm('account-server unit tests', [
    '--filter',
    '@kit/account-server',
    'test:unit',
  ]);
  run(
    'Edge function tests',
    deno,
    [
      'test',
      '--allow-env',
      '--allow-net',
      '--allow-read',
      '--allow-import',
      'supabase/functions/_shared/afdian.test.ts',
      'supabase/functions/billing-webhook/index.test.ts',
      'supabase/functions/maintenance/index.test.ts',
      'supabase/functions/account-api/index.test.ts',
    ],
    localEnv,
  );
  runPnpm('database tests', ['test:db'], localEnv);
  runPnpm(
    'settlement concurrency',
    ['run', 'test:sql:bill-05-concurrency'],
    localEnv,
  );
  runPnpm(
    'template typecheck',
    ['--filter', 'template-preview', 'typecheck'],
    localEnv,
  );
  runPnpm('admin typecheck', ['--filter', 'admin', 'typecheck'], localEnv);
  runPnpm('SDK package test', ['test:sdk:m5-02']);
  runPnpm('registry consumer test', ['test:registry:m5-04']);
  runPnpm('consumer install test', ['test:consumer:m5-05'], localEnv);
  runPnpm('runtime import probe', ['runtime:probe'], localEnv);
  runPnpm('consumer/admin browser flow', ['test:e2e:t16-r2'], localEnv);
  const accountApi = await startAccountApiForT12(localEnv);
  const admin = await startAdminForT12(localEnv);
  try {
    runPnpm('Admin browser flow', ['test:e2e:t12-r2'], {
      ...localEnv,
      T12_ADMIN_APP_URL: 'http://127.0.0.1:3001',
      T12_ALLOW_SYSTEM_ADMIN_SWAP: '1',
    });
  } finally {
    terminateChild(admin);
    children.delete(admin);
    terminateChild(accountApi);
    children.delete(accountApi);
  }
  runPnpm('documentation check', ['docs:check']);
  runPnpm('contract check', ['contracts:check']);
  console.log(
    `TASK-0801 PASS: ${evidence.filter((item) => item.code === 0).length} executable gates passed.`,
  );
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  stopChildren();
}
