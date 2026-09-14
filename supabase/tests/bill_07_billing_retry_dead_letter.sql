begin;

select plan(31);

select has_column('public', 'billing_processing_jobs', 'max_attempts', 'jobs have a bounded retry budget');
select has_column('public', 'billing_processing_jobs', 'retry_attempts', 'jobs track the current retry cycle');
select has_column('public', 'billing_processing_jobs', 'dead_lettered_at', 'jobs expose dead-letter time');
select has_column('public', 'billing_processing_jobs', 'last_requeue_operation_id', 'jobs retain requeue idempotency');
select has_function('private', 'billing_processing_job_requeue', array['private.job_context', 'uuid', 'uuid', 'text'], 'generic requeue boundary exists');
select ok(has_function_privilege('job_executor', 'private.billing_processing_job_requeue(private.job_context, uuid, uuid, text)', 'execute'), 'only the job executor can requeue');
select ok(not has_function_privilege('admin_executor', 'private.billing_processing_job_requeue(private.job_context, uuid, uuid, text)', 'execute'), 'admin executor cannot requeue directly');
select ok((select prosecdef from pg_proc where oid = 'private.billing_processing_job_requeue(private.job_context, uuid, uuid, text)'::regprocedure), 'requeue is security definer');
select ok(pg_get_functiondef('private.billing_processing_job_finish(private.job_context, uuid, bigint, text, text, text)'::regprocedure) like '%RETRY_BUDGET_EXHAUSTED%', 'finish enforces the retry ceiling');
select ok(pg_get_functiondef('private.billing_processing_job_claim(private.job_context, integer)'::regprocedure) like '%retry_attempts < j.max_attempts%', 'claim excludes exhausted cycles');

insert into public.billing_provider_accounts (id, provider, name, status, secret_reference)
values ('00000000-0000-4000-8000-000000000701', 'afdian', 'BILL-07 fixture', 'active', 'test-secret-reference');
insert into public.billing_webhook_events (
  id, provider_account_id, provider_event_key, payload_hash, signature_status,
  processing_status, provider_order_no
) values (
  '00000000-0000-4000-8000-000000000702',
  '00000000-0000-4000-8000-000000000701', 'bill07-event', decode(repeat('ab', 32), 'hex'),
  'verified', 'queued', 'bill07-order'
);
insert into public.billing_webhook_events (
  id, provider_account_id, provider_event_key, payload_hash, signature_status,
  processing_status, provider_order_no
) values
  ('00000000-0000-4000-8000-000000000709', '00000000-0000-4000-8000-000000000701', 'bill07-event-retry', decode(repeat('cd', 32), 'hex'), 'verified', 'queued', 'bill07-order-retry'),
  ('00000000-0000-4000-8000-000000000716', '00000000-0000-4000-8000-000000000701', 'bill07-event-requeue', decode(repeat('ef', 32), 'hex'), 'verified', 'manual_review', 'bill07-order-requeue'),
  ('00000000-0000-4000-8000-000000000718', '00000000-0000-4000-8000-000000000701', 'bill07-event-permanent', decode(repeat('12', 32), 'hex'), 'verified', 'manual_review', 'bill07-order-permanent');
insert into public.billing_processing_jobs (
  id, job_kind, webhook_event_id, state, attempts, retry_attempts,
  max_attempts, next_attempt_at, lease_owner, lease_until, fence
) values (
  '00000000-0000-4000-8000-000000000703', 'webhook_order_discovery',
  '00000000-0000-4000-8000-000000000702', 'processing', 8, 8, 8,
  now(), 'dead-worker', now() - interval '1 second', 8
);

select is(
  (select count(*)::integer from private.billing_processing_job_claim(
    row('00000000-0000-4000-8000-000000000704', 'bill07-reclaimer', 1, '00000000-0000-4000-8000-000000000705')::private.job_context,
    20
  )),
  0,
  'an exhausted expired job is not reclaimed'
);
select is((select state from public.billing_processing_jobs where id = '00000000-0000-4000-8000-000000000703'), 'manual_review', 'exhausted job enters manual review');
select is((select error_class from public.billing_processing_jobs where id = '00000000-0000-4000-8000-000000000703'), 'dead_letter', 'dead letter has a distinct error class');
select is((select error_code from public.billing_processing_jobs where id = '00000000-0000-4000-8000-000000000703'), 'RETRY_BUDGET_EXHAUSTED', 'dead letter preserves a stable error code');
select ok((select dead_lettered_at is not null from public.billing_processing_jobs where id = '00000000-0000-4000-8000-000000000703'), 'dead letter records an operator timestamp');
select is((select processing_status from public.billing_webhook_events where id = '00000000-0000-4000-8000-000000000702'), 'manual_review', 'inbox event follows the dead letter');

insert into public.billing_processing_jobs (
  id, job_kind, webhook_event_id, state, max_attempts, next_attempt_at, fence
) values (
  '00000000-0000-4000-8000-000000000706', 'webhook_order_discovery',
  '00000000-0000-4000-8000-000000000709', 'pending', 8, now(), 0
);

select is(
  (select attempt from private.billing_processing_job_claim(
    row('00000000-0000-4000-8000-000000000707', 'bill07-worker', 1, '00000000-0000-4000-8000-000000000708')::private.job_context,
    1
  ) where job_id = '00000000-0000-4000-8000-000000000706'),
  1,
  'a fresh retry cycle starts at attempt one'
);
select is(
  (select state from private.billing_processing_job_finish(
    row('00000000-0000-4000-8000-000000000706', 'bill07-worker', 1, '00000000-0000-4000-8000-000000000709')::private.job_context,
    '00000000-0000-4000-8000-000000000706', 1, 'retryable', 'provider', 'PROVIDER_UNAVAILABLE'
  )),
  'retryable',
  'transient provider failure remains retryable'
);
select ok((select next_attempt_at > now() + interval '20 seconds' from public.billing_processing_jobs where id = '00000000-0000-4000-8000-000000000706'), 'retry uses a future backoff deadline');
select is((select last_error_code from public.billing_processing_jobs where id = '00000000-0000-4000-8000-000000000706'), 'PROVIDER_UNAVAILABLE', 'retry preserves the last error code');

insert into public.billing_processing_jobs (
  id, job_kind, webhook_event_id, state, error_class, error_code,
  last_error_class, last_error_code, max_attempts, attempts, retry_attempts,
  fence
) values (
  '00000000-0000-4000-8000-000000000710', 'webhook_order_discovery',
  '00000000-0000-4000-8000-000000000716', 'manual_review', 'provider_contract',
  'PROVIDER_RESPONSE_INVALID', 'provider_contract', 'PROVIDER_RESPONSE_INVALID',
  8, 8, 8, 2
);

select is(
  (select state from private.billing_processing_job_requeue(
    row('00000000-0000-4000-8000-000000000711', 'bill07-operator', 1, '00000000-0000-4000-8000-000000000712')::private.job_context,
    '00000000-0000-4000-8000-000000000710', '00000000-0000-4000-8000-000000000713',
    'Provider parser fixed'
  )),
  'pending',
  'an allowed provider contract dead letter can be requeued'
);
select is((select retry_attempts from public.billing_processing_jobs where id = '00000000-0000-4000-8000-000000000710'), 0, 'requeue resets only the current retry cycle');
select is((select attempts from public.billing_processing_jobs where id = '00000000-0000-4000-8000-000000000710'), 8, 'requeue preserves lifetime attempts');
select is((select requeue_count from public.billing_processing_jobs where id = '00000000-0000-4000-8000-000000000710'), 1, 'requeue increments its audit counter');
select is((select fence from public.billing_processing_jobs where id = '00000000-0000-4000-8000-000000000710'), 3::bigint, 'requeue advances the fence');
select is((select last_requeue_operation_id from public.billing_processing_jobs where id = '00000000-0000-4000-8000-000000000710'), '00000000-0000-4000-8000-000000000713'::uuid, 'requeue stores its operation id');
select is(
  (select replayed from private.billing_processing_job_requeue(
    row('00000000-0000-4000-8000-000000000711', 'bill07-operator', 1, '00000000-0000-4000-8000-000000000712')::private.job_context,
    '00000000-0000-4000-8000-000000000710', '00000000-0000-4000-8000-000000000713',
    'same operation replay'
  )),
  true,
  'the same requeue operation is idempotent'
);
select throws_ok(
  $$select * from private.billing_processing_job_requeue(
    row('00000000-0000-4000-8000-000000000711', 'bill07-operator', 1, '00000000-0000-4000-8000-000000000712')::private.job_context,
    '00000000-0000-4000-8000-000000000710', '00000000-0000-4000-8000-000000000714', 'second operation'
  )$$,
  'P0001', 'job_requeue_not_allowed', 'a pending job cannot be requeued twice concurrently'
);
select is((select count(*)::integer from public.audit_logs where event_type = 'billing.job.requeued' and target_id = '00000000-0000-4000-8000-000000000710'), 1, 'requeue is audited once despite replay');
select is((select processing_status from public.billing_webhook_events where id = '00000000-0000-4000-8000-000000000716'), 'queued', 'requeue reopens the inbox event');

insert into public.billing_processing_jobs (
  id, job_kind, webhook_event_id, state, error_class, error_code,
  last_error_class, last_error_code, max_attempts, attempts, retry_attempts,
  fence
) values (
  '00000000-0000-4000-8000-000000000717', 'webhook_order_discovery',
  '00000000-0000-4000-8000-000000000718', 'manual_review', 'billing_verification',
  'CONTRACT_CONFLICT', 'billing_verification', 'CONTRACT_CONFLICT',
  8, 8, 8, 2
);

select throws_ok(
  $$select * from private.billing_processing_job_requeue(
    row('00000000-0000-4000-8000-000000000711', 'bill07-operator', 1, '00000000-0000-4000-8000-000000000712')::private.job_context,
    '00000000-0000-4000-8000-000000000717', '00000000-0000-4000-8000-000000000715', 'permanent failure'
  )$$,
  'P0001', 'job_requeue_not_allowed', 'a non-requeueable dead letter stays manual'
);

select * from finish();

rollback;
