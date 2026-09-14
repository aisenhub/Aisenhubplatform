-- TASK-0305: stable webhook identity and hash-conflict evidence.
-- A webhook is only an observation. This migration never grants an
-- entitlement from the ingress path; it only records an event and enqueues a
-- discovery job through the existing security-definer boundary.

create table public.billing_webhook_event_conflicts (
  id uuid primary key default gen_random_uuid(),
  provider_account_id uuid not null references public.billing_provider_accounts(id) on delete restrict,
  webhook_event_id uuid not null references public.billing_webhook_events(id) on delete restrict,
  provider_event_key text not null check (length(provider_event_key) between 1 and 256),
  existing_payload_hash bytea not null check (octet_length(existing_payload_hash) = 32),
  conflicting_payload_hash bytea not null check (octet_length(conflicting_payload_hash) = 32),
  observed_at timestamptz not null default clock_timestamp(),
  unique (provider_account_id, provider_event_key, conflicting_payload_hash)
);

alter table public.billing_webhook_event_conflicts enable row level security;
alter table public.billing_webhook_event_conflicts force row level security;

create policy billing_webhook_event_conflicts_domain_owner
  on public.billing_webhook_event_conflicts for all to domain_owner
  using (true) with check (true);

revoke all on public.billing_webhook_event_conflicts
  from public, anon, authenticated, account_executor, admin_executor,
    job_executor, recovery_executor, billing_ingress;
grant select, insert on public.billing_webhook_event_conflicts to domain_owner;

create index billing_webhook_event_conflicts_lookup_idx
  on public.billing_webhook_event_conflicts(provider_account_id, provider_event_key, observed_at desc);

create or replace function private.billing_webhook_ingest(
  p_provider_account_id uuid,
  p_provider_event_key text,
  p_payload_hash bytea,
  p_signature_status text,
  p_provider_order_no text
)
returns table (event_id uuid, job_id uuid, duplicate boolean, processing_status text)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_event public.billing_webhook_events;
  v_job public.billing_processing_jobs;
begin
  if p_provider_account_id is null or p_provider_event_key is null
     or length(p_provider_event_key) not between 1 and 256
     or p_payload_hash is null or octet_length(p_payload_hash) <> 32
     or p_signature_status not in ('verified', 'unverified', 'invalid', 'missing')
     or p_provider_order_no is null or length(p_provider_order_no) not between 1 and 256 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if not exists (select 1 from public.billing_provider_accounts pa where pa.id = p_provider_account_id) then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  insert into public.billing_webhook_events(
    provider_account_id, provider_event_key, payload_hash, signature_status,
    processing_status, provider_order_no
  ) values (
    p_provider_account_id, p_provider_event_key, p_payload_hash, p_signature_status,
    'queued', p_provider_order_no
  )
  on conflict (provider_account_id, provider_event_key) do nothing
  returning * into v_event;
  if not found then
    select e.* into v_event from public.billing_webhook_events e
    where e.provider_account_id = p_provider_account_id and e.provider_event_key = p_provider_event_key
    for update;
    if v_event.payload_hash <> p_payload_hash then
      insert into public.billing_webhook_event_conflicts (
        provider_account_id, webhook_event_id, provider_event_key,
        existing_payload_hash, conflicting_payload_hash
      ) values (
        p_provider_account_id, v_event.id, p_provider_event_key,
        v_event.payload_hash, p_payload_hash
      ) on conflict do nothing;
      update public.billing_webhook_events
      set processing_status = 'manual_review', error_code = 'WEBHOOK_PAYLOAD_CONFLICT'
      where id = v_event.id;
      select j.* into v_job from public.billing_processing_jobs j where j.webhook_event_id = v_event.id;
      return query select v_event.id, v_job.id, false, 'manual_review'::text;
      return;
    end if;
    select j.* into v_job from public.billing_processing_jobs j where j.webhook_event_id = v_event.id;
    return query select v_event.id, v_job.id, true, v_event.processing_status;
    return;
  end if;
  insert into public.billing_processing_jobs(job_kind, webhook_event_id)
  values ('webhook_order_discovery', v_event.id)
  returning * into v_job;
  return query select v_event.id, v_job.id, false, v_event.processing_status;
end;
$$;

alter function private.billing_webhook_ingest(uuid, text, bytea, text, text) owner to domain_owner;
revoke all on function private.billing_webhook_ingest(uuid, text, bytea, text, text)
  from public, anon, authenticated, account_executor, admin_executor, job_executor, recovery_executor;
grant execute on function private.billing_webhook_ingest(uuid, text, bytea, text, text) to billing_ingress;
