begin;

select plan(6);

insert into public.platforms (id, code, name, status, allow_activation)
values ('00000000-0000-4000-8000-000000000801', 'bill08-readiness', 'BILL-08 readiness', 'active', true);
insert into public.plans (id, platform_id, code, name, kind, features)
values
  ('00000000-0000-4000-8000-000000000802', '00000000-0000-4000-8000-000000000801', 'free', 'Free', 'free', '{}'::jsonb),
  ('00000000-0000-4000-8000-000000000803', '00000000-0000-4000-8000-000000000801', 'pro', 'Pro', 'paid', '{}'::jsonb);
update public.platforms
set default_plan_id = '00000000-0000-4000-8000-000000000802'
where id = '00000000-0000-4000-8000-000000000801';
update public.platform_subscription_config
set paid_plan_id = '00000000-0000-4000-8000-000000000803',
    monthly_enabled = true,
    yearly_enabled = true,
    lifetime_enabled = true
where platform_id = '00000000-0000-4000-8000-000000000801';

insert into private.platform_api_keys (
  id, platform_id, name, key_hmac, hmac_key_version, key_prefix, key_suffix,
  creation_operation_id
) values (
  '00000000-0000-4000-8000-000000000804',
  '00000000-0000-4000-8000-000000000801',
  'BILL-08 fixture key', repeat('a', 64), 1, 'phk_v1', 'fixture',
  '00000000-0000-4000-8000-000000000805'
);
insert into public.billing_provider_accounts (
  id, provider, name, status, secret_reference
) values (
  '00000000-0000-4000-8000-000000000806', 'afdian', 'BILL-08 provider', 'active', 'fixture/bill-08'
);
insert into public.billing_provider_products (
  id, provider_account_id, subscription_product_id, external_plan_id,
  product_type, expected_show_amount, expected_total_amount, price_version,
  mapping_version, validation_status, published, enabled
)
select
  gen_random_uuid(),
  '00000000-0000-4000-8000-000000000806',
  p.id,
  'bill08-' || p.code,
  'subscription',
  p.price_amount,
  p.price_amount,
  p.price_version,
  1,
  'verified',
  true,
  true
from public.subscription_products p
where p.code in ('monthly', 'yearly', 'lifetime');

select is(
  (select purchasable from private.subscription_products_list(
    '00000000-0000-4000-8000-000000000801',
    '00000000-0000-4000-8000-000000000804'
  ) where product_code = 'monthly'),
  true,
  'verified current mapping makes monthly product purchasable'
);
select is(
  (select reason from private.subscription_products_list(
    '00000000-0000-4000-8000-000000000801',
    '00000000-0000-4000-8000-000000000804'
  ) where product_code = 'monthly'),
  'ready',
  'ready paid product exposes an explicit readiness reason'
);
select is(
  (select purchasable from private.subscription_products_list(
    '00000000-0000-4000-8000-000000000801',
    '00000000-0000-4000-8000-000000000804'
  ) where product_code = 'free'),
  false,
  'free product never becomes a paid checkout'
);
select is(
  (select count(*) from private.subscription_products_list(
    '00000000-0000-4000-8000-000000000801',
    '00000000-0000-4000-8000-000000000804'
  ) where product_code in ('monthly', 'yearly', 'lifetime' ) and purchasable),
  3::bigint,
  'all enabled verified paid mappings are purchasable'
);

update public.billing_provider_products
set published = false
where provider_account_id = '00000000-0000-4000-8000-000000000806'
  and subscription_product_id = (select id from public.subscription_products where code = 'yearly');
select is(
  (select reason from private.subscription_products_list(
    '00000000-0000-4000-8000-000000000801',
    '00000000-0000-4000-8000-000000000804'
  ) where product_code = 'yearly'),
  'provider_mapping_unavailable',
  'unpublished mapping explains purchase unavailability'
);

update public.platform_subscription_config
set monthly_enabled = false
where platform_id = '00000000-0000-4000-8000-000000000801';
select is(
  (select reason from private.subscription_products_list(
    '00000000-0000-4000-8000-000000000801',
    '00000000-0000-4000-8000-000000000804'
  ) where product_code = 'monthly'),
  'product_disabled',
  'platform product switch still takes precedence over mapping readiness'
);

select * from finish();
rollback;
