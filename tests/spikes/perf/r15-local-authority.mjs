import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import postgres from 'postgres';

const execFileAsync = promisify(execFile);
const repositoryRoot = process.cwd();
const apiOrigin = (
  process.env.R15_ACCOUNT_API_ORIGIN ?? 'http://127.0.0.1:8789'
).replace(/\/$/u, '');
const requestsPerSecond = positiveInteger(
  process.env.R15_REQUESTS_PER_SECOND,
  100,
);
const durationSeconds = positiveInteger(
  process.env.R15_DURATION_SECONDS,
  15 * 60,
);
const platformSecret =
  process.env.R15_PLATFORM_KEY_HMAC_SECRET ??
  'local-r15-authority-probe-platform-secret';
const redemptionSecret =
  process.env.R15_REDEMPTION_HMAC_SECRET ??
  'local-r15-authority-probe-redemption-secret';

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function localStatus() {
  const supabaseCli = `${repositoryRoot}/node_modules/supabase/dist/supabase.js`;
  const { stdout } = await execFileAsync(
    process.execPath,
    [supabaseCli, 'status', '-o', 'env'],
    { cwd: repositoryRoot },
  );
  return Object.fromEntries(
    stdout
      .split('\n')
      .map((line) => /^([A-Z0-9_]+)="(.*)"$/u.exec(line))
      .filter(Boolean)
      .map((match) => [match[1], match[2]]),
  );
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  if (!sorted.length) return null;
  const index = Math.min(
    sorted.length - 1,
    Math.ceil(sorted.length * fraction) - 1,
  );
  return Number(sorted[index].toFixed(2));
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const status = await localStatus();
const authUrl = status.API_URL;
const anonKey = status.ANON_KEY;
const databaseUrl = status.DB_URL;
assert(authUrl && anonKey && databaseUrl, 'Local Supabase status is required');
const apiPort = new URL(apiOrigin).port || '8000';

const sql = postgres(databaseUrl, {
  max: 12,
  prepare: false,
  onnotice: () => undefined,
});
const platformId = randomUUID();
const planId = randomUUID();
const keyId = randomUUID();
const userEmail = `r15-local-${randomUUID()}@example.test`;
const userPassword = `R15-local-${randomBytes(16).toString('hex')}!`;
const presentedKey = `phk_v1_${keyId}_r15-local-probe`;
const keyHmac = createHmac('sha256', platformSecret)
  .update(`1:platform-key:${keyId}:${presentedKey}`)
  .digest('hex');
let userId;
let managedApi;

async function waitForManagedApi() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (managedApi?.exitCode !== null)
      throw new Error('managed Account API exited before becoming ready');
    try {
      await fetch(`${apiOrigin}/functions/v1/account-api/v1/plans`, {
        signal: AbortSignal.timeout(2000),
      });
      return;
    } catch {
      await sleep(250);
    }
  }
  throw new Error('managed Account API did not become ready');
}

async function startManagedApi() {
  if (process.env.R15_START_API !== '1') return;
  assert(status.SERVICE_ROLE_KEY, 'Local service role key is required');
  managedApi = spawn(
    process.env.R15_DENO_PATH ?? 'deno',
    [
      'run',
      '--allow-env',
      '--allow-net',
      '--allow-read',
      '--allow-import',
      'supabase/functions/account-api/index.ts',
    ],
    {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        SUPABASE_URL: authUrl,
        SUPABASE_ANON_KEY: anonKey,
        SUPABASE_PUBLISHABLE_KEY: anonKey,
        SUPABASE_SECRET_KEY: status.SERVICE_ROLE_KEY,
        ACCOUNT_API_JWT_SECRET: status.JWT_SECRET,
        ACCOUNT_API_DB_URL: databaseUrl,
        PLATFORM_KEY_HMAC_SECRET: platformSecret,
        REDEMPTION_HMAC_SECRET: redemptionSecret,
        REDEMPTION_HMAC_KEY_VERSION: '1',
        ACCOUNT_API_PORT: apiPort,
      },
      stdio: 'ignore',
      windowsHide: true,
    },
  );
  await waitForManagedApi();
}

async function stopManagedApi() {
  if (!managedApi) return;
  if (managedApi.exitCode === null) managedApi.kill();
  managedApi = undefined;
}

async function cleanup() {
  if (userId) {
    await sql`delete from public.platform_accounts where user_id = ${userId}`.catch(
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
  await sql`delete from private.platform_api_keys where id = ${keyId}`.catch(
    () => undefined,
  );
  await sql`delete from public.plans where id = ${planId}`.catch(
    () => undefined,
  );
  await sql`delete from public.platforms where id = ${platformId}`.catch(
    () => undefined,
  );
  await sql.end({ timeout: 5 }).catch(() => undefined);
}

async function signup() {
  const response = await fetch(`${authUrl}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email: userEmail, password: userPassword }),
  });
  const payload = await response.json().catch(() => null);
  assert.equal(response.status, 200, 'local Auth signup must succeed');
  userId = payload?.user?.id;
  assert.ok(userId && payload?.access_token, 'signup must return a session');
  return payload.access_token;
}

async function request(accessToken, includeBody = false) {
  const started = performance.now();
  try {
    const response = await fetch(
      `${apiOrigin}/functions/v1/account-api/v1/account/principal`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-Platform-Key': presentedKey,
        },
        signal: AbortSignal.timeout(10_000),
      },
    );
    const body = await response.text();
    return {
      latency: performance.now() - started,
      status: response.status,
      ...(includeBody ? { body } : {}),
    };
  } catch {
    return { latency: performance.now() - started, status: 'network_error' };
  }
}

async function profileAuth(accessToken) {
  const latencies = await Promise.all(
    Array.from({ length: 50 }, async () => {
      const started = performance.now();
      const response = await fetch(`${authUrl}/auth/v1/user`, {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${accessToken}`,
        },
      });
      await response.arrayBuffer();
      assert.equal(response.status, 200, 'Auth profiling request must succeed');
      return performance.now() - started;
    }),
  );
  return {
    p50_ms: percentile(latencies, 0.5),
    p95_ms: percentile(latencies, 0.95),
  };
}

async function profileApi(accessToken) {
  const results = await Promise.all(
    Array.from({ length: 50 }, () => request(accessToken)),
  );
  const latencies = results.map((result) => result.latency);
  return {
    p50_ms: percentile(latencies, 0.5),
    p95_ms: percentile(latencies, 0.95),
  };
}

async function activate(accessToken) {
  const response = await fetch(
    `${apiOrigin}/functions/v1/account-api/v1/account/activate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Platform-Key': presentedKey,
      },
      body: '{}',
    },
  );
  const body = await response.text();
  assert.equal(
    response.status,
    200,
    `local account activation must succeed: ${body}`,
  );
}

try {
  await startManagedApi();
  await sql`grant account_executor to postgres`;
  await sql`
    insert into public.platforms (id, code, name, status, allow_activation)
    values (${platformId}, ${`r15-${platformId.slice(0, 8)}`}, 'R15 local probe', 'active', true)
  `;
  await sql`
    insert into public.plans (id, platform_id, code, name, kind, features)
    values (${planId}, ${platformId}, 'free', 'Free', 'free', ${sql.json({})})
  `;
  await sql`update public.platforms set default_plan_id = ${planId} where id = ${platformId}`;
  await sql`
    insert into private.platform_api_keys
      (id, platform_id, name, key_hmac, hmac_key_version, key_prefix, key_suffix, creation_operation_id)
    values
      (${keyId}, ${platformId}, 'R15 local probe', ${keyHmac}, 1, 'phk_v1',
       ${presentedKey.slice(-8)}, ${randomUUID()})
  `;

  const accessToken = await signup();
  await activate(accessToken);
  if (process.env.R15_PROFILE === '1')
    console.log(
      JSON.stringify({
        profile: {
          auth: await profileAuth(accessToken),
          account_api: await profileApi(accessToken),
        },
      }),
    );
  const warmup = await request(accessToken, true);
  assert.equal(
    warmup.status,
    200,
    `authorization endpoint warmup must succeed: ${warmup.body}`,
  );

  const latencies = [];
  const statusCounts = new Map();
  const startedAt = performance.now();
  for (let second = 0; second < durationSeconds; second += 1) {
    const batchStarted = performance.now();
    const batch = await Promise.all(
      Array.from({ length: requestsPerSecond }, () => request(accessToken)),
    );
    for (const result of batch) {
      latencies.push(result.latency);
      statusCounts.set(
        String(result.status),
        (statusCounts.get(String(result.status)) ?? 0) + 1,
      );
    }
    if ((second + 1) % 60 === 0 || second + 1 === durationSeconds) {
      console.log(
        JSON.stringify({
          elapsed_seconds: second + 1,
          requests: latencies.length,
          p95_ms: percentile(latencies, 0.95),
          status_counts: Object.fromEntries(statusCounts),
        }),
      );
    }
    const remaining = 1000 - (performance.now() - batchStarted);
    if (remaining > 0 && second + 1 < durationSeconds) await sleep(remaining);
  }

  const elapsedSeconds = (performance.now() - startedAt) / 1000;
  const successful = statusCounts.get('200') ?? 0;
  const total = latencies.length;
  const errorRate = total === 0 ? 1 : (total - successful) / total;
  const observedRate = total / elapsedSeconds;
  const p95 = percentile(latencies, 0.95);
  const result = {
    endpoint: 'account/principal',
    configuration: {
      db_pool_max: process.env.ACCOUNT_API_DB_POOL_MAX ?? '8',
      db_role_mode: process.env.ACCOUNT_API_DB_ROLE_MODE ?? 'transaction',
    },
    target_requests_per_second: requestsPerSecond,
    observed_requests_per_second: Number(observedRate.toFixed(2)),
    duration_seconds: Number(elapsedSeconds.toFixed(2)),
    total_requests: total,
    status_counts: Object.fromEntries(statusCounts),
    error_rate: Number(errorRate.toFixed(6)),
    p95_ms: p95,
    p99_ms: percentile(latencies, 0.99),
    target: { p95_ms_max: 500, error_rate_max: 0.01 },
    pass:
      observedRate >= requestsPerSecond * 0.99 &&
      p95 !== null &&
      p95 <= 500 &&
      errorRate < 0.01,
  };
  console.log(JSON.stringify(result, null, 2));
  assert.equal(
    result.pass,
    true,
    'R15 local authorization pressure target failed',
  );
} finally {
  await stopManagedApi();
  await cleanup();
}
