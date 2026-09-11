import postgres from 'postgres';

const databaseUrl = process.env.SUPABASE_DB_URL;
const localUrl = process.env.SUPABASE_LOCAL_URL;
const anonKey = process.env.SUPABASE_LOCAL_ANON_KEY;
const secretKey = process.env.SUPABASE_LOCAL_SECRET_KEY;
if (!databaseUrl || !localUrl || !anonKey || !secretKey)
  throw new Error(
    'SUPABASE_DB_URL, SUPABASE_LOCAL_URL, SUPABASE_LOCAL_ANON_KEY and SUPABASE_LOCAL_SECRET_KEY are required',
  );

const sql = postgres(databaseUrl, {
  max: 8,
  prepare: false,
  onnotice: () => undefined,
});

const platformId = crypto.randomUUID();
let userId;
const accountId = crypto.randomUUID();
const planId = crypto.randomUUID();
const providerAccountId = crypto.randomUUID();
const providerProductId = crypto.randomUUID();
const checkoutId = crypto.randomUUID();
const orderIds = [crypto.randomUUID(), crypto.randomUUID()];
const jobIds = [crypto.randomUUID(), crypto.randomUUID()];
const leaseOwner = 'bill05-concurrency-worker';
let monthlyProductId;

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const asRole = async (role, callback) =>
  sql.begin(async (transaction) => {
    await transaction.unsafe(`set local role ${role}`);
    return callback(transaction);
  });

async function signup() {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const response = await fetch(`${localUrl}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: anonKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        email: `bill05-concurrency-${crypto.randomUUID()}@example.test`,
        password: 'BILL-05-only-local-probe-password-123!',
      }),
    });
    const body = await response.json();
    if (response.ok && body.user?.id) return body.user.id;
    if (response.status !== 502 || attempt === 30)
      throw new Error(`Local Auth signup failed (${response.status})`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('unreachable');
}

const facts = {
  status: 'paid',
  provider_user_id: 'bill05-concurrency-user',
  external_plan_id: 'bill05-concurrency-plan',
  product_type: 'subscription',
  sku_ids: [],
  purchase_months: 1,
  total_amount: '19.90',
  show_amount: '19.90',
  currency: 'CNY',
  custom_order_id: `bill05-concurrency-${checkoutId}`,
};

try {
  await sql`grant job_executor to postgres`;
  userId = await signup();
  await asRole('domain_owner', async (transaction) => {
    const [monthlyProduct] = await transaction`
      select id from public.subscription_products where code = 'monthly'
    `;
    assert(monthlyProduct?.id, 'monthly subscription product is required');
    monthlyProductId = monthlyProduct.id;
    await transaction`
      insert into public.platforms (id, code, name)
      values (${platformId}, ${`bill05-concurrency-${platformId.slice(0, 8)}`}, 'BILL-05 concurrency fixture')
    `;
    await transaction`
      insert into public.plans (id, platform_id, code, name, kind, features)
      values (${planId}, ${platformId}, 'paid', 'Paid', 'paid', '{}'::jsonb)
    `;
    await transaction`
      update public.platform_subscription_config
      set paid_plan_id = ${planId}, monthly_enabled = true
      where platform_id = ${platformId}
    `;
    await transaction`
      insert into public.platform_accounts (id, platform_id, user_id, status)
      values (${accountId}, ${platformId}, ${userId}, 'active')
    `;
    await transaction`
      insert into public.billing_provider_accounts (id, provider, name, status, secret_reference)
      values (${providerAccountId}, 'afdian', 'BILL-05 concurrency fixture', 'disabled', 'test-secret-reference')
    `;
    await transaction`
      insert into public.billing_provider_products (
        id, provider_account_id, subscription_product_id, external_plan_id, product_type,
        external_sku_ids, sku_count, purchase_months, expected_show_amount, expected_total_amount,
        price_version, mapping_version, validation_status, published, enabled
      ) values (
        ${providerProductId}, ${providerAccountId}, ${monthlyProductId}, 'bill05-concurrency-plan',
        'subscription', '{}'::text[], 0, 1, 19.90, 19.90, 1, 1, 'verified', true, true
      )
    `;
    await transaction`
      insert into public.billing_checkout_intents (
        id, platform_id, platform_account_id, subscription_product_id, entitlement_plan_id,
        provider_account_id, provider_product_id, product_code, term_kind_snapshot,
        duration_value_snapshot, duration_unit_snapshot, price_amount, price_version,
        mapping_version, custom_order_id, idempotency_key_hash, request_hash, expires_at
      ) values (
        ${checkoutId}, ${platformId}, ${accountId}, ${monthlyProductId}, ${planId},
        ${providerAccountId}, ${providerProductId}, 'monthly', 'finite', 1, 'month', 19.90,
        1, 1, ${facts.custom_order_id}, ${Buffer.alloc(32, 0x11)}, ${Buffer.alloc(32, 0x22)}, now() + interval '30 minutes'
      )
    `;
    for (let index = 0; index < orderIds.length; index += 1) {
      await transaction`
        insert into public.billing_orders (
          id, provider_account_id, provider_order_no, checkout_intent_id, platform_id,
          platform_account_id, subscription_product_id, linkage_status
        ) values (
          ${orderIds[index]}, ${providerAccountId}, ${`bill05-concurrency-order-${index + 1}`},
          ${checkoutId}, ${platformId}, ${accountId}, ${monthlyProductId}, 'linked'
        )
      `;
      await transaction`
        insert into public.billing_processing_jobs (
          id, job_kind, billing_order_id, state, attempts, lease_owner, lease_until, fence
        ) values (
          ${jobIds[index]}, 'order_verification', ${orderIds[index]}, 'processing', 1,
          ${leaseOwner}, now() + interval '1 minute', 1
        )
      `;
    }
  });

  const settle = (jobId, orderId) =>
    asRole('job_executor', async (transaction) => {
      const [result] = await transaction`
        select * from private.billing_order_verify_and_settle(
          row(${crypto.randomUUID()}, ${leaseOwner}, 1, ${crypto.randomUUID()})::private.job_context,
          ${jobId}, ${orderId}, 1, ${sql.json(facts)}
        )
      `;
      return result;
    });

  const results = await Promise.all(
    orderIds.map((orderId, index) => settle(jobIds[index], orderId)),
  );
  const decisions = results.map((result) => result.decision_code).sort();
  assert(
    decisions.join(',') === 'duplicate_payment,granted',
    `concurrent settlement decisions are ${decisions.join(',')}`,
  );

  const summary = await asRole('domain_owner', async (transaction) => {
    const [row] = await transaction`
      select
        (select count(*) from public.billing_settlements where checkout_intent_id = ${checkoutId})::integer as settlements,
        (select count(*) from public.billing_settlements where checkout_intent_id = ${checkoutId} and settlement_kind = 'automatic')::integer as automatic_settlements,
        (select count(*) from public.billing_settlements where checkout_intent_id = ${checkoutId} and settlement_kind = 'manual')::integer as manual_settlements,
        (select count(*) from public.subscription_grants where billing_order_id = any(${orderIds}::uuid[]))::integer as grants,
        (select status from public.billing_checkout_intents where id = ${checkoutId}) as checkout_status,
        (select count(*) from public.billing_processing_jobs where id = any(${jobIds}::uuid[]) and state = 'completed')::integer as completed_jobs,
        (select count(*) from public.billing_processing_jobs where id = any(${jobIds}::uuid[]) and state = 'manual_review')::integer as review_jobs
    `;
    return row;
  });

  assert(
    summary.settlements === 2,
    'both provider orders retain settlement history',
  );
  assert(
    summary.automatic_settlements === 1,
    'one automatic settlement owns the checkout slot',
  );
  assert(
    summary.manual_settlements === 1,
    'the concurrent second payment is manual',
  );
  assert(summary.grants === 1, 'concurrent settlement grants exactly once');
  assert(
    summary.checkout_status === 'granted',
    'checkout reaches granted exactly once',
  );
  assert(summary.completed_jobs === 1, 'the winning job completes');
  assert(summary.review_jobs === 1, 'the losing job requires manual review');

  console.log(
    JSON.stringify({
      settlementConcurrency: 'PASS',
      decisions,
      settlements: summary.settlements,
      grants: summary.grants,
      completedJobs: summary.completed_jobs,
      reviewJobs: summary.review_jobs,
    }),
  );
} finally {
  const cleanup = async (label, query) => {
    try {
      await query();
    } catch (error) {
      console.error(`cleanup ${label} failed: ${error.message}`);
    }
  };
  await cleanup(
    'audit logs',
    () => sql`delete from public.audit_logs where platform_id = ${platformId}`,
  );
  await cleanup(
    'subscription events',
    () =>
      sql`delete from public.subscription_events where platform_id = ${platformId}`,
  );
  await cleanup(
    'settlements',
    () =>
      sql`delete from public.billing_settlements where platform_id = ${platformId}`,
  );
  await cleanup(
    'grants',
    () =>
      sql`delete from public.subscription_grants where platform_id = ${platformId}`,
  );
  await cleanup(
    'processing jobs',
    () =>
      sql`delete from public.billing_processing_jobs where billing_order_id = any(${orderIds}::uuid[])`,
  );
  await cleanup(
    'orders',
    () =>
      sql`delete from public.billing_orders where platform_id = ${platformId}`,
  );
  await cleanup(
    'checkout intents',
    () =>
      sql`delete from public.billing_checkout_intents where platform_id = ${platformId}`,
  );
  await cleanup(
    'subscriptions',
    () =>
      sql`delete from public.subscriptions where platform_id = ${platformId}`,
  );
  await cleanup(
    'provider products',
    () =>
      sql`delete from public.billing_provider_products where provider_account_id = ${providerAccountId}`,
  );
  await cleanup(
    'provider account',
    () =>
      sql`delete from public.billing_provider_accounts where id = ${providerAccountId}`,
  );
  await cleanup(
    'subscription config',
    () =>
      sql`delete from public.platform_subscription_config where platform_id = ${platformId}`,
  );
  await cleanup(
    'platform account',
    () => sql`delete from public.platform_accounts where id = ${accountId}`,
  );
  await cleanup(
    'plan',
    () => sql`delete from public.plans where id = ${planId}`,
  );
  await cleanup(
    'platform',
    () => sql`delete from public.platforms where id = ${platformId}`,
  );
  if (userId)
    await fetch(`${localUrl}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { apikey: secretKey, Authorization: `Bearer ${secretKey}` },
    }).catch(() => undefined);
  await sql.end({ timeout: 1 }).catch(() => undefined);
}
