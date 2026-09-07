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
const platformA = crypto.randomUUID();
const platformB = crypto.randomUUID();
const keyA = crypto.randomUUID();
const accountA = crypto.randomUUID();
const requestId = crypto.randomUUID();
const keyHmac = 'a'.repeat(64);
let user;
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function signup() {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const response = await fetch(`${localUrl}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: anonKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        email: `t13-${crypto.randomUUID()}@example.test`,
        password: 'T13-only-local-probe-password-123!',
      }),
    });
    const body = await response.json();
    if (response.ok && body.user?.id) {
      user = body.user.id;
      return;
    }
    if (response.status !== 502 || attempt === 5)
      throw new Error(`T13 Local Auth signup failed (${response.status})`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

const asRole = async (role, callback) =>
  sql.begin(async (transaction) => {
    await transaction.unsafe(`set local role ${role}`);
    return callback(transaction);
  });

try {
  await signup();
  const [session] =
    await sql`select id from auth.sessions where user_id = ${user} order by created_at desc limit 1`;
  assert(session?.id, 'signup creates an Auth session');
  await sql`
    insert into public.platforms (id, code, name)
    values
      (${platformA}, ${`t13-platform-a-${platformA.slice(0, 8)}`}, 'T13 Platform A'),
      (${platformB}, ${`t13-platform-b-${platformB.slice(0, 8)}`}, 'T13 Platform B')
  `;
  await sql`
    insert into public.platform_accounts (id, platform_id, user_id, status)
    values (${accountA}, ${platformA}, ${user}, 'active')
  `;
  await sql`
    insert into private.platform_api_keys
      (id, platform_id, name, key_hmac, hmac_key_version, key_prefix, key_suffix, creation_operation_id)
    values (${keyA}, ${platformA}, 'T13 key', ${keyHmac}, 1, 'phk_v1', 'aaaa', ${crypto.randomUUID()})
  `;
  await sql`grant account_executor to postgres`;
  await sql`grant admin_executor to postgres`;

  const [verified] = await asRole(
    'account_executor',
    (transaction) => transaction`
    select * from private.platform_key_verify(${keyHmac}, 1)
  `,
  );
  assert(
    verified?.key_id === keyA && verified.platform_id === platformA,
    'active Platform Key resolves to its platform',
  );

  const [principal] = await asRole(
    'account_executor',
    (transaction) => transaction`
    select * from private.account_principal(
      row(${user}, ${session.id}, ${platformA}, ${keyA}, ${requestId})::private.account_context
    )
  `,
  );
  assert(
    principal.authorization === 'allowed' &&
      principal.platform_status === 'active',
    'Principal authorizes active account',
  );

  const [wrongPlatform] = await asRole(
    'account_executor',
    (transaction) => transaction`
    select * from private.account_principal(
      row(${user}, ${session.id}, ${platformB}, ${keyA}, ${crypto.randomUUID()})::private.account_context
    )
  `,
  );
  assert(
    wrongPlatform.authorization === 'unauthorized',
    'Platform Key cannot cross platform boundary',
  );

  await sql`insert into private.system_admin (user_id) values (${user})`;
  const [disabled] = await asRole(
    'admin_executor',
    (transaction) => transaction`
    select * from private.admin_platform_update(
      row(${user}, ${session.id}, ${crypto.randomUUID()})::private.admin_context,
      ${platformA}, 'disabled', false
    )
  `,
  );
  assert(
    disabled.status === 'disabled',
    'Admin platform update is session-bound',
  );
  const [diagnostic] = await asRole(
    'account_executor',
    (transaction) => transaction`
    select * from private.account_principal(
      row(${user}, ${session.id}, ${platformA}, ${keyA}, ${crypto.randomUUID()})::private.account_context
    )
  `,
  );
  assert(
    diagnostic.authorization === 'platform_disabled',
    'Disabled platform is diagnostic-only',
  );

  await asRole(
    'admin_executor',
    (transaction) => transaction`
    select * from private.admin_platform_key_revoke(
      row(${user}, ${session.id}, ${crypto.randomUUID()})::private.admin_context,
      ${platformA}, ${keyA}
    )
  `,
  );
  const revoked = await asRole(
    'account_executor',
    (transaction) => transaction`
    select * from private.platform_key_verify(${keyHmac}, 1)
  `,
  );
  assert(
    revoked.length === 0,
    'Revoked Platform Key is rejected on the next request',
  );

  console.log(
    JSON.stringify({
      platformKey: 'PASS',
      crossPlatform: 'PASS',
      principal: 'PASS',
      adminPlatform: 'PASS',
      revoke: 'PASS',
    }),
  );
} finally {
  await sql`delete from public.audit_logs where platform_id in (${platformA}, ${platformB})`.catch(
    () => undefined,
  );
  await sql`delete from private.platform_api_keys where platform_id in (${platformA}, ${platformB})`.catch(
    () => undefined,
  );
  await sql`delete from private.system_admin where user_id = ${user}`.catch(
    () => undefined,
  );
  await sql`delete from public.platform_accounts where id = ${accountA}`.catch(
    () => undefined,
  );
  await sql`delete from public.platforms where id in (${platformA}, ${platformB})`.catch(
    () => undefined,
  );
  if (user) {
    await fetch(`${localUrl}/auth/v1/admin/users/${user}`, {
      method: 'DELETE',
      headers: { apikey: secretKey, Authorization: `Bearer ${secretKey}` },
    }).catch(() => undefined);
  }
  await sql.end({ timeout: 1 }).catch(() => undefined);
}
