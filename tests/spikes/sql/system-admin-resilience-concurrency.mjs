import postgres from 'postgres';

const databaseUrl = process.env.SUPABASE_DB_URL;
if (!databaseUrl) throw new Error('SUPABASE_DB_URL is required');

const blocker = postgres(databaseUrl, {
  max: 1,
  prepare: false,
  onnotice: () => undefined,
});
const workerA = postgres(databaseUrl, {
  max: 1,
  prepare: false,
  onnotice: () => undefined,
});
const workerB = postgres(databaseUrl, {
  max: 1,
  prepare: false,
  onnotice: () => undefined,
});
const sql = postgres(databaseUrl, {
  max: 2,
  prepare: false,
  onnotice: () => undefined,
});

const ids = {
  a: '00000000-0000-4690-8000-000000000001',
  b: '00000000-0000-4690-8000-000000000002',
  c: '00000000-0000-4690-8000-000000000003',
  sa: '00000000-0000-4691-8000-000000000001',
  sb: '00000000-0000-4691-8000-000000000002',
  sc: '00000000-0000-4691-8000-000000000003',
  fa: '00000000-0000-4692-8000-000000000001',
  fb: '00000000-0000-4692-8000-000000000002',
  pa: '00000000-0000-4693-8000-000000000001',
  pb: '00000000-0000-4693-8000-000000000002',
  oa: '00000000-0000-4694-8000-000000000001',
  ob: '00000000-0000-4694-8000-000000000002',
  ra: '00000000-0000-4695-8000-000000000001',
  rb: '00000000-0000-4695-8000-000000000002',
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function cleanup() {
  const users = [ids.a, ids.b, ids.c];
  await sql`delete from public.audit_logs where actor_user_id = any(${users}::uuid[]) or target_id = any(${users}::uuid[])`.catch(
    () => undefined,
  );
  await sql`delete from private.system_admin_operations where actor_user_id = any(${users}::uuid[]) or target_user_id = any(${users}::uuid[])`.catch(
    () => undefined,
  );
  await sql`delete from private.admin_step_up where user_id = any(${users}::uuid[])`.catch(
    () => undefined,
  );
  await sql`delete from private.system_admin where user_id = any(${users}::uuid[])`.catch(
    () => undefined,
  );
  await sql`delete from auth.sessions where user_id = any(${users}::uuid[])`.catch(
    () => undefined,
  );
  await sql`delete from auth.mfa_factors where user_id = any(${users}::uuid[])`.catch(
    () => undefined,
  );
  await sql`delete from auth.users where id = any(${users}::uuid[])`.catch(
    () => undefined,
  );
}

try {
  await cleanup();
  await sql`
    insert into auth.users(id,aud,role,email,encrypted_password,created_at,updated_at)
    values
      (${ids.a},'authenticated','authenticated','resilience-concurrency-a@example.test','x',now(),now()),
      (${ids.b},'authenticated','authenticated','resilience-concurrency-b@example.test','x',now(),now()),
      (${ids.c},'authenticated','authenticated','resilience-concurrency-c@example.test','x',now(),now())
  `;
  await sql`
    insert into auth.sessions(id,user_id,created_at,updated_at,aal,not_after)
    values
      (${ids.sa},${ids.a},now(),now(),'aal2',now()+interval '1 hour'),
      (${ids.sb},${ids.b},now(),now(),'aal2',now()+interval '1 hour'),
      (${ids.sc},${ids.c},now(),now(),'aal2',now()+interval '1 hour')
  `;
  await sql`
    insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at)
    values
      (${ids.fa},${ids.a},'totp','verified',now(),now()),
      (${ids.fb},${ids.b},'totp','verified',now(),now())
  `;
  await sql`
    insert into private.system_admin(user_id,state,activated_at)
    values (${ids.a},'active',now()),(${ids.b},'active',now()),(${ids.c},'active',now())
  `;
  await sql`
    insert into private.admin_step_up(id,user_id,session_id,factor_id,verified_at,expires_at)
    values
      (${ids.pa},${ids.a},${ids.sa},${ids.fa},now(),now()+interval '10 minutes'),
      (${ids.pb},${ids.b},${ids.sb},${ids.fb},now(),now()+interval '10 minutes')
  `;

  let releaseLock;
  let lockReady;
  const ready = new Promise((resolve) => {
    lockReady = resolve;
  });
  const hold = new Promise((resolve) => {
    releaseLock = resolve;
  });
  const blockerTask = blocker.begin(async (transaction) => {
    await transaction`select pg_advisory_xact_lock(hashtextextended('system-admin-membership',0))`;
    lockReady();
    await hold;
  });
  await ready;

  const removeB = workerA`
    select private.admin_system_admin_remove(
      row(${ids.a}::uuid,${ids.sa}::uuid,${ids.ra}::uuid)::private.admin_context,
      ${ids.b}::uuid,${ids.pa}::uuid,${ids.oa}::uuid,'concurrent remove B'
    ) as result
  `;
  const removeC = workerB`
    select private.admin_system_admin_remove(
      row(${ids.b}::uuid,${ids.sb}::uuid,${ids.rb}::uuid)::private.admin_context,
      ${ids.c}::uuid,${ids.pb}::uuid,${ids.ob}::uuid,'concurrent remove C'
    ) as result
  `;

  await pause(250);
  releaseLock();
  await blockerTask;
  const results = await Promise.allSettled([removeB, removeC]);
  const fulfilled = results.filter((result) => result.status === 'fulfilled');
  const rejected = results.filter((result) => result.status === 'rejected');
  const [{ active_count: activeCount }] = await sql`
    select count(*)::integer as active_count from private.system_admin where state='active' and user_id = any(${[ids.a, ids.b, ids.c]}::uuid[])
  `;

  assert(
    fulfilled.length === 1,
    `expected exactly one successful concurrent removal, got ${fulfilled.length}`,
  );
  assert(
    rejected.length === 1,
    `expected exactly one rejected concurrent removal, got ${rejected.length}`,
  );
  assert(
    Number(activeCount) === 2,
    `active System Admin floor violated: ${activeCount}`,
  );
  const rejectionMessage = String(
    rejected[0].reason?.message ?? rejected[0].reason ?? '',
  );
  assert(
    rejectionMessage.includes('admin_required') ||
      rejectionMessage.includes('minimum_active_system_admins_required'),
    `unexpected rejection: ${rejectionMessage}`,
  );
  console.log(
    'PASS: concurrent System Admin removals preserve the two-active floor',
  );
} finally {
  await cleanup();
  await Promise.all([
    blocker.end({ timeout: 1 }),
    workerA.end({ timeout: 1 }),
    workerB.end({ timeout: 1 }),
    sql.end({ timeout: 1 }),
  ]);
}
