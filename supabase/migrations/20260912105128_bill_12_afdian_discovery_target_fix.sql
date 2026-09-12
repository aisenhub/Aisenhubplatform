-- Forward-fix BILL-11: qualify the unique constraint target so PL/pgSQL
-- output columns cannot shadow the billing_orders column names.

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
  on conflict on constraint billing_orders_provider_account_id_provider_order_no_key
  do nothing;

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

alter function private.billing_webhook_discovery_target(private.job_context, uuid, bigint) owner to domain_owner;
revoke all on function private.billing_webhook_discovery_target(private.job_context, uuid, bigint)
  from public, anon, authenticated, account_executor, admin_executor, recovery_executor, billing_ingress;
grant execute on function private.billing_webhook_discovery_target(private.job_context, uuid, bigint) to job_executor;
