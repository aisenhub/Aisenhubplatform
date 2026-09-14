begin;

select plan(20);

select has_function(
  'private',
  'admin_billing_order_requery',
  array['private.admin_context', 'uuid', 'uuid', 'bigint', 'text'],
  'billing requery keeps the stable operation contract'
);
select has_function(
  'private',
  'admin_billing_order_resolve',
  array['private.admin_context', 'uuid', 'uuid', 'bigint', 'text', 'text'],
  'billing resolve keeps the stable operation contract'
);
select ok(
  pg_get_functiondef('private.admin_billing_order_requery(private.admin_context, uuid, uuid, bigint, text)'::regprocedure) like '%billing_order_requery%'
    and pg_get_functiondef('private.admin_billing_order_resolve(private.admin_context, uuid, uuid, bigint, text, text)'::regprocedure) like '%admin_idempotency%',
  'both admin billing mutations persist operation identity'
);
select ok(
  strpos(
    pg_get_functiondef('private.admin_billing_order_requery(private.admin_context, uuid, uuid, bigint, text)'::regprocedure),
    'if v_existing.state = ''completed'''
  ) < strpos(
    pg_get_functiondef('private.admin_billing_order_requery(private.admin_context, uuid, uuid, bigint, text)'::regprocedure),
    'if v_order.admin_version <> p_expected_version'
  )
  and strpos(
    pg_get_functiondef('private.admin_billing_order_resolve(private.admin_context, uuid, uuid, bigint, text, text)'::regprocedure),
    'if v_existing.state = ''completed'''
  ) < strpos(
    pg_get_functiondef('private.admin_billing_order_resolve(private.admin_context, uuid, uuid, bigint, text, text)'::regprocedure),
    'if v_order.admin_version <> p_expected_version'
  ),
  'idempotent replay is checked before optimistic concurrency'
);
select ok(
  (select prosecdef from pg_proc where oid = 'private.admin_billing_order_requery(private.admin_context, uuid, uuid, bigint, text)'::regprocedure)
    and (select prosecdef from pg_proc where oid = 'private.admin_billing_order_resolve(private.admin_context, uuid, uuid, bigint, text, text)'::regprocedure),
  'billing mutations remain security definer'
);
select ok(
  has_function_privilege('admin_executor', 'private.admin_billing_order_requery(private.admin_context, uuid, uuid, bigint, text)', 'execute')
    and has_function_privilege('admin_executor', 'private.admin_billing_order_resolve(private.admin_context, uuid, uuid, bigint, text, text)', 'execute'),
  'admin executor can execute both mutations'
);
select ok(
  not has_function_privilege('account_executor', 'private.admin_billing_order_requery(private.admin_context, uuid, uuid, bigint, text)', 'execute')
    and not has_function_privilege('account_executor', 'private.admin_billing_order_resolve(private.admin_context, uuid, uuid, bigint, text, text)', 'execute'),
  'account executor cannot execute either mutation'
);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values ('00000000-0000-4000-8000-000000000640', 'authenticated', 'authenticated', 'bill14-admin@example.invalid', 'not-a-real-password', now(), now());
insert into private.system_admin (user_id)
values ('00000000-0000-4000-8000-000000000640');
insert into auth.sessions (id, user_id, created_at, updated_at, not_after)
values (
  '00000000-0000-4000-8000-000000000641',
  '00000000-0000-4000-8000-000000000640', now(), now(), now() + interval '1 hour'
);
insert into public.billing_provider_accounts (id, provider, name, status, secret_reference)
values ('00000000-0000-4000-8000-000000000642', 'afdian', 'BILL-14 fixture', 'active', 'test-secret-reference');
insert into public.billing_orders (
  id, provider_account_id, provider_order_no, provider_status, verification_status,
  entitlement_status, linkage_status
) values
  ('00000000-0000-4000-8000-000000000643', '00000000-0000-4000-8000-000000000642', 'bill14-resolve', 'paid', 'verified', 'blocked', 'unlinked'),
  ('00000000-0000-4000-8000-000000000644', '00000000-0000-4000-8000-000000000642', 'bill14-requery', 'paid', 'verified', 'blocked', 'unlinked'),
  ('00000000-0000-4000-8000-000000000645', '00000000-0000-4000-8000-000000000642', 'bill14-cross-order', 'paid', 'verified', 'blocked', 'unlinked');
insert into public.billing_settlements (
  billing_order_id, checkout_intent_id, platform_id, platform_account_id,
  settlement_kind, state, operation_id, decision_reason, decision_code
) values (
  '00000000-0000-4000-8000-000000000643', null, null, null,
  'manual', 'review_required', '00000000-0000-4000-8000-000000000646',
  'bill14 fixture', 'unlinked_order'
);

select is(
  (select replayed from private.admin_billing_order_requery(
    row('00000000-0000-4000-8000-000000000640', '00000000-0000-4000-8000-000000000641', '00000000-0000-4000-8000-000000000647')::private.admin_context,
    '00000000-0000-4000-8000-000000000644', '00000000-0000-4000-8000-000000000648', 1, 'provider requery'
  )),
  false,
  'first requery creates one operation result'
);
select is(
  (select count(*)::integer from public.billing_processing_jobs where operation_id = '00000000-0000-4000-8000-000000000648'),
  1,
  'first requery creates exactly one job'
);
select is(
  (select response_status from private.admin_idempotency where operation = 'billing_order_requery' and idempotency_key = '00000000-0000-4000-8000-000000000648'),
  202,
  'requery persists the accepted response for replay'
);
update public.billing_orders
set provider_status = 'verified'
where id = '00000000-0000-4000-8000-000000000644';
select is(
  (select admin_version from private.admin_billing_order_requery(
    row('00000000-0000-4000-8000-000000000640', '00000000-0000-4000-8000-000000000641', '00000000-0000-4000-8000-000000000649')::private.admin_context,
    '00000000-0000-4000-8000-000000000644', '00000000-0000-4000-8000-000000000648', 1, 'provider requery'
  )),
  1::bigint,
  'requery replay returns the original result before If-Match'
);
select throws_ok(
  $$select * from private.admin_billing_order_requery(
    row('00000000-0000-4000-8000-000000000640', '00000000-0000-4000-8000-000000000641', '00000000-0000-4000-8000-000000000650')::private.admin_context,
    '00000000-0000-4000-8000-000000000644', '00000000-0000-4000-8000-000000000648', 1, 'different reason'
  )$$,
  '23505', 'idempotency_conflict',
  'requery rejects the same operation with different arguments'
);
select throws_ok(
  $$select * from private.admin_billing_order_requery(
    row('00000000-0000-4000-8000-000000000640', '00000000-0000-4000-8000-000000000641', '00000000-0000-4000-8000-000000000651')::private.admin_context,
    '00000000-0000-4000-8000-000000000645', '00000000-0000-4000-8000-000000000648', 1, 'provider requery'
  )$$,
  '23505', 'idempotency_conflict',
  'requery rejects cross-order operation reuse'
);

select is(
  (select admin_version from private.admin_billing_order_resolve(
    row('00000000-0000-4000-8000-000000000640', '00000000-0000-4000-8000-000000000641', '00000000-0000-4000-8000-000000000652')::private.admin_context,
    '00000000-0000-4000-8000-000000000643', '00000000-0000-4000-8000-000000000653', 1,
    'closed_anomaly', 'close fixture'
  )),
  2::bigint,
  'first resolve advances the order version'
);
select is(
  (select admin_version from private.admin_billing_order_resolve(
    row('00000000-0000-4000-8000-000000000640', '00000000-0000-4000-8000-000000000641', '00000000-0000-4000-8000-000000000654')::private.admin_context,
    '00000000-0000-4000-8000-000000000643', '00000000-0000-4000-8000-000000000653', 1,
    'closed_anomaly', 'close fixture'
  )),
  2::bigint,
  'resolve replay returns the original result before If-Match'
);
select throws_ok(
  $$select * from private.admin_billing_order_resolve(
    row('00000000-0000-4000-8000-000000000640', '00000000-0000-4000-8000-000000000641', '00000000-0000-4000-8000-000000000655')::private.admin_context,
    '00000000-0000-4000-8000-000000000643', '00000000-0000-4000-8000-000000000653', 1,
    'closed_anomaly', 'different reason'
  )$$,
  '23505', 'idempotency_conflict',
  'resolve rejects the same operation with different arguments'
);
select throws_ok(
  $$select * from private.admin_billing_order_resolve(
    row('00000000-0000-4000-8000-000000000640', '00000000-0000-4000-8000-000000000641', '00000000-0000-4000-8000-000000000656')::private.admin_context,
    '00000000-0000-4000-8000-000000000643', '00000000-0000-4000-8000-000000000657', 1,
    'closed_anomaly', 'new stale operation'
  )$$,
  '40001', 'precondition_failed',
  'a new resolve with a stale version is rejected'
);
select is(
  (select state from public.billing_settlements where billing_order_id = '00000000-0000-4000-8000-000000000643'),
  'finalized',
  'resolve finalizes the settlement once'
);
select is(
  (select resolution_status from public.billing_orders where id = '00000000-0000-4000-8000-000000000643'),
  'resolved',
  'resolve records the order outcome once'
);
select is(
  (select count(*)::integer from private.admin_idempotency where operation in ('billing_order_requery', 'billing_order_resolve') and state = 'completed'),
  2,
  'completed results are persisted for both mutation types'
);

select * from finish();

rollback;
