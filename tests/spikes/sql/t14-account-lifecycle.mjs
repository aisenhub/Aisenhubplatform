import postgres from 'postgres';

const databaseUrl = process.env.SUPABASE_DB_URL;
const localUrl = process.env.SUPABASE_LOCAL_URL;
const anonKey = process.env.SUPABASE_LOCAL_ANON_KEY;
const secretKey = process.env.SUPABASE_LOCAL_SECRET_KEY;
if (!databaseUrl || !localUrl || !anonKey || !secretKey)
  throw new Error('Local Supabase variables are required');
const sql = postgres(databaseUrl, {
  max: 1,
  prepare: false,
  onnotice: () => undefined,
});
const platformId = crypto.randomUUID();
const keyId = crypto.randomUUID();
const proofId = crypto.randomUUID();
const deleteProofId = crypto.randomUUID();
let user;
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const expectSqlState = async (query, expected, message) => {
  try {
    await query();
  } catch (error) {
    assert(error.code === expected, `${message}: got ${error.code}`);
    return;
  }
  throw new Error(`${message}: unexpectedly succeeded`);
};
const asRole = async (role, callback) =>
  sql.begin(async (transaction) => {
    await transaction.unsafe(`set local role ${role}`);
    return callback(transaction);
  });

async function signup() {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const response = await fetch(`${localUrl}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: anonKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        email: `t14-${crypto.randomUUID()}@example.test`,
        password: 'T14-only-local-probe-password-123!',
      }),
    });
    const body = await response.json();
    if (response.ok && body.user?.id) {
      user = body.user.id;
      return;
    }
    if (response.status !== 502 || attempt === 5)
      throw new Error(`T14 Local Auth signup failed (${response.status})`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

try {
  await signup();
  const [session] =
    await sql`select id from auth.sessions where user_id = ${user} order by created_at desc limit 1`;
  assert(session?.id, 'Local Auth signup creates session');
  await sql`insert into public.platforms (id, code, name) values (${platformId}, ${`t14-${platformId.slice(0, 8)}`}, 'T14 Platform')`;
  await sql`insert into private.platform_api_keys (id, platform_id, name, key_hmac, hmac_key_version, key_prefix, key_suffix, creation_operation_id) values (${keyId}, ${platformId}, 'T14 key', ${'b'.repeat(64)}, 1, 'phk_v1', 'bbbb', ${crypto.randomUUID()})`;
  await sql`grant account_executor to postgres`;
  await sql`grant admin_executor to postgres`;
  await sql`insert into private.system_admin (user_id) values (${user})`;

  const [activated] = await asRole(
    'account_executor',
    (transaction) =>
      transaction`select * from private.account_activate(row(${user}, ${session.id}, ${platformId}, ${keyId}, ${crypto.randomUUID()})::private.account_context)`,
  );
  assert(
    activated.account_status === 'active',
    'activate creates active account',
  );
  const [again] = await asRole(
    'account_executor',
    (transaction) =>
      transaction`select * from private.account_activate(row(${user}, ${session.id}, ${platformId}, ${keyId}, ${crypto.randomUUID()})::private.account_context)`,
  );
  assert(
    again.platform_account_id === activated.platform_account_id,
    'activate is idempotent',
  );
  const [createdAccount] =
    await sql`select id from public.platform_accounts where platform_id = ${platformId} and user_id = ${user}`;
  const [initialRows] =
    await sql`select (select count(*) from public.platform_profiles where platform_account_id = ${createdAccount?.id}) as profiles, (select count(*) from public.platform_preferences where platform_account_id = ${createdAccount?.id}) as preferences`;
  assert(
    createdAccount?.id &&
      Number(initialRows.profiles) === 1 &&
      Number(initialRows.preferences) === 1,
    'activation creates profile and preferences',
  );

  await asRole(
    'admin_executor',
    (transaction) =>
      transaction`select * from private.admin_account_transition(row(${user}, ${session.id}, ${crypto.randomUUID()})::private.admin_context, ${platformId}, ${createdAccount.id}, 'suspend')`,
  );
  const [suspended] =
    await sql`select status from public.platform_accounts where id = ${createdAccount.id}`;
  assert(
    suspended.status === 'suspended',
    'Admin suspend changes account state',
  );
  await asRole(
    'admin_executor',
    (transaction) =>
      transaction`select * from private.admin_account_transition(row(${user}, ${session.id}, ${crypto.randomUUID()})::private.admin_context, ${platformId}, ${createdAccount.id}, 'restore')`,
  );
  const [restored] =
    await sql`select status from public.platform_accounts where id = ${createdAccount.id}`;
  assert(
    restored.status === 'active',
    'Admin restore changes suspended account state',
  );

  await sql`insert into private.user_recent_auth_proofs (id, user_id, session_id, factor_id, verified_at, expires_at) values (${deleteProofId}, ${user}, ${session.id}, 'factor-t14', now() - interval '1 minute', now() + interval '4 minutes')`;
  const [deleteRequest] = await asRole(
    'account_executor',
    (transaction) =>
      transaction`select * from private.identity_delete_request(row(${user}, ${session.id}, ${platformId}, ${keyId}, ${crypto.randomUUID()})::private.account_context, ${deleteProofId})`,
  );
  assert(
    deleteRequest.state === 'pending_admin',
    'identity delete request stops at pending_admin',
  );
  const [deleteReplay] = await asRole(
    'account_executor',
    (transaction) =>
      transaction`select * from private.identity_delete_request(row(${user}, ${session.id}, ${platformId}, ${keyId}, ${crypto.randomUUID()})::private.account_context, ${deleteProofId})`,
  );
  assert(
    deleteReplay.request_id === deleteRequest.request_id,
    'identity delete request is idempotent',
  );

  await expectSqlState(
    () =>
      asRole(
        'account_executor',
        (transaction) =>
          transaction`select * from private.account_close(row(${user}, ${session.id}, ${platformId}, ${keyId}, ${crypto.randomUUID()})::private.account_context, ${proofId})`,
      ),
    '42501',
    'close without recent proof',
  );
  await sql`insert into private.user_recent_auth_proofs (id, user_id, session_id, factor_id, verified_at, expires_at) values (${proofId}, ${user}, ${session.id}, 'factor-t14', now() - interval '1 minute', now() + interval '4 minutes')`;
  const [closed] = await asRole(
    'account_executor',
    (transaction) =>
      transaction`select * from private.account_close(row(${user}, ${session.id}, ${platformId}, ${keyId}, ${crypto.randomUUID()})::private.account_context, ${proofId})`,
  );
  assert(
    closed.account_status === 'closed',
    'close changes account state only with proof',
  );
  console.log(
    JSON.stringify({
      activate: 'PASS',
      idempotency: 'PASS',
      adminTransition: 'PASS',
      pendingAdmin: 'PASS',
      proofGate: 'PASS',
      close: 'PASS',
    }),
  );
} finally {
  await sql`delete from public.audit_logs where platform_id = ${platformId}`.catch(
    () => undefined,
  );
  await sql`delete from private.user_recent_auth_proofs where user_id = ${user}`.catch(
    () => undefined,
  );
  await sql`delete from private.deletion_requests where user_id = ${user}`.catch(
    () => undefined,
  );
  await sql`delete from private.platform_api_keys where platform_id = ${platformId}`.catch(
    () => undefined,
  );
  await sql`delete from public.platform_accounts where platform_id = ${platformId}`.catch(
    () => undefined,
  );
  await sql`delete from public.platforms where id = ${platformId}`.catch(
    () => undefined,
  );
  if (user)
    await fetch(`${localUrl}/auth/v1/admin/users/${user}`, {
      method: 'DELETE',
      headers: { apikey: secretKey, Authorization: `Bearer ${secretKey}` },
    }).catch(() => undefined);
  await sql.end({ timeout: 1 }).catch(() => undefined);
}
