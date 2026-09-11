begin;

select plan(39);

insert into public.platforms (id, code, name)
values ('00000000-0000-4000-8000-000000000101', 'bill02-fixture', 'BILL-02 fixture');
insert into public.plans (id, platform_id, code, name, kind, features)
values ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000101', 'paid-one', 'Paid One', 'paid', '{}'::jsonb);

select is(
  (select paid_plan_id from public.platform_subscription_config where platform_id = '00000000-0000-4000-8000-000000000101'),
  '00000000-0000-4000-8000-000000000102'::uuid,
  'exactly one active paid Plan is auto-backfilled'
);

insert into public.plans (id, platform_id, code, name, kind, features)
values ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000101', 'paid-two', 'Paid Two', 'paid', '{}'::jsonb);

select is(
  (select paid_plan_id from public.platform_subscription_config where platform_id = '00000000-0000-4000-8000-000000000101'),
  '00000000-0000-4000-8000-000000000102'::uuid,
  'ambiguous later paid Plan does not remap an existing config'
);

select has_table('public', 'subscription_products', 'fixed subscription product catalog exists');
select has_table('public', 'platform_subscription_config', 'platform subscription config exists');
select is((select count(*) from public.subscription_products), 4::bigint, 'catalog has exactly four products');
select is((select count(*) from public.subscription_products where code = 'free' and price_amount = 0 and term_kind = 'free'), 1::bigint, 'free product is zero-price free term');
select is((select duration_value from public.subscription_products where code = 'lifetime'), 99, 'lifetime is finite 99 years');
select is((select duration_unit from public.subscription_products where code = 'lifetime'), 'year', 'lifetime duration unit is year');
select ok((select relforcerowsecurity from pg_class where oid = 'public.subscription_products'::regclass), 'product catalog forces RLS');
select ok((select relforcerowsecurity from pg_class where oid = 'public.platform_subscription_config'::regclass), 'subscription config forces RLS');
select ok(exists (select 1 from pg_policy where polrelid = 'public.subscription_products'::regclass and polname = 'subscription_products_domain_owner'), 'catalog domain-owner policy exists');
select ok(exists (select 1 from pg_policy where polrelid = 'public.platform_subscription_config'::regclass and polname = 'platform_subscription_config_domain_owner'), 'config domain-owner policy exists');
select ok(not has_table_privilege('account_executor', 'public.subscription_products', 'select'), 'account executor cannot read catalog directly');
select ok(not has_table_privilege('account_executor', 'public.platform_subscription_config', 'select'), 'account executor cannot read config directly');
select ok(not has_table_privilege('admin_executor', 'public.subscription_products', 'insert'), 'admin executor cannot insert catalog directly');
select ok(not has_table_privilege('admin_executor', 'public.platform_subscription_config', 'update'), 'admin executor cannot update config directly');
select ok(has_function_privilege('account_executor', 'private.subscription_products_list(uuid, uuid)', 'execute'), 'account executor can read products through wrapper');
select ok(has_function_privilege('admin_executor', 'private.admin_subscription_config_read(private.admin_context, uuid)', 'execute'), 'admin executor can read config through wrapper');
select ok(has_function_privilege('admin_executor', 'private.admin_subscription_config_patch(private.admin_context, uuid, bigint, uuid, boolean, boolean, boolean, text, text)', 'execute'), 'admin executor can patch config through wrapper');
select ok(not has_function_privilege('account_executor', 'private.admin_subscription_config_patch(private.admin_context, uuid, bigint, uuid, boolean, boolean, boolean, text, text)', 'execute'), 'account executor cannot patch config');
select ok((select prosecdef from pg_proc where oid = 'private.subscription_products_list(uuid, uuid)'::regprocedure), 'product list is security definer');
select ok((select array_to_string(proconfig, ',') like 'search_path=pg_catalog%' from pg_proc where oid = 'private.subscription_products_list(uuid, uuid)'::regprocedure), 'product list pins search_path');
select ok((select prosecdef from pg_proc where oid = 'private.admin_subscription_config_patch(private.admin_context, uuid, bigint, uuid, boolean, boolean, boolean, text, text)'::regprocedure), 'config patch is security definer');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.platform_subscription_config'::regclass and contype = 'f' and pg_get_constraintdef(oid) like '%platform_id, paid_plan_id, paid_plan_kind%'), 'paid Plan mapping is same-platform composite FK');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.subscription_grants'::regclass and contype = 'f' and lower(pg_get_constraintdef(oid)) like '%references plans%'), 'historical grants retain Plan foreign key');
select ok(exists (select 1 from pg_trigger where tgrelid = 'public.platforms'::regclass and tgname = 'platforms_subscription_config_init'), 'new platforms initialize subscription config');
select ok(exists (select 1 from pg_trigger where tgrelid = 'public.plans'::regclass and tgname = 'plans_subscription_config_backfill'), 'plans backfill an unconfigured singleton paid Plan');
select ok(exists (select 1 from pg_trigger where tgrelid = 'public.plans'::regclass and tgname = 'plans_prevent_enabled_subscription_archive'), 'enabled paid Plan archive guard exists');
select ok(exists (select 1 from pg_trigger where tgrelid = 'public.subscription_products'::regclass and tgname = 'subscription_products_guard'), 'catalog immutable-field guard exists');
select ok(pg_get_functiondef('private.subscription_plan_switch_preflight(uuid, uuid)'::regprocedure) like '%redeemable_old_plan_batch%', 'preflight checks redeemable old Plan batches');
select ok(pg_get_functiondef('private.subscription_plan_switch_preflight(uuid, uuid)'::regprocedure) like '%active_or_future_grant%', 'preflight checks active or future grants');
select ok(pg_get_functiondef('private.admin_subscription_config_patch(private.admin_context, uuid, bigint, uuid, boolean, boolean, boolean, text, text)'::regprocedure) like '%precondition_failed%', 'config patch enforces optimistic concurrency');
select ok(pg_get_functiondef('private.subscription_products_list(uuid, uuid)'::regprocedure) like '%provider_mapping_unavailable%', 'products expose unavailable provider mapping explicitly');
select ok(pg_get_functiondef('private.subscription_products_list(uuid, uuid)'::regprocedure) like '%paid_plan_not_configured%', 'products expose missing paid Plan configuration');
select ok(pg_get_functiondef('private.subscription_product_guard()'::regprocedure) like '%price_version_required%', 'price changes require a new price version');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.subscription_products'::regclass and pg_get_constraintdef(oid) like '%duration_value = 99%'), 'lifetime constraint prevents perpetual semantics');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.subscription_products'::regclass and pg_get_constraintdef(oid) like '%numeric%') or exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'subscription_products' and column_name = 'price_amount' and numeric_precision = 12 and numeric_scale = 2), 'prices use numeric(12,2)');
select ok(pg_get_functiondef('private.platform_subscription_config_backfill(uuid)'::regprocedure) like '%v_paid_count = 1%', 'ambiguous paid Plan backfill stays null');
select ok(pg_get_functiondef('private.platform_subscription_config_backfill(uuid)'::regprocedure) like '%paid_plan_id is null%', 'backfill never remaps an existing config');

select * from finish();

rollback;
