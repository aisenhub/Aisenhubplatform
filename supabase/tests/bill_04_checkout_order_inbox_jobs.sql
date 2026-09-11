begin;

select plan(66);

select has_table('public', 'billing_provider_accounts', 'provider account table exists');
select has_table('public', 'billing_provider_products', 'provider product mapping table exists');
select has_table('public', 'billing_checkout_intents', 'checkout intent table exists');
select has_table('public', 'billing_orders', 'billing order table exists');
select has_table('public', 'billing_webhook_events', 'webhook inbox table exists');
select has_table('public', 'billing_processing_jobs', 'processing job table exists');
select has_table('public', 'billing_settlements', 'settlement table exists');

select has_column('public', 'billing_provider_products', 'expected_show_amount', 'mapping pins displayed amount');
select has_column('public', 'billing_provider_products', 'mapping_version', 'mapping is versioned');
select has_column('public', 'billing_checkout_intents', 'price_amount', 'checkout stores price snapshot');
select has_column('public', 'billing_checkout_intents', 'duration_value_snapshot', 'checkout stores duration snapshot');
select has_column('public', 'billing_checkout_intents', 'token_digest', 'checkout stores token digest only');
select has_column('public', 'billing_checkout_intents', 'idempotency_key_hash', 'checkout stores idempotency hash');
select has_column('public', 'billing_orders', 'checkout_intent_id', 'order can link checkout');
select has_column('public', 'billing_orders', 'provider_order_no', 'order stores provider order number');
select has_column('public', 'billing_webhook_events', 'payload_hash', 'inbox stores payload hash');
select has_column('public', 'billing_webhook_events', 'signature_status', 'inbox stores signature status');
select has_column('public', 'billing_processing_jobs', 'fence', 'jobs have fencing token');
select has_column('public', 'billing_processing_jobs', 'lease_until', 'jobs have lease');
select has_column('public', 'billing_settlements', 'operation_id', 'settlement has operation id');

select ok((select relforcerowsecurity from pg_class where oid = 'public.billing_checkout_intents'::regclass), 'checkout forces RLS');
select ok((select relforcerowsecurity from pg_class where oid = 'public.billing_orders'::regclass), 'orders force RLS');
select ok((select relforcerowsecurity from pg_class where oid = 'public.billing_webhook_events'::regclass), 'inbox forces RLS');
select ok((select relforcerowsecurity from pg_class where oid = 'public.billing_processing_jobs'::regclass), 'jobs force RLS');
select ok((select relforcerowsecurity from pg_class where oid = 'public.billing_settlements'::regclass), 'settlements force RLS');
select ok(not has_table_privilege('account_executor', 'public.billing_checkout_intents', 'insert'), 'account executor cannot insert checkout rows');
select ok(not has_table_privilege('billing_ingress', 'public.billing_webhook_events', 'insert'), 'webhook role cannot insert inbox rows directly');
select ok(not has_table_privilege('job_executor', 'public.billing_processing_jobs', 'update'), 'job executor cannot update jobs directly');

select has_function('private', 'subscription_checkout_create', array['private.account_context', 'uuid', 'text', 'text', 'smallint', 'bytea'], 'checkout create wrapper exists');
select has_function('private', 'subscription_checkout_read', array['private.account_context', 'uuid'], 'checkout read wrapper exists');
select has_function('private', 'billing_webhook_ingest', array['uuid', 'text', 'bytea', 'text', 'text'], 'webhook ingest wrapper exists');
select has_function('private', 'billing_processing_job_claim', array['private.job_context', 'integer'], 'job claim wrapper exists');
select has_function('private', 'billing_processing_job_finish', array['private.job_context', 'uuid', 'bigint', 'text', 'text', 'text'], 'job finish wrapper exists');
select ok(has_function_privilege('account_executor', 'private.subscription_checkout_create(private.account_context, uuid, text, text, smallint, bytea)', 'execute'), 'account executor can create checkout through wrapper');
select ok(has_function_privilege('account_executor', 'private.subscription_checkout_read(private.account_context, uuid)', 'execute'), 'account executor can read checkout through wrapper');
select ok(has_function_privilege('billing_ingress', 'private.billing_webhook_ingest(uuid, text, bytea, text, text)', 'execute'), 'billing ingress can ingest through wrapper');
select ok(has_function_privilege('job_executor', 'private.billing_processing_job_claim(private.job_context, integer)', 'execute'), 'job executor can claim through wrapper');
select ok(has_function_privilege('job_executor', 'private.billing_processing_job_finish(private.job_context, uuid, bigint, text, text, text)', 'execute'), 'job executor can finish through wrapper');

select ok((select prosecdef from pg_proc where oid = 'private.subscription_checkout_create(private.account_context, uuid, text, text, smallint, bytea)'::regprocedure), 'checkout create is security definer');
select ok((select prosecdef from pg_proc where oid = 'private.billing_webhook_ingest(uuid, text, bytea, text, text)'::regprocedure), 'webhook ingest is security definer');
select ok((select array_to_string(proconfig, ',') like 'search_path=pg_catalog%' from pg_proc where oid = 'private.billing_processing_job_claim(private.job_context, integer)'::regprocedure), 'job claim pins search path');
select ok(pg_get_functiondef('private.subscription_checkout_create(private.account_context, uuid, text, text, smallint, bytea)'::regprocedure) like '%provider_mapping_unavailable%', 'checkout closes when provider mapping is unavailable');
select ok(pg_get_functiondef('private.subscription_checkout_create(private.account_context, uuid, text, text, smallint, bytea)'::regprocedure) like '%idempotency_conflict%', 'checkout detects idempotency conflict');
select ok(pg_get_functiondef('private.billing_webhook_ingest(uuid, text, bytea, text, text)'::regprocedure) like '%payload_hash%', 'webhook ingest persists hash not payload');
select ok(pg_get_functiondef('private.billing_processing_job_claim(private.job_context, integer)'::regprocedure) like '%skip locked%', 'job claim uses skip locked');
select ok(pg_get_functiondef('private.billing_processing_job_finish(private.job_context, uuid, bigint, text, text, text)'::regprocedure) like '%fence_conflict%', 'job finish rejects stale fences');

select ok(exists (select 1 from pg_constraint where conrelid = 'public.billing_orders'::regclass and contype = 'f' and pg_get_constraintdef(oid) like '%billing_checkout_intents%'), 'orders retain strong checkout FK');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.billing_settlements'::regclass and contype = 'u' and pg_get_constraintdef(oid) like '%operation_id%'), 'settlements make operation id unique');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.billing_webhook_events'::regclass and contype = 'u' and pg_get_constraintdef(oid) like '%provider_account_id%provider_event_key%'), 'inbox deduplicates provider event key');
select ok(exists (select 1 from pg_indexes where indexname = 'billing_processing_jobs_claim_idx'), 'jobs have claim index');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.subscription_grants'::regclass and contype = 'f' and pg_get_constraintdef(oid) like '%billing_order_id%'), 'billing grant has strong order FK');
select ok(pg_get_constraintdef((select oid from pg_constraint where conname = 'subscription_grants_source_identity_check_v2')) like '%billing_order%', 'billing order grants use dedicated source');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.billing_checkout_intents'::regclass and contype = 'u' and pg_get_constraintdef(oid) like '%platform_account_id%idempotency_key_hash%'), 'checkout idempotency is scoped to account');

insert into public.billing_provider_accounts (id, provider, name, status, secret_reference)
values ('00000000-0000-4000-8000-000000000405', 'afdian', 'BILL-04 fixture', 'active', 'test-secret-reference');
select is(
  (select duplicate from private.billing_webhook_ingest(
    '00000000-0000-4000-8000-000000000405', 'bill04-event', decode(repeat('ab', 32), 'hex'), 'verified', 'order-1'
  )), false, 'first webhook event is not a duplicate'
);
select is(
  (select processing_status from public.billing_webhook_events where provider_event_key = 'bill04-event'),
  'queued', 'webhook is queued before ACK'
);
select is((select count(*)::integer from public.billing_webhook_events where provider_event_key = 'bill04-event'), 1, 'webhook inbox stores one event');
select is((select count(*)::integer from public.billing_processing_jobs), 1, 'webhook creates one processing job');
select is(
  (select duplicate from private.billing_webhook_ingest(
    '00000000-0000-4000-8000-000000000405', 'bill04-event', decode(repeat('ab', 32), 'hex'), 'verified', 'order-1'
  )), true, 'same webhook event is idempotently acknowledged'
);
select is((select count(*)::integer from public.billing_webhook_events where provider_event_key = 'bill04-event'), 1, 'duplicate does not create a second inbox row');
select is((select count(*)::integer from public.billing_processing_jobs), 1, 'duplicate does not create a second job');
select is(
  (select fence from private.billing_processing_job_claim(
    row('00000000-0000-4000-8000-000000000406', 'bill04-test-worker', 1, '00000000-0000-4000-8000-000000000407')::private.job_context, 20
  )), 1::bigint, 'claim advances the fencing token'
);
select is((select state from public.billing_processing_jobs), 'processing', 'claim leases the job');
select is((select lease_owner from public.billing_processing_jobs), 'bill04-test-worker', 'claim binds the worker lease');
select is(
  (select state from private.billing_processing_job_finish(
    row('00000000-0000-4000-8000-000000000406', 'bill04-test-worker', 1, '00000000-0000-4000-8000-000000000407')::private.job_context,
    (select id from public.billing_processing_jobs), 1, 'completed', null, null
  )), 'completed', 'finish releases a completed job'
);
select throws_ok(
  $$select * from private.billing_processing_job_finish(
    row('00000000-0000-4000-8000-000000000406', 'bill04-test-worker', 2, '00000000-0000-4000-8000-000000000407')::private.job_context,
    (select id from public.billing_processing_jobs), 1, 'completed', null, null
  )$$,
  '22023', 'invalid_input', 'finish requires context fence to match submitted fence'
);
select throws_ok(
  $$select * from private.billing_processing_job_finish(
    row('00000000-0000-4000-8000-000000000406', 'bill04-test-worker', 1, '00000000-0000-4000-8000-000000000407')::private.job_context,
    (select id from public.billing_processing_jobs), 1, 'completed', null, null
  )$$,
  '40001', 'fence_conflict', 'a completed job cannot be finished twice'
);

select * from finish();

rollback;
