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
    .filter((match) => match)
    .map((match) => [match[1], match[2]]),
);
if (!status.API_URL || !status.ANON_KEY || !status.DB_URL)
  throw new Error('M4-05 probe requires Local Auth and database');

const sql = postgres(status.DB_URL, {
  max: 4,
  prepare: false,
  onnotice: () => undefined,
});
const platformId = crypto.randomUUID();
const accountId = crypto.randomUUID();
const keyId = crypto.randomUUID();
const userEmail = `m4-05-${crypto.randomUUID()}@example.test`;
const password = `M4-05-${crypto.randomUUID()}!`;
const keyHmac = 'c'.repeat(64);
const jobId = crypto.randomUUID();
const leaseOwner = `m4-05-worker-${crypto.randomUUID()}`;
let userId;
let sessionId;
const fileIds = [];
const barrierId = crypto.randomUUID();

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

async function accountCall(name, args) {
  return (
    await sql.unsafe(
      `select * from private.${name}(row($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid)::private.account_context, ${args.map((_, index) => `$${index + 6}`).join(',')})`,
      [...context(), ...args],
    )
  )[0];
}

async function jobCall(name, fileId, fence = 1, args = []) {
  if (name === 'file_cleanup_finish') {
    const finishArgs = [args[0] ?? null, args[1] ?? null];
    return (
      await sql.unsafe(
        `select * from private.${name}(row($1::uuid,$2::text,$3::bigint,$4::uuid)::private.job_context, $5::uuid, $6::bigint, $7::text, $8::text)`,
        [
          jobId,
          leaseOwner,
          fence,
          crypto.randomUUID(),
          fileId,
          fence,
          ...finishArgs,
        ],
      )
    )[0];
  }
  return (
    await sql.unsafe(
      `select * from private.${name}(row($1::uuid,$2::text,$3::bigint,$4::uuid)::private.job_context, $5::uuid)`,
      [jobId, leaseOwner, fence, crypto.randomUUID(), fileId],
    )
  )[0];
}

async function expectRejected(action, message) {
  await assert.rejects(action, (error) => {
    assert.match(String(error?.message), new RegExp(message, 'u'));
    return true;
  });
}

async function createFile({
  status: fileStatus,
  writeOutcome,
  reservedBytes,
  actualSize = reservedBytes,
  sha = 'd'.repeat(64),
  updatedAt = null,
}) {
  const fileId = crypto.randomUUID();
  fileIds.push(fileId);
  await sql`insert into public.platform_config_files
    (id, platform_id, platform_account_id, original_name, storage_path,
     mime_type, purpose, requested_size_bytes, actual_size_bytes, sha256,
     reserved_bytes, reserved_count, status, write_outcome, intent_expires_at,
     uploaded_at, updated_at)
    values (${fileId}, ${platformId}, ${accountId}, ${`${fileId}.ini`},
      ${`${platformId}/${accountId}/${fileId}`}, 'text/plain', 'config',
      ${Math.max(1, reservedBytes)}, ${actualSize}, ${sha}, ${reservedBytes},
      ${reservedBytes ? 1 : 0}, ${fileStatus}, ${writeOutcome}, now(), now(), coalesce(${updatedAt}, now()))`;
  return fileId;
}

try {
  const signup = await authRequest('/auth/v1/signup', {
    method: 'POST',
    body: JSON.stringify({ email: userEmail, password }),
  });
  assert.equal(signup.response.status, 200);
  userId = signup.body?.user?.id;
  assert.ok(userId && signup.body?.access_token);
  const [session] =
    await sql`select id from auth.sessions where user_id = ${userId} order by created_at desc limit 1`;
  sessionId = session.id;
  await sql`grant account_executor to postgres`;
  await sql`grant job_executor to postgres`;
  await sql`insert into public.platforms (id, code, name, status, allow_activation) values (${platformId}, ${`m4-05-${platformId.slice(0, 8)}`}, 'M4-05 fixture', 'active', true)`;
  await sql`insert into private.platform_api_keys (id, platform_id, name, key_hmac, hmac_key_version, key_prefix, key_suffix, creation_operation_id) values (${keyId}, ${platformId}, 'fixture', ${keyHmac}, 1, 'phk_v1', 'm4-05', ${crypto.randomUUID()})`;
  await sql`insert into public.platform_accounts (id, platform_id, user_id, status) values (${accountId}, ${platformId}, ${userId}, 'active')`;

  const pendingFile = await createFile({
    status: 'pending',
    writeOutcome: 'not_started',
    reservedBytes: 5,
    actualSize: null,
  });
  await sql`set role account_executor`;
  const deleted = await accountCall('file_delete_request', [
    pendingFile,
    'delete-1',
  ]);
  assert.equal(deleted.status, 'deleted');
  assert.equal(Number(deleted.reserved_bytes), 0);
  const replay = await accountCall('file_delete_request', [
    pendingFile,
    'delete-1',
  ]);
  assert.equal(replay.status, 'deleted');
  await sql`set role postgres`;
  const [deletedRow] =
    await sql`select status, reserved_bytes from public.platform_config_files where id = ${pendingFile}`;
  assert.deepEqual(
    { status: deletedRow.status, reserved: Number(deletedRow.reserved_bytes) },
    { status: 'deleted', reserved: 0 },
  );

  await sql`set role postgres`;
  const activeFile = await createFile({
    status: 'active',
    writeOutcome: 'confirmed',
    reservedBytes: 3,
  });
  await sql`set role job_executor`;
  const claim = await jobCall('file_cleanup_claim', activeFile);
  assert.equal(claim.action, 'remove');
  const finished = await jobCall(
    'file_cleanup_finish',
    activeFile,
    Number(claim.fencing_token),
    ['removed'],
  );
  assert.equal(finished.status, 'deleted');
  assert.equal(Number(finished.reserved_bytes), 0);

  await sql`set role postgres`;
  const unknownFile = await createFile({
    status: 'storing',
    writeOutcome: 'unknown',
    reservedBytes: 7,
    updatedAt: new Date(Date.now() - 6 * 60 * 1000),
  });
  await sql`insert into private.file_write_attempts (platform_id, platform_account_id, file_id, fencing_token, state, actual_size_bytes, sha256) values (${platformId}, ${accountId}, ${unknownFile}, 1, 'unknown', 7, ${'e'.repeat(64)})`;
  await sql`set role job_executor`;
  const unknownClaim = await jobCall('file_cleanup_claim', unknownFile);
  assert.equal(unknownClaim.action, 'settlement_required');
  const failed = await jobCall('file_cleanup_finish', unknownFile, 1, [
    'failed',
    'provider_timeout',
  ]);
  assert.equal(failed.status, 'storing');
  assert.equal(Number(failed.reserved_bytes), 7);
  assert.equal(Number(failed.retry_count), 1);

  await sql`set role postgres`;
  const staleFile = await createFile({
    status: 'active',
    writeOutcome: 'confirmed',
    reservedBytes: 2,
  });
  await sql`set role job_executor`;
  const staleClaim = await jobCall('file_cleanup_claim', staleFile);
  await expectRejected(
    jobCall(
      'file_cleanup_finish',
      staleFile,
      Number(staleClaim.fencing_token) + 1,
      ['removed'],
    ),
    'stale_job_fence',
  );
  await sql`select private.job_lease_release('file_cleanup', ${staleFile}, ${leaseOwner}, ${staleClaim.fencing_token})`;

  await sql`set role postgres`;
  const barrierFile = await createFile({
    status: 'active',
    writeOutcome: 'confirmed',
    reservedBytes: 2,
  });
  await sql`insert into private.file_backup_barriers (id, scope, recovery_set_id, state, deadline_at) values (${barrierId}, 'file', ${barrierFile}, 'active', now() + interval '1 hour')`;
  await sql`set role job_executor`;
  const barrierClaim = await jobCall('file_cleanup_claim', barrierFile);
  assert.equal(barrierClaim.action, 'backup_barrier');

  await sql`set role postgres`;
  await sql`alter table public.platform_config_files disable trigger platform_config_files_set_updated_at`;
  await sql`update public.platform_config_files set updated_at = now() - interval '6 minutes' where id = ${unknownFile}`;
  await sql`alter table public.platform_config_files enable trigger platform_config_files_set_updated_at`;
  const [staleCheck] =
    await sql`select updated_at, write_outcome from public.platform_config_files where id = ${unknownFile}`;
  assert.equal(staleCheck.write_outcome, 'unknown');
  assert.ok(
    new Date(staleCheck.updated_at).getTime() < Date.now() - 5 * 60 * 1000,
  );
  await sql`set role job_executor`;
  const [alert] = await sql.unsafe(
    `select * from private.file_reconcile_step(row($1::uuid,$2::text,$3::bigint,$4::uuid)::private.job_context, null::uuid, 20)`,
    [jobId, leaseOwner, 1, crypto.randomUUID()],
  );
  assert.equal(alert.issue_code, 'unknown_write');
  console.log(
    JSON.stringify({
      deletionRequestRelease: 'PASS',
      cleanupClaimAndFinish: 'PASS',
      unknownHeldAndRetry: 'PASS',
      staleFenceAndBarrier: 'PASS',
      reconcileAlerts: 'PASS',
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
  await sql`delete from private.job_leases where job_kind = 'file_cleanup' and resource_id = any(${fileIds}::uuid[])`.catch(
    () => undefined,
  );
  await sql`delete from private.file_backup_barriers where id = ${barrierId}`.catch(
    () => undefined,
  );
  await sql`delete from private.idempotency_keys where platform_id = ${platformId}`.catch(
    () => undefined,
  );
  await sql`delete from public.platform_config_files where platform_id = ${platformId}`.catch(
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
