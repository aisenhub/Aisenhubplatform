-- BILL-15: keep webhook event lifecycle in sync when billing settlement updates
-- the processing job directly instead of going through the generic finish RPC.

create or replace function private.billing_processing_job_sync_webhook_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private, public
as $$
begin
  if new.webhook_event_id is null
     or old.state is not distinct from new.state
     or new.state not in ('completed', 'retryable', 'manual_review') then
    return new;
  end if;

  update public.billing_webhook_events
  set processing_status = case new.state
        when 'retryable' then 'retryable'
        when 'manual_review' then 'manual_review'
        else 'processed'
      end,
      processed_at = case when new.state in ('completed', 'manual_review')
        then clock_timestamp() else null end,
      error_code = case when new.state = 'completed' then null else new.error_code end
  where id = new.webhook_event_id;
  return new;
end;
$$;

alter function private.billing_processing_job_sync_webhook_event()
  owner to domain_owner;

revoke all on function private.billing_processing_job_sync_webhook_event()
  from public, anon, authenticated, account_executor, admin_executor,
    job_executor, recovery_executor, billing_ingress;

drop trigger if exists billing_processing_jobs_sync_webhook_event
  on public.billing_processing_jobs;

create trigger billing_processing_jobs_sync_webhook_event
after update of state on public.billing_processing_jobs
for each row
when (old.state is distinct from new.state)
execute function private.billing_processing_job_sync_webhook_event();

-- Repair successful settlement events written before BILL-15.
update public.billing_webhook_events e
set processing_status = case j.state
      when 'retryable' then 'retryable'
      when 'manual_review' then 'manual_review'
      else 'processed'
    end,
    processed_at = case when j.state in ('completed', 'manual_review')
      then coalesce(e.processed_at, clock_timestamp()) else null end,
    error_code = case when j.state = 'completed' then null else j.error_code end
from public.billing_processing_jobs j
where j.webhook_event_id = e.id
  and j.state in ('completed', 'retryable', 'manual_review')
  and e.processing_status = 'processing';
