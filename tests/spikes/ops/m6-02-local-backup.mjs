import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import postgres from 'postgres';

const execFileAsync = promisify(execFile);
const repositoryRoot = process.cwd();
const supabaseCli = join(
  repositoryRoot,
  'node_modules',
  'supabase',
  'dist',
  'supabase.js',
);
const { stdout } = await execFileAsync(
  process.execPath,
  [supabaseCli, 'status', '-o', 'env'],
  { cwd: repositoryRoot },
);
const localStatus = Object.fromEntries(
  stdout
    .split('\n')
    .map((line) => /^([A-Z0-9_]+)="(.*)"$/u.exec(line))
    .filter((match) => match)
    .map((match) => [match[1], match[2]]),
);

const apiUrl = localStatus.API_URL?.replace(/\/$/u, '');
const databaseUrl = localStatus.DB_URL;
const serviceKey = localStatus.SERVICE_ROLE_KEY;
if (!apiUrl || !databaseUrl || !serviceKey)
  throw new Error('M6-02 local simulation requires Local Supabase status');

const sql = postgres(databaseUrl, {
  max: 4,
  prepare: false,
  onnotice: () => undefined,
});
const artifactDirectory = await mkdtemp(
  join('E:\\AppData', 'm6-02-local-backup-'),
);
const platformId = crypto.randomUUID();
const accountId = crypto.randomUUID();
const fileId = crypto.randomUUID();
const tombstoneOperationId = crypto.randomUUID();
const jobId = crypto.randomUUID();
const failedJobId = crypto.randomUUID();
const leaseOwner = `m6-02-${crypto.randomUUID()}`;
const failedLeaseOwner = `m6-02-failed-${crypto.randomUUID()}`;
const objectPath = `${platformId}/${accountId}/${fileId}`;
const content = Buffer.from('m6-02 local immutable object');
const contentHash = createHash('sha256').update(content).digest('hex');
const recoverySetId = `m6-02-${crypto.randomUUID()}`;
const failedRecoverySetId = `m6-02-failed-${crypto.randomUUID()}`;
const storageUrl = `${apiUrl}/storage/v1/object/platform-config-files/${objectPath}`;
const storageHeaders = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
};

async function callFunction(name, values, casts) {
  const placeholders = values.map(
    (_, index) => `$${index + 1}::${casts[index]}`,
  );
  const [row] = await sql.unsafe(
    `select * from private.${name}(${placeholders.join(', ')})`,
    values,
  );
  return row;
}

async function jobLease(jobIdValue, owner) {
  return callFunction(
    'job_lease_claim',
    ['backup_manifest', jobIdValue, owner, 120],
    ['text', 'uuid', 'text', 'integer'],
  );
}

async function barrierContext(jobIdValue, owner, fence) {
  return [jobIdValue, owner, fence, crypto.randomUUID()];
}

async function barrierCall(name, context, values, casts) {
  const ctx = 'row($1::uuid,$2::text,$3::bigint,$4::uuid)::private.job_context';
  const args = values.map((_, index) => `$${index + 5}::${casts[index]}`);
  const [row] = await sql.unsafe(
    `select * from private.${name}(${ctx}, ${args.join(', ')})`,
    [...context, ...values],
  );
  return row;
}

async function putObject() {
  const response = await fetch(storageUrl, {
    method: 'POST',
    headers: {
      ...storageHeaders,
      'Content-Type': 'text/plain',
      'X-Upsert': 'false',
    },
    body: content,
  });
  assert.ok(
    response.ok,
    `local Storage object write failed: ${response.status}`,
  );
}

async function removeObject() {
  await fetch(storageUrl, {
    method: 'DELETE',
    headers: storageHeaders,
  }).catch(() => undefined);
}

async function cleanup() {
  await removeObject();
  await sql`delete from private.file_deletion_tombstones where operation_id = ${tombstoneOperationId}`.catch(
    () => undefined,
  );
  await sql`delete from private.file_backup_barriers where recovery_set_id in (${recoverySetId}, ${failedRecoverySetId})`.catch(
    () => undefined,
  );
  await sql`delete from private.job_leases where resource_id in (${jobId}, ${failedJobId})`.catch(
    () => undefined,
  );
  await sql`delete from private.job_leases where job_kind = 'file_cleanup' and resource_id = ${fileId}`.catch(
    () => undefined,
  );
  await sql`delete from public.platform_config_files where id = ${fileId}`.catch(
    () => undefined,
  );
  await sql`delete from public.platform_file_policies where platform_id = ${platformId}`.catch(
    () => undefined,
  );
  await sql`delete from public.platform_accounts where id = ${accountId}`.catch(
    () => undefined,
  );
  await sql`delete from public.platforms where id = ${platformId}`.catch(
    () => undefined,
  );
  await sql.end({ timeout: 5 }).catch(() => undefined);
  await rm(artifactDirectory, { recursive: true, force: true });
}

try {
  await sql`
    insert into public.platforms (id, code, name, status, allow_activation)
    values (${platformId}, ${`m6-02-${platformId.slice(0, 8)}`}, 'M6-02 local backup', 'active', true)
  `;
  await sql`
    insert into public.platform_accounts
      (id, platform_id, user_id, status, anonymized_at)
    values (${accountId}, ${platformId}, null, 'closed', now())
  `;
  await sql`
    insert into public.platform_file_policies
      (platform_id, max_file_bytes, max_files, max_total_bytes)
    values (${platformId}, 1024, 10, 10240)
  `;
  await putObject();
  await sql`
    insert into public.platform_config_files
      (id, platform_id, platform_account_id, original_name, storage_path,
       mime_type, purpose, requested_size_bytes, actual_size_bytes, sha256,
       reserved_bytes, reserved_count, status, write_outcome,
       intent_expires_at, uploaded_at)
    values
      (${fileId}, ${platformId}, ${accountId}, 'm6-02.txt', ${objectPath},
       'text/plain', 'config', ${content.byteLength}, ${content.byteLength},
       ${contentHash}, ${content.byteLength}, 1, 'active', 'confirmed',
       now() + interval '1 day', now())
  `;
  await sql`
    insert into private.file_deletion_tombstones
      (operation_id, platform_id, platform_account_ref_hash, file_ref_hash,
       object_path_hash, original_status, requested_at, confirmed_at,
       reason_code, data_version, source_commit, manifest_version)
    values
      (${tombstoneOperationId}, ${platformId},
       ${createHash('sha256').update(accountId).digest('hex')},
       ${createHash('sha256').update(fileId).digest('hex')},
       ${createHash('sha256').update(objectPath).digest('hex')},
       'deleting', now(), now(), 'm6_02_fixture', 'v1', 'local-fixture', null)
  `;

  const lease = await jobLease(jobId, leaseOwner);
  assert.equal(lease.claimed, true, 'backup worker lease must be claimed');
  const context = await barrierContext(jobId, leaseOwner, lease.fencing_token);
  const begin = await barrierCall(
    'file_backup_barrier_begin',
    context,
    ['global', recoverySetId, new Date(Date.now() + 60_000), 'm6-02-local-v1'],
    ['text', 'text', 'timestamptz', 'text'],
  );
  assert.equal(begin.state, 'running');

  const guardedJobId = crypto.randomUUID();
  const guardedOwner = `m6-02-guard-${crypto.randomUUID()}`;
  const [guardedFile] = await sql
    .unsafe(
      `select * from private.file_cleanup_claim(
      row($1::uuid,$2::text,$3::bigint,$4::uuid)::private.job_context,
      $5::uuid, 30
    )`,
      [guardedJobId, guardedOwner, 1, crypto.randomUUID(), fileId],
    )
    .catch(() => []);
  assert.equal(guardedFile?.action, 'backup_barrier');

  const [file] = await sql`
    select id, platform_id, platform_account_id, storage_bucket, storage_path,
           actual_size_bytes, sha256, status, write_outcome
    from public.platform_config_files
    where id = ${fileId}
  `;
  const objectResponse = await fetch(
    `${apiUrl}/storage/v1/object/${file.storage_bucket}/${file.storage_path}`,
    { headers: storageHeaders },
  );
  assert.equal(objectResponse.status, 200);
  const objectBytes = Buffer.from(await objectResponse.arrayBuffer());
  const objectHash = createHash('sha256').update(objectBytes).digest('hex');
  assert.equal(objectBytes.byteLength, Number(file.actual_size_bytes));
  assert.equal(objectHash, file.sha256);

  const [tombstone] = await sql`
    select operation_id, platform_id, platform_account_ref_hash,
           file_ref_hash, object_path_hash, original_status, requested_at,
           confirmed_at, reason_code, data_version, source_commit, manifest_version
    from private.file_deletion_tombstones
    where operation_id = ${tombstoneOperationId}
  `;
  const manifest = {
    format: 'aisenhub-backup-manifest-v1',
    recovery_set_id: recoverySetId,
    generated_at: new Date().toISOString(),
    migration_version: '20260909003356',
    objects: [
      {
        file_id: file.id,
        platform_id: file.platform_id,
        platform_account_id: file.platform_account_id,
        bucket: file.storage_bucket,
        path: file.storage_path,
        size: objectBytes.byteLength,
        sha256: objectHash,
        status: file.status,
        write_outcome: file.write_outcome,
      },
    ],
    tombstones: [tombstone],
  };
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestHash = createHash('sha256').update(manifestText).digest('hex');
  await writeFile(
    join(artifactDirectory, 'manifest.json'),
    manifestText,
    'utf8',
  );
  await writeFile(
    join(artifactDirectory, 'tombstones.jsonl'),
    `${JSON.stringify(tombstone)}\n`,
    'utf8',
  );
  const tombstoneText = await readFile(
    join(artifactDirectory, 'tombstones.jsonl'),
    'utf8',
  );
  assert(
    !/token|secret|password|cookie|original_name|content/iu.test(tombstoneText),
  );

  const finished = await barrierCall(
    'file_backup_barrier_finish',
    context,
    [begin.barrier_id, begin.fencing_token, 'complete', 'm6-02-local-v1', null],
    ['uuid', 'bigint', 'text', 'text', 'text'],
  );
  assert.equal(finished.state, 'complete');
  assert.equal(finished.last_error_code, null);

  const failedLease = await jobLease(failedJobId, failedLeaseOwner);
  assert.equal(failedLease.claimed, true);
  const failedContext = await barrierContext(
    failedJobId,
    failedLeaseOwner,
    failedLease.fencing_token,
  );
  const failedBegin = await barrierCall(
    'file_backup_barrier_begin',
    failedContext,
    [
      'file',
      failedRecoverySetId,
      new Date(Date.now() + 60_000),
      'm6-02-local-f1',
    ],
    ['text', 'text', 'timestamptz', 'text'],
  );
  const failed = await barrierCall(
    'file_backup_barrier_finish',
    failedContext,
    [
      failedBegin.barrier_id,
      failedBegin.fencing_token,
      'failed',
      null,
      'object_copy_failed',
    ],
    ['uuid', 'bigint', 'text', 'text', 'text'],
  );
  assert.equal(failed.state, 'failed');
  assert.equal(failed.last_error_code, 'object_copy_failed');

  console.log(
    JSON.stringify(
      {
        localBarrierContract: 'PASS',
        objectManifestHashVerification: 'PASS',
        externalTombstoneIsolation: 'PASS',
        failedRecoverySetReleasesBarrier: 'PASS',
        externalBackupTarget: 'NOT_RUN (X04 unavailable)',
        manifestSha256: manifestHash,
      },
      null,
      2,
    ),
  );
} finally {
  await cleanup();
}
