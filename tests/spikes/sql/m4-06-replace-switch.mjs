import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import postgres from 'postgres';

const execFileAsync = promisify(execFile);
const root = process.cwd();
const cli = join(root, 'node_modules', 'supabase', 'dist', 'supabase.js');
const { stdout } = await execFileAsync(
  process.execPath,
  [cli, 'status', '-o', 'env'],
  { cwd: root },
);
const status = Object.fromEntries(
  stdout
    .split('\n')
    .map((line) => /^([A-Z0-9_]+)="(.*)"$/u.exec(line))
    .filter(Boolean)
    .map((match) => [match[1], match[2]]),
);
if (!status.DB_URL || !status.API_URL || !status.ANON_KEY)
  throw new Error('M4-06 probe requires Local Auth and database');

const sql = postgres(status.DB_URL, {
  max: 4,
  prepare: false,
  onnotice: () => undefined,
});
const platformId = crypto.randomUUID();
const accountId = crypto.randomUUID();
const keyId = crypto.randomUUID();
const userEmail = `m4-06-${crypto.randomUUID()}@example.test`;
const password = `M4-06-${crypto.randomUUID()}!`;
const fileIds = [];
let userId;
let sessionId;

function context() {
  return [userId, sessionId, platformId, keyId, crypto.randomUUID()];
}

async function authRequest(path, options = {}) {
  const response = await fetch(`${status.API_URL}${path}`, {
    ...options,
    headers: {
      apikey: status.ANON_KEY,
      'content-type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  return { response, body: await response.json().catch(() => null) };
}

async function intent(replacesFileId, idempotencyKey, size = 4) {
  const [row] = await sql.unsafe(
    'select * from private.file_intent_create(row($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid)::private.account_context, $6::text, $7::bigint, $8::text, $9::text, $10::uuid, $11::text)',
    [
      ...context(),
      'replacement.ini',
      size,
      'text/plain',
      'config',
      replacesFileId,
      idempotencyKey,
    ],
  );
  fileIds.push(row.file_id);
  return row;
}

async function finalize(fileId, attemptId, size, hash) {
  const [row] = await sql.unsafe(
    'select * from private.file_write_attempt_finalize(row($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid)::private.account_context, $6::uuid, $7::uuid, $8::bigint, $9::text, $10::text)',
    [...context(), fileId, attemptId, size, hash, 'provider-m4-06'],
  );
  return row;
}

async function stage(fileId, size, hash) {
  const attemptId = crypto.randomUUID();
  await sql`update public.platform_config_files set status = 'storing', write_outcome = 'in_flight', actual_size_bytes = ${size}, sha256 = ${hash} where id = ${fileId}`;
  await sql`insert into private.file_write_attempts
    (id, platform_id, platform_account_id, file_id, fencing_token, state, actual_size_bytes, sha256)
    values (${attemptId}, ${platformId}, ${accountId}, ${fileId}, 1, 'in_flight', ${size}, ${hash})`;
  return attemptId;
}

async function createActiveFile(size, id) {
  const fileId = crypto.randomUUID();
  fileIds.push(fileId);
  await sql`insert into public.platform_config_files
    (id, platform_id, platform_account_id, original_name, storage_path,
     mime_type, purpose, requested_size_bytes, actual_size_bytes, sha256,
     reserved_bytes, reserved_count, status, write_outcome, intent_expires_at,
     uploaded_at)
    values (${fileId}, ${platformId}, ${accountId}, ${`${id}.ini`},
      ${`${platformId}/${accountId}/${fileId}`}, 'text/plain', 'config',
      ${size}, ${size}, ${'a'.repeat(64)}, ${size}, 1, 'active',
      'confirmed', now(), now())`;
  return fileId;
}

async function expectQuotaFailure(action) {
  await assert.rejects(action, (error) => {
    assert.match(String(error?.message), /quota_exceeded/u);
    return true;
  });
}

try {
  let signup;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    signup = await authRequest('/auth/v1/signup', {
      method: 'POST',
      body: JSON.stringify({ email: userEmail, password }),
    });
    if (signup.response.status === 200) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.equal(signup.response.status, 200, JSON.stringify(signup.body));
  userId = signup.body?.user?.id;
  assert.ok(userId && signup.body?.access_token);
  const [session] =
    await sql`select id from auth.sessions where user_id = ${userId} order by created_at desc limit 1`;
  sessionId = session.id;
  await sql`grant account_executor to postgres`;
  await sql`insert into public.platforms (id, code, name, status, allow_activation) values (${platformId}, ${`m4-06-${platformId.slice(0, 8)}`}, 'M4-06 fixture', 'active', true)`;
  const keyHmac =
    crypto.randomUUID().replaceAll('-', '') +
    crypto.randomUUID().replaceAll('-', '');
  await sql`insert into private.platform_api_keys (id, platform_id, name, key_hmac, hmac_key_version, key_prefix, key_suffix, creation_operation_id) values (${keyId}, ${platformId}, 'fixture', ${keyHmac}, 1, 'phk_v1', 'm4-06', ${crypto.randomUUID()})`;
  await sql`insert into public.platform_accounts (id, platform_id, user_id, status) values (${accountId}, ${platformId}, ${userId}, 'active')`;
  const original = await createActiveFile(5, 'original');

  await sql`set role account_executor`;
  const replacement = await intent(original, 'replace-1');
  await sql`set role postgres`;
  const replacementHash = 'b'.repeat(64);
  const replacementAttempt = await stage(
    replacement.file_id,
    4,
    replacementHash,
  );
  await sql`set role account_executor`;
  const switched = await finalize(
    replacement.file_id,
    replacementAttempt,
    4,
    replacementHash,
  );
  assert.equal(switched.replace_outcome, 'switched');
  await sql`set role postgres`;
  const [switchedState] =
    await sql`select status, write_outcome, reserved_bytes from public.platform_config_files where id = ${replacement.file_id}`;
  const [originalState] =
    await sql`select status, write_outcome, reserved_bytes from public.platform_config_files where id = ${original}`;
  assert.deepEqual(
    {
      status: switchedState.status,
      outcome: switchedState.write_outcome,
      reserved: Number(switchedState.reserved_bytes),
    },
    { status: 'active', outcome: 'confirmed', reserved: 4 },
  );
  assert.deepEqual(
    {
      status: originalState.status,
      outcome: originalState.write_outcome,
      reserved: Number(originalState.reserved_bytes),
    },
    { status: 'deleting', outcome: 'confirmed', reserved: 5 },
  );

  const busyOriginal = await createActiveFile(3, 'busy-original');
  await sql`set role account_executor`;
  const busyReplacement = await intent(busyOriginal, 'replace-2', 2);
  await sql`set role postgres`;
  const busyHash = 'c'.repeat(64);
  const busyAttempt = await stage(busyReplacement.file_id, 2, busyHash);
  await sql`update public.platform_config_files set status = 'deleting' where id = ${busyOriginal}`;
  await sql`set role account_executor`;
  const busy = await finalize(
    busyReplacement.file_id,
    busyAttempt,
    2,
    busyHash,
  );
  assert.equal(busy.replace_outcome, 'file_busy');
  await sql`set role postgres`;
  const [busyState] =
    await sql`select status, write_outcome, reserved_bytes from public.platform_config_files where id = ${busyReplacement.file_id}`;
  assert.deepEqual(
    {
      status: busyState.status,
      outcome: busyState.write_outcome,
      reserved: Number(busyState.reserved_bytes),
    },
    { status: 'deleting', outcome: 'confirmed', reserved: 2 },
  );

  await sql`update public.platform_file_policies set max_file_bytes = 1, max_total_bytes = 1 where platform_id = ${platformId}`;
  await sql`set role account_executor`;
  await expectQuotaFailure(intent(original, 'replace-capacity', 1));
  console.log(
    JSON.stringify({
      atomicSwitch: 'PASS',
      busyCompensation: 'PASS',
      capacityGuard: 'PASS',
    }),
  );
} finally {
  await sql`set role postgres`.catch(() => undefined);
  await sql`delete from public.audit_logs where platform_id = ${platformId}`.catch(
    () => undefined,
  );
  await sql`delete from private.file_write_attempts where platform_id = ${platformId}`.catch(
    () => undefined,
  );
  await sql`delete from private.idempotency_keys where platform_id = ${platformId}`.catch(
    () => undefined,
  );
  await sql`delete from public.platform_config_files where platform_id = ${platformId}`.catch(
    () => undefined,
  );
  await sql`delete from public.platform_file_policies where platform_id = ${platformId}`.catch(
    () => undefined,
  );
  await sql`delete from public.platform_accounts where id = ${accountId}`.catch(
    () => undefined,
  );
  await sql`delete from private.platform_api_keys where platform_id = ${platformId}`.catch(
    () => undefined,
  );
  await sql`delete from public.platforms where id = ${platformId}`.catch(
    () => undefined,
  );
  if (userId)
    await fetch(`${status.API_URL}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers: {
        apikey: status.SERVICE_ROLE_KEY,
        Authorization: `Bearer ${status.SERVICE_ROLE_KEY}`,
      },
    }).catch(() => undefined);
  await sql.end({ timeout: 5 }).catch(() => undefined);
}
