begin;

select plan(13);

-- Isolate global cleanup counts from older Local fixtures. These changes are
-- rolled back with the whole test; no existing Local records are removed.
delete from private.idempotency_keys;
delete from private.admin_idempotency;

select has_function(
  'private',
  'idempotency_cleanup',
  array['private.job_context', 'timestamptz', 'integer'],
  'bounded idempotency cleanup wrapper exists'
);
select ok(
  has_function_privilege(
    'job_executor',
    'private.idempotency_cleanup(private.job_context, timestamptz, integer)',
    'execute'
  ),
  'job executor can run idempotency cleanup through the wrapper'
);
select ok(
  not has_table_privilege('job_executor', 'private.idempotency_keys', 'delete'),
  'job executor cannot delete user idempotency rows directly'
);
select ok(
  not has_table_privilege('job_executor', 'private.admin_idempotency', 'delete'),
  'job executor cannot delete admin idempotency rows directly'
);
select ok(
  pg_get_functiondef('private.idempotency_cleanup(private.job_context, timestamptz, integer)'::regprocedure)
    not like '%delete from public.billing_checkout_intents%',
  'cleanup never deletes durable checkout rows'
);
select ok(
  pg_get_functiondef('private.idempotency_cleanup(private.job_context, timestamptz, integer)'::regprocedure)
    like '%p_limit not between 1 and 1000%',
  'cleanup is bounded'
);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values (
  '00000000-0000-4000-8000-000000000901', 'authenticated', 'authenticated',
  'bill09-cleanup@example.invalid', 'not-a-real-password', now(), now()
);
insert into public.platforms (id, code, name)
values ('00000000-0000-4000-8000-000000000902', 'bill09-cleanup', 'BILL-09 cleanup');
insert into public.plans (id, platform_id, code, name, kind, features)
values (
  '00000000-0000-4000-8000-000000000903',
  '00000000-0000-4000-8000-000000000902',
  'paid', 'Paid', 'paid', '{}'::jsonb
);
insert into public.platform_accounts (id, platform_id, user_id, status)
values (
  '00000000-0000-4000-8000-000000000904',
  '00000000-0000-4000-8000-000000000902',
  '00000000-0000-4000-8000-000000000901', 'active'
);
insert into public.platform_commercial_offers(
  id, platform_id, plan_id, code, name, duration_value, duration_unit, status, recommended
) values (
  '00000000-0000-4000-8000-000000000908',
  '00000000-0000-4000-8000-000000000902',
  '00000000-0000-4000-8000-000000000903',
  'monthly', 'Monthly', 1, 'month', 'active', true
);
insert into public.platform_commercial_prices(
  id, platform_id, offer_id, version, amount, currency, status, effective_from
) values (
  '00000000-0000-4000-8000-000000000909',
  '00000000-0000-4000-8000-000000000902',
  '00000000-0000-4000-8000-000000000908', 1, 9.90, 'CNY', 'active', now()
);
insert into public.billing_provider_accounts(id, provider, name, status, secret_reference)
values ('00000000-0000-4000-8000-000000000910','afdian','BILL-09 cleanup','active','fixture://bill09-cleanup');
insert into public.billing_provider_products(
  id, provider_account_id, platform_id, commercial_price_id, external_plan_id, product_type,
  external_sku_ids, sku_count, purchase_months, expected_show_amount, expected_total_amount,
  currency, price_version, mapping_version, validation_status, published, enabled
) values (
  '00000000-0000-4000-8000-000000000911','00000000-0000-4000-8000-000000000910',
  '00000000-0000-4000-8000-000000000902','00000000-0000-4000-8000-000000000909',
  'bill09-plan','subscription','{}'::text[],0,1,9.90,9.90,'CNY',1,1,'verified',true,true
);

insert into private.idempotency_keys (
  platform_id, platform_account_id, operation, actor_scope,
  idempotency_key, request_hash, state, response_status, response_body,
  created_at, expires_at
) values (
  '00000000-0000-4000-8000-000000000902',
  '00000000-0000-4000-8000-000000000904',
  'fixture', 'user:bill09', 'expired-user-key', decode(repeat('aa', 32), 'hex'),
  'completed', 200, '{}'::jsonb, now() - interval '8 days', now() - interval '1 day'
);
insert into private.admin_idempotency (
  admin_user_id, scope, operation, idempotency_key, request_hash,
  state, response_status, response_body, created_at, expires_at
) values (
  '00000000-0000-4000-8000-000000000901', 'global', 'fixture',
  'expired-admin-key', decode(repeat('bb', 32), 'hex'),
  'completed', 200, '{}'::jsonb, now() - interval '8 days', now() - interval '1 day'
);
insert into private.idempotency_keys (
  platform_id, platform_account_id, operation, actor_scope,
  idempotency_key, request_hash, state, response_status, response_body,
  created_at, expires_at
)
select platform_id, platform_account_id, operation, actor_scope,
  'live-user-key', request_hash, state, response_status, response_body,
  now(), now() + interval '1 day'
from private.idempotency_keys;
insert into private.admin_idempotency (
  admin_user_id, scope, operation, idempotency_key, request_hash,
  state, response_status, response_body, created_at, expires_at
)
select admin_user_id, scope, operation, 'live-admin-key', request_hash,
  state, response_status, response_body, now(), now() + interval '1 day'
from private.admin_idempotency;

insert into public.billing_checkout_intents (
  id, platform_id, platform_account_id, entitlement_plan_id,
  provider_account_id, provider_product_id, commercial_offer_id, commercial_price_id,
  offer_code_snapshot, term_kind_snapshot, duration_value_snapshot, duration_unit_snapshot,
  price_amount, currency, price_version, mapping_version,
  idempotency_key_hash, request_hash, expires_at
) values (
  '00000000-0000-4000-8000-000000000905',
  '00000000-0000-4000-8000-000000000902',
  '00000000-0000-4000-8000-000000000904',
  '00000000-0000-4000-8000-000000000903',
  '00000000-0000-4000-8000-000000000910','00000000-0000-4000-8000-000000000911',
  '00000000-0000-4000-8000-000000000908','00000000-0000-4000-8000-000000000909',
  'monthly','finite',1,'month',9.90,'CNY',1,1,
  decode(repeat('cc', 32), 'hex'), decode(repeat('dd', 32), 'hex'),
  now() - interval '1 day'
);

select is(
  (select user_deleted from private.idempotency_cleanup(
    row('00000000-0000-4000-8000-000000000906', 'bill09-worker', 1, '00000000-0000-4000-8000-000000000907')::private.job_context,
    now(), 100
  )),
  1,
  'cleanup removes expired user idempotency rows'
);
insert into private.admin_idempotency (
  admin_user_id, scope, operation, idempotency_key, request_hash,
  state, response_status, response_body, created_at, expires_at
) values (
  '00000000-0000-4000-8000-000000000901', 'global', 'fixture',
  'expired-admin-key-2', decode(repeat('be', 32), 'hex'),
  'completed', 200, '{}'::jsonb, now() - interval '8 days', now() - interval '1 day'
);
select is(
  (select admin_deleted from private.idempotency_cleanup(
    row('00000000-0000-4000-8000-000000000906', 'bill09-worker', 1, '00000000-0000-4000-8000-000000000907')::private.job_context,
    now(), 100
  )),
  1,
  'cleanup removes expired admin idempotency rows'
);
select is(
  (select count(*) from public.billing_checkout_intents
   where id = '00000000-0000-4000-8000-000000000905'),
  1::bigint,
  'expired ordinary cache cleanup preserves durable checkout binding'
);

select is((select count(*) from private.idempotency_keys where idempotency_key = 'expired-user-key'),
  0::bigint, 'the expired user fixture is actually removed');
select is((select count(*) from private.admin_idempotency where idempotency_key like 'expired-admin-key%'),
  0::bigint, 'the expired admin fixtures are actually removed');
select is((select count(*) from private.idempotency_keys where idempotency_key = 'live-user-key'),
  1::bigint, 'unexpired user idempotency remains intact');
select is((select count(*) from private.admin_idempotency where idempotency_key = 'live-admin-key'),
  1::bigint, 'unexpired admin idempotency remains intact');

select * from finish();
rollback;
