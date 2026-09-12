begin;

select plan(7);

select is(
  (select price_amount from public.subscription_products where code = 'monthly'),
  9.90::numeric,
  'monthly price is 9.90 CNY'
);
select is(
  (select price_amount from public.subscription_products where code = 'yearly'),
  39.90::numeric,
  'yearly price is 39.90 CNY'
);
select is(
  (select price_amount from public.subscription_products where code = 'lifetime'),
  49.90::numeric,
  'lifetime price is 49.90 CNY'
);
select is(
  (select price_version from public.subscription_products where code = 'monthly'),
  2,
  'monthly price release increments the version'
);
select is(
  (select price_version from public.subscription_products where code = 'yearly'),
  2,
  'yearly price release increments the version'
);
select is(
  (select price_version from public.subscription_products where code = 'lifetime'),
  2,
  'lifetime price release increments the version'
);
select is(
  (select duration_value from public.subscription_products where code = 'lifetime'),
  99,
  'lifetime retains the finite 99-year entitlement semantics'
);

select * from finish();

rollback;
