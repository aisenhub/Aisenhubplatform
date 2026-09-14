begin;

select plan(7);

select has_function(
  'private',
  'billing_lifetime_purchase_guard',
  array[]::text[],
  'lifetime purchase guard function exists'
);
select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'billing_checkout_intents_lifetime_purchase_idx'
  ),
  'lifetime purchase history has a partial index'
);
select ok(
  not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.billing_checkout_intents'::regclass
      and tgname = 'billing_checkout_intents_lifetime_purchase_guard'
      and not tgisinternal
  ),
  'repeatable lifetime policy no longer blocks checkout transitions'
);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values (
  '00000000-0000-4000-8000-000000001901', 'authenticated', 'authenticated',
  'bill19@example.invalid', 'not-a-real-password', now(), now()
);
insert into public.platforms (id, code, name, status)
values (
  '00000000-0000-4000-8000-000000001902', 'bill19-fixture', 'BILL-19 fixture', 'active'
);
insert into public.plans (id, platform_id, code, name, kind, features)
values (
  '00000000-0000-4000-8000-000000001903',
  '00000000-0000-4000-8000-000000001902',
  'paid', 'Paid', 'paid', '{}'::jsonb
);
insert into public.platform_accounts (id, platform_id, user_id, status)
values (
  '00000000-0000-4000-8000-000000001904',
  '00000000-0000-4000-8000-000000001902',
  '00000000-0000-4000-8000-000000001901',
  'active'
);

insert into public.billing_checkout_intents (
  id, platform_id, platform_account_id, subscription_product_id, entitlement_plan_id,
  product_code, term_kind_snapshot, duration_value_snapshot, duration_unit_snapshot,
  price_amount, currency, price_version, custom_order_id,
  idempotency_key_hash, request_hash, expires_at
) values
(
  '00000000-0000-4000-8000-000000001905',
  '00000000-0000-4000-8000-000000001902',
  '00000000-0000-4000-8000-000000001904',
  (select id from public.subscription_products where code = 'lifetime'),
  '00000000-0000-4000-8000-000000001903',
  'lifetime', 'finite', 99, 'year', 1.00, 'CNY', 1, 'bill19-first',
  decode(repeat('01', 32), 'hex'), decode(repeat('02', 32), 'hex'), now() + interval '30 minutes'
),
(
  '00000000-0000-4000-8000-000000001906',
  '00000000-0000-4000-8000-000000001902',
  '00000000-0000-4000-8000-000000001904',
  (select id from public.subscription_products where code = 'lifetime'),
  '00000000-0000-4000-8000-000000001903',
  'lifetime', 'finite', 99, 'year', 1.00, 'CNY', 1, 'bill19-second',
  decode(repeat('03', 32), 'hex'), decode(repeat('04', 32), 'hex'), now() + interval '30 minutes'
);

update public.billing_checkout_intents
set status = 'paid', paid_at = now()
where id = '00000000-0000-4000-8000-000000001905';
select is(
  (select status from public.billing_checkout_intents where id = '00000000-0000-4000-8000-000000001905'),
  'paid',
  'the first lifetime checkout can become paid'
);

update public.billing_checkout_intents
set status = 'paid', paid_at = now()
where id = '00000000-0000-4000-8000-000000001906';
select is(
  (select status from public.billing_checkout_intents where id = '00000000-0000-4000-8000-000000001906'),
  'paid',
  'a second lifetime purchase is accepted for the same account'
);

insert into public.billing_provider_accounts (
  id, provider, name, status, secret_reference
) values (
  '00000000-0000-4000-8000-000000001909',
  'afdian', 'BILL-19 fixture provider', 'disabled', 'vault://bill19-fixture'
);
insert into public.billing_orders (
  id, provider_account_id, provider_order_no, platform_id, platform_account_id,
  provider_status, currency
) values
(
  '00000000-0000-4000-8000-000000001907',
  '00000000-0000-4000-8000-000000001909',
  'bill19-order-1',
  '00000000-0000-4000-8000-000000001902',
  '00000000-0000-4000-8000-000000001904',
  'paid', 'CNY'
),
(
  '00000000-0000-4000-8000-000000001908',
  '00000000-0000-4000-8000-000000001909',
  'bill19-order-2',
  '00000000-0000-4000-8000-000000001902',
  '00000000-0000-4000-8000-000000001904',
  'paid', 'CNY'
);

select * from private.entitlement_apply(
  '00000000-0000-4000-8000-000000001902',
  '00000000-0000-4000-8000-000000001904',
  '00000000-0000-4000-8000-000000001903',
  'billing_order',
  '00000000-0000-4000-8000-000000001907',
  99, 'year', null, 'billing_order_settlement', null
);
select * from private.entitlement_apply(
  '00000000-0000-4000-8000-000000001902',
  '00000000-0000-4000-8000-000000001904',
  '00000000-0000-4000-8000-000000001903',
  'billing_order',
  '00000000-0000-4000-8000-000000001908',
  99, 'year', null, 'billing_order_settlement', null
);
select ok(
  (select count(*) = 2 from public.subscription_grants
   where platform_id = '00000000-0000-4000-8000-000000001902'
     and platform_account_id = '00000000-0000-4000-8000-000000001904'
     and plan_id = '00000000-0000-4000-8000-000000001903'),
  'each repeat purchase creates an independent entitlement grant'
);
select ok(
  (select max(ends_at) - min(starts_at) > interval '190 years'
   from public.subscription_grants
   where platform_id = '00000000-0000-4000-8000-000000001902'
     and platform_account_id = '00000000-0000-4000-8000-000000001904'
     and plan_id = '00000000-0000-4000-8000-000000001903'),
  'repeat purchases extend the backend entitlement horizon by another 99 years'
);

select * from finish();
rollback;
