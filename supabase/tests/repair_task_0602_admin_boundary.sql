begin;

select plan(21);

-- TASK-0602-NEG: only the central Admin executor may reach Billing Admin
-- wrappers.  The browser-facing roles and worker/account roles must not be
-- able to turn a forged admin_context into a read or mutation capability.
select ok(
  has_function_privilege(
    'admin_executor',
    'private.admin_billing_order_list_v2(private.admin_context, timestamptz, uuid, integer, text, uuid, uuid, uuid, text)',
    'execute'
  ),
  'admin executor can use the server-side billing list wrapper'
);
select ok(
  not has_function_privilege(
    'account_executor',
    'private.admin_billing_order_list_v2(private.admin_context, timestamptz, uuid, integer, text, uuid, uuid, uuid, text)',
    'execute'
  ),
  'account executor cannot query central billing orders'
);
select ok(
  has_function_privilege(
    'admin_executor',
    'private.admin_billing_order_read_v3(private.admin_context, uuid)',
    'execute'
  ),
  'admin executor can use the server-side billing detail wrapper'
);
select ok(
  not has_function_privilege(
    'account_executor',
    'private.admin_billing_order_read_v3(private.admin_context, uuid)',
    'execute'
  ),
  'account executor cannot query central billing details'
);
select ok(
  has_function_privilege(
    'admin_executor',
    'private.admin_billing_metrics(private.admin_context)',
    'execute'
  ),
  'admin executor can use the server-side billing metrics wrapper'
);
select ok(
  not has_function_privilege(
    'job_executor',
    'private.admin_billing_metrics(private.admin_context)',
    'execute'
  ),
  'job executor cannot query central billing metrics'
);
select ok(
  has_function_privilege(
    'admin_executor',
    'private.admin_billing_order_requery(private.admin_context, uuid, uuid, bigint, text)',
    'execute'
  ),
  'admin executor can use the server-side billing requery wrapper'
);
select ok(
  not has_function_privilege(
    'account_executor',
    'private.admin_billing_order_requery(private.admin_context, uuid, uuid, bigint, text)',
    'execute'
  ),
  'account executor cannot submit an Admin billing requery'
);
select ok(
  has_function_privilege(
    'admin_executor',
    'private.admin_billing_order_resolve(private.admin_context, uuid, uuid, bigint, text, text)',
    'execute'
  ),
  'admin executor can use the server-side billing resolve wrapper'
);
select ok(
  not has_function_privilege(
    'job_executor',
    'private.admin_billing_order_resolve(private.admin_context, uuid, uuid, bigint, text, text)',
    'execute'
  ),
  'job executor cannot submit an Admin billing resolution'
);

-- Neither executor receives direct table access as a shortcut around the
-- wrapper's system_admin/session checks.
select ok(
  not has_table_privilege('admin_executor', 'public.billing_orders', 'select'),
  'admin executor cannot read billing orders directly'
);
select ok(
  not has_table_privilege('admin_executor', 'public.billing_settlements', 'update'),
  'admin executor cannot update settlements directly'
);
select ok(
  not has_table_privilege('account_executor', 'public.billing_checkout_intents', 'select'),
  'account executor cannot read checkout intents directly'
);
select ok(
  (select relrowsecurity and relforcerowsecurity
   from pg_class where oid = 'public.billing_orders'::regclass),
  'billing orders retain forced RLS'
);
select ok(
  (select relrowsecurity and relforcerowsecurity
   from pg_class where oid = 'public.billing_checkout_intents'::regclass),
  'checkout intents retain forced RLS'
);

select ok(
  (select prosecdef from pg_proc
   where oid = 'private.billing_admin_assert(private.admin_context)'::regprocedure),
  'billing Admin assertion is security definer'
);
select ok(
  (select array_to_string(proconfig, ',') like 'search_path=pg_catalog%'
   from pg_proc
   where oid = 'private.billing_admin_assert(private.admin_context)'::regprocedure),
  'billing Admin assertion pins search_path'
);
select throws_ok(
  $$select private.billing_admin_assert(row(
    '00000000-0000-4000-8000-000000002601',
    '00000000-0000-4000-8000-000000002602',
    '00000000-0000-4000-8000-000000002603'
  )::private.admin_context)$$,
  '42501',
  'admin_required',
  'forged admin/user context is rejected'
);

-- TASK-0602-NEG: a valid user of platform B cannot use the same user/session
-- to read a platform A Checkout.  The platform and account predicates are
-- both part of the account domain boundary; failure is intentionally generic.
insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values (
  '00000000-0000-4000-8000-000000002604', 'authenticated', 'authenticated',
  'repair0602@example.invalid', 'not-a-real-password', now(), now()
);
insert into auth.sessions (id, user_id, created_at, updated_at, not_after)
values (
  '00000000-0000-4000-8000-000000002605',
  '00000000-0000-4000-8000-000000002604', now(), now(), now() + interval '1 hour'
);
insert into public.platforms (id, code, name, status)
values
  ('00000000-0000-4000-8000-000000002606', 'repair0602-a', 'Repair 0602 A', 'active'),
  ('00000000-0000-4000-8000-000000002607', 'repair0602-b', 'Repair 0602 B', 'active');
insert into public.plans (id, platform_id, code, name, kind)
values
  ('00000000-0000-4000-8000-000000002608', '00000000-0000-4000-8000-000000002606', 'paid', 'Paid A', 'paid'),
  ('00000000-0000-4000-8000-000000002609', '00000000-0000-4000-8000-000000002607', 'paid', 'Paid B', 'paid');
insert into public.platform_accounts (id, platform_id, user_id, status)
values
  ('00000000-0000-4000-8000-000000002610', '00000000-0000-4000-8000-000000002606', '00000000-0000-4000-8000-000000002604', 'active'),
  ('00000000-0000-4000-8000-000000002611', '00000000-0000-4000-8000-000000002607', '00000000-0000-4000-8000-000000002604', 'active');
insert into private.platform_api_keys (
  id, platform_id, name, key_hmac, hmac_key_version, key_prefix, key_suffix,
  creation_operation_id
)
values
  (
    '00000000-0000-4000-8000-000000002612',
    '00000000-0000-4000-8000-000000002606',
    'Repair 0602 A key', repeat('a', 64), 1, 'repair-a', 'fixture-a',
    '00000000-0000-4000-8000-000000002613'
  ),
  (
    '00000000-0000-4000-8000-000000002614',
    '00000000-0000-4000-8000-000000002607',
    'Repair 0602 B key', repeat('b', 64), 1, 'repair-b', 'fixture-b',
    '00000000-0000-4000-8000-000000002615'
  );
insert into public.billing_checkout_intents (
  id, platform_id, platform_account_id, subscription_product_id, entitlement_plan_id,
  product_code, term_kind_snapshot, duration_value_snapshot, duration_unit_snapshot,
  price_amount, currency, price_version, idempotency_key_hash, request_hash, expires_at
)
values (
  '00000000-0000-4000-8000-000000002616',
  '00000000-0000-4000-8000-000000002606',
  '00000000-0000-4000-8000-000000002610',
  (select id from public.subscription_products where code = 'monthly'),
  '00000000-0000-4000-8000-000000002608',
  'monthly', 'finite', 1, 'month', 9.90, 'CNY', 1,
  decode(repeat('c1', 32), 'hex'), decode(repeat('d1', 32), 'hex'), now() + interval '1 hour'
);
select is(
  (select count(*)::integer from private.subscription_checkout_read_v2(
    row(
      '00000000-0000-4000-8000-000000002604',
      '00000000-0000-4000-8000-000000002605',
      '00000000-0000-4000-8000-000000002606',
      '00000000-0000-4000-8000-000000002612',
      '00000000-0000-4000-8000-000000002617'
    )::private.account_context,
    '00000000-0000-4000-8000-000000002616'
  )),
  1,
  'the owning platform and account can read the checkout'
);
select throws_ok(
  $$select * from private.subscription_checkout_read_v2(
    row(
      '00000000-0000-4000-8000-000000002604',
      '00000000-0000-4000-8000-000000002605',
      '00000000-0000-4000-8000-000000002607',
      '00000000-0000-4000-8000-000000002614',
      '00000000-0000-4000-8000-000000002618'
    )::private.account_context,
    '00000000-0000-4000-8000-000000002616'
  )$$,
  'P0002',
  'resource_not_found',
  'the same user cannot read a checkout from another platform'
);
select throws_ok(
  $$select * from private.subscription_checkout_read_v2(
    row(
      '00000000-0000-4000-8000-000000002604',
      '00000000-0000-4000-8000-000000002605',
      '00000000-0000-4000-8000-000000002606',
      '00000000-0000-4000-8000-000000002614',
      '00000000-0000-4000-8000-000000002619'
    )::private.account_context,
    '00000000-0000-4000-8000-000000002616'
  )$$,
  'P0002',
  'resource_not_found',
  'a key from another platform cannot be used to read the checkout'
);

select * from finish();

rollback;
