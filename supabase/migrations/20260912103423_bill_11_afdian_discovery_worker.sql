-- BILL-11: turn a verified webhook signal into a durable local order target.
-- Provider I/O remains in the maintenance worker; these functions only own
-- short, fenced database transitions.

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
  for update;
  if not found then
    raise exception using errcode = '40001', message = 'fence_conflict';
  end if;
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
  where id = p_job_id and lease_owner = (p_ctx).lease_owner and fence = p_fence;
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
  for update;
  if not found then
    raise exception using errcode = '40001', message = 'fence_conflict';
  end if;
  if v_job.billing_order_id is not null and v_job.billing_order_id <> p_order_id then
    raise exception using errcode = '40001', message = 'job_order_conflict';
  end if;

  select * into v_order from public.billing_orders o where o.id = p_order_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
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

  select * into v_order from public.billing_orders o where o.id = p_order_id;
  return query select v_order.id, v_order.checkout_intent_id is not null;
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
  for update;
  if not found then
    raise exception using errcode = '40001', message = 'fence_conflict';
  end if;
  v_event_id := v_job.webhook_event_id;

  update public.billing_processing_jobs j
  set state = p_state, lease_owner = null, lease_until = null,
      error_class = p_error_class, error_code = p_error_code,
      next_attempt_at = case when p_state = 'retryable'
        then clock_timestamp() + interval '1 minute' else j.next_attempt_at end
  where j.id = p_job_id and j.state = 'processing'
    and j.lease_owner = (p_ctx).lease_owner and j.fence = p_fence
  returning j.id, j.state, j.fence
  into v_result_job_id, v_result_state, v_result_fence;
  if not found then
    raise exception using errcode = '40001', message = 'fence_conflict';
  end if;

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

alter function private.billing_webhook_discovery_target(private.job_context, uuid, bigint) owner to domain_owner;
alter function private.billing_order_link_checkout(private.job_context, uuid, uuid, bigint, text) owner to domain_owner;
alter function private.billing_processing_job_finish(private.job_context, uuid, bigint, text, text, text) owner to domain_owner;

revoke all on function private.billing_webhook_discovery_target(private.job_context, uuid, bigint)
  from public, anon, authenticated, account_executor, admin_executor, recovery_executor, billing_ingress;
revoke all on function private.billing_order_link_checkout(private.job_context, uuid, uuid, bigint, text)
  from public, anon, authenticated, account_executor, admin_executor, recovery_executor, billing_ingress;
revoke all on function private.billing_processing_job_finish(private.job_context, uuid, bigint, text, text, text)
  from public, anon, authenticated, account_executor, admin_executor, recovery_executor, billing_ingress;

grant execute on function private.billing_webhook_discovery_target(private.job_context, uuid, bigint) to job_executor;
grant execute on function private.billing_order_link_checkout(private.job_context, uuid, uuid, bigint, text) to job_executor;
grant execute on function private.billing_processing_job_finish(private.job_context, uuid, bigint, text, text, text) to job_executor;
