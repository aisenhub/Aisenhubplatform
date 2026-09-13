-- BILL-14: safely reopen provider-contract discovery failures after a parser fix.
-- Only the maintenance worker can use this boundary, and only the exact
-- provider-contract failure is eligible for requeue.

create or replace function private.billing_processing_job_requeue_contract(
  p_ctx private.job_context,
  p_job_id uuid
)
returns table (job_id uuid, state text, fence bigint)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_job public.billing_processing_jobs;
begin
  if (p_ctx).job_id is null or (p_ctx).lease_owner is null
     or (p_ctx).fencing_token is null or (p_ctx).fencing_token < 1
     or (p_ctx).request_id is null or p_job_id is null then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  select * into v_job
  from public.billing_processing_jobs j
  where j.id = p_job_id
    and j.state = 'manual_review'
    and j.job_kind = 'webhook_order_discovery'
    and j.error_code = 'PROVIDER_RESPONSE_INVALID'
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'job_requeue_not_allowed';
  end if;

  update public.billing_processing_jobs
  set state = 'pending', lease_owner = null, lease_until = null,
      error_class = null, error_code = null,
      next_attempt_at = clock_timestamp()
  where id = p_job_id and state = 'manual_review';

  if v_job.webhook_event_id is not null then
    update public.billing_webhook_events
    set processing_status = 'queued', processed_at = null, error_code = null
    where id = v_job.webhook_event_id;
  end if;

  return query
    select j.id, j.state, j.fence
    from public.billing_processing_jobs j
    where j.id = p_job_id;
end;
$$;

alter function private.billing_processing_job_requeue_contract(private.job_context, uuid)
  owner to domain_owner;

revoke all on function private.billing_processing_job_requeue_contract(private.job_context, uuid)
  from public, anon, authenticated, account_executor, admin_executor,
    recovery_executor, billing_ingress;
grant execute on function private.billing_processing_job_requeue_contract(private.job_context, uuid)
  to job_executor;
