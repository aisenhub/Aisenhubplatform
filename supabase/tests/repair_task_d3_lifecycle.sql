begin;

select plan(24);

select has_column(
  'public', 'platform_subscription_config', 'purchases_paused',
  'subscription config exposes an independent purchase pause'
);
select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.billing_checkout_intents'::regclass
      and tgname = 'billing_checkout_intents_lifecycle_guard'
  ),
  'checkout lifecycle guard exists'
);
select ok(
  pg_get_functiondef('private.billing_checkout_lifecycle_guard()'::regprocedure)
    like '%purchases_paused%',
  'checkout lifecycle guard checks the purchase pause'
);
select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.plans'::regclass
      and tgname = 'plans_archived_immutable'
  ),
  'archived Plan immutability trigger exists'
);
select ok(
  not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.plans'::regclass
      and tgname = 'plans_prevent_enabled_subscription_archive'
  ),
  'legacy enabled-flag archive blocker is removed'
);
select has_function(
  'private', 'admin_subscription_config_read_v2', array['private.admin_context', 'uuid'],
  'v2 Admin subscription config read exists'
);
select has_function(
  'private', 'admin_subscription_config_patch_v2',
  array['private.admin_context', 'uuid', 'bigint', 'uuid', 'boolean', 'boolean', 'boolean', 'boolean', 'text', 'text'],
  'v2 Admin subscription config patch exists'
);
select has_table('private', 'account_retention_policy', 'retention policy table exists');
select ok(
  (select relforcerowsecurity from pg_class where oid = 'private.account_retention_policy'::regclass),
  'retention policy forces RLS'
);
select has_function('private', 'account_retention_cutoff', array['timestamptz'], 'retention cutoff exists');
select ok(
  pg_get_functiondef('private.account_retention_cleanup(private.job_context, uuid, timestamptz, integer)'::regprocedure)
    like '%account_retention_cutoff%',
  'retention cleanup uses the explicit policy cutoff'
);
select ok(
  pg_get_functiondef('private.account_retention_cleanup(private.job_context, uuid, timestamptz, integer)'::regprocedure)
    not like '%delete from public.billing_%',
  'retention cleanup does not delete durable billing facts'
);
select throws_ok(
  $$select * from private.account_retention_cutoff(null::timestamptz)$$,
  'P0001', 'retention_policy_not_configured',
  'retention policy is fail-closed before configuration'
);

insert into private.account_retention_policy (
  personal_data_retention_days, policy_source, policy_reference
)
values (90, 'fixture', 'D3 test policy');
select is(
  (select retention_days from private.account_retention_cutoff(null::timestamptz)),
  90,
  'configured retention policy controls anonymization cutoff'
);

insert into public.platforms (id, code, name, status)
values (
  '00000000-0000-4000-8000-000000009301',
  'repair-d3', 'Repair D3', 'active'
);
insert into public.plans (id, platform_id, code, name, kind, status, features)
values (
  '00000000-0000-4000-8000-000000009302',
  '00000000-0000-4000-8000-000000009301',
  'repair-d3-paid', 'Repair D3 Paid', 'paid', 'active', '{}'::jsonb
);
update public.plans
set status = 'archived'
where id = '00000000-0000-4000-8000-000000009302';
select is(
  (select status from public.plans where id = '00000000-0000-4000-8000-000000009302'),
  'archived',
  'active Plan can be archived'
);
select throws_ok(
  $$update public.plans set name = 'must-not-change' where id = '00000000-0000-4000-8000-000000009302'$$,
  'P0001', 'plan_archived_immutable',
  'archived Plan cannot be modified'
);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values (
  '00000000-0000-4000-8000-000000009303', 'authenticated', 'authenticated',
  'repair-d3@example.invalid', 'not-a-real-password', now(), now()
);
insert into public.platform_accounts (
  id, platform_id, user_id, status, closed_at
) values (
  '00000000-0000-4000-8000-000000009304',
  '00000000-0000-4000-8000-000000009301',
  '00000000-0000-4000-8000-000000009303', 'closed',
  clock_timestamp() - interval '100 days'
);
insert into public.platform_profiles (
  platform_account_id, display_name, avatar_url, bio, locale, timezone, metadata
) values (
  '00000000-0000-4000-8000-000000009304',
  'Personal Name', 'https://example.invalid/avatar', 'Personal Bio',
  'zh-CN', 'Asia/Shanghai', '{"email":"redact-me"}'::jsonb
);
insert into public.platform_preferences (platform_account_id, preferences)
values ('00000000-0000-4000-8000-000000009304', '{"theme":"dark"}'::jsonb);
insert into public.audit_logs (
  request_id, actor_type, actor_user_id, platform_id, platform_account_id,
  event_type, target_type, target_id, ip, user_agent, metadata
) values (
  '00000000-0000-4000-8000-000000009305', 'user',
  '00000000-0000-4000-8000-000000009303',
  '00000000-0000-4000-8000-000000009301',
  '00000000-0000-4000-8000-000000009304',
  'profile.updated', 'platform_account', '00000000-0000-4000-8000-000000009304',
  '192.0.2.10'::inet, 'fixture-agent', '{"email":"redact-me"}'::jsonb
);

select is(
  (select count(*) from private.account_retention_candidates(null, null, 20)
   where platform_account_id = '00000000-0000-4000-8000-000000009304'),
  1::bigint,
  'closed account past configured cutoff is a retention candidate'
);
select is(
  (select action from private.account_retention_cleanup(
    row(
      '00000000-0000-4000-8000-000000009306', 'repair-d3-worker', 1,
      '00000000-0000-4000-8000-000000009307'
    )::private.job_context,
    '00000000-0000-4000-8000-000000009304', null, 60
  )),
  'cleaned',
  'retention cleanup anonymizes an eligible closed account'
);
select ok(
  (select user_id is null and anonymized_at is not null
   from public.platform_accounts
   where id = '00000000-0000-4000-8000-000000009304'),
  'account tombstone remains while personal identity is detached'
);
select is(
  (select display_name from public.platform_profiles
   where platform_account_id = '00000000-0000-4000-8000-000000009304'),
  null,
  'profile identity is anonymized'
);
select is(
  (select preferences from public.platform_preferences
   where platform_account_id = '00000000-0000-4000-8000-000000009304'),
  '{}'::jsonb,
  'account preferences are minimized'
);
select is(
  (select actor_user_id from public.audit_logs where event_type = 'profile.updated'
   and platform_account_id = '00000000-0000-4000-8000-000000009304'),
  null,
  'historical audit actor identity is anonymized'
);
select is(
  (select event_type from public.audit_logs where event_type = 'profile.updated'
   and platform_account_id = '00000000-0000-4000-8000-000000009304'),
  'profile.updated',
  'historical audit event fact is retained'
);
select is(
  (select (metadata ->> 'personal_data_retention_days')::integer
   from public.audit_logs
   where event_type = 'account.retention_cleaned'
     and platform_account_id = '00000000-0000-4000-8000-000000009304'),
  90,
  'cleanup audit records the configured retention period'
);

select * from finish();

rollback;
