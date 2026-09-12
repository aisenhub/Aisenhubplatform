begin;

select plan(44);

select has_column('public', 'billing_checkout_intents', 'custom_order_id', 'checkout has custom order binding');
select has_column('public', 'billing_orders', 'custom_order_id', 'order stores custom order observation');
select has_column('public', 'billing_orders', 'provider_facts', 'order stores normalized provider facts');
select has_column('public', 'billing_settlements', 'decision_code', 'settlement stores decision code');
select has_table('public', 'billing_reconciliation_cursors', 'reconciliation cursor table exists');
select ok((select relforcerowsecurity from pg_class where oid = 'public.billing_reconciliation_cursors'::regclass), 'reconciliation cursor forces RLS');

select has_function('private', 'billing_order_verify_and_settle', array['private.job_context', 'uuid', 'uuid', 'bigint', 'jsonb'], 'verify and settle wrapper exists');
select has_function('private', 'billing_reconciliation_cursor_update', array['private.job_context', 'uuid', 'text', 'bigint', 'timestamp with time zone', 'text', 'text', 'boolean', 'text'], 'reconciliation cursor wrapper exists');
select has_function('private', 'billing_order_query_target', array['private.job_context', 'uuid', 'uuid', 'bigint'], 'query target wrapper exists');
select ok(has_function_privilege('job_executor', 'private.billing_order_verify_and_settle(private.job_context, uuid, uuid, bigint, jsonb)', 'execute'), 'job executor can verify through wrapper');
select ok(has_function_privilege('job_executor', 'private.billing_reconciliation_cursor_update(private.job_context, uuid, text, bigint, timestamp with time zone, text, text, boolean, text)', 'execute'), 'job executor can update cursor through wrapper');
select ok(has_function_privilege('job_executor', 'private.billing_order_query_target(private.job_context, uuid, uuid, bigint)', 'execute'), 'job executor can query target through wrapper');
select ok(pg_get_functiondef('private.entitlement_apply(uuid, uuid, uuid, text, uuid, integer, text, uuid, text, uuid)'::regprocedure) like '%billing_order_id%', 'shared entitlement entry supports billing order source');
select ok(pg_get_functiondef('private.billing_order_verify_and_settle(private.job_context, uuid, uuid, bigint, jsonb)'::regprocedure) like '%entitlement_apply%', 'settlement delegates Grant write to shared entry');
select ok(pg_get_functiondef('private.billing_order_verify_and_settle(private.job_context, uuid, uuid, bigint, jsonb)'::regprocedure) like '%manual_review%', 'contract failures enter manual review');
select ok(pg_get_functiondef('private.billing_order_verify_and_settle(private.job_context, uuid, uuid, bigint, jsonb)'::regprocedure) like '%duplicate_payment%', 'second payment is not auto-granted');
select ok(pg_get_functiondef('private.billing_order_verify_and_settle(private.job_context, uuid, uuid, bigint, jsonb)'::regprocedure) like '%expected_show_amount%', 'verification compares exact mapped amounts');

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values ('00000000-0000-4000-8000-000000000501', 'authenticated', 'authenticated', 'bill05@example.invalid', 'not-a-real-password', now(), now());
insert into public.platforms (id, code, name)
values ('00000000-0000-4000-8000-000000000502', 'bill05-fixture', 'BILL-05 fixture');
insert into public.plans (id, platform_id, code, name, kind, features)
values ('00000000-0000-4000-8000-000000000503', '00000000-0000-4000-8000-000000000502', 'paid', 'Paid', 'paid', '{}'::jsonb);
insert into public.platform_accounts (id, platform_id, user_id, status)
values ('00000000-0000-4000-8000-000000000504', '00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-000000000501', 'active');
update public.platform_subscription_config
set paid_plan_id = '00000000-0000-4000-8000-000000000503', monthly_enabled = true
where platform_id = '00000000-0000-4000-8000-000000000502';
insert into public.billing_provider_accounts (id, provider, name, status, secret_reference)
values ('00000000-0000-4000-8000-000000000505', 'afdian', 'BILL-05 fixture', 'active', 'test-secret-reference');
insert into public.billing_provider_products (
  id, provider_account_id, subscription_product_id, external_plan_id, product_type,
  external_sku_ids, sku_count, purchase_months, expected_show_amount, expected_total_amount,
  price_version, mapping_version, validation_status, published, enabled
) values (
  '00000000-0000-4000-8000-000000000506', '00000000-0000-4000-8000-000000000505',
  (select id from public.subscription_products where code = 'monthly'), 'plan-monthly',
  'subscription', '{}'::text[], 0, 1, 9.90, 9.90, 2, 1, 'verified', true, true
);
insert into public.billing_checkout_intents (
  id, platform_id, platform_account_id, subscription_product_id, entitlement_plan_id,
  provider_account_id, provider_product_id, product_code, term_kind_snapshot,
  duration_value_snapshot, duration_unit_snapshot, price_amount, price_version,
  mapping_version, custom_order_id, token_key_version, token_digest,
  idempotency_key_hash, request_hash, expires_at
) values (
  '00000000-0000-4000-8000-000000000507', '00000000-0000-4000-8000-000000000502',
  '00000000-0000-4000-8000-000000000504',
  (select id from public.subscription_products where code = 'monthly'),
  '00000000-0000-4000-8000-000000000503', '00000000-0000-4000-8000-000000000505',
  '00000000-0000-4000-8000-000000000506', 'monthly', 'finite', 1, 'month', 9.90,
  2, 1, 'bill05-custom-order', 1, decode(repeat('ab', 32), 'hex'),
  decode(repeat('cd', 32), 'hex'), decode(repeat('ef', 32), 'hex'), now() + interval '30 minutes'
);
insert into public.billing_orders (
  id, provider_account_id, provider_order_no, checkout_intent_id, platform_id,
  platform_account_id, subscription_product_id, linkage_status
) values (
  '00000000-0000-4000-8000-000000000508', '00000000-0000-4000-8000-000000000505',
  'provider-order-1', '00000000-0000-4000-8000-000000000507',
  '00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-000000000504',
  (select id from public.subscription_products where code = 'monthly'), 'linked'
);
insert into public.billing_processing_jobs (
  id, job_kind, billing_order_id, state, attempts, lease_owner, lease_until, fence
) values (
  '00000000-0000-4000-8000-000000000509', 'order_verification',
  '00000000-0000-4000-8000-000000000508', 'processing', 1, 'bill05-worker', now() + interval '1 minute', 1
);

select is(
  (select entitlement_status from private.billing_order_verify_and_settle(
    row('00000000-0000-4000-8000-000000000510', 'bill05-worker', 1, '00000000-0000-4000-8000-000000000511')::private.job_context,
    '00000000-0000-4000-8000-000000000509', '00000000-0000-4000-8000-000000000508', 1,
    '{"status":"paid","provider_user_id":"provider-user-1","external_plan_id":"plan-monthly","product_type":"subscription","sku_ids":[],"purchase_months":1,"total_amount":"9.90","show_amount":"9.90","currency":"CNY","custom_order_id":"bill05-custom-order"}'::jsonb
  )), 'granted', 'a matching provider observation grants once'
);
select is((select verification_status from public.billing_orders where id = '00000000-0000-4000-8000-000000000508'), 'verified', 'matching order is verified');
select is((select entitlement_status from public.billing_orders where id = '00000000-0000-4000-8000-000000000508'), 'granted', 'order records granted effect');
select is((select linkage_status from public.billing_orders where id = '00000000-0000-4000-8000-000000000508'), 'linked', 'order remains linked to checkout');
select is((select source from public.subscription_grants where billing_order_id = '00000000-0000-4000-8000-000000000508'), 'billing_order', 'grant uses billing order source');
select is((select billing_order_id from public.subscription_grants where billing_order_id = '00000000-0000-4000-8000-000000000508'), '00000000-0000-4000-8000-000000000508'::uuid, 'grant has strong order identity');
select is((select state from public.billing_settlements where billing_order_id = '00000000-0000-4000-8000-000000000508'), 'finalized', 'settlement is finalized after grant');
select is((select settlement_kind from public.billing_settlements where billing_order_id = '00000000-0000-4000-8000-000000000508'), 'automatic', 'first matching payment uses automatic settlement');
select is((select status from public.billing_checkout_intents where id = '00000000-0000-4000-8000-000000000507'), 'granted', 'checkout reflects grant state');
select is((select custom_order_id from public.billing_checkout_intents where id = '00000000-0000-4000-8000-000000000507'), 'bill05-custom-order', 'checkout custom binding is preserved');
select is((select state from public.billing_processing_jobs where id = '00000000-0000-4000-8000-000000000509'), 'completed', 'processing job completes after settlement');
select is((select count(*)::integer from public.subscription_grants where billing_order_id = '00000000-0000-4000-8000-000000000508'), 1, 'repeated settlement has one grant');

insert into public.billing_orders (
  id, provider_account_id, provider_order_no, checkout_intent_id, platform_id,
  platform_account_id, subscription_product_id, linkage_status
) values (
  '00000000-0000-4000-8000-000000000514', '00000000-0000-4000-8000-000000000505',
  'provider-order-2', '00000000-0000-4000-8000-000000000507',
  '00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-000000000504',
  (select id from public.subscription_products where code = 'monthly'), 'linked'
);
insert into public.billing_processing_jobs (
  id, job_kind, billing_order_id, state, attempts, lease_owner, lease_until, fence
) values (
  '00000000-0000-4000-8000-000000000515', 'order_verification',
  '00000000-0000-4000-8000-000000000514', 'processing', 1, 'bill05-worker', now() + interval '1 minute', 1
);
select is(
  (select decision_code from private.billing_order_verify_and_settle(
    row('00000000-0000-4000-8000-000000000516', 'bill05-worker', 1, '00000000-0000-4000-8000-000000000517')::private.job_context,
    '00000000-0000-4000-8000-000000000515', '00000000-0000-4000-8000-000000000514', 1,
    '{"status":"paid","provider_user_id":"provider-user-1","external_plan_id":"plan-monthly","product_type":"subscription","sku_ids":[],"purchase_months":1,"total_amount":"9.90","show_amount":"9.90","currency":"CNY","custom_order_id":"bill05-custom-order"}'::jsonb
  )), 'duplicate_payment', 'a second payment for one checkout is manual');
select is((select settlement_kind from public.billing_settlements where billing_order_id = '00000000-0000-4000-8000-000000000514'), 'manual', 'duplicate payment uses manual settlement');
select is((select state from public.billing_processing_jobs where id = '00000000-0000-4000-8000-000000000515'), 'manual_review', 'duplicate payment stops in manual review');

insert into public.billing_orders (
  id, provider_account_id, provider_order_no, checkout_intent_id, platform_id,
  platform_account_id, subscription_product_id, linkage_status
) values (
  '00000000-0000-4000-8000-000000000518', '00000000-0000-4000-8000-000000000505',
  'provider-order-3', '00000000-0000-4000-8000-000000000507',
  '00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-000000000504',
  (select id from public.subscription_products where code = 'monthly'), 'linked'
);
insert into public.billing_processing_jobs (
  id, job_kind, billing_order_id, state, attempts, lease_owner, lease_until, fence
) values (
  '00000000-0000-4000-8000-000000000519', 'order_verification',
  '00000000-0000-4000-8000-000000000518', 'processing', 1, 'bill05-worker', now() + interval '1 minute', 1
);
select is(
  (select decision_code from private.billing_order_verify_and_settle(
    row('00000000-0000-4000-8000-000000000520', 'bill05-worker', 1, '00000000-0000-4000-8000-000000000521')::private.job_context,
    '00000000-0000-4000-8000-000000000519', '00000000-0000-4000-8000-000000000518', 1,
    '{"status":"paid","provider_user_id":"provider-user-1","external_plan_id":"plan-monthly","product_type":"subscription","sku_ids":[],"purchase_months":1,"total_amount":"9.90","show_amount":"8.90","currency":"CNY","custom_order_id":"bill05-custom-order"}'::jsonb
  )), 'contract_conflict', 'a mapped amount mismatch is manual');
select is((select settlement_kind from public.billing_settlements where billing_order_id = '00000000-0000-4000-8000-000000000518'), 'manual', 'contract mismatch uses manual settlement');
select is((select state from public.billing_processing_jobs where id = '00000000-0000-4000-8000-000000000519'), 'manual_review', 'contract mismatch stops in manual review');

insert into public.billing_provider_products (
  id, provider_account_id, subscription_product_id, external_plan_id, product_type,
  external_sku_ids, sku_count, purchase_months, expected_show_amount, expected_total_amount,
  price_version, mapping_version, validation_status, published, enabled
) values (
  '00000000-0000-4000-8000-000000000522', '00000000-0000-4000-8000-000000000505',
  (select id from public.subscription_products where code = 'lifetime'), 'sale-plan-lifetime',
  '1', array['sale-sku-lifetime']::text[], 1, null, 49.90, 49.90, 2, 1, 'verified', true, true
);
insert into public.billing_checkout_intents (
  id, platform_id, platform_account_id, subscription_product_id, entitlement_plan_id,
  provider_account_id, provider_product_id, product_code, term_kind_snapshot,
  duration_value_snapshot, duration_unit_snapshot, price_amount, price_version,
  mapping_version, custom_order_id, token_key_version, token_digest,
  idempotency_key_hash, request_hash, expires_at
) values (
  '00000000-0000-4000-8000-000000000523', '00000000-0000-4000-8000-000000000502',
  '00000000-0000-4000-8000-000000000504',
  (select id from public.subscription_products where code = 'lifetime'),
  '00000000-0000-4000-8000-000000000503', '00000000-0000-4000-8000-000000000505',
  '00000000-0000-4000-8000-000000000522', 'lifetime', 'finite', 99, 'year', 49.90,
  2, 1, 'bill05-sale-custom-order', 1, decode(repeat('12', 32), 'hex'),
  decode(repeat('34', 32), 'hex'), decode(repeat('56', 32), 'hex'), now() + interval '30 minutes'
);
insert into public.billing_orders (
  id, provider_account_id, provider_order_no, checkout_intent_id, platform_id,
  platform_account_id, subscription_product_id, linkage_status
) values (
  '00000000-0000-4000-8000-000000000524', '00000000-0000-4000-8000-000000000505',
  'provider-sale-order', '00000000-0000-4000-8000-000000000523',
  '00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-000000000504',
  (select id from public.subscription_products where code = 'lifetime'), 'linked'
);
insert into public.billing_processing_jobs (
  id, job_kind, billing_order_id, state, attempts, lease_owner, lease_until, fence
) values (
  '00000000-0000-4000-8000-000000000525', 'order_verification',
  '00000000-0000-4000-8000-000000000524', 'processing', 1, 'bill05-worker', now() + interval '1 minute', 1
);
select is(
  (select entitlement_status from private.billing_order_verify_and_settle(
    row('00000000-0000-4000-8000-000000000526', 'bill05-worker', 1, '00000000-0000-4000-8000-000000000527')::private.job_context,
    '00000000-0000-4000-8000-000000000525', '00000000-0000-4000-8000-000000000524', 1,
    '{"status":"paid","provider_user_id":"provider-user-1","external_plan_id":"sale-plan-lifetime","product_type":"1","sku_ids":["sale-sku-lifetime"],"purchase_months":12,"total_amount":"49.90","show_amount":"49.90","currency":"CNY","custom_order_id":"bill05-sale-custom-order"}'::jsonb
  )), 'granted', 'sale product does not treat provider month as the local entitlement term'
);
select is((select verification_status from public.billing_orders where id = '00000000-0000-4000-8000-000000000524'), 'verified', 'sale product order is verified');
select is((select settlement_kind from public.billing_settlements where billing_order_id = '00000000-0000-4000-8000-000000000524'), 'automatic', 'sale product uses automatic settlement');
select is((select state from public.billing_processing_jobs where id = '00000000-0000-4000-8000-000000000525'), 'completed', 'sale product job completes after settlement');
select is((select count(*)::integer from public.subscription_grants where billing_order_id = '00000000-0000-4000-8000-000000000524'), 1, 'sale product creates one grant');

select is(
  (select version from private.billing_reconciliation_cursor_update(
    row('00000000-0000-4000-8000-000000000512', 'bill05-worker', 1, '00000000-0000-4000-8000-000000000513')::private.job_context,
    '00000000-0000-4000-8000-000000000505', 'discovery', 0, now(), 'provider-order-1', 'cursor-1', true, null
  )), 1::bigint, 'first discovery cursor starts at version one'
);
select is((select stream from public.billing_reconciliation_cursors), 'discovery', 'cursor stores the stream');
select is((select high_water_order_no from public.billing_reconciliation_cursors), 'provider-order-1', 'cursor stores high water order');
select throws_ok(
  $$select * from private.billing_reconciliation_cursor_update(
    row('00000000-0000-4000-8000-000000000512', 'bill05-worker', 1, '00000000-0000-4000-8000-000000000513')::private.job_context,
    '00000000-0000-4000-8000-000000000505', 'discovery', 0, now(), 'provider-order-2', 'cursor-2', true, null
  )$$,
  '40001', 'cursor_conflict', 'stale cursor version is rejected'
);

select * from finish();

rollback;
