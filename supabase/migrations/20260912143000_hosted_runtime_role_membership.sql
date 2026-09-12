-- BILL-11: allow the hosted Postgres runtime to enter the least-privilege
-- executor roles used by the Edge Functions.
--
-- Local tests run as a superuser and therefore hide this deployment
-- requirement. Supabase hosted functions connect through the postgres role,
-- which must be an explicit member before SET LOCAL ROLE can succeed.

do $$
declare
  v_role text;
begin
  if not exists (select 1 from pg_roles where rolname = 'postgres') then
    return;
  end if;

  foreach v_role in array array[
    'account_executor',
    'admin_executor',
    'job_executor',
    'recovery_executor',
    'billing_ingress'
  ] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      execute format('grant %I to %I', v_role, 'postgres');
    end if;
  end loop;
end;
$$;
