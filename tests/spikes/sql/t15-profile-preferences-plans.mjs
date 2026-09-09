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
const planId = crypto.randomUUID();
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
        email: `t15-${crypto.randomUUID()}@example.test`,
        password: 'T15-only-local-probe-password-123!',
      }),
    });
    const body = await response.json();
    if (response.ok && body.user?.id) {
      user = body.user.id;
      return;
    }
    if (response.status !== 502 || attempt === 5)
      throw new Error(`T15 Local Auth signup failed (${response.status})`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

try {
  await signup();
  const [session] =
    await sql`select id from auth.sessions where user_id = ${user} order by created_at desc limit 1`;
  assert(session?.id, 'Local Auth signup creates session');
  await sql`insert into public.platforms (id, code, name) values (${platformId}, ${`t15-${platformId.slice(0, 8)}`}, 'T15 Platform')`;
  await sql`insert into public.plans (id, platform_id, code, name, kind, features) values (${planId}, ${platformId}, 'pro', 'Pro', 'paid', '{"quota": 5}'::jsonb)`;
  await sql`insert into private.platform_api_keys (id, platform_id, name, key_hmac, hmac_key_version, key_prefix, key_suffix, creation_operation_id) values (${keyId}, ${platformId}, 'T15 key', ${'c'.repeat(64)}, 1, 'phk_v1', 'cccc', ${crypto.randomUUID()})`;
  await sql`grant account_executor to postgres`;
  const [activated] = await asRole(
    'account_executor',
    (transaction) =>
      transaction`select * from private.account_activate(row(${user}, ${session.id}, ${platformId}, ${keyId}, ${crypto.randomUUID()})::private.account_context)`,
  );
  const [profile] = await asRole(
    'account_executor',
    (transaction) =>
      transaction`select * from private.profile_get(row(${user}, ${session.id}, ${platformId}, ${keyId}, ${crypto.randomUUID()})::private.account_context)`,
  );
  assert(
    activated.account_status === 'active' && Number(profile.row_version) === 1,
    'profile read starts at version one',
  );
  const [patched] = await asRole(
    'account_executor',
    (transaction) =>
      transaction`select * from private.profile_patch(row(${user}, ${session.id}, ${platformId}, ${keyId}, ${crypto.randomUUID()})::private.account_context, 1, '{"display_name":"T15 User","metadata":{"theme":"light"}}'::jsonb)`,
  );
  assert(
    patched.display_name === 'T15 User' && Number(patched.row_version) === 2,
    'profile patch increments row version',
  );
  await expectSqlState(
    () =>
      asRole(
        'account_executor',
        (transaction) =>
          transaction`select * from private.profile_patch(row(${user}, ${session.id}, ${platformId}, ${keyId}, ${crypto.randomUUID()})::private.account_context, 1, '{"bio":"stale"}'::jsonb)`,
      ),
    '40001',
    'stale profile ETag',
  );
  await expectSqlState(
    () =>
      asRole(
        'account_executor',
        (transaction) =>
          transaction`select * from private.profile_patch(row(${user}, ${session.id}, ${platformId}, ${keyId}, ${crypto.randomUUID()})::private.account_context, 2, '{"ownership":"nope"}'::jsonb)`,
      ),
    '22023',
    'profile ownership field',
  );

  await sql`update public.platform_preferences set preferences = '{"remove":"yes"}'::jsonb where platform_account_id = ${activated.platform_account_id}`;
  const [preferences] = await asRole(
    'account_executor',
    (transaction) =>
      transaction`select * from private.preferences_patch(row(${user}, ${session.id}, ${platformId}, ${keyId}, ${crypto.randomUUID()})::private.account_context, 1, '{"theme":"dark","remove":null}'::jsonb)`,
  );
  assert(
    preferences.preferences.theme === 'dark' &&
      preferences.preferences.remove === undefined &&
      Number(preferences.row_version) === 2,
    'preferences merge patch removes null keys and increments version',
  );

  const plans = await asRole(
    'account_executor',
    (transaction) =>
      transaction`select * from private.public_plans_list(${platformId}, ${keyId})`,
  );
  assert(
    plans.length === 1 &&
      plans[0].code === 'pro' &&
      plans[0].features.quota === 5,
    'public plans returns active allowlisted plans',
  );
  await sql`update public.platforms set status = 'disabled' where id = ${platformId}`;
  await expectSqlState(
    () =>
      asRole(
        'account_executor',
        (transaction) =>
          transaction`select * from private.public_plans_list(${platformId}, ${keyId})`,
      ),
    '28000',
    'disabled platform public plans',
  );
  console.log(
    JSON.stringify({
      profile: 'PASS',
      staleVersion: 'PASS',
      ownershipBoundary: 'PASS',
      preferencesMergePatch: 'PASS',
      publicPlans: 'PASS',
      disabledPlatform: 'PASS',
    }),
  );
} finally {
  await sql`delete from public.audit_logs where platform_id = ${platformId}`.catch(
    () => undefined,
  );
  await sql`delete from private.platform_api_keys where platform_id = ${platformId}`.catch(
    () => undefined,
  );
  await sql`delete from public.platform_profiles where platform_account_id in (select id from public.platform_accounts where platform_id = ${platformId})`.catch(
    () => undefined,
  );
  await sql`delete from public.platform_preferences where platform_account_id in (select id from public.platform_accounts where platform_id = ${platformId})`.catch(
    () => undefined,
  );
  await sql`delete from public.platform_accounts where platform_id = ${platformId}`.catch(
    () => undefined,
  );
  await sql`delete from public.plans where platform_id = ${platformId}`.catch(
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
