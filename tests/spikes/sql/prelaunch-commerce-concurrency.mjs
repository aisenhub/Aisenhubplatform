import postgres from 'postgres';

const databaseUrl = process.env.SUPABASE_DB_URL;
if (!databaseUrl) throw new Error('SUPABASE_DB_URL is required');

const sql = postgres(databaseUrl, {
  max: 8,
  prepare: false,
  onnotice: () => undefined,
});

const adminUserId = crypto.randomUUID();
const sessionId = crypto.randomUUID();
const platformId = crypto.randomUUID();
const planId = crypto.randomUUID();
const offerId = crypto.randomUUID();
const providerAccountId = crypto.randomUUID();
let previousSystemAdminId = null;

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const asAdmin = async (callback) =>
  sql.begin(async (transaction) => {
    await transaction.unsafe('set local role admin_executor');
    return callback(transaction);
  });

try {
  await sql`grant admin_executor to postgres`;
  const [previousSystemAdmin] =
    await sql`select user_id from private.system_admin where singleton_id = 1`;
  previousSystemAdminId = previousSystemAdmin?.user_id ?? null;

  await sql`
    insert into auth.users(id,aud,role,email,encrypted_password,created_at,updated_at)
    values(
      ${adminUserId},'authenticated','authenticated',
      ${`prelaunch-commerce-concurrency-${adminUserId}@example.invalid`},'x',now(),now()
    )
  `;
  await sql`
    insert into auth.sessions(id,user_id,created_at,updated_at,not_after)
    values(${sessionId},${adminUserId},now(),now(),now()+interval '1 hour')
  `;
  await sql`
    insert into private.system_admin(singleton_id,user_id)
    values(1,${adminUserId})
    on conflict(singleton_id) do update set user_id=excluded.user_id,updated_at=now()
  `;
  await sql`
    insert into public.platforms(id,code,name,status,allow_activation)
    values(
      ${platformId},${`commerce-concurrency-${platformId.slice(0, 8)}`},
      'Commerce concurrency fixture','active',true
    )
  `;
  await sql`
    insert into public.plans(id,platform_id,code,name,kind,status,features)
    values(${planId},${platformId},'paid','Paid','paid','active','{}'::jsonb)
  `;
  await sql`
    insert into public.platform_commercial_offers(
      id,platform_id,plan_id,code,name,duration_value,duration_unit,status,recommended
    ) values(
      ${offerId},${platformId},${planId},'concurrent-month','Concurrent Month',
      1,'month','draft',false
    )
  `;
  await sql`
    insert into public.billing_provider_accounts(
      id,provider,name,status,secret_reference
    ) values(
      ${providerAccountId},'afdian','Commerce concurrency provider','disabled',
      'fixture://commerce-concurrency'
    )
  `;

  const createPrice = (amount) =>
    asAdmin(async (transaction) => {
      const requestId = crypto.randomUUID();
      const [row] = await transaction`
        select result.* from private.admin_commercial_price_create(
          row(${adminUserId},${sessionId},${requestId})::private.admin_context,
          ${platformId},${offerId},${amount},'CNY'
        ) as result
      `;
      return row;
    });

  const prices = await Promise.all([
    createPrice('29.90'),
    createPrice('39.90'),
  ]);
  const versions = prices
    .map((price) => Number(price.version))
    .sort((a, b) => a - b);
  assert(
    versions.join(',') === '1,2',
    `concurrent Price versions are ${versions.join(',')}`,
  );

  const mappingPriceId = prices[0].id;
  const createMapping = (externalPlanId) =>
    asAdmin(async (transaction) => {
      const requestId = crypto.randomUUID();
      const [row] = await transaction`
        select result.* from private.admin_commercial_mapping_upsert(
          row(${adminUserId},${sessionId},${requestId})::private.admin_context,
          ${platformId},null::uuid,${providerAccountId},${mappingPriceId},
          ${externalPlanId},'subscription','{}'::text[],1,'verified'
        ) as result
      `;
      return row;
    });

  const mappings = await Promise.all([
    createMapping('concurrent-provider-plan-a'),
    createMapping('concurrent-provider-plan-b'),
  ]);
  const mappingVersions = mappings
    .map((mapping) => Number(mapping.mapping_version))
    .sort((a, b) => a - b);
  assert(
    mappingVersions.join(',') === '1,2',
    `concurrent Mapping versions are ${mappingVersions.join(',')}`,
  );

  const publish = (price) =>
    asAdmin(async (transaction) => {
      const requestId = crypto.randomUUID();
      const [row] = await transaction`
        select result.* from private.admin_commercial_price_command(
          row(${adminUserId},${sessionId},${requestId})::private.admin_context,
          ${platformId},${price.id},'publish',${crypto.randomUUID()},
          ${`concurrent publish v${price.version}`}
        ) as result
      `;
      return row;
    });

  const publishResults = await Promise.allSettled(
    prices.map((price) => publish(price)),
  );
  assert(
    publishResults.every((result) => result.status === 'fulfilled'),
    `concurrent publish produced a raw failure: ${publishResults
      .filter((result) => result.status === 'rejected')
      .map((result) => result.reason?.message ?? String(result.reason))
      .join('; ')}`,
  );

  const publishedFacts = await sql`
    select id,version,status
    from public.platform_commercial_prices
    where platform_id=${platformId} and offer_id=${offerId}
    order by version
  `;
  const active = publishedFacts.filter((price) => price.status === 'active');
  const retired = publishedFacts.filter((price) => price.status === 'retired');
  assert(
    active.length === 1,
    `expected one active Price, found ${active.length}`,
  );
  assert(
    retired.length === 1,
    `expected one retired Price, found ${retired.length}`,
  );

  console.log(
    JSON.stringify({
      prelaunchCommerceConcurrency: 'PASS',
      priceVersions: versions,
      mappingVersions,
      finalActivePriceVersion: Number(active[0].version),
      finalRetiredPriceVersion: Number(retired[0].version),
      concurrentPublishCalls: publishResults.length,
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
    () => sql`delete from public.audit_logs where platform_id=${platformId}`,
  );
  await cleanup(
    'admin idempotency',
    () =>
      sql`delete from private.admin_idempotency where admin_user_id=${adminUserId}`,
  );
  await cleanup(
    'provider mappings',
    () =>
      sql`delete from public.billing_provider_products where provider_account_id=${providerAccountId}`,
  );
  await cleanup(
    'provider account',
    () =>
      sql`delete from public.billing_provider_accounts where id=${providerAccountId}`,
  );
  await cleanup(
    'prices',
    () =>
      sql`delete from public.platform_commercial_prices where platform_id=${platformId}`,
  );
  await cleanup(
    'offers',
    () =>
      sql`delete from public.platform_commercial_offers where platform_id=${platformId}`,
  );
  await cleanup(
    'commerce policy',
    () =>
      sql`delete from public.platform_commerce_policy where platform_id=${platformId}`,
  );
  await cleanup(
    'plans',
    () => sql`delete from public.plans where platform_id=${platformId}`,
  );
  await cleanup(
    'platform',
    () => sql`delete from public.platforms where id=${platformId}`,
  );
  await cleanup('system admin restore', async () => {
    if (previousSystemAdminId) {
      await sql`
        update private.system_admin
        set user_id=${previousSystemAdminId},updated_at=now()
        where singleton_id=1
      `;
    } else {
      await sql`delete from private.system_admin where user_id=${adminUserId}`;
    }
  });
  await cleanup(
    'admin session',
    () => sql`delete from auth.sessions where id=${sessionId}`,
  );
  await cleanup(
    'admin user',
    () => sql`delete from auth.users where id=${adminUserId}`,
  );
  await sql.end({ timeout: 1 }).catch(() => undefined);
}
