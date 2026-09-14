begin;
select plan(18);

select has_table('public', 'billing_order_observations', 'provider observations have a durable audit table');
select has_column('public', 'billing_order_observations', 'provider_contract_version', 'observations preserve contract version');
select has_column('public', 'billing_order_observations', 'observed_at', 'observations preserve observation time');
select ok(
  pg_get_functiondef('private.billing_order_verify_and_settle(private.job_context,uuid,uuid,bigint,jsonb)'::regprocedure) like '%billing_order_observations%',
  'settlement records every provider observation'
);
select ok(
  pg_get_functiondef('private.billing_order_verify_and_settle(private.job_context,uuid,uuid,bigint,jsonb)'::regprocedure) like '%v_settlement.state = ''finalized''%',
  'finalized settlements preserve their business decision'
);
select ok(
  pg_get_functiondef('private.billing_order_verify_and_settle(private.job_context,uuid,uuid,bigint,jsonb)'::regprocedure) like '%update public.billing_settlements set%',
  'review settlements can be resolved by a newer observation'
);
select ok(
  has_function_privilege('job_executor', 'private.billing_order_verify_and_settle(private.job_context,uuid,uuid,bigint,jsonb)', 'EXECUTE'),
  'job executor retains the fenced settlement boundary'
);
select ok(
  not has_function_privilege('account_executor', 'private.billing_order_verify_and_settle(private.job_context,uuid,uuid,bigint,jsonb)', 'EXECUTE'),
  'account executor cannot settle billing orders'
);

insert into public.billing_provider_accounts (id, provider, name, status, secret_reference)
values ('00000000-0000-4000-8000-000000000601', 'afdian', 'BILL-10 fixture', 'active', 'test-secret-reference');
insert into public.billing_orders (
  id, provider_account_id, provider_order_no, linkage_status
) values (
  '00000000-0000-4000-8000-000000000602', '00000000-0000-4000-8000-000000000601',
  'bill10-finalized-order', 'unlinked'
);
insert into public.billing_processing_jobs (
  id, job_kind, billing_order_id, state, attempts, lease_owner, lease_until, fence
) values (
  '00000000-0000-4000-8000-000000000603', 'order_verification',
  '00000000-0000-4000-8000-000000000602', 'processing', 1, 'bill10-worker-1', now() + interval '1 minute', 1
);
select is(
  (select decision_code from private.billing_order_verify_and_settle(
    row('00000000-0000-4000-8000-000000000604', 'bill10-worker-1', 1, '00000000-0000-4000-8000-000000000605')::private.job_context,
    '00000000-0000-4000-8000-000000000603', '00000000-0000-4000-8000-000000000602', 1,
    '{"status":"failed","contract_version":1}'::jsonb
  )), 'provider_not_paid', 'first failed observation finalizes the rejection');
select is((select state from public.billing_settlements where billing_order_id = '00000000-0000-4000-8000-000000000602'), 'finalized', 'failed decision is finalized');
select is((select count(*)::integer from public.billing_order_observations where billing_order_id = '00000000-0000-4000-8000-000000000602'), 1, 'first provider observation is recorded');

insert into public.billing_processing_jobs (
  id, job_kind, billing_order_id, state, attempts, lease_owner, lease_until, fence
) values (
  '00000000-0000-4000-8000-000000000606', 'reconciliation',
  '00000000-0000-4000-8000-000000000602', 'processing', 1, 'bill10-worker-2', now() + interval '1 minute', 1
);
select is(
  (select decision_code from private.billing_order_verify_and_settle(
    row('00000000-0000-4000-8000-000000000607', 'bill10-worker-2', 1, '00000000-0000-4000-8000-000000000608')::private.job_context,
    '00000000-0000-4000-8000-000000000606', '00000000-0000-4000-8000-000000000602', 1,
    '{"status":"paid","contract_version":1}'::jsonb
  )), 'provider_not_paid', 'late paid observation returns the historical decision');
select is((select provider_status from public.billing_orders where id = '00000000-0000-4000-8000-000000000602'), 'paid', 'latest provider observation updates the order fact');
select is((select entitlement_status from public.billing_orders where id = '00000000-0000-4000-8000-000000000602'), 'rejected', 'late paid observation cannot revive entitlement');
select is((select state from public.billing_processing_jobs where id = '00000000-0000-4000-8000-000000000606'), 'completed', 'late observation completes without reopening a finalized settlement');
select is((select count(*)::integer from public.billing_order_observations where billing_order_id = '00000000-0000-4000-8000-000000000602'), 2, 'late provider observation is separately recorded');
select is((select provider_status from public.billing_order_observations where billing_order_id = '00000000-0000-4000-8000-000000000602' order by observed_at desc, id desc limit 1), 'paid', 'observation history keeps the latest provider status');
select is((select count(*)::integer from public.subscription_grants where billing_order_id = '00000000-0000-4000-8000-000000000602'), 0, 'late observation creates no Grant');

select * from finish();
rollback;
