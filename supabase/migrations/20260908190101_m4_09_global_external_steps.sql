create or replace function private.deletion_job_file_list(
  p_ctx private.job_context,
  p_job_id uuid,
  p_lease_fence bigint
)
returns table (
  file_id uuid, storage_bucket text, storage_path text,
  status text, write_outcome text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_job private.deletion_jobs;
begin
  if (p_ctx).job_id is null or (p_ctx).lease_owner is null
     or (p_ctx).fencing_token is null or (p_ctx).request_id is null
     or p_job_id is null or p_lease_fence is null or p_lease_fence < 1 then
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
  if not found or v_job.state <> 'running' or v_job.checkpoint <> 'files_blocked'
     or v_job.fence <> (p_ctx).fencing_token then
    raise exception using errcode = '40001', message = 'stale_job_fence';
  end if;
  return query
    select f.id, f.storage_bucket, f.storage_path, f.status, f.write_outcome
    from public.platform_config_files f
    join public.platform_accounts a on a.id = f.platform_account_id
    where a.user_id = v_job.user_id and f.status <> 'deleted'
    order by f.id;
end;
$$;

create or replace function private.deletion_job_auth_target(
  p_ctx private.job_context,
  p_job_id uuid,
  p_lease_fence bigint
)
returns table (user_id uuid)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_job private.deletion_jobs;
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
  return query select v_job.user_id;
end;
$$;

alter function private.deletion_job_file_list(private.job_context, uuid, bigint) owner to domain_owner;
alter function private.deletion_job_auth_target(private.job_context, uuid, bigint) owner to domain_owner;
revoke all on function private.deletion_job_file_list(private.job_context, uuid, bigint),
  private.deletion_job_auth_target(private.job_context, uuid, bigint)
  from public, anon, authenticated, account_executor, admin_executor, recovery_executor;
grant execute on function private.deletion_job_file_list(private.job_context, uuid, bigint),
  private.deletion_job_auth_target(private.job_context, uuid, bigint)
  to job_executor;
