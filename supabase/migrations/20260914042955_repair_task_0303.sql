-- RC-03 / TASK-0303
-- Keep retry decisions observable and bounded.  `attempts` is the lifetime
-- execution count; `retry_attempts` is the current retry cycle and is reset
-- only by the controlled requeue boundary.

alter table public.billing_processing_jobs
  add column max_attempts integer not null default 8
    check (max_attempts between 1 and 100),
  add column retry_attempts integer not null default 0
    check (retry_attempts >= 0),
  add column requeue_count integer not null default 0
    check (requeue_count >= 0),
  add column dead_lettered_at timestamptz,
  add column last_error_class text,
  add column last_error_code text,
  add column last_requeue_operation_id uuid,
  add column last_requeue_at timestamptz,
  add column last_requeue_reason text;

update public.billing_processing_jobs
set retry_attempts = attempts
where retry_attempts = 0 and attempts > 0;

create index billing_processing_jobs_manual_review_idx
  on public.billing_processing_jobs (dead_lettered_at, updated_at, id)
  where state = 'manual_review';

create or replace function private.billing_processing_job_retry_delay_seconds(
  p_error_class text,
  p_error_code text,
  p_retry_attempt integer
)
returns integer
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_base integer;
  v_exponent integer;
begin
  if p_retry_attempt is null or p_retry_attempt < 1 then
    return 60;
  end if;
  v_base := case
    when p_error_code in ('PROVIDER_RATE_LIMITED', 'RATE_LIMITED') then 300
    when p_error_class = 'provider' then 60
    when p_error_class = 'worker' then 30
    else 60
  end;
  v_exponent := least(p_retry_attempt - 1, 5);
  return least(3600, v_base * power(2::numeric, v_exponent)::integer);
end;
$$;

create or replace function private.billing_processing_job_claim(
  p_ctx private.job_context,
  p_limit integer default 20
)
returns table (
  job_id uuid,
  job_kind text,
  webhook_event_id uuid,
  billing_order_id uuid,
  attempt integer,
  fence bigint,
  lease_until timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
begin
  if (p_ctx).job_id is null or (p_ctx).lease_owner is null
     or length((p_ctx).lease_owner) not between 1 and 128
     or (p_ctx).fencing_token is null or (p_ctx).fencing_token < 1
     or (p_ctx).request_id is null
     or p_limit is null or p_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  -- A crashed worker may leave a processing row at the retry ceiling.  Move
  -- it to the same searchable manual queue as an in-flight retry that reaches
  -- the ceiling; never reclaim it into an unbounded loop.
  with exhausted as (
    update public.billing_processing_jobs j
    set state = 'manual_review', lease_owner = null, lease_until = null,
        error_class = 'dead_letter', error_code = 'RETRY_BUDGET_EXHAUSTED',
        dead_lettered_at = coalesce(j.dead_lettered_at, clock_timestamp()),
        updated_at = clock_timestamp()
    where j.retry_attempts >= j.max_attempts
      and (
        j.state in ('pending', 'retryable')
        or (j.state = 'processing' and j.lease_until <= clock_timestamp())
      )
    returning j.webhook_event_id
  )
  update public.billing_webhook_events e
  set processing_status = 'manual_review', processed_at = clock_timestamp(),
      error_code = 'RETRY_BUDGET_EXHAUSTED'
  where e.id in (
    select exhausted.webhook_event_id
    from exhausted
    where exhausted.webhook_event_id is not null
  );

  return query
    with candidates as (
      select j.id
      from public.billing_processing_jobs j
      where (
        j.state in ('pending', 'retryable')
        and j.next_attempt_at <= clock_timestamp()
        and j.retry_attempts < j.max_attempts
      )
      or (
        j.state = 'processing'
        and j.lease_until <= clock_timestamp()
        and j.retry_attempts < j.max_attempts
      )
      order by j.next_attempt_at, j.created_at, j.id
      for update skip locked
      limit p_limit
    ), claimed as (
      update public.billing_processing_jobs j
      set state = 'processing', attempts = j.attempts + 1,
          retry_attempts = j.retry_attempts + 1,
          lease_owner = (p_ctx).lease_owner,
          lease_until = clock_timestamp() + interval '60 seconds',
          fence = j.fence + 1,
          error_class = case when j.state = 'processing' then 'lease' else null end,
          error_code = case when j.state = 'processing' then 'LEASE_EXPIRED' else null end,
          updated_at = clock_timestamp()
      from candidates
      where j.id = candidates.id
      returning j.id, j.job_kind, j.webhook_event_id, j.billing_order_id,
        j.attempts, j.fence, j.lease_until
    ) select * from claimed;
end;
$$;

create or replace function private.billing_processing_job_finish(
  p_ctx private.job_context,
  p_job_id uuid,
  p_fence bigint,
  p_state text,
  p_error_class text default null,
  p_error_code text default null
)
returns table (job_id uuid, state text, fence bigint)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_job public.billing_processing_jobs;
  v_event_id uuid;
  v_state text := p_state;
  v_error_class text := p_error_class;
  v_error_code text := p_error_code;
  v_delay integer;
  v_result_job_id uuid;
  v_result_state text;
  v_result_fence bigint;
begin
  if (p_ctx).job_id is null or (p_ctx).lease_owner is null
     or (p_ctx).fencing_token is null or (p_ctx).request_id is null
     or p_job_id is null or p_fence is null or p_fence <> (p_ctx).fencing_token
     or p_state not in ('retryable', 'completed', 'manual_review')
     or (p_state = 'retryable' and (p_error_class is null or p_error_code is null)) then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  select * into v_job
  from public.billing_processing_jobs j
  where j.id = p_job_id and j.state = 'processing'
    and j.lease_owner = (p_ctx).lease_owner and j.fence = p_fence
    and j.lease_until > clock_timestamp()
  for update;
  if not found then
    raise exception using errcode = '40001', message = 'fence_conflict';
  end if;
  v_event_id := v_job.webhook_event_id;

  if p_state = 'retryable' and v_job.retry_attempts >= v_job.max_attempts then
    v_state := 'manual_review';
    v_error_class := 'dead_letter';
    v_error_code := 'RETRY_BUDGET_EXHAUSTED';
  end if;
  if v_state = 'manual_review' then
    v_delay := null;
  else
    v_delay := private.billing_processing_job_retry_delay_seconds(
      v_error_class, v_error_code, v_job.retry_attempts
    ) + floor(random() * 30)::integer;
  end if;

  update public.billing_processing_jobs j
  set state = v_state, lease_owner = null, lease_until = null,
      error_class = v_error_class, error_code = v_error_code,
      last_error_class = p_error_class, last_error_code = p_error_code,
      dead_lettered_at = case when v_state = 'manual_review'
        then coalesce(j.dead_lettered_at, clock_timestamp()) else j.dead_lettered_at end,
      next_attempt_at = case when v_state = 'retryable'
        then clock_timestamp() + make_interval(secs => v_delay) else j.next_attempt_at end,
      updated_at = clock_timestamp()
  where j.id = p_job_id and j.state = 'processing'
    and j.lease_owner = (p_ctx).lease_owner and j.fence = p_fence
    and j.lease_until > clock_timestamp()
  returning j.id, j.state, j.fence
  into v_result_job_id, v_result_state, v_result_fence;
  if not found then
    raise exception using errcode = '40001', message = 'fence_conflict';
  end if;

  if v_event_id is not null then
    update public.billing_webhook_events
    set processing_status = case v_state
          when 'retryable' then 'retryable'
          when 'manual_review' then 'manual_review'
          else 'processed'
        end,
        processed_at = case when v_state in ('completed', 'manual_review')
          then clock_timestamp() else null end,
        error_code = case when v_state = 'completed' then null else v_error_code end
    where id = v_event_id;
  end if;
  return query select v_result_job_id, v_result_state, v_result_fence;
end;
$$;

create or replace function private.billing_processing_job_requeue(
  p_ctx private.job_context,
  p_job_id uuid,
  p_operation_id uuid,
  p_reason text
)
returns table (
  job_id uuid,
  state text,
  fence bigint,
  attempts integer,
  requeue_count integer,
  replayed boolean
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_job public.billing_processing_jobs;
  v_order public.billing_orders;
  v_settlement public.billing_settlements;
  v_platform_id uuid;
  v_platform_account_id uuid;
begin
  if (p_ctx).job_id is null or (p_ctx).lease_owner is null
     or (p_ctx).fencing_token is null or (p_ctx).fencing_token < 1
     or (p_ctx).request_id is null or p_job_id is null
     or p_operation_id is null or p_reason is null
     or length(p_reason) not between 1 and 1024 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  select * into v_job from public.billing_processing_jobs j
  where j.id = p_job_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  if v_job.last_requeue_operation_id = p_operation_id then
    return query select v_job.id, v_job.state, v_job.fence, v_job.attempts,
      v_job.requeue_count, true;
    return;
  end if;
  if v_job.state <> 'manual_review'
     or coalesce(v_job.last_error_class, v_job.error_class) not in
       ('provider', 'provider_contract', 'worker', 'dead_letter')
     or coalesce(v_job.last_error_code, v_job.error_code) not in (
       'PROVIDER_UNAVAILABLE', 'PROVIDER_ORDER_NOT_FOUND', 'PROVIDER_TIMEOUT',
       'PROVIDER_RATE_LIMITED', 'PROVIDER_RESPONSE_INVALID',
       'RETRY_BUDGET_EXHAUSTED', 'RATE_LIMITED'
     ) then
    raise exception using errcode = 'P0001', message = 'job_requeue_not_allowed';
  end if;

  if v_job.billing_order_id is not null then
    select * into v_order from public.billing_orders o
    where o.id = v_job.billing_order_id
    for update;
    if found then
      v_platform_id := v_order.platform_id;
      v_platform_account_id := v_order.platform_account_id;
      select * into v_settlement from public.billing_settlements s
      where s.billing_order_id = v_order.id
      order by s.created_at desc, s.id desc
      limit 1
      for update;
      if v_order.linkage_status = 'unlinked'
         or v_order.resolution_status = 'resolved'
         or (found and v_settlement.state = 'finalized') then
        raise exception using errcode = 'P0001', message = 'job_requeue_not_allowed';
      end if;
    end if;
  end if;

  update public.billing_processing_jobs j
  set state = 'pending', lease_owner = null, lease_until = null,
      error_class = null, error_code = null,
      next_attempt_at = clock_timestamp(), retry_attempts = 0,
      requeue_count = j.requeue_count + 1,
      last_requeue_operation_id = p_operation_id,
      last_requeue_at = clock_timestamp(), last_requeue_reason = p_reason,
      fence = j.fence + 1, updated_at = clock_timestamp()
  where j.id = p_job_id and j.state = 'manual_review'
  returning j.id, j.state, j.fence, j.attempts, j.requeue_count
  into v_job.id, v_job.state, v_job.fence, v_job.attempts, v_job.requeue_count;
  if not found then
    raise exception using errcode = '40001', message = 'job_requeue_conflict';
  end if;

  if v_job.webhook_event_id is not null then
    update public.billing_webhook_events e
    set processing_status = 'queued', processed_at = null, error_code = null
    where e.id = v_job.webhook_event_id;
  end if;
  perform private.audit_append(
    p_operation_id, 'job', null, v_platform_id, v_platform_account_id,
    'billing.job.requeued', 'billing_processing_job', p_job_id, null, null,
    jsonb_build_object('reason', p_reason, 'requeue_count', v_job.requeue_count)
  );
  return query select v_job.id, v_job.state, v_job.fence, v_job.attempts,
    v_job.requeue_count, false;
end;
$$;

alter function private.billing_processing_job_retry_delay_seconds(text, text, integer)
  owner to domain_owner;
alter function private.billing_processing_job_claim(private.job_context, integer)
  owner to domain_owner;
alter function private.billing_processing_job_finish(private.job_context, uuid, bigint, text, text, text)
  owner to domain_owner;
alter function private.billing_processing_job_requeue(private.job_context, uuid, uuid, text)
  owner to domain_owner;

revoke all on function private.billing_processing_job_retry_delay_seconds(text, text, integer),
  private.billing_processing_job_claim(private.job_context, integer),
  private.billing_processing_job_finish(private.job_context, uuid, bigint, text, text, text),
  private.billing_processing_job_requeue(private.job_context, uuid, uuid, text)
  from public, anon, authenticated, account_executor, admin_executor,
    recovery_executor, billing_ingress;
grant execute on function private.billing_processing_job_claim(private.job_context, integer),
  private.billing_processing_job_finish(private.job_context, uuid, bigint, text, text, text),
  private.billing_processing_job_requeue(private.job_context, uuid, uuid, text)
  to job_executor;
