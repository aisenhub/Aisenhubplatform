-- TASK-0702: make the hosted Billing scheduler fail-closed, route-safe, and
-- observable without editing the already-applied BILL-16 migration.

create table private.billing_cron_invocations (
  id uuid primary key default gen_random_uuid(),
  request_id bigint unique,
  endpoint_path text not null default '/maintenance/v1/billing/jobs/run'
    check (endpoint_path = '/maintenance/v1/billing/jobs/run'),
  requested_limit integer not null check (requested_limit between 1 and 20),
  scheduler_state text not null
    check (scheduler_state in ('skipped', 'queued', 'queue_failed')),
  business_state text not null default 'pending'
    check (business_state in (
      'not_applicable', 'pending', 'completed', 'completed_with_failures', 'failed'
    )),
  error_code text
    check (error_code is null or length(error_code) between 1 and 96),
  http_status_code integer
    check (http_status_code is null or http_status_code between 100 and 599),
  http_timed_out boolean,
  processed_count integer
    check (processed_count is null or processed_count >= 0),
  failed_count integer
    check (failed_count is null or failed_count >= 0),
  response_summary jsonb not null default '{}'::jsonb
    check (jsonb_typeof(response_summary) = 'object'),
  scheduled_at timestamptz not null default clock_timestamp(),
  request_accepted_at timestamptz,
  http_completed_at timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  constraint billing_cron_invocations_queue_state_ck check (
    (scheduler_state = 'queued' and request_id is not null)
    or (scheduler_state <> 'queued' and request_id is null)
  ),
  constraint billing_cron_invocations_business_state_ck check (
    (scheduler_state = 'queued' and business_state in ('pending', 'completed', 'completed_with_failures', 'failed'))
    or (scheduler_state <> 'queued' and business_state = 'not_applicable')
  )
);

create index billing_cron_invocations_scheduled_idx
  on private.billing_cron_invocations (scheduled_at desc, id desc);

create index billing_cron_invocations_pending_idx
  on private.billing_cron_invocations (request_id)
  where scheduler_state = 'queued' and http_completed_at is null;

alter table private.billing_cron_invocations enable row level security;
alter table private.billing_cron_invocations force row level security;
create policy billing_cron_invocations_postgres
  on private.billing_cron_invocations for all to postgres
  using (true) with check (true);
revoke all on private.billing_cron_invocations
  from public, anon, authenticated, account_executor, admin_executor,
    job_executor, recovery_executor, billing_ingress;
grant select, insert, update, delete on private.billing_cron_invocations to postgres;

create or replace function private.billing_maintenance_endpoint(p_function_url text)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_base text := rtrim(nullif(btrim(p_function_url), ''), '/');
begin
  if v_base is null
     or v_base !~* '^https?://'
     or v_base ~ '[?#]' then
    return null;
  end if;

  if v_base ~* '/maintenance/v1/billing/jobs/run$' then
    return v_base;
  end if;

  if v_base ~* '/maintenance$' then
    return v_base || '/v1/billing/jobs/run';
  end if;

  return null;
end;
$$;

revoke all on function private.billing_maintenance_endpoint(text) from public;
grant execute on function private.billing_maintenance_endpoint(text) to postgres;

create or replace function private.billing_maintenance_cron_observe()
returns void
language plpgsql
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_response record;
  v_body jsonb;
  v_processed integer;
  v_failed integer;
  v_summary jsonb;
  v_business_state text;
  v_error_code text;
begin
  for v_response in
    select i.id, r.status_code, r.timed_out, r.error_msg, r.content, r.created
    from private.billing_cron_invocations i
    join net._http_response r on r.id = i.request_id
    where i.scheduler_state = 'queued'
      and i.http_completed_at is null
    order by i.scheduled_at, i.id
    limit 20
  loop
    v_body := '{}'::jsonb;
    if v_response.content is not null then
      begin
        v_body := v_response.content::jsonb;
      exception when others then
        v_body := '{}'::jsonb;
      end;
    end if;

    v_processed := null;
    if jsonb_typeof(v_body->'processed') = 'number'
       and (v_body->>'processed') ~ '^[0-9]+$' then
      v_processed := (v_body->>'processed')::integer;
    end if;

    v_failed := 0;
    if jsonb_typeof(v_body->'results') = 'array' then
      select count(*)::integer
      into v_failed
      from jsonb_array_elements(v_body->'results') as result(item)
      where (result.item->>'status') in ('failed', 'invalid_claim')
         or (result.item->>'status') ~ '^[4-9][0-9][0-9]$';
    end if;

    v_error_code := case
      when coalesce(v_response.timed_out, false) then 'HTTP_TIMEOUT'
      when v_response.error_msg is not null then 'HTTP_REQUEST_FAILED'
      when v_response.status_code is null then 'HTTP_STATUS_MISSING'
      when v_response.status_code < 200 or v_response.status_code >= 300
        then 'HTTP_' || v_response.status_code::text
      when v_processed is null then 'WORKER_RESPONSE_INVALID'
      else null
    end;

    v_business_state := case
      when v_error_code is not null then 'failed'
      when v_failed > 0 then 'completed_with_failures'
      else 'completed'
    end;

    v_summary := jsonb_build_object(
      'processed', v_processed,
      'failed', v_failed,
      'result_count', case
        when jsonb_typeof(v_body->'results') = 'array'
          then jsonb_array_length(v_body->'results')
        else 0
      end
    );

    update private.billing_cron_invocations
    set business_state = v_business_state,
        error_code = v_error_code,
        http_status_code = v_response.status_code,
        http_timed_out = v_response.timed_out,
        processed_count = v_processed,
        failed_count = v_failed,
        response_summary = v_summary,
        http_completed_at = v_response.created,
        updated_at = clock_timestamp()
    where id = v_response.id;
  end loop;

  -- Keep the operational history bounded while retaining enough data for
  -- incident review. pg_net itself retains response rows for only six hours.
  delete from private.billing_cron_invocations
  where scheduled_at < clock_timestamp() - interval '30 days';
end;
$$;

revoke all on function private.billing_maintenance_cron_observe() from public;
grant execute on function private.billing_maintenance_cron_observe() to postgres;

create or replace function private.billing_maintenance_cron()
returns void
language plpgsql
security definer
set search_path = pg_catalog, private, public
as $$
declare
  function_url text;
  worker_token text;
  endpoint text;
  request_id bigint;
begin
  perform private.billing_maintenance_cron_observe();

  if not pg_try_advisory_xact_lock(7092026090702::bigint) then
    insert into private.billing_cron_invocations (
      requested_limit, scheduler_state, business_state, error_code
    ) values (5, 'skipped', 'not_applicable', 'OVERLAPPING_INVOCATION');
    return;
  end if;

  select decrypted_secret
  into function_url
  from vault.decrypted_secrets
  where name = 'billing_maintenance_function_url'
  limit 1;

  select decrypted_secret
  into worker_token
  from vault.decrypted_secrets
  where name = 'billing_maintenance_job_token'
  limit 1;

  if nullif(btrim(function_url), '') is null
     or nullif(btrim(worker_token), '') is null then
    insert into private.billing_cron_invocations (
      requested_limit, scheduler_state, business_state, error_code
    ) values (5, 'skipped', 'not_applicable', 'MISSING_RUNTIME_CONFIG');
    return;
  end if;

  endpoint := private.billing_maintenance_endpoint(function_url);
  if endpoint is null then
    insert into private.billing_cron_invocations (
      requested_limit, scheduler_state, business_state, error_code
    ) values (5, 'skipped', 'not_applicable', 'INVALID_FUNCTION_URL');
    return;
  end if;

  begin
    request_id := net.http_post(
      url := endpoint,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || worker_token
      ),
      body := jsonb_build_object('limit', 5),
      timeout_milliseconds := 5000
    );

    insert into private.billing_cron_invocations (
      request_id, requested_limit, scheduler_state, business_state,
      request_accepted_at
    ) values (
      request_id, 5, 'queued', 'pending', clock_timestamp()
    );
  exception when others then
    insert into private.billing_cron_invocations (
      requested_limit, scheduler_state, business_state, error_code
    ) values (5, 'queue_failed', 'not_applicable', 'PG_NET_ENQUEUE_FAILED');
  end;
end;
$$;

revoke all on function private.billing_maintenance_cron() from public;
grant execute on function private.billing_maintenance_cron() to postgres;

do $$
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'billing-worker-every-minute';

  perform cron.schedule(
    'billing-worker-every-minute',
    '* * * * *',
    'select private.billing_maintenance_cron();'
  );
end;
$$;
