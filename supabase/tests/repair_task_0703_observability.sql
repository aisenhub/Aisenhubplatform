begin;

select plan(34);

select has_table('private', 'billing_refund_observations', 'refund observations are durable facts');
select has_table('private', 'billing_operational_alerts', 'operational alerts have durable lifecycle state');
select has_function('private', 'billing_observability_snapshot', array[]::text[], 'observability snapshot exists');
select has_function('private', 'billing_alerts_evaluate', array['private.job_context', 'jsonb'], 'alert evaluation exists');
select has_function('private', 'billing_alert_delivery_update', array['private.job_context', 'uuid', 'text', 'text'], 'alert delivery update exists');
select has_function('private', 'billing_refund_observation_record', array['private.job_context', 'uuid', 'text', 'text', 'uuid', 'text', 'numeric', 'text', 'jsonb'], 'refund observation writer exists');
select has_function('private', 'admin_billing_observability', array['private.admin_context'], 'admin observability wrapper exists');
select ok((select relforcerowsecurity from pg_class where oid = 'private.billing_refund_observations'::regclass), 'refund observations keep forced RLS');
select ok((select relforcerowsecurity from pg_class where oid = 'private.billing_operational_alerts'::regclass), 'operational alerts keep forced RLS');
select ok(has_function_privilege('job_executor', 'private.billing_alerts_evaluate(private.job_context, jsonb)', 'execute'), 'job executor can evaluate alerts');
select ok(not has_table_privilege('job_executor', 'private.billing_operational_alerts', 'select'), 'job executor cannot read alert table directly');
select ok(not has_table_privilege('admin_executor', 'private.billing_refund_observations', 'select'), 'admin executor cannot read refund facts directly');

select is(
  (select pending_count from private.billing_observability_snapshot()),
  0::bigint,
  'empty local snapshot has no pending jobs'
);
select is(
  (select processing_count from private.billing_observability_snapshot()),
  0::bigint,
  'empty local snapshot has no processing jobs'
);

insert into public.billing_provider_accounts (id, provider, name, status, secret_reference)
values (
  '00000000-0000-4070-8300-000000000701', 'afdian', 'TASK-0703 fixture',
  'active', 'not-a-real-secret-reference'
);
insert into public.billing_orders (
  id, provider_account_id, provider_order_no, provider_status,
  verification_status, entitlement_status, linkage_status,
  created_at, updated_at
) values
  ('00000000-0000-4070-8300-000000000702', '00000000-0000-4070-8300-000000000701', '0703-pending', 'paid', 'verified', 'blocked', 'unlinked', now() - interval '20 minutes', now() - interval '20 minutes'),
  ('00000000-0000-4070-8300-000000000703', '00000000-0000-4070-8300-000000000701', '0703-processing', 'paid', 'verified', 'blocked', 'unlinked', now() - interval '10 minutes', now() - interval '10 minutes'),
  ('00000000-0000-4070-8300-000000000704', '00000000-0000-4070-8300-000000000701', '0703-retryable', 'paid', 'verified', 'blocked', 'unlinked', now() - interval '5 minutes', now() - interval '5 minutes'),
  ('00000000-0000-4070-8300-000000000705', '00000000-0000-4070-8300-000000000701', '0703-manual', 'paid', 'verified', 'blocked', 'unlinked', now() - interval '5 minutes', now() - interval '5 minutes'),
  ('00000000-0000-4070-8300-000000000706', '00000000-0000-4070-8300-000000000701', '0703-completed', 'paid', 'verified', 'granted', 'unlinked', now() - interval '1 minute', now() - interval '1 minute');
insert into public.billing_processing_jobs (
  id, job_kind, billing_order_id, state, attempts, max_attempts,
  retry_attempts, lease_owner, lease_until, error_class, error_code,
  created_at, updated_at
) values
  ('00000000-0000-4070-8300-000000000707', 'order_verification', '00000000-0000-4070-8300-000000000702', 'pending', 1, 8, 1, null, null, null, null, now() - interval '20 minutes', now() - interval '20 minutes'),
  ('00000000-0000-4070-8300-000000000708', 'order_verification', '00000000-0000-4070-8300-000000000703', 'processing', 2, 8, 2, 'worker-0703', now() - interval '1 minute', 'lease', 'LEASE_EXPIRED', now() - interval '10 minutes', now() - interval '2 minutes'),
  ('00000000-0000-4070-8300-000000000709', 'order_verification', '00000000-0000-4070-8300-000000000704', 'retryable', 3, 8, 3, null, null, 'provider', 'PROVIDER_TIMEOUT', now() - interval '5 minutes', now() - interval '5 minutes'),
  ('00000000-0000-4070-8300-000000000710', 'order_verification', '00000000-0000-4070-8300-000000000705', 'manual_review', 8, 8, 8, null, null, 'dead_letter', 'RETRY_BUDGET_EXHAUSTED', now() - interval '5 minutes', now() - interval '5 minutes'),
  ('00000000-0000-4070-8300-000000000711', 'order_verification', '00000000-0000-4070-8300-000000000706', 'completed', 1, 8, 1, null, null, null, null, now() - interval '1 minute', now() - interval '1 minute');
insert into public.billing_settlements (
  billing_order_id, platform_id, platform_account_id, settlement_kind,
  state, operation_id, decision_code, decision_reason
) values (
  '00000000-0000-4070-8300-000000000706', null, null, 'manual',
  'review_required', '00000000-0000-4070-8300-000000000712',
  'duplicate_payment', 'TASK-0703 duplicate payment fixture'
);
insert into public.billing_reconciliation_cursors (
  provider_account_id, stream, last_success_at, head_scan_at
) values
  ('00000000-0000-4070-8300-000000000701', 'discovery', now() - interval '30 minutes', now() - interval '30 minutes'),
  ('00000000-0000-4070-8300-000000000701', 'processing', now() - interval '5 minutes', now() - interval '5 minutes');
insert into private.billing_refund_observations (
  provider_account_id, provider_refund_id, provider_order_no,
  billing_order_id, status, refund_amount, currency, details
) values (
  '00000000-0000-4070-8300-000000000701', '0703-refund-1', '0703-completed',
  '00000000-0000-4070-8300-000000000706', 'compensation_pending', 9.90, 'CNY',
  '{"source":"fixture"}'::jsonb
);

select is((select pending_count from private.billing_observability_snapshot()), 1::bigint, 'snapshot counts pending jobs');
select is((select processing_count from private.billing_observability_snapshot()), 1::bigint, 'snapshot counts processing jobs');
select is((select retryable_count from private.billing_observability_snapshot()), 1::bigint, 'snapshot counts retryable jobs');
select is((select manual_review_count from private.billing_observability_snapshot()), 1::bigint, 'snapshot counts manual review jobs');
select is((select completed_count from private.billing_observability_snapshot()), 1::bigint, 'snapshot counts completed jobs');
select is((select expired_lease_count from private.billing_observability_snapshot()), 1::bigint, 'snapshot counts expired processing leases');
select is((select duplicate_payment_count from private.billing_observability_snapshot()), 1::bigint, 'snapshot counts duplicate payments');
select is((select refund_mismatch_count from private.billing_observability_snapshot()), 1::bigint, 'snapshot counts pending refund compensation');
select ok((select discovery_lag_seconds > 60 from private.billing_observability_snapshot()), 'snapshot keeps discovery freshness separate');

set local role job_executor;
create temporary table task_0703_alerts on commit drop as
select * from private.billing_alerts_evaluate(
  row(
    '00000000-0000-4070-8300-000000000713', 'worker-0703', 1,
    '00000000-0000-4070-8300-000000000714'
  )::private.job_context,
  '{"pending_age_seconds":60,"processing_age_seconds":60,"discovery_stale_seconds":60,"processing_stale_seconds":60}'::jsonb
);
set local role postgres;
select ok(exists (select 1 from task_0703_alerts where alert_key = 'billing.jobs.expired_lease'), 'expired lease creates an alert');
select ok(exists (select 1 from task_0703_alerts where alert_key = 'billing.refunds.compensation_pending'), 'refund mismatch creates an alert');
select ok(exists (select 1 from task_0703_alerts where alert_key = 'billing.reconciliation.discovery_stale'), 'discovery staleness creates an alert');
select ok(exists (select 1 from task_0703_alerts where alert_key = 'billing.reconciliation.processing_stale'), 'processing staleness creates an alert');

create temporary table task_0703_alerts_repeat on commit drop as
select * from private.billing_alerts_evaluate(
  row(
    '00000000-0000-4070-8300-000000000715', 'worker-0703', 1,
    '00000000-0000-4070-8300-000000000716'
  )::private.job_context,
  '{"pending_age_seconds":60,"processing_age_seconds":60,"discovery_stale_seconds":60,"processing_stale_seconds":60}'::jsonb
);
set local role postgres;
select ok(
  (select occurrence_count = 2 and needs_delivery from task_0703_alerts_repeat where alert_key = 'billing.jobs.expired_lease'),
  'repeated failures are deduplicated while delivery remains pending'
);

set local role job_executor;
create temporary table task_0703_delivery_success on commit drop as
select * from private.billing_alert_delivery_update(
  row('00000000-0000-4070-8300-000000000717', 'worker-0703', 1, '00000000-0000-4070-8300-000000000718')::private.job_context,
  (select alert_id from task_0703_alerts where alert_key = 'billing.jobs.expired_lease'),
  'delivered', null
);
set local role postgres;
select is(
  (select delivery_status from task_0703_delivery_success),
  'delivered',
  'delivery receiver success is recorded explicitly'
);

set local role job_executor;
create temporary table task_0703_delivery_failure on commit drop as
select * from private.billing_alert_delivery_update(
  row('00000000-0000-4070-8300-000000000719', 'worker-0703', 1, '00000000-0000-4070-8300-000000000720')::private.job_context,
  (select alert_id from task_0703_alerts where alert_key = 'billing.jobs.expired_lease'),
  'failed', 'ALERT_RECEIVER_UNAVAILABLE'
);
set local role postgres;
select is(
  (select delivery_status from task_0703_delivery_failure),
  'failed',
  'delivery receiver failure is retained for retry'
);

set local role postgres;
update public.billing_processing_jobs
set state = 'completed', lease_owner = null, lease_until = null
where id in (
  '00000000-0000-4070-8300-000000000707',
  '00000000-0000-4070-8300-000000000708',
  '00000000-0000-4070-8300-000000000709',
  '00000000-0000-4070-8300-000000000710'
);
update public.billing_settlements
set decision_code = 'granted', state = 'finalized'
where billing_order_id = '00000000-0000-4070-8300-000000000706';
update private.billing_refund_observations
set status = 'compensated', compensation_operation_id = '00000000-0000-4070-8300-000000000721', compensated_at = now()
where provider_refund_id = '0703-refund-1';
update public.billing_reconciliation_cursors
set last_success_at = now()
where provider_account_id = '00000000-0000-4070-8300-000000000701';

set local role job_executor;
create temporary table task_0703_recovered on commit drop as
select * from private.billing_alerts_evaluate(
  row(
    '00000000-0000-4070-8300-000000000722', 'worker-0703', 1,
    '00000000-0000-4070-8300-000000000723'
  )::private.job_context,
  '{"pending_age_seconds":3600,"processing_age_seconds":3600,"discovery_stale_seconds":3600,"processing_stale_seconds":3600}'::jsonb
);
set local role postgres;
select ok(exists (select 1 from task_0703_recovered where status = 'recovered'), 'resolved conditions emit recovery rows');
select ok((select count(*) from private.billing_operational_alerts where status = 'active') < (select count(*) from private.billing_operational_alerts), 'recovered alerts are not left active');

set local role postgres;
insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values ('00000000-0000-4070-8300-000000000724', 'authenticated', 'authenticated', 'task-0703-admin@example.invalid', 'not-a-real-password', now(), now());
insert into private.system_admin (user_id) values ('00000000-0000-4070-8300-000000000724');
insert into auth.sessions (id, user_id, created_at, updated_at, not_after)
values ('00000000-0000-4070-8300-000000000725', '00000000-0000-4070-8300-000000000724', now(), now(), now() + interval '1 hour');
set local role admin_executor;
create temporary table task_0703_admin_snapshot on commit drop as
select * from private.admin_billing_observability(
  row('00000000-0000-4070-8300-000000000724', '00000000-0000-4070-8300-000000000725', '00000000-0000-4070-8300-000000000726')::private.admin_context
);
set local role postgres;
select ok(
  (select alert_threshold_source = 'local_default' from task_0703_admin_snapshot),
  'admin wrapper exposes threshold provenance instead of hiding defaults'
);
select ok(
  (select jsonb_typeof(alerts) = 'array' from task_0703_admin_snapshot),
  'admin wrapper exposes a bounded alert array'
);

select * from finish();
rollback;
