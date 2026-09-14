-- TASK-0703: durable billing observability facts and alert lifecycle.
--
-- This migration deliberately does not choose the final production SLA.  The
-- threshold function exposes local defaults for deterministic tests and lets
-- the worker supply an approved threshold set later.  A missing receiver
-- keeps delivery pending; it is never reported as delivered just because the
-- database row was written.

create table private.billing_refund_observations (
  id uuid primary key default gen_random_uuid(),
  provider_account_id uuid not null references public.billing_provider_accounts(id) on delete restrict,
  provider_refund_id text not null check (length(provider_refund_id) between 1 and 256),
  provider_order_no text not null check (length(provider_order_no) between 1 and 256),
  billing_order_id uuid references public.billing_orders(id) on delete restrict,
  status text not null default 'compensation_pending'
    check (status in ('observed', 'compensation_pending', 'compensated', 'rejected')),
  refund_amount numeric(12, 2) check (refund_amount is null or refund_amount >= 0),
  currency text check (currency is null or currency = 'CNY'),
  compensation_operation_id uuid,
  compensated_at timestamptz,
  observed_at timestamptz not null default clock_timestamp(),
  details jsonb not null default '{}'::jsonb
    check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (provider_account_id, provider_refund_id),
  check (
    (status = 'compensated' and compensation_operation_id is not null and compensated_at is not null)
    or status <> 'compensated'
  )
);

create index billing_refund_observations_status_idx
  on private.billing_refund_observations(status, observed_at, id);
create index billing_refund_observations_order_idx
  on private.billing_refund_observations(billing_order_id, status, observed_at desc)
  where billing_order_id is not null;

alter table private.billing_refund_observations enable row level security;
alter table private.billing_refund_observations force row level security;
create policy billing_refund_observations_domain_owner
  on private.billing_refund_observations for all to domain_owner
  using (true) with check (true);
revoke all on private.billing_refund_observations
  from public, anon, authenticated, account_executor, admin_executor,
    job_executor, recovery_executor, billing_ingress;
grant select, insert, update on private.billing_refund_observations to domain_owner;
create trigger billing_refund_observations_set_updated_at
  before update on private.billing_refund_observations for each row
  execute function private.set_updated_at();

create table private.billing_operational_alerts (
  id uuid primary key default gen_random_uuid(),
  alert_key text not null unique check (length(alert_key) between 1 and 128),
  severity text not null check (severity in ('warning', 'high', 'critical')),
  status text not null default 'active' check (status in ('active', 'recovered')),
  fingerprint text not null check (length(fingerprint) between 1 and 64),
  occurrence_count bigint not null default 1 check (occurrence_count > 0),
  first_seen_at timestamptz not null default clock_timestamp(),
  last_seen_at timestamptz not null default clock_timestamp(),
  recovered_at timestamptz,
  delivery_status text not null default 'pending'
    check (delivery_status in ('pending', 'delivered', 'failed')),
  delivery_attempts integer not null default 0 check (delivery_attempts >= 0),
  last_delivery_at timestamptz,
  last_delivery_error text,
  details jsonb not null default '{}'::jsonb
    check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check ((status = 'active' and recovered_at is null) or (status = 'recovered' and recovered_at is not null))
);

create index billing_operational_alerts_status_idx
  on private.billing_operational_alerts(status, severity, last_seen_at desc, id);
create index billing_operational_alerts_delivery_idx
  on private.billing_operational_alerts(delivery_status, updated_at desc)
  where delivery_status in ('pending', 'failed');

alter table private.billing_operational_alerts enable row level security;
alter table private.billing_operational_alerts force row level security;
create policy billing_operational_alerts_domain_owner
  on private.billing_operational_alerts for all to domain_owner
  using (true) with check (true);
revoke all on private.billing_operational_alerts
  from public, anon, authenticated, account_executor, admin_executor,
    job_executor, recovery_executor, billing_ingress;
grant select, insert, update on private.billing_operational_alerts to domain_owner;
create trigger billing_operational_alerts_set_updated_at
  before update on private.billing_operational_alerts for each row
  execute function private.set_updated_at();

create or replace function private.billing_cron_observability()
returns table (
  scheduler_last_accepted_at timestamptz,
  scheduler_last_completed_at timestamptz,
  scheduler_failure_count bigint
)
language sql
stable
security definer
set search_path = pg_catalog, private
as $$
  select
    max(i.request_accepted_at) filter (where i.scheduler_state = 'queued'),
    max(i.http_completed_at) filter (where i.scheduler_state = 'queued' and i.business_state in ('completed', 'completed_with_failures')),
    count(*) filter (where i.scheduled_at >= clock_timestamp() - interval '24 hours' and (i.scheduler_state = 'queue_failed' or i.business_state = 'failed'))::bigint
  from private.billing_cron_invocations i;
$$;

create or replace function private.billing_alert_threshold_defaults()
returns jsonb
language sql
immutable
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'pending_age_seconds', 900,
    'processing_age_seconds', 120,
    'discovery_stale_seconds', 900,
    'processing_stale_seconds', 900,
    'expired_lease_count', 1,
    'manual_review_count', 1,
    'duplicate_payment_count', 1,
    'retry_budget_exhausted_count', 1,
    'refund_mismatch_count', 1,
    'scheduler_failure_count', 1
  );
$$;

create or replace function private.billing_observability_snapshot()
returns table (
  observed_at timestamptz,
  pending_count bigint,
  processing_count bigint,
  retryable_count bigint,
  completed_count bigint,
  manual_review_count bigint,
  oldest_pending_age_seconds numeric,
  oldest_processing_age_seconds numeric,
  expired_lease_count bigint,
  retry_attempts_total bigint,
  retry_budget_exhausted_count bigint,
  duplicate_payment_count bigint,
  refund_mismatch_count bigint,
  discovery_last_success_at timestamptz,
  processing_last_success_at timestamptz,
  discovery_lag_seconds numeric,
  processing_lag_seconds numeric,
  scheduler_last_accepted_at timestamptz,
  scheduler_last_completed_at timestamptz,
  scheduler_failure_count bigint
)
language sql
stable
security definer
set search_path = pg_catalog, private, public
as $$
  with now_value as (
    select clock_timestamp() as observed_at
  ),
  jobs as (
    select
      count(*) filter (where j.state = 'pending')::bigint as pending_count,
      count(*) filter (where j.state = 'processing')::bigint as processing_count,
      count(*) filter (where j.state = 'retryable')::bigint as retryable_count,
      count(*) filter (where j.state = 'completed')::bigint as completed_count,
      count(*) filter (where j.state = 'manual_review')::bigint as manual_review_count,
      min(j.created_at) filter (where j.state in ('pending', 'retryable')) as oldest_pending_created_at,
      min(j.created_at) filter (where j.state = 'processing') as oldest_processing_created_at,
      count(*) filter (where j.state = 'processing' and j.lease_until <= n.observed_at)::bigint as expired_lease_count,
      coalesce(sum(j.retry_attempts) filter (where j.state in ('pending', 'processing', 'retryable', 'manual_review')), 0)::bigint as retry_attempts_total,
      count(*) filter (where j.retry_attempts >= j.max_attempts)::bigint as retry_budget_exhausted_count
    from public.billing_processing_jobs j
    cross join now_value n
  ),
  cursors as (
    select
      max(c.last_success_at) filter (where c.stream = 'discovery') as discovery_last_success_at,
      max(c.last_success_at) filter (where c.stream = 'processing') as processing_last_success_at
    from public.billing_reconciliation_cursors c
  ),
  scheduler as (
    select * from private.billing_cron_observability()
  )
  select
    n.observed_at,
    j.pending_count,
    j.processing_count,
    j.retryable_count,
    j.completed_count,
    j.manual_review_count,
    greatest(extract(epoch from (n.observed_at - j.oldest_pending_created_at)), 0),
    greatest(extract(epoch from (n.observed_at - j.oldest_processing_created_at)), 0),
    j.expired_lease_count,
    j.retry_attempts_total,
    j.retry_budget_exhausted_count,
    (select count(*)::bigint from public.billing_settlements s where s.decision_code = 'duplicate_payment'),
    (select count(*)::bigint from private.billing_refund_observations r where r.status = 'compensation_pending'),
    c.discovery_last_success_at,
    c.processing_last_success_at,
    case when c.discovery_last_success_at is null then null else extract(epoch from (n.observed_at - c.discovery_last_success_at)) end,
    case when c.processing_last_success_at is null then null else extract(epoch from (n.observed_at - c.processing_last_success_at)) end,
    s.scheduler_last_accepted_at,
    s.scheduler_last_completed_at,
    s.scheduler_failure_count
  from now_value n
  cross join jobs j
  cross join cursors c
  cross join scheduler s;
$$;

create or replace function private.billing_alerts_evaluate(
  p_ctx private.job_context,
  p_thresholds jsonb default '{}'::jsonb
)
returns table (
  alert_id uuid,
  alert_key text,
  severity text,
  status text,
  fingerprint text,
  occurrence_count bigint,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  recovered_at timestamptz,
  delivery_status text,
  delivery_attempts integer,
  details jsonb,
  needs_delivery boolean
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_thresholds jsonb;
  v_key text;
  v_value jsonb;
  v_metrics record;
  v_item jsonb;
  v_alert record;
  v_fingerprint text;
  v_now timestamptz := clock_timestamp();
  v_expected jsonb := '[]'::jsonb;
  v_threshold numeric;
begin
  if (p_ctx).job_id is null or (p_ctx).lease_owner is null
     or length((p_ctx).lease_owner) not between 1 and 128
     or (p_ctx).fencing_token is null or (p_ctx).fencing_token < 1
     or (p_ctx).request_id is null
     or p_thresholds is null or jsonb_typeof(p_thresholds) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  for v_key, v_value in
    select key, value from jsonb_each(p_thresholds)
  loop
    if v_key not in (
      'pending_age_seconds', 'processing_age_seconds',
      'discovery_stale_seconds', 'processing_stale_seconds',
      'expired_lease_count', 'manual_review_count',
      'duplicate_payment_count', 'retry_budget_exhausted_count',
      'refund_mismatch_count', 'scheduler_failure_count'
    ) or jsonb_typeof(v_value) <> 'number' or (v_value #>> '{}')::numeric <= 0 then
      raise exception using errcode = '22023', message = 'invalid_thresholds';
    end if;
  end loop;

  v_thresholds := private.billing_alert_threshold_defaults() || p_thresholds;
  select * into v_metrics from private.billing_observability_snapshot();

  if coalesce(v_metrics.oldest_pending_age_seconds, 0) >= (v_thresholds->>'pending_age_seconds')::numeric then
    v_expected := v_expected || jsonb_build_array(jsonb_build_object(
      'alert_key', 'billing.jobs.pending_age', 'severity', 'high',
      'details', jsonb_build_object('metric', 'oldest_pending_age_seconds', 'value', v_metrics.oldest_pending_age_seconds, 'threshold', (v_thresholds->>'pending_age_seconds')::numeric, 'observed_at', v_metrics.observed_at)
    ));
  end if;
  if coalesce(v_metrics.oldest_processing_age_seconds, 0) >= (v_thresholds->>'processing_age_seconds')::numeric then
    v_expected := v_expected || jsonb_build_array(jsonb_build_object(
      'alert_key', 'billing.jobs.processing_age', 'severity', 'high',
      'details', jsonb_build_object('metric', 'oldest_processing_age_seconds', 'value', v_metrics.oldest_processing_age_seconds, 'threshold', (v_thresholds->>'processing_age_seconds')::numeric, 'observed_at', v_metrics.observed_at)
    ));
  end if;
  if v_metrics.expired_lease_count >= (v_thresholds->>'expired_lease_count')::numeric then
    v_expected := v_expected || jsonb_build_array(jsonb_build_object(
      'alert_key', 'billing.jobs.expired_lease', 'severity', 'critical',
      'details', jsonb_build_object('metric', 'expired_lease_count', 'value', v_metrics.expired_lease_count, 'threshold', (v_thresholds->>'expired_lease_count')::numeric, 'observed_at', v_metrics.observed_at)
    ));
  end if;
  if v_metrics.manual_review_count >= (v_thresholds->>'manual_review_count')::numeric then
    v_expected := v_expected || jsonb_build_array(jsonb_build_object(
      'alert_key', 'billing.jobs.manual_review', 'severity', 'high',
      'details', jsonb_build_object('metric', 'manual_review_count', 'value', v_metrics.manual_review_count, 'threshold', (v_thresholds->>'manual_review_count')::numeric, 'observed_at', v_metrics.observed_at)
    ));
  end if;
  if v_metrics.retry_budget_exhausted_count >= (v_thresholds->>'retry_budget_exhausted_count')::numeric then
    v_expected := v_expected || jsonb_build_array(jsonb_build_object(
      'alert_key', 'billing.jobs.retry_budget_exhausted', 'severity', 'critical',
      'details', jsonb_build_object('metric', 'retry_budget_exhausted_count', 'value', v_metrics.retry_budget_exhausted_count, 'threshold', (v_thresholds->>'retry_budget_exhausted_count')::numeric, 'observed_at', v_metrics.observed_at)
    ));
  end if;
  if v_metrics.duplicate_payment_count >= (v_thresholds->>'duplicate_payment_count')::numeric then
    v_expected := v_expected || jsonb_build_array(jsonb_build_object(
      'alert_key', 'billing.payments.duplicate', 'severity', 'high',
      'details', jsonb_build_object('metric', 'duplicate_payment_count', 'value', v_metrics.duplicate_payment_count, 'threshold', (v_thresholds->>'duplicate_payment_count')::numeric, 'observed_at', v_metrics.observed_at)
    ));
  end if;
  if v_metrics.refund_mismatch_count >= (v_thresholds->>'refund_mismatch_count')::numeric then
    v_expected := v_expected || jsonb_build_array(jsonb_build_object(
      'alert_key', 'billing.refunds.compensation_pending', 'severity', 'critical',
      'details', jsonb_build_object('metric', 'refund_mismatch_count', 'value', v_metrics.refund_mismatch_count, 'threshold', (v_thresholds->>'refund_mismatch_count')::numeric, 'observed_at', v_metrics.observed_at)
    ));
  end if;
  if v_metrics.discovery_last_success_at is null
     or coalesce(v_metrics.discovery_lag_seconds, 0) >= (v_thresholds->>'discovery_stale_seconds')::numeric then
    v_expected := v_expected || jsonb_build_array(jsonb_build_object(
      'alert_key', 'billing.reconciliation.discovery_stale', 'severity', 'critical',
      'details', jsonb_build_object('metric', 'discovery_lag_seconds', 'value', v_metrics.discovery_lag_seconds, 'threshold', (v_thresholds->>'discovery_stale_seconds')::numeric, 'last_success_at', v_metrics.discovery_last_success_at, 'observed_at', v_metrics.observed_at)
    ));
  end if;
  if v_metrics.processing_last_success_at is null
     or coalesce(v_metrics.processing_lag_seconds, 0) >= (v_thresholds->>'processing_stale_seconds')::numeric then
    v_expected := v_expected || jsonb_build_array(jsonb_build_object(
      'alert_key', 'billing.reconciliation.processing_stale', 'severity', 'critical',
      'details', jsonb_build_object('metric', 'processing_lag_seconds', 'value', v_metrics.processing_lag_seconds, 'threshold', (v_thresholds->>'processing_stale_seconds')::numeric, 'last_success_at', v_metrics.processing_last_success_at, 'observed_at', v_metrics.observed_at)
    ));
  end if;
  if v_metrics.scheduler_failure_count >= (v_thresholds->>'scheduler_failure_count')::numeric then
    v_expected := v_expected || jsonb_build_array(jsonb_build_object(
      'alert_key', 'billing.scheduler.delivery_failed', 'severity', 'high',
      'details', jsonb_build_object('metric', 'scheduler_failure_count', 'value', v_metrics.scheduler_failure_count, 'threshold', (v_thresholds->>'scheduler_failure_count')::numeric, 'observed_at', v_metrics.observed_at)
    ));
  end if;

  for v_item in select value from jsonb_array_elements(v_expected)
  loop
    v_key := v_item->>'alert_key';
    v_fingerprint := md5((v_item->'details')::text);
    select a.* into v_alert
    from private.billing_operational_alerts as a
    where a.alert_key = v_key
    for update;
    if not found then
      insert into private.billing_operational_alerts (
        alert_key, severity, status, fingerprint, occurrence_count,
        first_seen_at, last_seen_at, delivery_status, details
      ) values (
        v_key, v_item->>'severity', 'active', v_fingerprint, 1,
        v_now, v_now, 'pending', v_item->'details'
      ) returning * into v_alert;
    else
      update private.billing_operational_alerts as a
      set severity = v_item->>'severity', status = 'active',
          fingerprint = v_fingerprint,
          occurrence_count = case when a.status = 'active' then a.occurrence_count + 1 else 1 end,
          first_seen_at = case when a.status = 'active' then a.first_seen_at else v_now end,
          last_seen_at = v_now, recovered_at = null,
          delivery_status = case
            when a.status = 'recovered' or a.fingerprint <> v_fingerprint or a.delivery_status = 'failed' then 'pending'
            else a.delivery_status
          end,
          last_delivery_error = case
            when a.status = 'recovered' or a.fingerprint <> v_fingerprint then null
            else a.last_delivery_error
          end,
          details = v_item->'details', updated_at = v_now
      where a.id = v_alert.id
      returning * into v_alert;
    end if;
    alert_id := v_alert.id;
    alert_key := v_alert.alert_key;
    severity := v_alert.severity;
    status := v_alert.status;
    fingerprint := v_alert.fingerprint;
    occurrence_count := v_alert.occurrence_count;
    first_seen_at := v_alert.first_seen_at;
    last_seen_at := v_alert.last_seen_at;
    recovered_at := v_alert.recovered_at;
    delivery_status := v_alert.delivery_status;
    delivery_attempts := v_alert.delivery_attempts;
    details := v_alert.details;
    needs_delivery := v_alert.delivery_status = 'pending';
    return next;
  end loop;

  for v_alert in
    select a.*
    from private.billing_operational_alerts a
    where a.status = 'active'
      and not exists (
        select 1 from jsonb_array_elements(v_expected) item
        where item->>'alert_key' = a.alert_key
      )
    for update
  loop
    update private.billing_operational_alerts as a
    set status = 'recovered', recovered_at = v_now, last_seen_at = v_now,
        delivery_status = 'pending',
        details = a.details || jsonb_build_object('recovered_at', v_now),
        updated_at = v_now
    where a.id = v_alert.id
    returning * into v_alert;
    alert_id := v_alert.id;
    alert_key := v_alert.alert_key;
    severity := v_alert.severity;
    status := v_alert.status;
    fingerprint := v_alert.fingerprint;
    occurrence_count := v_alert.occurrence_count;
    first_seen_at := v_alert.first_seen_at;
    last_seen_at := v_alert.last_seen_at;
    recovered_at := v_alert.recovered_at;
    delivery_status := v_alert.delivery_status;
    delivery_attempts := v_alert.delivery_attempts;
    details := v_alert.details;
    needs_delivery := true;
    return next;
  end loop;
end;
$$;

create or replace function private.billing_alert_delivery_update(
  p_ctx private.job_context,
  p_alert_id uuid,
  p_delivery_status text,
  p_error_code text default null
)
returns table (
  alert_id uuid,
  alert_key text,
  status text,
  delivery_status text,
  delivery_attempts integer,
  last_delivery_error text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_alert private.billing_operational_alerts;
begin
  if (p_ctx).job_id is null or (p_ctx).lease_owner is null
     or (p_ctx).fencing_token is null or (p_ctx).fencing_token < 1
     or (p_ctx).request_id is null or p_alert_id is null
     or p_delivery_status not in ('delivered', 'failed')
     or (p_error_code is not null and (length(p_error_code) < 1 or length(p_error_code) > 128)) then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  update private.billing_operational_alerts as a
  set delivery_status = p_delivery_status,
      delivery_attempts = a.delivery_attempts + 1,
      last_delivery_at = clock_timestamp(),
      last_delivery_error = case when p_delivery_status = 'failed' then p_error_code else null end,
      updated_at = clock_timestamp()
  where a.id = p_alert_id
  returning * into v_alert;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  return query select v_alert.id, v_alert.alert_key, v_alert.status,
    v_alert.delivery_status, v_alert.delivery_attempts, v_alert.last_delivery_error;
end;
$$;

create or replace function private.billing_refund_observation_record(
  p_ctx private.job_context,
  p_provider_account_id uuid,
  p_provider_refund_id text,
  p_provider_order_no text,
  p_billing_order_id uuid,
  p_status text,
  p_refund_amount numeric,
  p_currency text,
  p_details jsonb default '{}'::jsonb
)
returns table (observation_id uuid, status text, billing_order_id uuid)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_observation private.billing_refund_observations;
begin
  if (p_ctx).job_id is null or (p_ctx).lease_owner is null
     or (p_ctx).fencing_token is null or (p_ctx).fencing_token < 1
     or (p_ctx).request_id is null or p_provider_account_id is null
     or p_provider_refund_id is null or length(p_provider_refund_id) not between 1 and 256
     or p_provider_order_no is null or length(p_provider_order_no) not between 1 and 256
     or p_status not in ('observed', 'compensation_pending', 'compensated', 'rejected')
     or (p_refund_amount is not null and p_refund_amount < 0)
     or (p_currency is not null and p_currency <> 'CNY')
     or p_details is null or jsonb_typeof(p_details) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  insert into private.billing_refund_observations (
    provider_account_id, provider_refund_id, provider_order_no,
    billing_order_id, status, refund_amount, currency, details
  ) values (
    p_provider_account_id, p_provider_refund_id, p_provider_order_no,
    p_billing_order_id, p_status, p_refund_amount, p_currency, p_details
  )
  on conflict (provider_account_id, provider_refund_id) do update
  set provider_order_no = excluded.provider_order_no,
      billing_order_id = excluded.billing_order_id,
      status = case when private.billing_refund_observations.status = 'compensated'
        and excluded.status <> 'compensated'
        then private.billing_refund_observations.status else excluded.status end,
      refund_amount = excluded.refund_amount,
      currency = excluded.currency,
      details = excluded.details,
      updated_at = clock_timestamp()
  returning * into v_observation;
  return query select v_observation.id, v_observation.status, v_observation.billing_order_id;
end;
$$;

create or replace function private.admin_billing_observability(p_ctx private.admin_context)
returns table (
  observed_at timestamptz,
  pending_count bigint,
  processing_count bigint,
  retryable_count bigint,
  completed_count bigint,
  manual_review_count bigint,
  oldest_pending_age_seconds numeric,
  oldest_processing_age_seconds numeric,
  expired_lease_count bigint,
  retry_attempts_total bigint,
  retry_budget_exhausted_count bigint,
  duplicate_payment_count bigint,
  refund_mismatch_count bigint,
  discovery_last_success_at timestamptz,
  processing_last_success_at timestamptz,
  discovery_lag_seconds numeric,
  processing_lag_seconds numeric,
  scheduler_last_accepted_at timestamptz,
  scheduler_last_completed_at timestamptz,
  scheduler_failure_count bigint,
  active_alert_count bigint,
  pending_alert_delivery_count bigint,
  alert_thresholds jsonb,
  alert_threshold_source text,
  alerts jsonb
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
begin
  perform private.billing_admin_assert(p_ctx);
  return query
    select m.*,
      (select count(*)::bigint from private.billing_operational_alerts where status = 'active'),
      (select count(*)::bigint from private.billing_operational_alerts where delivery_status in ('pending', 'failed')),
      private.billing_alert_threshold_defaults(),
      'local_default'::text,
      coalesce((select jsonb_agg(jsonb_build_object(
        'alert_id', a.id, 'alert_key', a.alert_key, 'severity', a.severity,
        'status', a.status, 'occurrence_count', a.occurrence_count,
        'first_seen_at', a.first_seen_at, 'last_seen_at', a.last_seen_at,
        'recovered_at', a.recovered_at, 'delivery_status', a.delivery_status,
        'delivery_attempts', a.delivery_attempts, 'last_delivery_error', a.last_delivery_error,
        'details', a.details
      ) order by case a.severity when 'critical' then 1 when 'high' then 2 else 3 end, a.last_seen_at desc)
      from private.billing_operational_alerts a where a.status = 'active'), '[]'::jsonb)
    from private.billing_observability_snapshot() m;
end;
$$;

alter function private.billing_alert_threshold_defaults() owner to domain_owner;
alter function private.billing_cron_observability() owner to postgres;
alter function private.billing_observability_snapshot() owner to domain_owner;
alter function private.billing_alerts_evaluate(private.job_context, jsonb) owner to domain_owner;
alter function private.billing_alert_delivery_update(private.job_context, uuid, text, text) owner to domain_owner;
alter function private.billing_refund_observation_record(private.job_context, uuid, text, text, uuid, text, numeric, text, jsonb) owner to domain_owner;
alter function private.admin_billing_observability(private.admin_context) owner to domain_owner;

revoke all on function private.billing_alert_threshold_defaults() from public, anon, authenticated, account_executor, admin_executor, job_executor, recovery_executor, billing_ingress;
revoke all on function private.billing_cron_observability() from public, anon, authenticated, account_executor, admin_executor, job_executor, recovery_executor, billing_ingress;
grant execute on function private.billing_cron_observability() to domain_owner;
revoke all on function private.billing_observability_snapshot() from public, anon, authenticated, account_executor, admin_executor, job_executor, recovery_executor, billing_ingress;
revoke all on function private.billing_alerts_evaluate(private.job_context, jsonb) from public, anon, authenticated, account_executor, admin_executor, recovery_executor, billing_ingress;
revoke all on function private.billing_alert_delivery_update(private.job_context, uuid, text, text) from public, anon, authenticated, account_executor, admin_executor, recovery_executor, billing_ingress;
revoke all on function private.billing_refund_observation_record(private.job_context, uuid, text, text, uuid, text, numeric, text, jsonb) from public, anon, authenticated, account_executor, admin_executor, recovery_executor, billing_ingress;
revoke all on function private.admin_billing_observability(private.admin_context) from public, anon, authenticated, account_executor, job_executor, recovery_executor, billing_ingress;
grant execute on function private.billing_alerts_evaluate(private.job_context, jsonb) to job_executor;
grant execute on function private.billing_alert_delivery_update(private.job_context, uuid, text, text) to job_executor;
grant execute on function private.billing_refund_observation_record(private.job_context, uuid, text, text, uuid, text, numeric, text, jsonb) to job_executor;
grant execute on function private.admin_billing_observability(private.admin_context) to admin_executor;
