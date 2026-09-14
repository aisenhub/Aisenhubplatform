begin;

select plan(8);

select has_function(
  'private',
  'subscription_checkout_read_by_idempotency',
  array['private.account_context', 'text'],
  'durable Checkout recovery wrapper exists'
);
select ok(
  has_function_privilege(
    'account_executor',
    'private.subscription_checkout_read_by_idempotency(private.account_context, text)',
    'execute'
  ),
  'account executor can recover a Checkout by Idempotency-Key'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'private.subscription_checkout_read_by_idempotency(private.account_context, text)',
    'execute'
  ),
  'authenticated cannot call the recovery wrapper directly'
);
select ok(
  not has_table_privilege('account_executor', 'public.billing_checkout_intents', 'select'),
  'account executor still cannot read Checkout rows directly'
);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values (
  '00000000-0000-4000-8000-000000002070',
  'authenticated',
  'authenticated',
  'repair0202@example.invalid',
  'not-a-real-password',
  now(),
  now()
);
insert into auth.sessions (id, user_id, created_at, updated_at, not_after)
values (
  '00000000-0000-4000-8000-000000002071',
  '00000000-0000-4000-8000-000000002070',
  now(),
  now(),
  now() + interval '1 hour'
);
insert into public.platforms (id, code, name, status)
values (
  '00000000-0000-4000-8000-000000002072',
  'repair0202',
  'Repair 0202',
  'active'
);
insert into public.plans (id, platform_id, code, name, kind, status)
values (
  '00000000-0000-4000-8000-000000002073',
  '00000000-0000-4000-8000-000000002072',
  'paid',
  'Repair 0202 Paid',
  'paid',
  'active'
);
insert into public.platform_accounts (id, platform_id, user_id, status)
values (
  '00000000-0000-4000-8000-000000002074',
  '00000000-0000-4000-8000-000000002072',
  '00000000-0000-4000-8000-000000002070',
  'active'
);
insert into private.platform_api_keys (
  id, platform_id, name, key_hmac, hmac_key_version, key_prefix, key_suffix,
  creation_operation_id
)
values (
  '00000000-0000-4000-8000-000000002075',
  '00000000-0000-4000-8000-000000002072',
  'Repair 0202 key',
  repeat('2', 64),
  1,
  'repair-0202',
  'fixture',
  '00000000-0000-4000-8000-000000002076'
);
insert into public.billing_checkout_intents (
  id, platform_id, platform_account_id, subscription_product_id, entitlement_plan_id,
  product_code, term_kind_snapshot, duration_value_snapshot, duration_unit_snapshot,
  price_amount, currency, price_version, idempotency_key_hash, request_hash, expires_at
)
values (
  '00000000-0000-4000-8000-000000002077',
  '00000000-0000-4000-8000-000000002072',
  '00000000-0000-4000-8000-000000002074',
  (select id from public.subscription_products where code = 'monthly'),
  '00000000-0000-4000-8000-000000002073',
  'monthly',
  'finite',
  1,
  'month',
  9.90,
  'CNY',
  2,
  extensions.digest(convert_to('repair0202-idempotency', 'utf8'), 'sha256'),
  extensions.digest(convert_to('["monthly"]', 'utf8'), 'sha256'),
  now() + interval '30 minutes'
);

select is(
  (select checkout_id from private.subscription_checkout_read_by_idempotency(
    row(
      '00000000-0000-4000-8000-000000002070',
      '00000000-0000-4000-8000-000000002071',
      '00000000-0000-4000-8000-000000002072',
      '00000000-0000-4000-8000-000000002075',
      '00000000-0000-4000-8000-000000002078'
    )::private.account_context,
    'repair0202-idempotency'
  )),
  '00000000-0000-4000-8000-000000002077'::uuid,
  'same Idempotency-Key recovers the durable Checkout'
);
select is(
  (select status from private.subscription_checkout_read_by_idempotency(
    row(
      '00000000-0000-4000-8000-000000002070',
      '00000000-0000-4000-8000-000000002071',
      '00000000-0000-4000-8000-000000002072',
      '00000000-0000-4000-8000-000000002075',
      '00000000-0000-4000-8000-000000002079'
    )::private.account_context,
    'repair0202-idempotency'
  )),
  'pending',
  'recovery returns the current projected Checkout status'
);
select throws_ok(
  $$select * from private.subscription_checkout_read_by_idempotency(
    row(
      '00000000-0000-4000-8000-000000002070',
      '00000000-0000-4000-8000-000000002071',
      '00000000-0000-4000-8000-000000002072',
      '00000000-0000-4000-8000-000000002075',
      '00000000-0000-4000-8000-000000002080'
    )::private.account_context,
    'missing-idempotency'
  )$$,
  'P0002',
  'resource_not_found',
  'unknown Idempotency-Key is not converted into a new Checkout'
);
select throws_ok(
  $$select * from private.subscription_checkout_read_by_idempotency(
    row(
      '00000000-0000-4000-8000-000000002070',
      '00000000-0000-4000-8000-000000002071',
      '00000000-0000-4000-8000-000000002072',
      '00000000-0000-4000-8000-000000002075',
      '00000000-0000-4000-8000-000000002081'
    )::private.account_context,
    ''
  )$$,
  '22023',
  'invalid_input',
  'empty Idempotency-Key is rejected'
);

select * from finish();

rollback;
