-- OPT-003: read-only Admin projection for one live Auth identity's AisenHub
-- lifecycle. Global Delete mutations remain owned by admin_deletion_job_*.

create or replace function private.admin_identity_lifecycle_read(
  p_ctx private.admin_context,
  p_user_id uuid
)
returns table (
  user_id uuid,
  identity_state text,
  request_id uuid,
  request_state text,
  requested_at timestamptz,
  approved_at timestamptz,
  approved_by uuid,
  cancelled_at timestamptz,
  job_id uuid,
  job_state text,
  checkpoint text,
  retry_count integer,
  next_attempt_at timestamptz,
  last_error_code text,
  job_created_at timestamptz,
  completed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  if (p_ctx).admin_user_id is null
     or (p_ctx).session_id is null
     or not exists (
       select 1 from private.system_admin sa
       where sa.user_id = (p_ctx).admin_user_id
     )
     or not exists (
       select 1
       from private.check_user_session(
         (p_ctx).admin_user_id,
         (p_ctx).session_id
       )
       where active
     ) then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;

  return query
  select
    p_user_id,
    coalesce(lifecycle.state, 'active')::text,
    request.id,
    request.state,
    request.requested_at,
    request.approved_at,
    request.approved_by,
    request.cancelled_at,
    job.id,
    job.state,
    job.checkpoint,
    job.retry_count,
    job.next_attempt_at,
    job.last_error_code,
    job.created_at,
    job.completed_at
  from (select 1) anchor
  left join private.identity_lifecycle lifecycle
    on lifecycle.user_id = p_user_id
  left join lateral (
    select candidate.*
    from private.deletion_requests candidate
    where candidate.user_id = p_user_id
    order by
      (candidate.state in ('pending_admin', 'approved')) desc,
      candidate.requested_at desc,
      candidate.id desc
    limit 1
  ) request on true
  left join private.deletion_jobs job
    on job.request_id = request.id;
end;
$$;

alter function private.admin_identity_lifecycle_read(private.admin_context, uuid)
  owner to domain_owner;

revoke all on function private.admin_identity_lifecycle_read(private.admin_context, uuid)
  from public, anon, authenticated, account_executor, job_executor,
    recovery_executor, billing_ingress;
grant execute on function private.admin_identity_lifecycle_read(private.admin_context, uuid)
  to admin_executor;
