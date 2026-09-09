import postgres from 'postgres';

const databaseUrl = process.env.SUPABASE_DB_URL;

if (!databaseUrl) {
  throw new Error('SUPABASE_DB_URL is required');
}

const sql = postgres(databaseUrl, {
  max: 1,
  prepare: false,
  onnotice: () => undefined,
});

const platformA = crypto.randomUUID();
const platformB = crypto.randomUUID();
const freePlanA = crypto.randomUUID();
const paidPlanA = crypto.randomUUID();
const freePlanB = crypto.randomUUID();
const tombstoneAccount = crypto.randomUUID();

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

const expectAutocommitSqlState = async (query, expectedState, message) => {
  try {
    await query();
  } catch (error) {
    assert(error.code === expectedState, `${message}: got ${error.code}`);
    return;
  }
  throw new Error(`${message}: statement unexpectedly succeeded`);
};

try {
  {
    await sql`
      insert into public.platforms (id, code, name)
      values
        (${platformA}, 't08-platform-a', 'T08 Platform A'),
        (${platformB}, 't08-platform-b', 'T08 Platform B')
    `;
    await sql`
      insert into public.plans (id, platform_id, code, name, kind)
      values
        (${freePlanA}, ${platformA}, 'free', 'Free', 'free'),
        (${paidPlanA}, ${platformA}, 'pro', 'Pro', 'paid'),
        (${freePlanB}, ${platformB}, 'free', 'Free', 'free')
    `;

    await sql`
      update public.platforms
      set default_plan_id = ${freePlanA}
      where id = ${platformA}
    `;
    await sql`
      update public.platforms
      set default_plan_id = ${freePlanB}
      where id = ${platformB}
    `;

    await expectSqlState(
      () => sql`
        update public.platforms
        set default_plan_id = ${freePlanB}
        where id = ${platformA}
      `,
      '23503',
      'cross-platform default plan is rejected',
    );
    await expectSqlState(
      () => sql`
        update public.platforms
        set default_plan_id = ${paidPlanA}
        where id = ${platformA}
      `,
      '23503',
      'paid plan cannot become the default Free plan',
    );

    await sql`
      insert into public.platform_accounts (id, platform_id, status, user_id, anonymized_at)
      values (${tombstoneAccount}, ${platformA}, 'closed', null, now())
    `;
    await expectSqlState(
      () => sql`
        insert into public.platform_accounts (platform_id, status, user_id)
        values (${platformA}, 'active', null)
      `,
      '23514',
      'active account without identity is rejected',
    );
    await expectSqlState(
      () => sql`
        insert into public.platform_accounts (platform_id, status, user_id)
        values (${platformA}, 'closed', null)
      `,
      '23514',
      'closed account without anonymization timestamp is rejected',
    );

    await sql`
      insert into public.platform_profiles (platform_account_id)
      values (${tombstoneAccount})
    `;
    await sql`
      insert into public.platform_preferences (platform_account_id)
      values (${tombstoneAccount})
    `;
    const [versions] = await sql`
      select p.row_version as profile_version, q.row_version as preferences_version
      from public.platform_profiles p
      join public.platform_preferences q using (platform_account_id)
      where p.platform_account_id = ${tombstoneAccount}
    `;
    assert(
      String(versions.profile_version) === '1' &&
        String(versions.preferences_version) === '1',
      'profile/preferences row_version defaults to 1',
    );

    const [before] = await sql`
      select updated_at
      from public.platform_profiles
      where platform_account_id = ${tombstoneAccount}
    `;
    await new Promise((resolve) => setTimeout(resolve, 10));
    await sql`
      update public.platform_profiles
      set display_name = 'T08 updated'
      where platform_account_id = ${tombstoneAccount}
    `;
    const [after] = await sql`
      select updated_at
      from public.platform_profiles
      where platform_account_id = ${tombstoneAccount}
    `;
    assert(
      after.updated_at > before.updated_at,
      'updated_at trigger advances on update',
    );
  }

  await sql`set role anon`;
  await expectAutocommitSqlState(
    () => sql`select count(*) from public.platforms`,
    '42501',
    'anon cannot read core tables by default',
  );
  await sql`reset role`;

  console.log(
    JSON.stringify({
      crossPlatformDefault: 'PASS',
      defaultFreeKind: 'PASS',
      tombstoneChecks: 'PASS',
      rowVersionDefaults: 'PASS',
      updatedAtTrigger: 'PASS',
      runtimeDefaultDeny: 'PASS',
    }),
  );
} finally {
  await sql`reset role`;
  await sql`delete from public.platform_profiles where platform_account_id = ${tombstoneAccount}`;
  await sql`delete from public.platform_preferences where platform_account_id = ${tombstoneAccount}`;
  await sql`delete from public.platform_accounts where id = ${tombstoneAccount}`;
  for (const platformId of [platformA, platformB]) {
    await sql`update public.platforms set default_plan_id = null where id = ${platformId}`;
  }
  for (const planId of [freePlanA, paidPlanA, freePlanB]) {
    await sql`delete from public.plans where id = ${planId}`;
  }
  for (const platformId of [platformA, platformB]) {
    await sql`delete from public.platforms where id = ${platformId}`;
  }
  await sql.end({ timeout: 5 });
}
