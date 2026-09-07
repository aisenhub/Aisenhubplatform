import postgres from 'postgres';

const databaseUrl = process.env.SUPABASE_DB_URL;
const localUrl = process.env.SUPABASE_LOCAL_URL;
const anonKey = process.env.SUPABASE_LOCAL_ANON_KEY;
const secretKey = process.env.SUPABASE_LOCAL_SECRET_KEY;

if (!databaseUrl || !localUrl || !anonKey || !secretKey) {
  throw new Error(
    'SUPABASE_DB_URL, SUPABASE_LOCAL_URL, SUPABASE_LOCAL_ANON_KEY and SUPABASE_LOCAL_SECRET_KEY are required',
  );
}

const sql = postgres(databaseUrl, {
  max: 1,
  prepare: false,
  onnotice: () => undefined,
});
const firstConnection = postgres(databaseUrl, { max: 1, prepare: false });
const secondConnection = postgres(databaseUrl, { max: 1, prepare: false });

const platformA = crypto.randomUUID();
const platformB = crypto.randomUUID();
const platformC = crypto.randomUUID();
const accountA1 = crypto.randomUUID();
const accountB1 = crypto.randomUUID();
const accountA2 = crypto.randomUUID();
const accountC3 = crypto.randomUUID();
const leaseResource = crypto.randomUUID();
const roleLeaseResource = crypto.randomUUID();
const rollbackOperation = crypto.randomUUID();
const hash = Buffer.alloc(32, 0x44);
const users = [];
const temporaryMemberships = [
  'account_executor',
  'admin_executor',
  'job_executor',
];

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const expectSqlState = async (query, expectedState, message) => {
  try {
    await query();
  } catch (error) {
    assert(error.code === expectedState, `${message}: got ${error.code}`);
    return;
  }
  throw new Error(`${message}: statement unexpectedly succeeded`);
};

const signup = async (label) => {
  const response = await fetch(`${localUrl}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: `t10-${label}-${crypto.randomUUID()}@example.test`,
      password: 'T10-only-local-probe-password-123!',
    }),
  });
  const body = await response.json();
  assert(response.ok && body.user?.id, `Local Auth signup ${label} succeeds`);
  users.push({ id: body.user.id, accessToken: body.access_token });
  return body.user.id;
};

const deleteUser = async ({ id }) => {
  await fetch(`${localUrl}/auth/v1/admin/users/${id}`, {
    method: 'DELETE',
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
    },
  });
};

try {
  const user1 = await signup('u1');
  const user2 = await signup('u2');
  const user3 = await signup('u3');

  await sql`
    insert into public.platforms (id, code, name)
    values
      (${platformA}, 't10-platform-a', 'T10 Platform A'),
      (${platformB}, 't10-platform-b', 'T10 Platform B'),
      (${platformC}, 't10-platform-c', 'T10 Platform C')
  `;
  await sql`
    insert into public.platform_accounts (id, platform_id, user_id, status)
    values
      (${accountA1}, ${platformA}, ${user1}, 'active'),
      (${accountB1}, ${platformB}, ${user1}, 'active'),
      (${accountA2}, ${platformA}, ${user2}, 'suspended'),
      (${accountC3}, ${platformC}, ${user3}, 'closed')
  `;
  await sql`
    insert into public.platform_profiles (platform_account_id)
    values (${accountA1})
  `;

  const [scopePlatform] = await sql`
    insert into private.admin_idempotency (
      admin_user_id, platform_id, scope, operation, idempotency_key, request_hash
    ) values (
      ${user1}, ${platformA}, ${`platform:${platformA}`}, 't10', 'same-key', ${hash}
    ) returning scope
  `;
  const [scopeGlobal] = await sql`
    insert into private.admin_idempotency (
      admin_user_id, platform_id, scope, operation, idempotency_key, request_hash
    ) values (${user1}, null, 'global', 't10', 'same-key', ${hash})
    returning scope
  `;
  assert(
    scopePlatform.scope !== scopeGlobal.scope,
    'platform and global Admin scopes do not collide',
  );

  await expectSqlState(
    () => sql`
      select private.audit_append(
        ${crypto.randomUUID()}, 'system', null, ${platformA}, ${accountB1},
        't10.cross-tenant', 'platform_account', ${accountB1}, null, null, '{}'::jsonb
      )
    `,
    '23503',
    'cross-platform audit account relation is rejected',
  );

  await firstConnection`begin`;
  const [firstUpdate] = await firstConnection`
    update public.platform_profiles
    set display_name = 'winner', row_version = row_version + 1
    where platform_account_id = ${accountA1} and row_version = 1
    returning row_version
  `;
  await firstConnection`commit`;
  const [staleUpdate] = await secondConnection`
    update public.platform_profiles
    set display_name = 'stale', row_version = row_version + 1
    where platform_account_id = ${accountA1} and row_version = 1
    returning row_version
  `;
  assert(
    firstUpdate.row_version === 2n || String(firstUpdate.row_version) === '2',
    'first profile version update wins',
  );
  assert(
    staleUpdate === undefined,
    'stale profile version update affects no row',
  );

  try {
    await sql.begin(async (tx) => {
      await tx`
        insert into private.idempotency_keys (
          platform_id, platform_account_id, operation, actor_scope,
          idempotency_key, request_hash
        ) values (${platformA}, ${accountA1}, 'rollback', 'user:test', ${rollbackOperation}, ${hash})
      `;
      throw new Error('t10-injected-failure');
    });
  } catch (error) {
    assert(
      error.message === 't10-injected-failure',
      'injected failure is observed',
    );
  }
  const [rolledBack] = await sql`
    select count(*)::integer as count
    from private.idempotency_keys
    where operation = 'rollback' and platform_id = ${platformA}
  `;
  assert(
    rolledBack.count === 0,
    'failed transaction leaves no pending idempotency row',
  );

  const [firstLease] = await sql`
    select * from private.job_lease_claim('t10', ${leaseResource}, 'worker-a', 60)
  `;
  await sql`
    update private.job_leases
    set lease_until = clock_timestamp() - interval '1 second'
    where job_kind = 't10' and resource_id = ${leaseResource}
  `;
  const [expiredLease] = await sql`
    select * from private.job_lease_claim('t10', ${leaseResource}, 'worker-b', 60)
  `;
  assert(
    firstLease.claimed && expiredLease.claimed,
    'expired lease can be reclaimed',
  );
  assert(
    String(expiredLease.fencing_token) === '2',
    'expired lease reclaim advances fencing token',
  );

  for (const role of temporaryMemberships) {
    await sql.unsafe(`grant ${role} to postgres`);
  }
  await sql`set role account_executor`;
  await expectSqlState(
    () => sql`select * from public.platform_accounts`,
    '42501',
    'account_executor cannot read account table directly',
  );
  await expectSqlState(
    () =>
      sql`select * from private.idempotency_claim(${platformA}, ${accountA1}, 'x', 'user:x', 'x', ${hash}::bytea)`,
    '42501',
    'account_executor cannot call internal idempotency helper directly',
  );
  await sql`reset role`;

  await sql`set role admin_executor`;
  await expectSqlState(
    () => sql`select * from private.platform_api_keys`,
    '42501',
    'admin_executor cannot read key table directly',
  );
  await sql`reset role`;

  await sql`set role job_executor`;
  const [jobLease] = await sql`
    select * from private.job_lease_claim('t10-role', ${roleLeaseResource}, 'job-role', 30)
  `;
  assert(jobLease.claimed, 'job_executor can call lease wrapper');
  await expectSqlState(
    () => sql`select * from private.job_leases`,
    '42501',
    'job_executor cannot read lease table directly',
  );
  await sql`reset role`;

  console.log(
    JSON.stringify({
      fixture: '3-platforms-3-users',
      crossTenantFk: 'PASS',
      profileOptimisticVersion: 'PASS',
      rollback: 'PASS',
      expiredFence: 'PASS',
      realRoleNegative: 'PASS',
    }),
  );
} finally {
  await sql`reset role`;
  for (const role of temporaryMemberships) {
    await sql.unsafe(`revoke ${role} from postgres`);
  }
  for (const resourceId of [leaseResource, roleLeaseResource]) {
    await sql`delete from private.job_leases where resource_id = ${resourceId}`;
  }
  for (const { id } of users) {
    await sql`delete from private.deletion_jobs where user_id = ${id}`;
    await sql`delete from private.deletion_requests where user_id = ${id}`;
    await sql`delete from private.admin_idempotency where admin_user_id = ${id}`;
  }
  await sql`delete from public.platform_profiles where platform_account_id = ${accountA1}`;
  for (const accountId of [accountA1, accountB1, accountA2, accountC3]) {
    await sql`delete from public.platform_accounts where id = ${accountId}`;
  }
  for (const platformId of [platformA, platformB, platformC]) {
    await sql`delete from public.platforms where id = ${platformId}`;
  }
  for (const user of users) {
    await deleteUser(user);
  }
  await firstConnection.end({ timeout: 5 });
  await secondConnection.end({ timeout: 5 });
  await sql.end({ timeout: 5 });
}
