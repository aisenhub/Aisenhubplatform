-- Forward-fix M4-09 admin list/read checks. The returned user_id column
-- shadows the unqualified system_admin.user_id reference in PL/pgSQL.

create or replace function private.admin_deletion_job_list(
  p_ctx private.admin_context,
  p_limit integer default 20
)
returns table (
  job_id uuid, request_id uuid, user_id uuid, state text, checkpoint text,
  fence bigint, retry_count integer, next_attempt_at timestamptz,
  last_error_code text, created_at timestamptz, completed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
begin
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if not exists (
       select 1
       from private.system_admin sa
       where sa.user_id = (p_ctx).admin_user_id
     )
     or not exists (
       select 1
       from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id)
       where active
     ) then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
  return query
    select j.id, j.request_id, j.user_id, j.state, j.checkpoint, j.fence,
      j.retry_count, j.next_attempt_at, j.last_error_code, j.created_at, j.completed_at
    from private.deletion_jobs j
    order by j.created_at desc, j.id desc
    limit p_limit;
end;
$$;

create or replace function private.admin_deletion_job_read(
  p_ctx private.admin_context,
  p_job_id uuid
)
returns table (
  job_id uuid, request_id uuid, user_id uuid, state text, checkpoint text,
  fence bigint, retry_count integer, next_attempt_at timestamptz,
  last_error_code text, created_at timestamptz, completed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
begin
  if p_job_id is null then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if not exists (
       select 1
       from private.system_admin sa
       where sa.user_id = (p_ctx).admin_user_id
     )
     or not exists (
       select 1
       from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id)
       where active
     ) then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
  return query
    select j.id, j.request_id, j.user_id, j.state, j.checkpoint, j.fence,
      j.retry_count, j.next_attempt_at, j.last_error_code, j.created_at, j.completed_at
    from private.deletion_jobs j
    where j.id = p_job_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
end;
$$;
