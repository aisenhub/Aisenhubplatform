-- RC-03 / TASK-0302
-- A processing lease is a time-bound capability.  Expired work can be
-- reclaimed with a new fence, while every database hand-off rejects the old
-- owner once the deadline has passed.

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
  return query
    with candidates as (
      select j.id
      from public.billing_processing_jobs j
      where (
        (j.state in ('pending', 'retryable') and j.next_attempt_at <= clock_timestamp())
        or (j.state = 'processing' and j.lease_until <= clock_timestamp())
      )
      order by j.next_attempt_at, j.created_at, j.id
      for update skip locked
      limit p_limit
    ), claimed as (
      update public.billing_processing_jobs j
      set state = 'processing', attempts = j.attempts + 1,
          lease_owner = (p_ctx).lease_owner,
          lease_until = clock_timestamp() + interval '60 seconds',
          fence = j.fence + 1,
          error_class = case when j.state = 'processing' then 'lease' else null end,
          error_code = case when j.state = 'processing' then 'LEASE_EXPIRED' else null end
      from candidates
      where j.id = candidates.id
      returning j.id, j.job_kind, j.webhook_event_id, j.billing_order_id,
        j.attempts, j.fence, j.lease_until
    ) select * from claimed;
end;
$$;

create or replace function private.billing_webhook_discovery_target(
  p_ctx private.job_context,
  p_job_id uuid,
  p_fence bigint
)
returns table (order_id uuid, provider_account_id uuid, provider_order_no text)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_job public.billing_processing_jobs;
  v_event public.billing_webhook_events;
  v_order public.billing_orders;
begin
  if (p_ctx).job_id is null or (p_ctx).lease_owner is null
     or (p_ctx).fencing_token is null or (p_ctx).request_id is null
     or p_job_id is null or p_fence is null
     or p_fence <> (p_ctx).fencing_token then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  select * into v_job from public.billing_processing_jobs j
  where j.id = p_job_id and j.state = 'processing'
    and j.lease_owner = (p_ctx).lease_owner and j.fence = p_fence
    and j.lease_until > clock_timestamp()
  for update;
  if not found then raise exception using errcode = '40001', message = 'fence_conflict'; end if;
  if v_job.job_kind <> 'webhook_order_discovery' or v_job.webhook_event_id is null then
    raise exception using errcode = '22023', message = 'invalid_job_kind';
  end if;

  select * into v_event from public.billing_webhook_events e
  where e.id = v_job.webhook_event_id
  for update;
  if not found or v_event.provider_order_no is null then
    raise exception using errcode = 'P0001', message = 'missing_provider_order_no';
  end if;

  insert into public.billing_orders(provider_account_id, provider_order_no)
  values (v_event.provider_account_id, v_event.provider_order_no)
  on conflict (provider_account_id, provider_order_no) do nothing;

  select * into v_order from public.billing_orders o
  where o.provider_account_id = v_event.provider_account_id
    and o.provider_order_no = v_event.provider_order_no
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'order_target_unavailable';
  end if;
  if v_job.billing_order_id is not null and v_job.billing_order_id <> v_order.id then
    raise exception using errcode = '40001', message = 'job_order_conflict';
  end if;

  update public.billing_processing_jobs
  set billing_order_id = v_order.id
  where id = p_job_id and state = 'processing'
    and lease_owner = (p_ctx).lease_owner and fence = p_fence
    and lease_until > clock_timestamp();
  if not found then raise exception using errcode = '40001', message = 'fence_conflict'; end if;
  update public.billing_webhook_events
  set processing_status = 'processing', error_code = null
  where id = v_event.id;

  return query select v_order.id, v_order.provider_account_id, v_order.provider_order_no;
end;
$$;

create or replace function private.billing_order_link_checkout(
  p_ctx private.job_context,
  p_job_id uuid,
  p_order_id uuid,
  p_fence bigint,
  p_custom_order_id text
)
returns table (order_id uuid, linked boolean)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_job public.billing_processing_jobs;
  v_order public.billing_orders;
  v_checkout public.billing_checkout_intents;
begin
  if (p_ctx).job_id is null or (p_ctx).lease_owner is null
     or (p_ctx).fencing_token is null or (p_ctx).request_id is null
     or p_job_id is null or p_order_id is null or p_fence is null
     or p_fence <> (p_ctx).fencing_token then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_job from public.billing_processing_jobs j
  where j.id = p_job_id and j.state = 'processing'
    and j.lease_owner = (p_ctx).lease_owner and j.fence = p_fence
    and j.lease_until > clock_timestamp()
  for update;
  if not found then raise exception using errcode = '40001', message = 'fence_conflict'; end if;
  if v_job.billing_order_id is not null and v_job.billing_order_id <> p_order_id then
    raise exception using errcode = '40001', message = 'job_order_conflict';
  end if;

  select * into v_order from public.billing_orders o where o.id = p_order_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  if v_order.checkout_intent_id is null and p_custom_order_id is not null
     and length(p_custom_order_id) between 1 and 256 then
    select * into v_checkout
    from public.billing_checkout_intents c
    where c.provider_account_id = v_order.provider_account_id
      and c.custom_order_id = p_custom_order_id
    order by c.created_at desc, c.id desc
    limit 1
    for update;
    if found then
      update public.billing_orders set
        checkout_intent_id = v_checkout.id,
        platform_id = v_checkout.platform_id,
        platform_account_id = v_checkout.platform_account_id,
        subscription_product_id = v_checkout.subscription_product_id,
        linkage_status = 'linked'
      where id = v_order.id and checkout_intent_id is null;
    end if;
  end if;

  update public.billing_processing_jobs set updated_at = clock_timestamp()
  where id = p_job_id and state = 'processing'
    and lease_owner = (p_ctx).lease_owner and fence = p_fence
    and lease_until > clock_timestamp();
  if not found then raise exception using errcode = '40001', message = 'fence_conflict'; end if;
  select * into v_order from public.billing_orders o where o.id = p_order_id;
  return query select v_order.id, v_order.checkout_intent_id is not null;
end;
$$;

create or replace function private.billing_order_query_target(
  p_ctx private.job_context,
  p_job_id uuid,
  p_order_id uuid,
  p_fence bigint
)
returns table (provider_account_id uuid, provider_order_no text)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_job public.billing_processing_jobs;
  v_order public.billing_orders;
begin
  if (p_ctx).job_id is null or (p_ctx).lease_owner is null
     or (p_ctx).fencing_token is null or (p_ctx).request_id is null
     or p_job_id is null or p_order_id is null or p_fence is null
     or p_fence <> (p_ctx).fencing_token then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_job from public.billing_processing_jobs j
  where j.id = p_job_id and j.state = 'processing'
    and j.lease_owner = (p_ctx).lease_owner and j.fence = p_fence
    and j.lease_until > clock_timestamp();
  if not found then raise exception using errcode = '40001', message = 'fence_conflict'; end if;
  if v_job.billing_order_id is not null and v_job.billing_order_id <> p_order_id then
    raise exception using errcode = '40001', message = 'job_order_conflict';
  end if;
  select * into v_order from public.billing_orders o where o.id = p_order_id;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  return query select v_order.provider_account_id, v_order.provider_order_no;
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
  v_result_job_id uuid;
  v_result_state text;
  v_result_fence bigint;
begin
  if (p_ctx).job_id is null or (p_ctx).lease_owner is null
     or (p_ctx).fencing_token is null or (p_ctx).request_id is null
     or p_job_id is null or p_fence is null or p_fence <> (p_ctx).fencing_token
     or p_state not in ('retryable', 'completed', 'manual_review') then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_job from public.billing_processing_jobs j
  where j.id = p_job_id and j.state = 'processing'
    and j.lease_owner = (p_ctx).lease_owner and j.fence = p_fence
    and j.lease_until > clock_timestamp()
  for update;
  if not found then raise exception using errcode = '40001', message = 'fence_conflict'; end if;
  v_event_id := v_job.webhook_event_id;

  update public.billing_processing_jobs j
  set state = p_state, lease_owner = null, lease_until = null,
      error_class = p_error_class, error_code = p_error_code,
      next_attempt_at = case when p_state = 'retryable'
        then clock_timestamp() + interval '1 minute' else j.next_attempt_at end
  where j.id = p_job_id and j.state = 'processing'
    and j.lease_owner = (p_ctx).lease_owner and j.fence = p_fence
    and j.lease_until > clock_timestamp()
  returning j.id, j.state, j.fence
  into v_result_job_id, v_result_state, v_result_fence;
  if not found then raise exception using errcode = '40001', message = 'fence_conflict'; end if;

  if v_event_id is not null then
    update public.billing_webhook_events
    set processing_status = case p_state
          when 'retryable' then 'retryable'
          when 'manual_review' then 'manual_review'
          else 'processed'
        end,
        processed_at = case when p_state in ('completed', 'manual_review')
          then clock_timestamp() else null end,
        error_code = case when p_state = 'completed' then null else p_error_code end
    where id = v_event_id;
  end if;
  return query select v_result_job_id, v_result_state, v_result_fence;
end;
$$;

create or replace function private.billing_reconciliation_cursor_update(
  p_ctx private.job_context,
  p_provider_account_id uuid,
  p_stream text,
  p_expected_version bigint,
  p_high_water_created_at timestamptz,
  p_high_water_order_no text,
  p_page_cursor text,
  p_success boolean,
  p_error_code text default null
)
returns table (
  provider_account_id uuid,
  stream text,
  version bigint,
  high_water_created_at timestamptz,
  high_water_order_no text,
  page_cursor text,
  last_success_at timestamptz,
  last_error_code text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_cursor public.billing_reconciliation_cursors;
begin
  if (p_ctx).job_id is null or (p_ctx).lease_owner is null
     or (p_ctx).fencing_token is null or (p_ctx).fencing_token < 1
     or (p_ctx).request_id is null or p_provider_account_id is null
     or p_stream not in ('discovery', 'processing')
     or p_expected_version is null or p_expected_version < 0 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if not exists (
    select 1 from public.billing_processing_jobs j
    where j.id = (p_ctx).job_id and j.state = 'processing'
      and j.lease_owner = (p_ctx).lease_owner
      and j.fence = (p_ctx).fencing_token
      and j.lease_until > clock_timestamp()
  ) then
    raise exception using errcode = '40001', message = 'fence_conflict';
  end if;
  select * into v_cursor from public.billing_reconciliation_cursors c
  where c.provider_account_id = p_provider_account_id and c.stream = p_stream for update;
  if not found then
    if p_expected_version <> 0 then raise exception using errcode = '40001', message = 'cursor_conflict'; end if;
    insert into public.billing_reconciliation_cursors (
      provider_account_id, stream, version, high_water_created_at, high_water_order_no,
      page_cursor, head_scan_at, last_success_at, last_error_code
    ) values (
      p_provider_account_id, p_stream, 1, p_high_water_created_at, p_high_water_order_no,
      p_page_cursor, clock_timestamp(), case when p_success then clock_timestamp() else null end,
      case when p_success then null else p_error_code end
    ) returning * into v_cursor;
  else
    if v_cursor.version <> p_expected_version then
      raise exception using errcode = '40001', message = 'cursor_conflict';
    end if;
    update public.billing_reconciliation_cursors as c set
      version = c.version + 1,
      high_water_created_at = case when p_high_water_created_at is not null and (c.high_water_created_at is null or (p_high_water_created_at, coalesce(p_high_water_order_no, '')) > (c.high_water_created_at, coalesce(c.high_water_order_no, ''))) then p_high_water_created_at else c.high_water_created_at end,
      high_water_order_no = case when p_high_water_created_at is not null and (c.high_water_created_at is null or (p_high_water_created_at, coalesce(p_high_water_order_no, '')) > (c.high_water_created_at, coalesce(c.high_water_order_no, ''))) then p_high_water_order_no else c.high_water_order_no end,
      page_cursor = p_page_cursor,
      head_scan_at = clock_timestamp(),
      last_success_at = case when p_success then clock_timestamp() else c.last_success_at end,
      last_error_code = case when p_success then null else p_error_code end
    where c.id = v_cursor.id returning c.* into v_cursor;
  end if;
  return query select v_cursor.provider_account_id, v_cursor.stream, v_cursor.version,
    v_cursor.high_water_created_at, v_cursor.high_water_order_no, v_cursor.page_cursor,
    v_cursor.last_success_at, v_cursor.last_error_code;
end;
$$;

alter function private.billing_processing_job_claim(private.job_context, integer) owner to domain_owner;
alter function private.billing_webhook_discovery_target(private.job_context, uuid, bigint) owner to domain_owner;
alter function private.billing_order_link_checkout(private.job_context, uuid, uuid, bigint, text) owner to domain_owner;
alter function private.billing_order_query_target(private.job_context, uuid, uuid, bigint) owner to domain_owner;
alter function private.billing_processing_job_finish(private.job_context, uuid, bigint, text, text, text) owner to domain_owner;
alter function private.billing_reconciliation_cursor_update(private.job_context, uuid, text, bigint, timestamptz, text, text, boolean, text) owner to domain_owner;

revoke all on function private.billing_processing_job_claim(private.job_context, integer),
  private.billing_webhook_discovery_target(private.job_context, uuid, bigint),
  private.billing_order_link_checkout(private.job_context, uuid, uuid, bigint, text),
  private.billing_order_query_target(private.job_context, uuid, uuid, bigint),
  private.billing_processing_job_finish(private.job_context, uuid, bigint, text, text, text),
  private.billing_reconciliation_cursor_update(private.job_context, uuid, text, bigint, timestamptz, text, text, boolean, text)
  from public, anon, authenticated, account_executor, admin_executor, recovery_executor, billing_ingress;

grant execute on function private.billing_processing_job_claim(private.job_context, integer),
  private.billing_webhook_discovery_target(private.job_context, uuid, bigint),
  private.billing_order_link_checkout(private.job_context, uuid, uuid, bigint, text),
  private.billing_order_query_target(private.job_context, uuid, uuid, bigint),
  private.billing_processing_job_finish(private.job_context, uuid, bigint, text, text, text),
  private.billing_reconciliation_cursor_update(private.job_context, uuid, text, bigint, timestamptz, text, text, boolean, text)
  to job_executor;
