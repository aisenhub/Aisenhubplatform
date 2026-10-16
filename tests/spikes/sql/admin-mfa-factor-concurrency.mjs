import postgres from 'postgres';

const databaseUrl = process.env.SUPABASE_DB_URL;
if (!databaseUrl) throw new Error('SUPABASE_DB_URL is required');

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
  user: '00000000-0000-4760-8000-000000000001',
  sessionA: '00000000-0000-4761-8000-000000000001',
  sessionB: '00000000-0000-4761-8000-000000000002',
  factorA: '00000000-0000-4762-8000-000000000001',
  factorB: '00000000-0000-4762-8000-000000000002',
  factorC: '00000000-0000-4762-8000-000000000003',
  factorD: '00000000-0000-4762-8000-000000000004',
  proofA: '00000000-0000-4763-8000-000000000001',
  proofB: '00000000-0000-4763-8000-000000000002',
  requestA: '00000000-0000-4764-8000-000000000001',
  requestB: '00000000-0000-4764-8000-000000000002',
  operationA: '00000000-0000-4765-8000-000000000001',
  operationB: '00000000-0000-4765-8000-000000000002',
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function cleanup() {
  await sql`delete from public.audit_logs where actor_user_id=${ids.user}::uuid`.catch(
    () => undefined,
  );
  await sql`delete from private.admin_mfa_factor_operations where user_id=${ids.user}::uuid`.catch(
    () => undefined,
  );
  await sql`delete from private.admin_step_up where user_id=${ids.user}::uuid`.catch(
    () => undefined,
  );
  await sql`delete from private.system_admin where user_id=${ids.user}::uuid`.catch(
    () => undefined,
  );
  await sql`delete from auth.sessions where user_id=${ids.user}::uuid`.catch(
    () => undefined,
  );
  await sql`delete from auth.mfa_factors where user_id=${ids.user}::uuid`.catch(
    () => undefined,
  );
  await sql`delete from auth.users where id=${ids.user}::uuid`.catch(
    () => undefined,
  );
}

try {
  await cleanup();
  await sql`
    insert into auth.users(id,aud,role,email,encrypted_password,created_at,updated_at)
    values (${ids.user},'authenticated','authenticated','mfa-factor-concurrency@example.test','x',now(),now())
  `;
  await sql`
    insert into auth.sessions(id,user_id,created_at,updated_at,aal,not_after)
    values
      (${ids.sessionA},${ids.user},now(),now(),'aal2',now()+interval '1 hour'),
      (${ids.sessionB},${ids.user},now(),now(),'aal2',now()+interval '1 hour')
  `;
  await sql`
    insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at)
    values
      (${ids.factorA},${ids.user},'totp','verified',now(),now()),
      (${ids.factorB},${ids.user},'totp','verified',now(),now()),
      (${ids.factorC},${ids.user},'totp','verified',now(),now()),
      (${ids.factorD},${ids.user},'totp','verified',now(),now())
  `;
  await sql`
    insert into private.system_admin(user_id,state,activated_at)
    values (${ids.user},'active',now())
  `;
  await sql`
    insert into private.admin_step_up(id,user_id,session_id,factor_id,verified_at,expires_at)
    values
      (${ids.proofA},${ids.user},${ids.sessionA},${ids.factorA},now(),now()+interval '10 minutes'),
      (${ids.proofB},${ids.user},${ids.sessionB},${ids.factorB},now(),now()+interval '10 minutes')
  `;

  const prepareA = workerA`
    select * from private.admin_mfa_factor_delete_prepare(
      row(${ids.user}::uuid,${ids.sessionA}::uuid,${ids.requestA}::uuid)::private.admin_context,
      ${ids.proofA}::uuid,${ids.factorC}::uuid,${ids.operationA}::uuid
    )
  `;
  const prepareB = workerB`
    select * from private.admin_mfa_factor_delete_prepare(
      row(${ids.user}::uuid,${ids.sessionB}::uuid,${ids.requestB}::uuid)::private.admin_context,
      ${ids.proofB}::uuid,${ids.factorD}::uuid,${ids.operationB}::uuid
    )
  `;
  const results = await Promise.allSettled([prepareA, prepareB]);
  const fulfilled = results.filter((result) => result.status === 'fulfilled');
  const rejected = results.filter((result) => result.status === 'rejected');
  assert(
    fulfilled.length === 1,
    `expected one prepared MFA factor deletion, got ${fulfilled.length}`,
  );
  assert(
    rejected.length === 1,
    `expected one concurrent deletion rejection, got ${rejected.length}`,
  );
  const rejection = String(
    rejected[0].reason?.message ?? rejected[0].reason ?? '',
  );
  assert(
    rejection.includes('mfa_factor_operation_in_progress'),
    `unexpected concurrent rejection: ${rejection}`,
  );
  const [{ active_count: activeCount }] = await sql`
    select count(*)::integer as active_count
    from private.admin_mfa_factor_operations
    where user_id=${ids.user}::uuid and state='authorized'
  `;
  assert(
    Number(activeCount) === 1,
    `expected one active factor operation, got ${activeCount}`,
  );
  const [{ proof_count: proofCount }] = await sql`
    select count(*)::integer as proof_count
    from private.admin_step_up
    where user_id=${ids.user}::uuid
  `;
  assert(
    Number(proofCount) === 1,
    `only the winning session proof should be consumed, remaining proofs=${proofCount}`,
  );
  console.log(
    'PASS: concurrent Admin MFA factor deletion prepares serialize across sessions',
  );
} finally {
  await cleanup();
  await Promise.all([
    workerA.end({ timeout: 1 }),
    workerB.end({ timeout: 1 }),
    sql.end({ timeout: 1 }),
  ]);
}
