-- BILL-16: hosted Postgres owns the recurring trigger for the billing worker.
--
-- The function reads its endpoint and custom worker token from Vault at call
-- time. The migration is therefore safe to apply to an environment before
-- its runtime secrets are provisioned: that environment simply does nothing
-- until both secrets exist.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function private.billing_maintenance_cron()
returns void
language plpgsql
security definer
set search_path = pg_catalog, private, public
as $$
declare
  function_url text;
  worker_token text;
begin
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
    return;
  end if;

  perform net.http_post(
    url := rtrim(function_url, '/') || '/v1/billing/jobs/run',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || worker_token
    ),
    body := jsonb_build_object('limit', 5),
    timeout_milliseconds := 5000
  );
end;
$$;

revoke all on function private.billing_maintenance_cron() from public;
grant execute on function private.billing_maintenance_cron() to postgres;

do $$
begin
  -- Keep this migration safe to re-run during staging recovery without
  -- creating duplicate invocations.
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
