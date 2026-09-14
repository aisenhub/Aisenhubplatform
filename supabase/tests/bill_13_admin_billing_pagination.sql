begin;

select plan(16);

select has_function(
  'private',
  'admin_billing_order_list_v2',
  array[
    'private.admin_context', 'timestamp with time zone', 'uuid', 'integer',
    'text', 'uuid', 'uuid', 'uuid', 'text'
  ],
  'stable admin billing list supports composite cursors and filters'
);
select ok(
  has_function_privilege(
    'admin_executor',
    'private.admin_billing_order_list_v2(private.admin_context, timestamp with time zone, uuid, integer, text, uuid, uuid, uuid, text)',
    'execute'
  ),
  'admin executor can call the v2 billing list'
);
select ok(
  not has_function_privilege(
    'account_executor',
    'private.admin_billing_order_list_v2(private.admin_context, timestamp with time zone, uuid, integer, text, uuid, uuid, uuid, text)',
    'execute'
  ),
  'account executor cannot call the admin billing list'
);
select ok(
  (select prosecdef from pg_proc where oid = 'private.admin_billing_order_list_v2(private.admin_context, timestamp with time zone, uuid, integer, text, uuid, uuid, uuid, text)'::regprocedure),
  'v2 billing list is security definer'
);
select ok(
  (select array_to_string(proconfig, ',') like 'search_path=pg_catalog%' from pg_proc where oid = 'private.admin_billing_order_list_v2(private.admin_context, timestamp with time zone, uuid, integer, text, uuid, uuid, uuid, text)'::regprocedure),
  'v2 billing list pins search_path'
);
select ok(
  pg_get_functiondef('private.admin_billing_order_list_v2(private.admin_context, timestamp with time zone, uuid, integer, text, uuid, uuid, uuid, text)'::regprocedure) like '%(o.created_at, o.id) < (p_cursor, p_cursor_id)%',
  'v2 billing list uses both sort keys for the cursor'
);
select ok(
  pg_get_functiondef('private.admin_billing_order_list_v2(private.admin_context, timestamp with time zone, uuid, integer, text, uuid, uuid, uuid, text)'::regprocedure) like '%p_platform_id%'
    and pg_get_functiondef('private.admin_billing_order_list_v2(private.admin_context, timestamp with time zone, uuid, integer, text, uuid, uuid, uuid, text)'::regprocedure) like '%p_provider_account_id%',
  'v2 billing list has ownership and provider filters'
);
select ok(
  pg_get_functiondef('private.admin_billing_order_list_v2(private.admin_context, timestamp with time zone, uuid, integer, text, uuid, uuid, uuid, text)'::regprocedure) like '%p_query%'
    and pg_get_functiondef('private.admin_billing_order_list_v2(private.admin_context, timestamp with time zone, uuid, integer, text, uuid, uuid, uuid, text)'::regprocedure) like '%unlinked%',
  'v2 billing list has query and unlinked filters'
);
select ok(
  not has_table_privilege('admin_executor', 'public.billing_orders', 'select'),
  'admin executor still cannot read billing orders directly'
);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values ('00000000-0000-4000-8000-000000000613', 'authenticated', 'authenticated', 'bill13-admin@example.invalid', 'not-a-real-password', now(), now());
insert into private.system_admin (user_id)
values ('00000000-0000-4000-8000-000000000613');
insert into auth.sessions (id, user_id, created_at, updated_at, not_after)
values (
  '00000000-0000-4000-8000-000000000614',
  '00000000-0000-4000-8000-000000000613', now(), now(), now() + interval '1 hour'
);
insert into public.billing_provider_accounts (id, provider, name, status, secret_reference)
values ('00000000-0000-4000-8000-000000000615', 'afdian', 'BILL-13 fixture', 'active', 'test-secret-reference');
insert into public.billing_orders (
  id, provider_account_id, provider_order_no, provider_status, verification_status,
  entitlement_status, linkage_status, created_at, updated_at
) values
  ('00000000-0000-4000-8000-000000000616', '00000000-0000-4000-8000-000000000615', 'bill13-same-time-1', 'paid', 'verified', 'blocked', 'unlinked', '2026-09-13 12:00:00+00', '2026-09-13 12:00:00+00'),
  ('00000000-0000-4000-8000-000000000617', '00000000-0000-4000-8000-000000000615', 'bill13-same-time-2', 'paid', 'verified', 'blocked', 'unlinked', '2026-09-13 12:00:00+00', '2026-09-13 12:00:00+00'),
  ('00000000-0000-4000-8000-000000000618', '00000000-0000-4000-8000-000000000615', 'bill13-same-time-3', 'paid', 'verified', 'blocked', 'unlinked', '2026-09-13 12:00:00+00', '2026-09-13 12:00:00+00');

select is(
  (select count(*)::integer from private.admin_billing_order_list_v2(
    row('00000000-0000-4000-8000-000000000613', '00000000-0000-4000-8000-000000000614', '00000000-0000-4000-8000-000000000619')::private.admin_context,
    null, null, 2, null, null, null, null, null
  )),
  2,
  'first page respects the requested limit'
);
select is(
  (select order_id from private.admin_billing_order_list_v2(
    row('00000000-0000-4000-8000-000000000613', '00000000-0000-4000-8000-000000000614', '00000000-0000-4000-8000-000000000620')::private.admin_context,
    null, null, 2, null, null, null, null, null
  ) page order by page.created_at desc, page.order_id desc limit 1),
  '00000000-0000-4000-8000-000000000618'::uuid,
  'first page starts with the newest ID when timestamps tie'
);
select is(
  (select count(*)::integer from private.admin_billing_order_list_v2(
    row('00000000-0000-4000-8000-000000000613', '00000000-0000-4000-8000-000000000614', '00000000-0000-4000-8000-000000000621')::private.admin_context,
    '2026-09-13 12:00:00+00', '00000000-0000-4000-8000-000000000617', 50, null, null, null, null, null
  )),
  1,
  'composite cursor returns the remaining tied row without skipping it'
);
select is(
  (select order_id from private.admin_billing_order_list_v2(
    row('00000000-0000-4000-8000-000000000613', '00000000-0000-4000-8000-000000000614', '00000000-0000-4000-8000-000000000622')::private.admin_context,
    null, null, 50, 'unlinked', null, null, null, null
  ) page order by page.created_at desc, page.order_id desc limit 1),
  '00000000-0000-4000-8000-000000000618'::uuid,
  'unlinked filter is evaluated by the server'
);
select is(
  (select order_id from private.admin_billing_order_list_v2(
    row('00000000-0000-4000-8000-000000000613', '00000000-0000-4000-8000-000000000614', '00000000-0000-4000-8000-000000000623')::private.admin_context,
    null, null, 50, null, null, null, '00000000-0000-4000-8000-000000000615', 'same-time-2'
  )),
  '00000000-0000-4000-8000-000000000617'::uuid,
  'provider account and order query filters are applied together'
);
select throws_ok(
  $$select * from private.admin_billing_order_list_v2(
    row('00000000-0000-4000-8000-000000000613', '00000000-0000-4000-8000-000000000614', '00000000-0000-4000-8000-000000000624')::private.admin_context,
    '2026-09-13 12:00:00+00', null, 50, null, null, null, null, null
  )$$,
  '22023',
  'invalid_input',
  'cursor requires both created_at and order_id'
);
select throws_ok(
  $$select * from private.admin_billing_order_list_v2(
    row('00000000-0000-4000-8000-000000000613', '00000000-0000-4000-8000-000000000614', '00000000-0000-4000-8000-000000000625')::private.admin_context,
    null, null, 101, null, null, null, null, null
  )$$,
  '22023',
  'invalid_input',
  'limit remains bounded'
);

select * from finish();

rollback;
