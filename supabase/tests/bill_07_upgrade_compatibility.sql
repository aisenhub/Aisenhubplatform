begin;

-- This fixture represents rows written before BILL-03 added immutable V2
-- product snapshots. It deliberately omits every new snapshot column and
-- verifies that the current schema still reads the legacy plan/duration/HMAC
-- interpretation without rewriting it.
select plan(30);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values (
  '00000000-0000-4000-8000-000000000701', 'authenticated', 'authenticated',
  'bill07-upgrade@example.invalid', 'not-a-real-password', now(), now()
);
insert into public.platforms (id, code, name)
values ('00000000-0000-4000-8000-000000000702', 'bill07-upgrade', 'BILL-07 upgrade fixture');
insert into public.plans (id, platform_id, code, name, kind, features)
values (
  '00000000-0000-4000-8000-000000000703',
  '00000000-0000-4000-8000-000000000702',
  'legacy-paid', 'Legacy Paid', 'paid', '{"legacy":true}'::jsonb
);
insert into public.platform_accounts (id, platform_id, user_id, status)
values (
  '00000000-0000-4000-8000-000000000704',
  '00000000-0000-4000-8000-000000000702',
  '00000000-0000-4000-8000-000000000701', 'active'
);
insert into public.subscriptions (
  id, platform_id, platform_account_id, plan_id, status, started_at,
  current_period_end
) values (
  '00000000-0000-4000-8000-000000000705',
  '00000000-0000-4000-8000-000000000702',
  '00000000-0000-4000-8000-000000000704',
  '00000000-0000-4000-8000-000000000703', 'active', now(), now() + interval '1 month'
);
insert into public.subscription_grants (
  id, platform_id, platform_account_id, plan_id, source, operation_id,
  starts_at, ends_at, created_by, reason
) values (
  '00000000-0000-4000-8000-000000000706',
  '00000000-0000-4000-8000-000000000702',
  '00000000-0000-4000-8000-000000000704',
  '00000000-0000-4000-8000-000000000703', 'admin',
  '00000000-0000-4000-8000-000000000707', now(), null,
  '00000000-0000-4000-8000-000000000701', 'legacy grant fixture'
);
insert into public.subscription_events (
  id, platform_id, platform_account_id, subscription_id, sequence,
  event_type, grant_id, operation_id, actor_user_id, reason
) values (
  '00000000-0000-4000-8000-000000000708',
  '00000000-0000-4000-8000-000000000702',
  '00000000-0000-4000-8000-000000000704',
  '00000000-0000-4000-8000-000000000705', 1, 'granted',
  '00000000-0000-4000-8000-000000000706',
  '00000000-0000-4000-8000-000000000709',
  '00000000-0000-4000-8000-000000000701', 'legacy event fixture'
);

insert into public.redemption_code_batches (
  id, platform_id, plan_id, name, quantity, duration_value, duration_unit,
  expires_at, delivery_deadline, creation_operation_id
) values (
  '00000000-0000-4000-8000-000000000710',
  '00000000-0000-4000-8000-000000000702',
  '00000000-0000-4000-8000-000000000703',
  'Legacy monthly batch', 1, 1, 'month', now() + interval '30 days',
  now() + interval '1 hour', '00000000-0000-4000-8000-000000000712'
);
insert into public.redemption_codes (
  id, platform_id, batch_id, plan_id, code_hmac, hmac_key_version,
  code_prefix, code_suffix
) values (
  '00000000-0000-4000-8000-000000000711',
  '00000000-0000-4000-8000-000000000702',
  '00000000-0000-4000-8000-000000000710',
  '00000000-0000-4000-8000-000000000703', repeat('ab', 32), 1, 'ABCD', 'QRST'
);

select has_column('public', 'redemption_code_batches', 'model_version', 'upgrade adds batch model version');
select has_column('public', 'redemption_code_batches', 'product_code', 'upgrade adds product snapshot');
select is((select model_version from public.redemption_code_batches where id = '00000000-0000-4000-8000-000000000710'), 1::smallint, 'legacy batch defaults to model version 1');
select is((select product_code from public.redemption_code_batches where id = '00000000-0000-4000-8000-000000000710'), null, 'legacy batch keeps product snapshot null');
select is((select term_kind_snapshot from public.redemption_code_batches where id = '00000000-0000-4000-8000-000000000710'), null, 'legacy batch keeps term snapshot null');
select is((select duration_value_snapshot from public.redemption_code_batches where id = '00000000-0000-4000-8000-000000000710'), null, 'legacy batch keeps duration snapshot null');
select is((select plan_id from public.redemption_code_batches where id = '00000000-0000-4000-8000-000000000710'), '00000000-0000-4000-8000-000000000703'::uuid, 'legacy plan identity remains');
select is((select duration_value from public.redemption_code_batches where id = '00000000-0000-4000-8000-000000000710'), 1, 'legacy duration value remains');
select is((select duration_unit from public.redemption_code_batches where id = '00000000-0000-4000-8000-000000000710'), 'month', 'legacy duration unit remains');
select is((select code_hmac from public.redemption_codes where id = '00000000-0000-4000-8000-000000000711'), repeat('ab', 32), 'legacy HMAC material remains');
select is((select hmac_key_version from public.redemption_codes where id = '00000000-0000-4000-8000-000000000711'), 1::smallint, 'legacy HMAC key version remains');
select is((select count(*)::integer from public.redemption_code_batches where platform_id = '00000000-0000-4000-8000-000000000702'), 1, 'legacy batch count is preserved');
select is((select count(*)::integer from public.redemption_codes where platform_id = '00000000-0000-4000-8000-000000000702'), 1, 'legacy code count is preserved');
select is((select count(*)::integer from public.subscription_grants where platform_account_id = '00000000-0000-4000-8000-000000000704'), 1, 'legacy grant count is preserved');
select is((select count(*)::integer from public.subscription_events where platform_account_id = '00000000-0000-4000-8000-000000000704'), 1, 'legacy event count is preserved');
select is((select ends_at from public.subscription_grants where id = '00000000-0000-4000-8000-000000000706'), null, 'legacy admin grant remains finite-or-perpetual as stored');
select is((select event_type from public.subscription_events where id = '00000000-0000-4000-8000-000000000708'), 'granted', 'legacy event type remains');
select is((select status from public.subscriptions where id = '00000000-0000-4000-8000-000000000705'), 'active', 'legacy subscription remains active');
select throws_ok(
  $$update public.redemption_code_batches set duration_value = 2 where id = '00000000-0000-4000-8000-000000000710'$$,
  'P0001', 'redemption_batch_snapshot_immutable', 'legacy batch snapshot cannot be rewritten'
);

insert into public.redemption_code_batches (
  id, platform_id, plan_id, name, quantity, duration_value, duration_unit,
  expires_at, delivery_deadline, creation_operation_id, model_version,
  product_code, term_kind_snapshot, duration_value_snapshot, duration_unit_snapshot
) values (
  '00000000-0000-4000-8000-000000000713',
  '00000000-0000-4000-8000-000000000702',
  '00000000-0000-4000-8000-000000000703',
  'New monthly batch', 1, 1, 'month', now() + interval '30 days',
  now() + interval '1 hour', '00000000-0000-4000-8000-000000000714', 2,
  'monthly', 'finite', 1, 'month'
);
select is((select model_version from public.redemption_code_batches where id = '00000000-0000-4000-8000-000000000713'), 2::smallint, 'new batch uses model version 2');
select is((select product_code from public.redemption_code_batches where id = '00000000-0000-4000-8000-000000000713'), 'monthly', 'new batch snapshots product');
select is((select term_kind_snapshot from public.redemption_code_batches where id = '00000000-0000-4000-8000-000000000713'), 'finite', 'new batch snapshots term');
select is((select duration_value_snapshot from public.redemption_code_batches where id = '00000000-0000-4000-8000-000000000713'), 1, 'new batch snapshots duration');
select is((select count(*)::integer from public.redemption_code_batches where platform_id = '00000000-0000-4000-8000-000000000702'), 2, 'legacy and new batches coexist');
select is((select count(*)::integer from public.redemption_code_batches where model_version = 1), 1, 'legacy batch remains the only V1 row');
select throws_ok(
  $$update public.redemption_code_batches set product_code = 'yearly' where id = '00000000-0000-4000-8000-000000000713'$$,
  'P0001', 'redemption_batch_snapshot_immutable', 'new batch snapshot cannot be rewritten'
);
select has_function('private', 'entitlement_apply', array['uuid', 'uuid', 'uuid', 'text', 'uuid', 'integer', 'text', 'uuid', 'text', 'uuid'], 'shared entitlement write entry remains available');
select has_function('private', 'admin_batch_create_v2', array['private.admin_context', 'uuid', 'text', 'text', 'integer', 'timestamp with time zone', 'timestamp with time zone', 'uuid', 'text', 'jsonb'], 'new batch wrapper remains available');
select ok((select relforcerowsecurity from pg_class where oid = 'public.redemption_code_batches'::regclass), 'batch RLS remains forced');
select ok((select relforcerowsecurity from pg_class where oid = 'public.subscription_grants'::regclass), 'grant RLS remains forced');

select * from finish();

rollback;
