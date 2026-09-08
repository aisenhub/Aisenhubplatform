create or replace function private.deletion_job_auth_prepare(
  p_ctx private.job_context,
  p_job_id uuid,
  p_lease_fence bigint
)
returns table (detached_accounts integer)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_job private.deletion_jobs;
  v_count integer;
begin
  if not exists (
    select 1 from private.job_leases l
    where l.job_kind = 'global_delete' and l.resource_id = p_job_id
      and l.lease_owner = (p_ctx).lease_owner and l.fencing_token = p_lease_fence
  ) then
    raise exception using errcode = '40001', message = 'stale_job_fence';
  end if;
  select * into v_job from private.deletion_jobs j where j.id = p_job_id;
  if not found or v_job.state <> 'running' or v_job.checkpoint <> 'history_anonymized'
     or v_job.fence <> (p_ctx).fencing_token then
    raise exception using errcode = '40001', message = 'stale_job_fence';
  end if;
  update public.platform_accounts a
  set user_id = null, anonymized_at = coalesce(a.anonymized_at, clock_timestamp()),
    status = 'closed', closed_at = coalesce(a.closed_at, clock_timestamp())
  where a.user_id = v_job.user_id;
  get diagnostics v_count = row_count;
  return query select v_count;
end;
$$;

alter function private.deletion_job_auth_prepare(private.job_context, uuid, bigint) owner to domain_owner;
revoke all on function private.deletion_job_auth_prepare(private.job_context, uuid, bigint)
  from public, anon, authenticated, account_executor, admin_executor, recovery_executor;
grant execute on function private.deletion_job_auth_prepare(private.job_context, uuid, bigint)
  to job_executor;
