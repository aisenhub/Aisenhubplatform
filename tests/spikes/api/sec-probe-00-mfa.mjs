import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import postgres from 'postgres';

const root = process.cwd();
const requireFromAuthPackage = createRequire(
  join(root, 'packages/account-auth-nextjs/package.json'),
);
const { createClient } = requireFromAuthPackage('@supabase/supabase-js');

let statusOutput;
try {
  statusOutput = execFileSync(
    process.execPath,
    [
      join(root, 'node_modules/supabase/dist/supabase.js'),
      'status',
      '-o',
      'env',
    ],
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  );
} catch {
  throw new Error('Local Supabase status is unavailable');
}
const local = Object.fromEntries(
  statusOutput
    .split('\n')
    .map((line) => /^([A-Z0-9_]+)="(.*)"$/u.exec(line))
    .filter(Boolean)
    .map((match) => [match[1], match[2]]),
);
for (const key of ['API_URL', 'DB_URL']) {
  assert.ok(local[key], `${key} is required`);
  assert.ok(
    ['localhost', '127.0.0.1', '[::1]'].includes(new URL(local[key]).hostname),
    `${key} must target Local`,
  );
}
assert.ok(local.ANON_KEY && local.SERVICE_ROLE_KEY);

const options = {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
  },
};
const client = (key = local.ANON_KEY) =>
  createClient(local.API_URL, key, options);
const admin = client(local.SERVICE_ROLE_KEY);
const sql = postgres(local.DB_URL, { max: 1, prepare: false });
const createdUsers = [];

function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const letter of secret.replace(/=+$/u, '').toUpperCase()) {
    const index = alphabet.indexOf(letter);
    assert.ok(index >= 0, 'TOTP secret must be base32');
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8)
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac('sha1', Buffer.from(bytes))
    .update(counter)
    .digest();
  const offset = digest[digest.length - 1] & 15;
  return String(
    (((digest[offset] & 127) << 24) |
      (digest[offset + 1] << 16) |
      (digest[offset + 2] << 8) |
      digest[offset + 3]) %
      1_000_000,
  ).padStart(6, '0');
}

async function checked(result, label) {
  assert.ifError(result.error, label);
  return result.data;
}

async function makeUser() {
  const email = `sec-probe-00-${randomUUID()}@example.test`;
  const password = `Sec-Probe-00-${randomBytes(16).toString('hex')}!`;
  const auth = client();
  const signup = await checked(
    await auth.auth.signUp({ email, password }),
    'local signup',
  );
  assert.ok(signup.user?.id && signup.session?.access_token);
  createdUsers.push(signup.user.id);
  return { auth, email, password };
}

async function verify(auth, factorId, secret) {
  const challenge = await checked(
    await auth.auth.mfa.challenge({ factorId }),
    'MFA challenge',
  );
  await checked(
    await auth.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: totp(secret),
    }),
    'MFA verify',
  );
}

async function enroll(auth, name) {
  const factor = await checked(
    await auth.auth.mfa.enroll({ factorType: 'totp', friendlyName: name }),
    'MFA enroll',
  );
  assert.ok(factor.id && factor.totp?.secret);
  await verify(auth, factor.id, factor.totp.secret);
  return { id: factor.id, secret: factor.totp.secret };
}

async function verifiedCount(auth) {
  const factors = await checked(await auth.auth.mfa.listFactors(), 'MFA list');
  return (factors.totp ?? []).filter((factor) => factor.status === 'verified')
    .length;
}

async function aal(auth) {
  const level = await checked(
    await auth.auth.mfa.getAuthenticatorAssuranceLevel(),
    'MFA assurance level',
  );
  return { current: level.currentLevel, next: level.nextLevel };
}

async function auditCount() {
  const [table] = await sql`
    select to_regclass('auth.audit_log_entries') is not null as present
  `;
  if (!table.present) return null;
  const [count] = await sql`
    select count(*)::integer as value from auth.audit_log_entries
  `;
  return count.value;
}

async function run() {
  const auditBefore = await auditCount();
  const firstUser = await makeUser();
  assert.equal(await verifiedCount(firstUser.auth), 0);
  const first = await enroll(firstUser.auth, 'probe-first');
  assert.equal(await verifiedCount(firstUser.auth), 1);
  const second = await enroll(firstUser.auth, 'probe-second');
  assert.equal(await verifiedCount(firstUser.auth), 2);
  const beforeDelete = await aal(firstUser.auth);
  await checked(
    await firstUser.auth.auth.mfa.unenroll({ factorId: first.id }),
    'delete backup factor',
  );
  assert.equal(await verifiedCount(firstUser.auth), 1);
  const afterBackupDelete = await aal(firstUser.auth);
  if (afterBackupDelete.current !== 'aal2')
    await verify(firstUser.auth, second.id, second.secret);
  const lastDelete = await firstUser.auth.auth.mfa.unenroll({
    factorId: second.id,
  });
  const remainingAfterLast = await verifiedCount(firstUser.auth);
  const beforeRefresh = await aal(firstUser.auth);
  const refresh = await firstUser.auth.auth.refreshSession();
  const afterRefresh = refresh.error ? null : await aal(firstUser.auth);

  const raceUser = await makeUser();
  const raceFirst = await enroll(raceUser.auth, 'race-first');
  const raceSecond = await enroll(raceUser.auth, 'race-second');
  const secondSession = client();
  await checked(
    await secondSession.auth.signInWithPassword({
      email: raceUser.email,
      password: raceUser.password,
    }),
    'second session login',
  );
  await verify(secondSession, raceFirst.id, raceFirst.secret);
  const race = await Promise.all([
    raceUser.auth.auth.mfa.unenroll({ factorId: raceFirst.id }),
    secondSession.auth.mfa.unenroll({ factorId: raceSecond.id }),
  ]);
  const freshSession = client();
  await checked(
    await freshSession.auth.signInWithPassword({
      email: raceUser.email,
      password: raceUser.password,
    }),
    'fresh session login',
  );
  const remainingAfterRace = await verifiedCount(freshSession);
  const auditAfter = await auditCount();

  return {
    firstFactor: 'verified',
    secondFactor: 'verified',
    aalBeforeDelete: beforeDelete,
    aalAfterBackupDelete: afterBackupDelete,
    nativeLastDelete: {
      ok: !lastDelete.error,
      code: lastDelete.error?.code ?? null,
      remaining: remainingAfterLast,
    },
    aalBeforeRefresh: beforeRefresh,
    refresh: { ok: !refresh.error, code: refresh.error?.code ?? null },
    aalAfterRefresh: afterRefresh,
    concurrentNativeDelete: {
      results: race.map((result) => ({
        ok: !result.error,
        code: result.error?.code ?? null,
      })),
      remaining: remainingAfterRace,
    },
    authAuditDatabase: {
      tablePresent: auditBefore !== null,
      rowsAddedDuringProbe:
        auditBefore === null || auditAfter === null
          ? null
          : auditAfter - auditBefore,
    },
  };
}

try {
  const outcome = await run();
  process.stdout.write(`${JSON.stringify(outcome)}\n`);
} finally {
  for (const userId of createdUsers) {
    const deletion = await admin.auth.admin.deleteUser(userId);
    assert.ifError(deletion.error, 'local synthetic user cleanup');
  }
  await sql.end({ timeout: 5 });
}
