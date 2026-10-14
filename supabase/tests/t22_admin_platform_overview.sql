begin;

select plan(20);

select has_function(
  'private',
  'admin_platform_overview',
  array['private.admin_context', 'uuid', 'integer'],
  'Admin platform overview reader exists'
);
select ok(
  has_function_privilege(
    'admin_executor',
    'private.admin_platform_overview(private.admin_context, uuid, integer)',
    'execute'
  ),
  'admin executor can read platform overview'
);
select ok(
  not has_function_privilege(
    'account_executor',
    'private.admin_platform_overview(private.admin_context, uuid, integer)',
    'execute'
  )
  and not has_function_privilege(
    'job_executor',
    'private.admin_platform_overview(private.admin_context, uuid, integer)',
    'execute'
  ),
  'non-Admin executors cannot read platform overview'
);
select ok(
  (select prosecdef from pg_proc
   where oid = 'private.admin_platform_overview(private.admin_context, uuid, integer)'::regprocedure)
  and (
    select array_to_string(proconfig, ',') like 'search_path=pg_catalog%'
    from pg_proc
    where oid = 'private.admin_platform_overview(private.admin_context, uuid, integer)'::regprocedure
  ),
  'platform overview reader is a pinned security definer'
);
select has_function(
  'private',
  'commerce_active_paid_entitlements',
  array['uuid', 'timestamp with time zone'],
  'shared active paid entitlement helper exists'
);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000004100', 'authenticated', 'authenticated', 'overview-admin@example.invalid', 'not-a-real-password', now(), now()),
  ('00000000-0000-4000-8000-000000004101', 'authenticated', 'authenticated', 'overview-a@example.invalid', 'not-a-real-password', now(), now()),
  ('00000000-0000-4000-8000-000000004102', 'authenticated', 'authenticated', 'overview-b@example.invalid', 'not-a-real-password', now(), now()),
  ('00000000-0000-4000-8000-000000004103', 'authenticated', 'authenticated', 'overview-c@example.invalid', 'not-a-real-password', now(), now());

insert into private.system_admin (user_id)
values ('00000000-0000-4000-8000-000000004100')
on conflict (user_id) do update set state = 'active';

insert into auth.sessions (id, user_id, created_at, updated_at, not_after)
values (
  '00000000-0000-4000-8000-000000004110',
  '00000000-0000-4000-8000-000000004100',
  now(), now(), now() + interval '1 hour'
);

insert into public.platforms (id, code, name)
values
  ('00000000-0000-4000-8000-000000004120', 'overview-main', 'Overview Main'),
  ('00000000-0000-4000-8000-000000004121', 'overview-other', 'Overview Other');

insert into public.platform_accounts (
  id, platform_id, user_id, status, created_at, activated_at, suspended_at,
  closed_at, anonymized_at
)
values
  (
    '00000000-0000-4000-8000-000000004130',
    '00000000-0000-4000-8000-000000004120',
    '00000000-0000-4000-8000-000000004101',
    'active', now() - interval '2 days', now() - interval '2 days', null, null, null
  ),
  (
    '00000000-0000-4000-8000-000000004131',
    '00000000-0000-4000-8000-000000004120',
    '00000000-0000-4000-8000-000000004102',
    'suspended', now() - interval '10 days', now() - interval '10 days',
    now() - interval '1 day', null, null
  ),
  (
    '00000000-0000-4000-8000-000000004132',
    '00000000-0000-4000-8000-000000004120',
    null,
    'closed', now() - interval '20 days', now() - interval '20 days', null,
    now() - interval '1 day', now() - interval '1 day'
  ),
  (
    '00000000-0000-4000-8000-000000004133',
    '00000000-0000-4000-8000-000000004120',
    '00000000-0000-4000-8000-000000004103',
    'active', now() - interval '30 days', now() - interval '30 days', null, null, null
  );

insert into public.plans (id, platform_id, code, name, kind, status)
values (
  '00000000-0000-4000-8000-000000004140',
  '00000000-0000-4000-8000-000000004120',
  'overview-pro', 'Overview Pro', 'paid', 'active'
);

insert into public.subscriptions (
  id, platform_id, platform_account_id, plan_id, status, started_at,
  current_period_end
)
values
  (
    '00000000-0000-4000-8000-000000004150',
    '00000000-0000-4000-8000-000000004120',
    '00000000-0000-4000-8000-000000004130',
    '00000000-0000-4000-8000-000000004140',
    'active', now() - interval '5 days', now() + interval '25 days'
  ),
  (
    '00000000-0000-4000-8000-000000004151',
    '00000000-0000-4000-8000-000000004120',
    '00000000-0000-4000-8000-000000004133',
    '00000000-0000-4000-8000-000000004140',
    'active', now() - interval '30 days', now() - interval '1 day'
  ),
  (
    '00000000-0000-4000-8000-000000004152',
    '00000000-0000-4000-8000-000000004120',
    '00000000-0000-4000-8000-000000004131',
    '00000000-0000-4000-8000-000000004140',
    'active', now() - interval '5 days', now() + interval '25 days'
  );

insert into public.subscription_grants(
  id, platform_id, platform_account_id, plan_id, source, operation_id,
  starts_at, ends_at, created_by, reason
)
values
  (
    '00000000-0000-4000-8000-000000004153',
    '00000000-0000-4000-8000-000000004120',
    '00000000-0000-4000-8000-000000004130',
    '00000000-0000-4000-8000-000000004140', 'admin',
    '00000000-0000-4000-8000-000000004154',
    now() - interval '5 days', now() + interval '25 days',
    '00000000-0000-4000-8000-000000004100', 'overview active fixture'
  ),
  (
    '00000000-0000-4000-8000-000000004155',
    '00000000-0000-4000-8000-000000004120',
    '00000000-0000-4000-8000-000000004131',
    '00000000-0000-4000-8000-000000004140', 'admin',
    '00000000-0000-4000-8000-000000004156',
    now() - interval '5 days', now() + interval '25 days',
    '00000000-0000-4000-8000-000000004100', 'overview suspended fixture'
  );

insert into public.billing_provider_accounts (
  id, provider, name, status, secret_reference
)
values (
  '00000000-0000-4000-8000-000000004160',
  'afdian', 'Overview Fixture', 'disabled', 'fixture://overview'
);

insert into public.billing_orders (
  id, provider_account_id, provider_order_no, platform_id,
  platform_account_id, provider_status, verification_status,
  entitlement_status, linkage_status, resolution_status, provider_paid_at,
  created_at, updated_at
)
values
  (
    '00000000-0000-4000-8000-000000004170',
    '00000000-0000-4000-8000-000000004160', 'overview-current-granted',
    '00000000-0000-4000-8000-000000004120',
    '00000000-0000-4000-8000-000000004130', 'paid', 'verified',
    'granted', 'unlinked', 'open', now() - interval '2 days',
    now() - interval '2 days', now() - interval '2 days'
  ),
  (
    '00000000-0000-4000-8000-000000004171',
    '00000000-0000-4000-8000-000000004160', 'overview-current-attention',
    '00000000-0000-4000-8000-000000004120',
    '00000000-0000-4000-8000-000000004131', 'paid', 'unverified',
    'blocked', 'unlinked', 'open', now() - interval '3 days',
    now() - interval '3 days', now() - interval '3 days'
  ),
  (
    '00000000-0000-4000-8000-000000004172',
    '00000000-0000-4000-8000-000000004160', 'overview-previous-granted',
    '00000000-0000-4000-8000-000000004120',
    '00000000-0000-4000-8000-000000004133', 'paid', 'verified',
    'granted', 'unlinked', 'open', now() - interval '10 days',
    now() - interval '10 days', now() - interval '10 days'
  ),
  (
    '00000000-0000-4000-8000-000000004173',
    '00000000-0000-4000-8000-000000004160', 'overview-other-platform',
    '00000000-0000-4000-8000-000000004121',
    null, 'paid', 'verified', 'granted', 'unlinked', 'open',
    now() - interval '1 day', now() - interval '1 day', now() - interval '1 day'
  );

set local role admin_executor;
create temporary table platform_overview_snapshot on commit drop as
select *
from private.admin_platform_overview(
  row(
    '00000000-0000-4000-8000-000000004100'::uuid,
    '00000000-0000-4000-8000-000000004110'::uuid,
    '00000000-0000-4000-8000-000000004180'::uuid
  )::private.admin_context,
  '00000000-0000-4000-8000-000000004120'::uuid,
  7
);
create temporary table commerce_summary_snapshot on commit drop as
select *
from private.admin_commerce_summary(
  row(
    '00000000-0000-4000-8000-000000004100'::uuid,
    '00000000-0000-4000-8000-000000004110'::uuid,
    '00000000-0000-4000-8000-000000004181'::uuid
  )::private.admin_context,
  '00000000-0000-4000-8000-000000004120'::uuid,
  now() - interval '7 days',
  now() + interval '1 minute'
);
set local role postgres;

select is((select total_accounts from platform_overview_snapshot), 4::bigint, 'all platform accounts are counted');
select ok(
  (select active_accounts = 2 and suspended_accounts = 1 and closed_accounts = 1
   from platform_overview_snapshot),
  'current account states are counted independently'
);
select ok(
  (select new_accounts = 1 and previous_new_accounts = 1
    and period_closed_accounts = 1 and previous_closed_accounts = 0
   from platform_overview_snapshot),
  'current and previous seven-day account windows are distinct'
);
select ok(
  (select net_accounts = 0 and previous_net_accounts = 1
   from platform_overview_snapshot),
  'net account change is derived from new minus closed'
);
select is(
  (select count(distinct s.platform_account_id)::bigint
   from public.subscriptions s
   join public.plans p on p.platform_id = s.platform_id and p.id = s.plan_id
   where s.platform_id = '00000000-0000-4000-8000-000000004120'
     and s.status = 'active' and p.kind = 'paid'
     and s.started_at <= now()
     and (s.current_period_end is null or s.current_period_end > now())),
  2::bigint,
  'fixture proves the retired subscription-only paid algorithm would over-count a suspended account'
);
select is(
  (select count(*)::bigint from private.commerce_active_paid_entitlements(
    '00000000-0000-4000-8000-000000004120'::uuid, now()
  )),
  1::bigint,
  'shared paid entitlement helper excludes the suspended account'
);
select is((select active_paid_accounts from platform_overview_snapshot), 1::bigint, 'expired paid projection is not counted active');
select is(
  (select active_paid_accounts from platform_overview_snapshot),
  (select active_paid_entitlement_accounts from commerce_summary_snapshot),
  'Overview and Commerce Summary consume the same paid entitlement fact'
);
select ok(
  (select orders = 2 and previous_orders = 1
    and granted_orders = 1 and previous_granted_orders = 1
   from platform_overview_snapshot),
  'orders and granted orders use platform and period boundaries'
);
select ok(
  (select attention_orders = 1 and previous_attention_orders = 0
   from platform_overview_snapshot),
  'attention orders reflect blocked or unresolved paid facts without cross-platform leakage'
);
select is((select period_days from platform_overview_snapshot), 7, 'requested period is projected');
select ok(
  (select period_end - period_start = interval '7 days'
    and period_start - previous_start = interval '7 days'
   from platform_overview_snapshot),
  'current and previous period boundaries are adjacent and equal length'
);

select throws_ok(
  $$select * from private.admin_platform_overview(
    row(
      '00000000-0000-4000-8000-000000004100'::uuid,
      '00000000-0000-4000-8000-000000004110'::uuid,
      gen_random_uuid()
    )::private.admin_context,
    '00000000-0000-4000-8000-000000004120'::uuid,
    14
  )$$,
  '22023', 'invalid_input',
  'unsupported period is rejected'
);
select throws_ok(
  $$select * from private.admin_platform_overview(
    row(
      '00000000-0000-4000-8000-000000004100'::uuid,
      '00000000-0000-4000-8000-000000004110'::uuid,
      gen_random_uuid()
    )::private.admin_context,
    '00000000-0000-4000-8000-000000004199'::uuid,
    30
  )$$,
  'P0002', 'resource_not_found',
  'missing platform is rejected'
);

update auth.sessions
set not_after = now() - interval '1 minute'
where id = '00000000-0000-4000-8000-000000004110';
select throws_ok(
  $$select * from private.admin_platform_overview(
    row(
      '00000000-0000-4000-8000-000000004100'::uuid,
      '00000000-0000-4000-8000-000000004110'::uuid,
      gen_random_uuid()
    )::private.admin_context,
    '00000000-0000-4000-8000-000000004120'::uuid,
    30
  )$$,
  '42501', 'admin_required',
  'expired Admin session cannot read platform overview'
);

select * from finish();

rollback;
