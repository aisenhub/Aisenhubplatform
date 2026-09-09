create or replace function private.deletion_job_backup_barrier_guard(
  p_ctx private.job_context,
  p_job_id uuid,
  p_lease_fence bigint
)
returns table (can_proceed boolean, error_code text)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_job private.deletion_jobs;
begin
  if (p_ctx).job_id is null or (p_ctx).lease_owner is null
     or (p_ctx).fencing_token is null or (p_ctx).fencing_token < 1
     or (p_ctx).request_id is null or p_job_id is null
     or p_lease_fence is null or p_lease_fence < 1 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if not exists (
    select 1 from private.job_leases l
    where l.job_kind = 'global_delete' and l.resource_id = p_job_id
      and l.lease_owner = (p_ctx).lease_owner and l.fencing_token = p_lease_fence
  ) then
    raise exception using errcode = '40001', message = 'stale_job_fence';
  end if;
  select * into v_job from private.deletion_jobs j where j.id = p_job_id;
  if not found or v_job.state <> 'running' or v_job.checkpoint <> 'accounts_closed'
     or v_job.fence <> (p_ctx).fencing_token then
    raise exception using errcode = '40001', message = 'stale_job_fence';
  end if;
  if exists (select 1 from private.file_backup_barriers b where b.state in ('active', 'running')) then
    return query select false, 'backup_barrier'::text;
    return;
  end if;
  return query select true, null::text;
end;
$$;

alter function private.deletion_job_backup_barrier_guard(private.job_context, uuid, bigint) owner to domain_owner;
revoke all on function private.deletion_job_backup_barrier_guard(private.job_context, uuid, bigint)
  from public, anon, authenticated, account_executor, admin_executor, recovery_executor;
grant execute on function private.deletion_job_backup_barrier_guard(private.job_context, uuid, bigint)
  to job_executor;
