import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { createHmac, randomBytes } from 'node:crypto';
import postgres from 'postgres';

const execFileAsync = promisify(execFile);
const repositoryRoot = process.cwd();
const localStatus = await (async () => {
  if (process.env.SUPABASE_LOCAL_URL)
    return {
      API_URL: process.env.SUPABASE_LOCAL_URL,
      ANON_KEY: process.env.SUPABASE_LOCAL_ANON_KEY,
      DB_URL: process.env.SUPABASE_DB_URL,
      PUBLISHABLE_KEY: process.env.SUPABASE_LOCAL_PUBLISHABLE_KEY,
    };
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
const databaseUrl = localStatus.DB_URL;
const apiUrl = (
  process.env.T12_ACCOUNT_API_URL ?? 'http://127.0.0.1:8787'
).replace(/\/$/u);
const platformSecret = process.env.T12_PLATFORM_KEY_HMAC_SECRET;
const mailpitContainer =
  process.env.SUPABASE_MAILPIT_CONTAINER ??
  'supabase_inbucket_aisenhub-platform-auth-local';

if (!authUrl || !anonKey || !databaseUrl || !platformSecret)
  throw new Error(
    'T12 ordinary proof probe requires Auth, database and fixture secret variables',
  );

const sql = postgres(databaseUrl, {
  max: 4,
  prepare: false,
  onnotice: () => undefined,
});
const userEmail = `t12-ordinary-${crypto.randomUUID()}@example.test`;
const password = `T12-ordinary-${randomBytes(16).toString('hex')}!`;
const platformId = crypto.randomUUID();
const planId = crypto.randomUUID();
const keyId = crypto.randomUUID();
const presentedKey = `phk_v1_${keyId}_t12-ordinary`;
const keyHmac = createHmac('sha256', platformSecret)
  .update(`1:platform-key:${keyId}:${presentedKey}`)
  .digest('hex');
let userId;
let currentAccessToken;
let eventAccessToken;
let localApiProcess;

async function startLocalApi() {
  if (process.env.T12_START_LOCAL_API === '0') return;
  localApiProcess = spawn(
    'D:\\APP\\Codex\\Deno\\bin\\deno.exe',
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
        SUPABASE_URL: localStatus.API_URL,
        SUPABASE_PUBLISHABLE_KEY: localStatus.PUBLISHABLE_KEY,
        ACCOUNT_API_DB_URL: localStatus.DB_URL,
        PLATFORM_KEY_HMAC_SECRET: platformSecret,
        ACCOUNT_API_PORT: '8787',
      },
      stdio: 'ignore',
    },
  );
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(
        `${apiUrl}/functions/v1/account-api/v1/plans`,
        {
          headers: { 'X-Platform-Key': 'bad' },
        },
      );
      if (response.status) return;
    } catch {
      // The Deno process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Local Account API did not become ready');
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

function assertStatus(response, expected, label) {
  assert.equal(
    response.status,
    expected,
    `${label}: expected ${expected}, got ${response.status}`,
  );
}

async function readMailpitToken() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { stdout } = await execFileAsync('docker', [
      'exec',
      mailpitContainer,
      'wget',
      '-qO-',
      'http://127.0.0.1:8025/api/v1/messages',
    ]);
    const messages = JSON.parse(stdout).messages ?? [];
    const message = messages.find((item) =>
      item.To?.some((recipient) => recipient.Address === userEmail),
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
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Local Mailpit did not produce an email token_hash');
}

async function cleanup() {
  if (userId) {
    await sql`delete from private.user_recent_auth_proofs where user_id = ${userId}`.catch(
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
  await sql`delete from public.platform_auth_origins where platform_id = ${platformId}`.catch(
    () => undefined,
  );
  await sql`delete from public.plans where platform_id = ${platformId}`.catch(
    () => undefined,
  );
  await sql`delete from private.platform_api_keys where platform_id = ${platformId}`.catch(
    () => undefined,
  );
  await sql`delete from public.platforms where id = ${platformId}`.catch(
    () => undefined,
  );
  await sql.end({ timeout: 5 }).catch(() => undefined);
}

try {
  await startLocalApi();
  const signup = await authRequest('/auth/v1/signup', {
    method: 'POST',
    body: JSON.stringify({ email: userEmail, password }),
  });
  assertStatus(signup.response, 200, 'ordinary Local signup');
  userId = signup.body?.user?.id;
  currentAccessToken = signup.body?.access_token;
  assert.ok(
    userId && currentAccessToken,
    'signup must return the current session',
  );

  const [currentSession] = await sql`
    select id from auth.sessions where user_id = ${userId} order by created_at desc limit 1
  `;
  assert.ok(currentSession?.id, 'current Auth session must be persisted');

  await sql`grant account_executor to postgres`;
  await sql`
    insert into public.platforms (id, code, name, status, allow_activation)
    values (${platformId}, ${`t12-ordinary-${platformId.slice(0, 8)}`}, 'T12 ordinary proof', 'active', true)
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
      (${keyId}, ${platformId}, 'T12 ordinary proof', ${keyHmac}, 1, 'phk_v1', 'inary', ${crypto.randomUUID()})
  `;

  const otp = await authRequest('/auth/v1/otp', {
    method: 'POST',
    body: JSON.stringify({ email: userEmail, create_user: false }),
  });
  assertStatus(otp.response, 200, 'ordinary email-auth event request');
  const tokenHash = await readMailpitToken();
  const verified = await authRequest('/auth/v1/verify', {
    method: 'POST',
    body: JSON.stringify({ token_hash: tokenHash, type: 'email' }),
  });
  assertStatus(
    verified.response,
    200,
    'ordinary email-auth event verification',
  );
  eventAccessToken = verified.body?.access_token;
  assert.ok(
    eventAccessToken,
    'email event verification must return a temporary session',
  );
  assert.notEqual(eventAccessToken, currentAccessToken);

  const proofResponse = await fetch(
    `${apiUrl}/functions/v1/account-api/v1/auth/recent-proof`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${currentAccessToken}`,
        'X-Reauth-Access-Token': eventAccessToken,
        'X-Platform-Key': presentedKey,
      },
    },
  );
  const proofBody = await proofResponse.json();
  assertStatus(proofResponse, 201, 'ordinary central proof issue');
  const proofId = proofBody.data?.proof_id;
  assert.match(proofId, /^[0-9a-f-]{36}$/iu);
  const [proof] = await sql`
    select user_id, session_id, factor_id, expires_at > now() as live
    from private.user_recent_auth_proofs where id = ${proofId}
  `;
  assert.deepEqual(proof, {
    user_id: userId,
    session_id: currentSession.id,
    factor_id: 'email_otp',
    live: true,
  });

  const revoke = await authRequest('/auth/v1/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${eventAccessToken}` },
  });
  assertStatus(revoke.response, 204, 'temporary event session revoke');
  const oldEvent = await authRequest('/auth/v1/user', {
    headers: { Authorization: `Bearer ${eventAccessToken}` },
  });
  assert.ok(
    oldEvent.response.status === 401 || oldEvent.response.status === 403,
  );

  console.log(
    JSON.stringify({
      emailAuthEvent: 'PASS',
      independentSession: 'PASS',
      centralProof: 'PASS',
      originalSessionBinding: 'PASS',
      temporarySessionRevoked: 'PASS',
    }),
  );
} finally {
  await cleanup();
  if (localApiProcess && !localApiProcess.killed) localApiProcess.kill();
}
