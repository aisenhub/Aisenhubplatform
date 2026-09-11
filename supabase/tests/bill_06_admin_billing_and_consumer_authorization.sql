begin;

select plan(30);

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

select * from finish();

rollback;
