import postgres from 'postgres';

const databaseUrl = process.env.SUPABASE_DB_URL;
const localUrl = process.env.SUPABASE_LOCAL_URL;
const anonKey = process.env.SUPABASE_LOCAL_ANON_KEY;
const secretKey = process.env.SUPABASE_LOCAL_SECRET_KEY;
if (!databaseUrl || !localUrl || !anonKey || !secretKey)
  throw new Error('Local Supabase variables are required');
const sql = postgres(databaseUrl, {
  max: 12,
  prepare: false,
  onnotice: () => undefined,
});
const platformId = crypto.randomUUID();
const keyId = crypto.randomUUID();
const freePlanId = crypto.randomUUID();
const paidPlanId = crypto.randomUUID();
const otherPlanId = crypto.randomUUID();
let managedPlanId;
let targetUser;
let adminUser;
let concurrentUser;
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
async function signup(prefix) {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const response = await fetch(`${localUrl}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: anonKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        email: `${prefix}-${crypto.randomUUID()}@example.test`,
        password: 'M3-only-local-probe-password-123!',
      }),
    });
    const body = await response.json();
    if (response.ok && body.user?.id) {
      const [session] =
        await sql`select id from auth.sessions where user_id = ${body.user.id} order by created_at desc limit 1`;
      return { user: body.user.id, session: session.id };
    }
    if (response.status !== 502 || attempt === 5)
      throw new Error(`Local Auth signup failed (${response.status})`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('unreachable');
}

try {
  targetUser = await signup('m3-target');
  adminUser = await signup('m3-admin');
  await sql`insert into public.platforms (id, code, name) values (${platformId}, ${`m3-${platformId.slice(0, 8)}`}, 'M3 Platform')`;
  await sql`insert into public.plans (id, platform_id, code, name, kind, features) values
    (${freePlanId}, ${platformId}, 'free', 'Free', 'free', '{"quota":1}'::jsonb),
    (${paidPlanId}, ${platformId}, 'pro', 'Pro', 'paid', '{"quota":10}'::jsonb),
    (${otherPlanId}, ${platformId}, 'team', 'Team', 'paid', '{"quota":50}'::jsonb)`;
  await sql`update public.platforms set default_plan_id = ${freePlanId} where id = ${platformId}`;
  await sql`insert into private.platform_api_keys (id, platform_id, name, key_hmac, hmac_key_version, key_prefix, key_suffix, creation_operation_id) values (${keyId}, ${platformId}, 'M3 key', ${'d'.repeat(64)}, 1, 'phk_v1', 'dddd', ${crypto.randomUUID()})`;
  await sql`insert into private.system_admin (user_id) values (${adminUser.user}) on conflict (singleton_id) do update set user_id = excluded.user_id`;
  await sql`grant account_executor to postgres`;
  await sql`grant admin_executor to postgres`;
  const context = () =>
    sql`row(${targetUser.user}, ${targetUser.session}, ${platformId}, ${keyId}, ${crypto.randomUUID()})::private.account_context`;
  const adminContext = () =>
    sql`row(${adminUser.user}, ${adminUser.session}, ${crypto.randomUUID()})::private.admin_context`;
  const [managedPlan] = await asRole(
    'admin_executor',
    (transaction) =>
      transaction`select * from private.admin_plan_upsert(${adminContext()}, ${platformId}, ${null}, 'starter', 'Starter', 'M3 managed plan', 'paid', ${sql.json({ quota: 3 })}, 'active', false, false)`,
  );
  managedPlanId = managedPlan.plan_id;
  assert(
    managedPlan.code === 'starter' &&
      managedPlan.kind === 'paid' &&
      managedPlan.status === 'active' &&
      managedPlan.is_default === false,
    'admin can create an active plan',
  );
  const [archivedPlan] = await asRole(
    'admin_executor',
    (transaction) =>
      transaction`select * from private.admin_plan_upsert(${adminContext()}, ${platformId}, ${managedPlanId}, 'starter', 'Starter', 'M3 managed plan', 'paid', ${sql.json({ quota: 3 })}, 'archived', false, false)`,
  );
  assert(
    archivedPlan.status === 'archived',
    'admin can archive a non-default plan',
  );
  const [temporaryDefault] = await asRole(
    'admin_executor',
    (transaction) =>
      transaction`select * from private.admin_plan_upsert(${adminContext()}, ${platformId}, ${null}, 'temporary-free', 'Temporary Free', null, 'free', ${sql.json({ quota: 0 })}, 'active', true, false)`,
  );
  assert(
    temporaryDefault.is_default === true,
    'admin can switch the default Free plan',
  );
  const [clearedDefault] = await asRole(
    'admin_executor',
    (transaction) =>
      transaction`select * from private.admin_plan_upsert(${adminContext()}, ${platformId}, ${temporaryDefault.plan_id}, 'temporary-free', 'Temporary Free', null, 'free', ${sql.json({ quota: 0 })}, 'archived', false, true)`,
  );
  assert(
    clearedDefault.is_default === false,
    'admin can clear an archived default Free plan',
  );
  const [restoredDefault] = await asRole(
    'admin_executor',
    (transaction) =>
      transaction`select * from private.admin_plan_upsert(${adminContext()}, ${platformId}, ${freePlanId}, 'free', 'Free', null, 'free', ${sql.json({ quota: 1 })}, 'active', true, false)`,
  );
  assert(
    restoredDefault.is_default === true,
    'admin can restore the default Free plan',
  );
  const [account] = await asRole(
    'account_executor',
    (transaction) =>
      transaction`select * from private.account_activate(${context()})`,
  );
  const [initial] = await asRole(
    'account_executor',
    (transaction) =>
      transaction`select * from private.entitlement_read(${context()})`,
  );
  assert(
    initial.entitlement_kind === 'free' &&
      initial.effective_status === 'active' &&
      initial.plan_id === freePlanId,
    'activation reads default Free fallback',
  );
  await expectSqlState(
    () =>
      asRole(
        'admin_executor',
        (transaction) =>
          transaction`select * from private.admin_entitlement_command(${adminContext()}, ${platformId}, ${account.platform_account_id}, 'grant', ${crypto.randomUUID()}, ${managedPlanId}, 30, 'day', null, 'archived plan')`,
      ),
    'P0001',
    'archived plan cannot receive new grant',
  );

  const grantOperation = crypto.randomUUID();
  const [grant] = await asRole(
    'admin_executor',
    (transaction) =>
      transaction`select * from private.admin_entitlement_command(${adminContext()}, ${platformId}, ${account.platform_account_id}, 'grant', ${grantOperation}, ${paidPlanId}, 30, 'day', null, 'M3 local grant')`,
  );
  const [term] = await asRole(
    'account_executor',
    (transaction) =>
      transaction`select * from private.entitlement_read(${context()})`,
  );
  assert(
    grant.outcome === 'applied' &&
      term.entitlement_kind === 'term' &&
      term.code === 'pro',
    'admin grant creates term entitlement',
  );
  const [replayed] = await asRole(
    'admin_executor',
    (transaction) =>
      transaction`select * from private.admin_entitlement_command(${adminContext()}, ${platformId}, ${account.platform_account_id}, 'grant', ${grantOperation}, ${paidPlanId}, 30, 'day', null, 'M3 local grant')`,
  );
  assert(
    replayed.outcome === 'replayed' && replayed.grant_id === grant.grant_id,
    'admin grant operation is idempotent',
  );
  await expectSqlState(
    () =>
      asRole(
        'admin_executor',
        (transaction) =>
          transaction`select * from private.admin_entitlement_command(${adminContext()}, ${platformId}, ${account.platform_account_id}, 'grant', ${crypto.randomUUID()}, ${otherPlanId}, 30, 'day', null, 'conflict')`,
      ),
    'P0001',
    'different active plan conflicts',
  );

  await asRole(
    'admin_executor',
    (transaction) =>
      transaction`select * from private.admin_entitlement_command(${adminContext()}, ${platformId}, ${account.platform_account_id}, 'pause', ${crypto.randomUUID()}, null, null, null, null, 'maintenance')`,
  );
  const [paused] = await asRole(
    'account_executor',
    (transaction) =>
      transaction`select * from private.entitlement_read(${context()})`,
  );
  assert(
    paused.effective_status === 'suspended' &&
      paused.features &&
      Object.keys(paused.features).length === 0,
    'pause suspends effective entitlement',
  );
  await asRole(
    'admin_executor',
    (transaction) =>
      transaction`select * from private.admin_entitlement_command(${adminContext()}, ${platformId}, ${account.platform_account_id}, 'resume', ${crypto.randomUUID()}, null, null, null, null, 'maintenance complete')`,
  );
  const [resumed] = await asRole(
    'account_executor',
    (transaction) =>
      transaction`select * from private.entitlement_read(${context()})`,
  );
  assert(
    resumed.effective_status === 'active' && resumed.code === 'pro',
    'resume restores current entitlement',
  );
  await asRole(
    'admin_executor',
    (transaction) =>
      transaction`select * from private.admin_entitlement_command(${adminContext()}, ${platformId}, ${account.platform_account_id}, 'revoke', ${crypto.randomUUID()}, null, null, null, ${grant.grant_id}, 'remove grant')`,
  );
  const [revoked] = await asRole(
    'account_executor',
    (transaction) =>
      transaction`select * from private.entitlement_read(${context()})`,
  );
  assert(
    revoked.entitlement_kind === 'free' && revoked.plan_id === freePlanId,
    'revocation returns to Free without deleting ledger',
  );
  const redemptionCodeHmac = `${platformId.replaceAll('-', '')}${'e'.repeat(32)}`;
  const creationOperationId = crypto.randomUUID();
  const receiptHmac = 'receipt-hmac-fixture';
  const expiresAt = new Date(Date.now() + 86400000).toISOString();
  const deliveryDeadline = new Date(Date.now() + 600000).toISOString();
  const codePayload = [
    {
      code_hmac: redemptionCodeHmac,
      hmac_key_version: 1,
      code_prefix: 'AISEN-V1',
      code_suffix: 'EEEE',
    },
  ];
  const [batch] = await asRole(
    'admin_executor',
    (transaction) =>
      transaction`select * from private.admin_batch_create(${adminContext()}, ${platformId}, ${paidPlanId}, 'M3 batch', 1, 30, 'day', ${expiresAt}, ${deliveryDeadline}, ${creationOperationId}, ${receiptHmac}, ${sql.json(codePayload)})`,
  );
  assert(
    batch.status === 'pending_delivery' && batch.quantity === 1,
    'batch starts pending delivery',
  );
  const [beforeDelivery] = await asRole(
    'account_executor',
    (transaction) =>
      transaction`select * from private.redeem_subscription_code(${context()}, ${redemptionCodeHmac}::text, 1::smallint, 'redeem-before-delivery'::text)`,
  );
  assert(
    beforeDelivery.outcome === 'rejected' &&
      beforeDelivery.error_code === 'CODE_EXPIRED',
    'pending batch cannot redeem',
  );
  const [confirmed] = await asRole(
    'admin_executor',
    (transaction) =>
      transaction`select * from private.admin_batch_confirm(${adminContext()}, ${platformId}, ${batch.batch_id}, ${receiptHmac})`,
  );
  assert(
    confirmed.status === 'active',
    'batch confirmation activates delivery',
  );
  const [redeemed] = await asRole(
    'account_executor',
    (transaction) =>
      transaction`select * from private.redeem_subscription_code(${context()}, ${redemptionCodeHmac}::text, 1::smallint, 'redeem-1'::text)`,
  );
  assert(
    redeemed.outcome === 'applied' && redeemed.plan_id === paidPlanId,
    'active code grants subscription',
  );
  const [redeemReplay] = await asRole(
    'account_executor',
    (transaction) =>
      transaction`select * from private.redeem_subscription_code(${context()}, ${redemptionCodeHmac}::text, 1::smallint, 'redeem-1'::text)`,
  );
  assert(
    redeemReplay.outcome === 'replayed' &&
      redeemReplay.grant_id === redeemed.grant_id,
    'redemption idempotency replays grant',
  );
  const [redeemAgain] = await asRole(
    'account_executor',
    (transaction) =>
      transaction`select * from private.redeem_subscription_code(${context()}, ${redemptionCodeHmac}::text, 1::smallint, 'redeem-2'::text)`,
  );
  assert(
    redeemAgain.outcome === 'rejected' &&
      redeemAgain.error_code === 'CODE_ALREADY_REDEEMED',
    'redeemed code is one-time',
  );
  const [afterRedeem] = await asRole(
    'account_executor',
    (transaction) =>
      transaction`select * from private.entitlement_read(${context()})`,
  );
  assert(
    afterRedeem.code === 'pro' && afterRedeem.entitlement_kind === 'term',
    'redemption updates projection',
  );
  concurrentUser = await signup('m3-concurrent');
  const concurrentContext = () =>
    sql`row(${concurrentUser.user}, ${concurrentUser.session}, ${platformId}, ${keyId}, ${crypto.randomUUID()})::private.account_context`;
  await asRole(
    'account_executor',
    (transaction) =>
      transaction`select * from private.account_activate(${concurrentContext()})`,
  );
  const concurrentCodeHmac = `${platformId.replaceAll('-', '')}${'f'.repeat(32)}`;
  const concurrentBatchOperationId = crypto.randomUUID();
  const concurrentCodePayload = [
    {
      code_hmac: concurrentCodeHmac,
      hmac_key_version: 1,
      code_prefix: 'AISEN-V1',
      code_suffix: 'FFFF',
    },
  ];
  const [concurrentBatch] = await asRole(
    'admin_executor',
    (transaction) =>
      transaction`select * from private.admin_batch_create(${adminContext()}, ${platformId}, ${paidPlanId}, 'M3 concurrent batch', 1, 30, 'day', ${expiresAt}, ${deliveryDeadline}, ${concurrentBatchOperationId}, 'concurrent-receipt', ${sql.json(concurrentCodePayload)})`,
  );
  await asRole(
    'admin_executor',
    (transaction) =>
      transaction`select * from private.admin_batch_confirm(${adminContext()}, ${platformId}, ${concurrentBatch.batch_id}, 'concurrent-receipt')`,
  );
  const concurrentResults = await Promise.all(
    Array.from({ length: 10 }, (_, index) =>
      asRole(
        'account_executor',
        (transaction) =>
          transaction`select * from private.redeem_subscription_code(${concurrentContext()}, ${concurrentCodeHmac}::text, 1::smallint, ${`concurrent-${index}`}::text)`,
      ),
    ),
  );
  const concurrentOutcomes = concurrentResults.map(([result]) => result);
  assert(
    concurrentOutcomes.filter((result) => result.outcome === 'applied')
      .length === 1 &&
      concurrentOutcomes.filter(
        (result) => result.error_code === 'CODE_ALREADY_REDEEMED',
      ).length === 9,
    'ten concurrent redemptions consume one code',
  );
  await expectSqlState(
    () =>
      asRole(
        'account_executor',
        (transaction) =>
          transaction`select private.entitlement_apply(${platformId}, ${account.platform_account_id}, ${paidPlanId}, 'admin', ${crypto.randomUUID()}, 1, 'day', ${adminUser.user}, 'forbidden', null)`,
      ),
    '42501',
    'executor cannot call internal apply',
  );
  const [counts] = await sql`select
    (select count(*)::int from public.subscription_grants where platform_id = ${platformId} and platform_account_id = ${account.platform_account_id}) as grants,
    count(*)::int as events,
    count(*) filter (where event_type = 'granted')::int as granted_events,
    count(*) filter (where event_type = 'revoked')::int as revoked_events,
    count(*) filter (where event_type = 'paused')::int as paused_events,
    count(*) filter (where event_type = 'resumed')::int as resumed_events
    from public.subscription_events where platform_id = ${platformId} and platform_account_id = ${account.platform_account_id}`;
  assert(
    counts.grants === 2 &&
      counts.events === 5 &&
      counts.granted_events === 2 &&
      counts.revoked_events === 1 &&
      counts.paused_events === 1 &&
      counts.resumed_events === 1,
    'ledger retains grant and ordered events',
  );
  console.log(
    JSON.stringify({
      defaultFree: 'PASS',
      adminGrant: 'PASS',
      idempotency: 'PASS',
      planConflict: 'PASS',
      pauseResume: 'PASS',
      revoke: 'PASS',
      roleBoundary: 'PASS',
      ledger: 'PASS',
      delivery: 'PASS',
      redemption: 'PASS',
      concurrentRedemption: 'PASS',
      planManagement: 'PASS',
    }),
  );
} finally {
  await sql`delete from public.audit_logs where platform_id = ${platformId}`.catch(
    () => undefined,
  );
  await sql`delete from public.subscription_events where platform_id = ${platformId}`.catch(
    () => undefined,
  );
  await sql`delete from public.subscription_grants where platform_id = ${platformId}`.catch(
    () => undefined,
  );
  await sql`delete from public.subscriptions where platform_id = ${platformId}`.catch(
    () => undefined,
  );
  await sql`delete from public.redemption_events where platform_id = ${platformId}`.catch(
    () => undefined,
  );
  await sql`delete from public.redemption_codes where platform_id = ${platformId}`.catch(
    () => undefined,
  );
  await sql`delete from public.redemption_code_batches where platform_id = ${platformId}`.catch(
    () => undefined,
  );
  await sql`delete from private.platform_api_keys where platform_id = ${platformId}`.catch(
    () => undefined,
  );
  await sql`delete from public.plans where platform_id = ${platformId}`.catch(
    () => undefined,
  );
  await sql`delete from public.platform_accounts where platform_id = ${platformId}`.catch(
    () => undefined,
  );
  await sql`delete from public.platforms where id = ${platformId}`.catch(
    () => undefined,
  );
  if (targetUser?.user)
    await fetch(`${localUrl}/auth/v1/admin/users/${targetUser.user}`, {
      method: 'DELETE',
      headers: { apikey: secretKey, Authorization: `Bearer ${secretKey}` },
    }).catch(() => undefined);
  if (adminUser?.user)
    await fetch(`${localUrl}/auth/v1/admin/users/${adminUser.user}`, {
      method: 'DELETE',
      headers: { apikey: secretKey, Authorization: `Bearer ${secretKey}` },
    }).catch(() => undefined);
  if (concurrentUser?.user)
    await fetch(`${localUrl}/auth/v1/admin/users/${concurrentUser.user}`, {
      method: 'DELETE',
      headers: { apikey: secretKey, Authorization: `Bearer ${secretKey}` },
    }).catch(() => undefined);
  await sql.end({ timeout: 1 }).catch(() => undefined);
}
