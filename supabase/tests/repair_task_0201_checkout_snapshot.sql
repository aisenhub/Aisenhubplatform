begin;

select plan(5);

-- TASK-0201-NEG: a published mapping referenced by a Checkout must be a
-- versioned contract.  The old schema allowed an in-place price rewrite.
insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values (
  '00000000-0000-4000-8000-000000002040',
  'authenticated',
  'authenticated',
  'repair0201@example.invalid',
  'not-a-real-password',
  now(),
  now()
);
insert into public.platforms (id, code, name, status)
values (
  '00000000-0000-4000-8000-000000002041',
  'repair0201',
  'Repair 0201',
  'active'
);
insert into public.plans (id, platform_id, code, name, kind, status)
values (
  '00000000-0000-4000-8000-000000002042',
  '00000000-0000-4000-8000-000000002041',
  'paid',
  'Repair 0201 Paid',
  'paid',
  'active'
);
insert into public.platform_accounts (id, platform_id, user_id, status)
values (
  '00000000-0000-4000-8000-000000002043',
  '00000000-0000-4000-8000-000000002041',
  '00000000-0000-4000-8000-000000002040',
  'active'
);
insert into public.billing_provider_accounts (id, provider, name, status, secret_reference)
values (
  '00000000-0000-4000-8000-000000002044',
  'afdian',
  'Repair 0201 Provider',
  'active',
  'test-secret-reference'
);
insert into public.billing_provider_products (
  id, provider_account_id, subscription_product_id, external_plan_id, product_type,
  external_sku_ids, sku_count, purchase_months, expected_show_amount, expected_total_amount,
  price_version, mapping_version, validation_status, published, enabled
)
values (
  '00000000-0000-4000-8000-000000002045',
  '00000000-0000-4000-8000-000000002044',
  (select id from public.subscription_products where code = 'monthly'),
  'repair0201-monthly',
  'subscription',
  '{}'::text[],
  0,
  1,
  9.90,
  9.90,
  2,
  1,
  'verified',
  true,
  true
);
insert into public.billing_checkout_intents (
  id, platform_id, platform_account_id, subscription_product_id, entitlement_plan_id,
  provider_account_id, provider_product_id, product_code, term_kind_snapshot,
  duration_value_snapshot, duration_unit_snapshot, price_amount, currency,
  price_version, mapping_version, custom_order_id, idempotency_key_hash,
  request_hash, expires_at
)
values (
  '00000000-0000-4000-8000-000000002046',
  '00000000-0000-4000-8000-000000002041',
  '00000000-0000-4000-8000-000000002043',
  (select id from public.subscription_products where code = 'monthly'),
  '00000000-0000-4000-8000-000000002042',
  '00000000-0000-4000-8000-000000002044',
  '00000000-0000-4000-8000-000000002045',
  'monthly',
  'finite',
  1,
  'month',
  9.90,
  'CNY',
  2,
  1,
  'repair0201-order',
  decode(repeat('20', 32), 'hex'),
  decode(repeat('21', 32), 'hex'),
  now() + interval '30 minutes'
);

select is(
  (select expected_total_amount from public.billing_provider_products
   where id = '00000000-0000-4000-8000-000000002045'),
  9.90::numeric,
  'published mapping starts at the Checkout contract amount'
);
select is(
  (select provider_expected_total_amount_snapshot from public.billing_checkout_intents
   where id = '00000000-0000-4000-8000-000000002046'),
  9.90::numeric,
  'Checkout stores the provider amount snapshot at creation'
);
select throws_ok(
  $$insert into public.billing_checkout_intents (
      id, platform_id, platform_account_id, subscription_product_id, entitlement_plan_id,
      provider_account_id, provider_product_id, product_code, term_kind_snapshot,
      duration_value_snapshot, duration_unit_snapshot, price_amount, currency,
      price_version, mapping_version, idempotency_key_hash, request_hash, expires_at
    )
    select '00000000-0000-4000-8000-000000002047', platform_id, platform_account_id,
      subscription_product_id, entitlement_plan_id, provider_account_id, provider_product_id,
      product_code, term_kind_snapshot, duration_value_snapshot, duration_unit_snapshot,
      8.00, currency, price_version, mapping_version,
      decode(repeat('22', 32), 'hex'), decode(repeat('23', 32), 'hex'), expires_at
    from public.billing_checkout_intents
    where id = '00000000-0000-4000-8000-000000002046'$$,
  'P0001',
  'checkout_snapshot_conflict',
  'client cannot inject a different Checkout amount'
);
select throws_ok(
  $$update public.billing_provider_products
    set expected_total_amount = 8.00
    where id = '00000000-0000-4000-8000-000000002045'$$,
  'P0001',
  'mapping_immutable',
  'a Checkout-referenced mapping rejects an in-place price rewrite'
);
select is(
  (select expected_total_amount from public.billing_provider_products
   where id = '00000000-0000-4000-8000-000000002045'),
  9.90::numeric,
  'rejected mapping rewrite leaves the published amount unchanged'
);

select * from finish();

rollback;
