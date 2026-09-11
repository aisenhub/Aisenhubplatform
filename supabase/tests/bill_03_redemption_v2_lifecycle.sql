begin;

select plan(40);

insert into public.platforms (id, code, name)
values ('00000000-0000-4000-8000-000000000201', 'bill03-fixture', 'BILL-03 fixture');
insert into public.plans (id, platform_id, code, name, kind, features)
values ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000201', 'paid-one', 'Paid One', 'paid', '{}'::jsonb);

insert into public.redemption_code_batches (
  id, platform_id, plan_id, name, quantity, duration_value, duration_unit,
  expires_at, delivery_deadline, creation_operation_id, model_version,
  product_code, term_kind_snapshot, duration_value_snapshot, duration_unit_snapshot
) values (
  '00000000-0000-4000-8000-000000000203',
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000202',
  'V2 monthly fixture', 1, 1, 'month', now() + interval '30 days',
  now() + interval '1 hour', '00000000-0000-4000-8000-000000000204', 2,
  'monthly', 'finite', 1, 'month'
);

select has_column('public', 'redemption_code_batches', 'model_version', 'batch model version exists');
select has_column('public', 'redemption_code_batches', 'product_code', 'batch product snapshot exists');
select has_column('public', 'redemption_code_batches', 'term_kind_snapshot', 'batch term snapshot exists');
select has_column('public', 'redemption_code_batches', 'duration_value_snapshot', 'batch duration value snapshot exists');
select has_column('public', 'redemption_code_batches', 'duration_unit_snapshot', 'batch duration unit snapshot exists');
select is((select model_version from public.redemption_code_batches where id = '00000000-0000-4000-8000-000000000203'), 2::smallint, 'new fixture is V2');
select is((select product_code from public.redemption_code_batches where id = '00000000-0000-4000-8000-000000000203'), 'monthly', 'product code is snapshotted');
select is((select duration_value_snapshot from public.redemption_code_batches where id = '00000000-0000-4000-8000-000000000203'), 1, 'duration value is snapshotted');
select is((select duration_unit_snapshot from public.redemption_code_batches where id = '00000000-0000-4000-8000-000000000203'), 'month', 'duration unit is snapshotted');
select throws_ok(
  $$update public.redemption_code_batches set product_code = 'yearly' where id = '00000000-0000-4000-8000-000000000203'$$,
  'P0001', 'redemption_batch_snapshot_immutable', 'V2 product snapshot cannot mutate'
);

select has_function('private', 'admin_batch_create_v2', array['private.admin_context', 'uuid', 'text', 'text', 'integer', 'timestamp with time zone', 'timestamp with time zone', 'uuid', 'text', 'jsonb'], 'V2 batch create exists');
select has_function('private', 'admin_entitlement_correction_preview', array['private.admin_context', 'uuid', 'uuid', 'uuid'], 'correction preview exists');
select has_function('private', 'admin_entitlement_correction_apply', array['private.admin_context', 'uuid', 'uuid', 'uuid', 'bigint', 'uuid', 'integer', 'text', 'uuid', 'text'], 'correction apply exists');
select has_table('public', 'subscription_grant_corrections', 'correction relation exists');
select ok((select relforcerowsecurity from pg_class where oid = 'public.subscription_grant_corrections'::regclass), 'correction relation forces RLS');
select ok(exists (select 1 from pg_policy where polrelid = 'public.subscription_grant_corrections'::regclass and polname = 'subscription_grant_corrections_domain_owner'), 'correction relation has domain owner policy');
select ok(not has_table_privilege('admin_executor', 'public.redemption_code_batches', 'insert'), 'admin executor cannot insert batches directly');
select ok(not has_table_privilege('admin_executor', 'public.subscription_grant_corrections', 'insert'), 'admin executor cannot insert corrections directly');
select ok(has_function_privilege('admin_executor', 'private.admin_batch_create_v2(private.admin_context, uuid, text, text, integer, timestamp with time zone, timestamp with time zone, uuid, text, jsonb)', 'execute'), 'admin executor can create V2 batches through wrapper');
select ok(has_function_privilege('admin_executor', 'private.admin_entitlement_correction_preview(private.admin_context, uuid, uuid, uuid)', 'execute'), 'admin executor can preview corrections');
select ok(has_function_privilege('admin_executor', 'private.admin_entitlement_correction_apply(private.admin_context, uuid, uuid, uuid, bigint, uuid, integer, text, uuid, text)', 'execute'), 'admin executor can apply corrections');
select ok(not has_function_privilege('account_executor', 'private.admin_batch_create_v2(private.admin_context, uuid, text, text, integer, timestamp with time zone, timestamp with time zone, uuid, text, jsonb)', 'execute'), 'account executor cannot create V2 batches');
select ok((select prosecdef from pg_proc where oid = 'private.admin_batch_create_v2(private.admin_context, uuid, text, text, integer, timestamp with time zone, timestamp with time zone, uuid, text, jsonb)'::regprocedure), 'V2 batch create is security definer');
select ok((select array_to_string(proconfig, ',') like 'search_path=pg_catalog%' from pg_proc where oid = 'private.admin_batch_create_v2(private.admin_context, uuid, text, text, integer, timestamp with time zone, timestamp with time zone, uuid, text, jsonb)'::regprocedure), 'V2 batch create pins search_path');
select ok((select prosecdef from pg_proc where oid = 'private.admin_entitlement_correction_apply(private.admin_context, uuid, uuid, uuid, bigint, uuid, integer, text, uuid, text)'::regprocedure), 'correction apply is security definer');
select ok((select array_to_string(proconfig, ',') like 'search_path=pg_catalog%' from pg_proc where oid = 'private.admin_entitlement_correction_apply(private.admin_context, uuid, uuid, uuid, bigint, uuid, integer, text, uuid, text)'::regprocedure), 'correction apply pins search_path');
select ok(pg_get_functiondef('private.admin_batch_create_v2(private.admin_context, uuid, text, text, integer, timestamp with time zone, timestamp with time zone, uuid, text, jsonb)'::regprocedure) like '%product_code%', 'V2 create derives term from product code');
select ok(pg_get_functiondef('private.admin_batch_create_v2(private.admin_context, uuid, text, text, integer, timestamp with time zone, timestamp with time zone, uuid, text, jsonb)'::regprocedure) like '%lifetime%', 'V2 create accepts the finite lifetime product');
select ok(pg_get_functiondef('private.admin_entitlement_correction_apply(private.admin_context, uuid, uuid, uuid, bigint, uuid, integer, text, uuid, text)'::regprocedure) like '%precondition_failed%', 'correction apply checks preview version');
select ok(pg_get_functiondef('private.admin_entitlement_correction_apply(private.admin_context, uuid, uuid, uuid, bigint, uuid, integer, text, uuid, text)'::regprocedure) like '%correction_exists%', 'correction apply prevents a second active chain');
select ok(pg_get_functiondef('private.admin_entitlement_correction_apply(private.admin_context, uuid, uuid, uuid, bigint, uuid, integer, text, uuid, text)'::regprocedure) like '%entitlement_apply%', 'correction uses the shared entitlement write entry');
select ok(pg_get_functiondef('private.admin_entitlement_correction_apply(private.admin_context, uuid, uuid, uuid, bigint, uuid, integer, text, uuid, text)'::regprocedure) like '%admin_entitlement_command%', 'correction uses the audited admin command entry');
select ok(exists (select 1 from pg_constraint where conname = 'redemption_batch_snapshot_check'), 'V2 snapshot check rejects free and custom durations');
select ok(exists (select 1 from pg_trigger where tgrelid = 'public.redemption_code_batches'::regclass and tgname = 'redemption_batch_snapshot_guard'), 'batch snapshot guard is installed');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.subscription_grant_corrections'::regclass and contype = 'u' and pg_get_constraintdef(oid) like '%original_grant_id%'), 'one correction chain per original grant');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.subscription_grant_corrections'::regclass and contype = 'f' and pg_get_constraintdef(oid) like '%subscription_grants%'), 'correction links remain strong grant FKs');
select ok(pg_get_functiondef('private.admin_batch_list(private.admin_context, uuid, integer)'::regprocedure) like '%product_code%', 'batch list exposes product snapshot');
select ok(pg_get_functiondef('private.admin_batch_list(private.admin_context, uuid, integer)'::regprocedure) like '%model_version%', 'batch list exposes model version');
select ok(pg_get_functiondef('private.admin_entitlement_correction_preview(private.admin_context, uuid, uuid, uuid)'::regprocedure) like '%later_grant_count%', 'correction preview reports later grants');
select ok(pg_get_functiondef('private.admin_entitlement_correction_apply(private.admin_context, uuid, uuid, uuid, bigint, uuid, integer, text, uuid, text)'::regprocedure) like '%expected_event_sequence%', 'correction records expected event sequence');

select * from finish();

rollback;
