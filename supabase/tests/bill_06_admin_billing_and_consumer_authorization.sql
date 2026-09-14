begin;

select plan(41);

select has_column('public', 'billing_orders', 'admin_version', 'orders have an optimistic admin version');
select has_column('public', 'billing_processing_jobs', 'operation_id', 'billing jobs have operation identity');
select ok(exists (select 1 from pg_class where relname = 'billing_processing_jobs_operation_idx' and relkind = 'i'), 'billing operations are idempotent');
select has_function('private', 'billing_admin_assert', array['private.admin_context'], 'billing admin guard exists');
select has_function('private', 'admin_billing_order_list', array['private.admin_context', 'timestamp with time zone', 'integer', 'text'], 'billing order list exists');
select has_function('private', 'admin_billing_order_read', array['private.admin_context', 'uuid'], 'billing order read exists');
select has_function('private', 'admin_billing_metrics', array['private.admin_context'], 'billing metrics exists');
select has_function('private', 'admin_billing_provider_product_list', array['private.admin_context', 'uuid'], 'provider product list exists');
select has_function('private', 'admin_billing_order_requery', array['private.admin_context', 'uuid', 'uuid', 'bigint', 'text'], 'billing requery exists');
select has_function('private', 'admin_billing_order_resolve', array['private.admin_context', 'uuid', 'uuid', 'bigint', 'text', 'text'], 'billing resolve exists');
select ok(has_function_privilege('admin_executor', 'private.admin_billing_order_list(private.admin_context, timestamp with time zone, integer, text)', 'execute'), 'admin can list billing orders');
select ok(has_function_privilege('admin_executor', 'private.admin_billing_order_read(private.admin_context, uuid)', 'execute'), 'admin can read billing orders');
select ok(has_function_privilege('admin_executor', 'private.admin_billing_order_requery(private.admin_context, uuid, uuid, bigint, text)', 'execute'), 'admin can requery billing orders');
select ok(has_function_privilege('admin_executor', 'private.admin_billing_order_resolve(private.admin_context, uuid, uuid, bigint, text, text)', 'execute'), 'admin can resolve billing orders');
select ok(not has_function_privilege('account_executor', 'private.admin_billing_order_requery(private.admin_context, uuid, uuid, bigint, text)', 'execute'), 'account executor cannot requery billing orders');
select ok(not has_table_privilege('admin_executor', 'public.billing_orders', 'update'), 'admin executor cannot update billing orders directly');
select ok(not has_table_privilege('admin_executor', 'public.billing_processing_jobs', 'insert'), 'admin executor cannot insert billing jobs directly');
select ok((select prosecdef from pg_proc where oid = 'private.admin_billing_order_requery(private.admin_context, uuid, uuid, bigint, text)'::regprocedure), 'requery is security definer');
select ok((select prosecdef from pg_proc where oid = 'private.admin_billing_order_resolve(private.admin_context, uuid, uuid, bigint, text, text)'::regprocedure), 'resolve is security definer');
select ok(pg_get_functiondef('private.admin_billing_order_requery(private.admin_context, uuid, uuid, bigint, text)'::regprocedure) like '%audit_append%', 'requery is audited');
select ok(
  pg_get_functiondef('private.admin_billing_order_resolve(private.admin_context, uuid, uuid, bigint, text, text)'::regprocedure) like '%expected_version%'
  and pg_get_functiondef('private.admin_billing_order_resolve(private.admin_context, uuid, uuid, bigint, text, text)'::regprocedure) like '%admin_idempotency%',
  'resolve checks version and persists idempotent operation'
);
select ok(pg_get_functiondef('private.admin_billing_order_resolve(private.admin_context, uuid, uuid, bigint, text, text)'::regprocedure) like '%settlement_required%', 'resolve requires a settlement');
select ok((select array_to_string(proconfig, ',') like 'search_path=pg_catalog%' from pg_proc where oid = 'private.admin_billing_order_list(private.admin_context, timestamp with time zone, integer, text)'::regprocedure), 'billing list pins search path');
select ok((select relforcerowsecurity from pg_class where oid = 'public.billing_orders'::regclass), 'billing orders keep forced RLS');
select ok((select relforcerowsecurity from pg_class where oid = 'public.billing_processing_jobs'::regclass), 'billing jobs keep forced RLS');
select ok(exists (select 1 from pg_trigger where tgname = 'billing_orders_admin_version'), 'billing order versions advance in one trigger');
select ok(pg_get_functiondef('private.admin_billing_order_requery(private.admin_context, uuid, uuid, bigint, text)'::regprocedure) like '%reconciliation%', 'requery creates reconciliation work');
select ok(pg_get_functiondef('private.admin_billing_order_resolve(private.admin_context, uuid, uuid, bigint, text, text)'::regprocedure) like '%resolution_status%', 'resolve records order resolution');
select ok(pg_get_functiondef('private.admin_billing_metrics(private.admin_context)'::regprocedure) like '%duplicate_payment%', 'metrics expose duplicate payments');
select ok(pg_get_functiondef('private.admin_billing_order_read(private.admin_context, uuid)'::regprocedure) like '%provider_facts%', 'order read exposes normalized facts');
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.billing_settlements'::regclass
      and conname = 'billing_settlements_scope_check'
  ),
  'settlements explicitly separate unlinked scope from linked scope'
);
select ok(
  pg_get_functiondef('private.admin_billing_order_list(private.admin_context, timestamp with time zone, integer, text)'::regprocedure) like '%unlinked%',
  'admin list exposes an unlinked filter'
);
select ok(
  pg_get_functiondef('private.admin_billing_order_resolve(private.admin_context, uuid, uuid, bigint, text, text)'::regprocedure) like '%global%',
  'unlinked resolution uses global idempotency scope'
);
select ok(
  pg_get_functiondef('private.admin_billing_order_resolve(private.admin_context, uuid, uuid, bigint, text, text)'::regprocedure) like '%settlement_scope_conflict%',
  'admin resolution validates unlinked settlement scope'
);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values ('00000000-0000-4000-8000-000000000601', 'authenticated', 'authenticated', 'bill06-admin@example.invalid', 'not-a-real-password', now(), now());
insert into private.system_admin (user_id)
values ('00000000-0000-4000-8000-000000000601');
insert into auth.sessions (id, user_id, created_at, updated_at, not_after)
values (
  '00000000-0000-4000-8000-000000000602',
  '00000000-0000-4000-8000-000000000601', now(), now(), now() + interval '1 hour'
);
insert into public.billing_provider_accounts (id, provider, name, status, secret_reference)
values ('00000000-0000-4000-8000-000000000603', 'afdian', 'BILL-06 fixture', 'active', 'test-secret-reference');
insert into public.billing_orders (
  id, provider_account_id, provider_order_no, provider_status, verification_status,
  entitlement_status, linkage_status
) values (
  '00000000-0000-4000-8000-000000000604',
  '00000000-0000-4000-8000-000000000603',
  'provider-order-admin-unlinked', 'paid', 'verified', 'blocked', 'unlinked'
);
insert into public.billing_processing_jobs (id, job_kind, billing_order_id, state, error_class, error_code)
values (
  '00000000-0000-4000-8000-000000000605', 'order_verification',
  '00000000-0000-4000-8000-000000000604', 'manual_review', 'billing_verification', 'unlinked_order'
);
insert into public.billing_settlements (
  billing_order_id, checkout_intent_id, platform_id, platform_account_id,
  settlement_kind, state, operation_id, decision_reason, decision_code
) values (
  '00000000-0000-4000-8000-000000000604', null, null, null,
  'manual', 'review_required', '00000000-0000-4000-8000-000000000606',
  'unlinked_order', 'unlinked_order'
);

select is(
  (select linkage_status from private.admin_billing_order_list(
    row('00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-000000000602', '00000000-0000-4000-8000-000000000607')::private.admin_context,
    null, 50, 'unlinked'
  ) where order_id = '00000000-0000-4000-8000-000000000604'),
  'unlinked', 'admin list returns unlinked payments in the dedicated queue'
);
select is(
  (select platform_id from private.admin_billing_order_read(
    row('00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-000000000602', '00000000-0000-4000-8000-000000000608')::private.admin_context,
    '00000000-0000-4000-8000-000000000604'
  )),
  null::uuid, 'admin read preserves empty platform ownership'
);
select is(
  (select resolution_status from private.admin_billing_order_resolve(
    row('00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-000000000602', '00000000-0000-4000-8000-000000000609')::private.admin_context,
    '00000000-0000-4000-8000-000000000604', '00000000-0000-4000-8000-000000000610', 1,
    'closed_anomaly', 'provider payment cannot be linked to a checkout'
  )),
  'resolved', 'admin can close an unlinked case without assigning ownership'
);
select is((select state from public.billing_settlements where billing_order_id = '00000000-0000-4000-8000-000000000604'), 'finalized', 'admin resolution finalizes only the manual settlement');
select is((select platform_id from private.admin_idempotency where operation = 'billing_order_resolve' and idempotency_key = '00000000-0000-4000-8000-000000000610'), null::uuid, 'unlinked resolution stores no platform in idempotency');
select is((select scope from private.admin_idempotency where operation = 'billing_order_resolve' and idempotency_key = '00000000-0000-4000-8000-000000000610'), 'global', 'unlinked resolution uses global idempotency scope');
select is((select state from public.billing_processing_jobs where id = '00000000-0000-4000-8000-000000000605'), 'completed', 'admin resolution closes the manual review job');

select * from finish();

rollback;
