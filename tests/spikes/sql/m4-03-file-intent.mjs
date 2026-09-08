import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import postgres from 'postgres';

const execFileAsync = promisify(execFile);
const root = process.cwd();
const { stdout } = await execFileAsync(
  process.execPath,
  [
    join(root, 'node_modules', 'supabase', 'dist', 'supabase.js'),
    'status',
    '-o',
    'env',
  ],
  { cwd: root },
);
const status = Object.fromEntries(
  stdout
    .split('\n')
    .map((line) => /^([A-Z0-9_]+)="(.*)"$/u.exec(line))
    .filter((match) => match)
    .map((match) => [match[1], match[2]]),
);
if (!status.API_URL || !status.ANON_KEY || !status.DB_URL)
  throw new Error('M4-03 probe requires Local Supabase Auth and database');

const sql = postgres(status.DB_URL, {
  max: 1,
  prepare: false,
  onnotice: () => undefined,
});
const platformId = crypto.randomUUID();
const accountId = crypto.randomUUID();
const keyId = crypto.randomUUID();
const userEmail = `m4-03-${crypto.randomUUID()}@example.test`;
const password = `M4-03-${crypto.randomUUID()}!`;
const keyHmac = 'a'.repeat(64);
let userId;

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

async function callAccount(functionName, args) {
  const result = await sql.unsafe(
    `select * from private.${functionName}(
      row($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)::private.account_context,
      ${args.map((_, index) => `$${index + 6}`).join(', ')}
    )`,
    [...context(), ...args],
  );
  return result[0];
}

async function expectRejected(action, message) {
  await assert.rejects(action, (error) => {
    assert.match(String(error?.message), new RegExp(message, 'u'));
    return true;
  });
}

let sessionId;
try {
  const signup = await authRequest('/auth/v1/signup', {
    method: 'POST',
    body: JSON.stringify({ email: userEmail, password }),
  });
  assert.equal(signup.response.status, 200, 'Local fixture signup');
  userId = signup.body?.user?.id;
  assert.ok(
    userId && signup.body?.access_token,
    'signup must return a session',
  );
  const [session] = await sql`
    select id from auth.sessions where user_id = ${userId} order by created_at desc limit 1
  `;
  sessionId = session?.id;
  assert.ok(sessionId, 'Auth session must be persisted');

  await sql`grant account_executor to postgres`;
  await sql`
    insert into public.platforms (id, code, name, status, allow_activation)
    values (${platformId}, ${`m4-03-${platformId.slice(0, 8)}`}, 'M4-03 fixture', 'active', true)
  `;
  await sql`
    insert into private.platform_api_keys
      (id, platform_id, name, key_hmac, hmac_key_version, key_prefix, key_suffix, creation_operation_id)
    values (${keyId}, ${platformId}, 'fixture', ${keyHmac}, 1, 'phk_v1', 'm4-03', ${crypto.randomUUID()})
  `;
  await sql`
    insert into public.platform_accounts (id, platform_id, user_id, status)
    values (${accountId}, ${platformId}, ${userId}, 'active')
  `;
  await sql`
    insert into public.platform_file_policies
      (platform_id, enabled, max_file_bytes, max_files, max_total_bytes)
    values (${platformId}, true, 10, 1, 10)
  `;

  await sql`set role account_executor`;
  const intent = await callAccount('file_intent_create', [
    'config.ini',
    5,
    'text/plain',
    'config',
    null,
    'intent-1',
  ]);
  assert.equal(intent.status, 'pending');
  assert.equal(intent.write_outcome, 'not_started');
  assert.equal(Number(intent.reserved_bytes), 5);
  assert.equal(Number(intent.reserved_count), 1);
  assert.match(
    intent.storage_path,
    new RegExp(`^${platformId}/${accountId}/${intent.file_id}$`, 'u'),
  );

  const replay = await callAccount('file_intent_create', [
    'config.ini',
    5,
    'text/plain',
    'config',
    null,
    'intent-1',
  ]);
  assert.equal(
    replay.file_id,
    intent.file_id,
    'same idempotency request replays file',
  );
  await expectRejected(
    callAccount('file_intent_create', [
      'config.ini',
      6,
      'text/plain',
      'config',
      null,
      'intent-1',
    ]),
    'idempotency_conflict',
  );

  const claim = await callAccount('file_receive_claim', [
    intent.file_id,
    'browser-receiver-1',
    15,
  ]);
  assert.equal(claim.status, 'receiving');
  assert.equal(Number(claim.fencing_token), 1);
  await expectRejected(
    callAccount('file_receive_claim', [
      intent.file_id,
      'browser-receiver-2',
      15,
    ]),
    'operation_in_progress',
  );

  const prepared = await callAccount('file_prepare_store', [
    intent.file_id,
    4,
    'b'.repeat(64),
    'prepare-1',
  ]);
  assert.equal(prepared.status, 'storing');
  assert.equal(prepared.write_outcome, 'in_flight');
  assert.equal(Number(prepared.reserved_bytes), 4);
  assert.ok(prepared.write_attempt_id);
  const preparedReplay = await callAccount('file_prepare_store', [
    intent.file_id,
    4,
    'b'.repeat(64),
    'prepare-1',
  ]);
  assert.equal(preparedReplay.write_attempt_id, prepared.write_attempt_id);
  await expectRejected(
    callAccount('file_intent_create', [
      'second.ini',
      1,
      'text/plain',
      'config',
      null,
      'intent-2',
    ]),
    'quota_exceeded',
  );
  await sql`set role postgres`;
  const [auditCount] = await sql`
    select count(*)::integer as count from public.audit_logs
    where platform_id = ${platformId} and event_type in ('file.intent_created', 'file.receive_claimed', 'file.store_prepared')
  `;
  assert.equal(
    Number(auditCount.count),
    3,
    'file mutations append audit events',
  );
  console.log(
    JSON.stringify({
      intentReservation: 'PASS',
      idempotencyReplayAndConflict: 'PASS',
      receiveClaimAndFence: 'PASS',
      prepareStoreAndAttempt: 'PASS',
      quotaAndAudit: 'PASS',
    }),
  );
} finally {
  await sql`set role postgres`.catch(() => undefined);
  await sql`delete from public.audit_logs where platform_id = ${platformId}`.catch(
    () => undefined,
  );
  await sql`delete from private.idempotency_keys where platform_id = ${platformId}`.catch(
    () => undefined,
  );
  await sql`delete from private.file_write_attempts where platform_id = ${platformId}`.catch(
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
  if (userId) {
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
  await sql.end({ timeout: 5 }).catch(() => undefined);
}
