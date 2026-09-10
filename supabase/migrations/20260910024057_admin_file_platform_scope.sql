-- FE-D01: keep Admin file filtering scoped before cursor pagination.
-- The existing v2 wrapper remains available for older global callers.

create or replace function private.admin_file_list_v3(
  p_ctx private.admin_context,
  p_platform_id uuid default null,
  p_cursor_file_id uuid default null,
  p_limit integer default 20,
  p_query text default null
)
returns table (
  file_id uuid,
  platform_id uuid,
  platform_account_id uuid,
  status text,
  write_outcome text,
  reserved_bytes bigint,
  reserved_count integer,
  actual_size_bytes bigint,
  original_name text,
  mime_type text,
  created_at timestamptz,
  updated_at timestamptz,
  cancel_requested_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_cursor_created_at timestamptz;
  v_cursor_platform_id uuid;
  v_query text;
begin
  if (p_ctx).admin_user_id is null or (p_ctx).session_id is null
     or p_limit is null or p_limit not between 1 and 100
     or (p_query is not null and length(btrim(p_query)) > 128)
     or not exists (select 1 from private.system_admin sa where sa.user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active) then
    raise exception using errcode = case when p_limit is null or p_limit not between 1 and 100 or (p_query is not null and length(btrim(p_query)) > 128) then '22023' else '42501' end,
      message = case when p_limit is null or p_limit not between 1 and 100 or (p_query is not null and length(btrim(p_query)) > 128) then 'invalid_input' else 'admin_required' end;
  end if;

  if p_platform_id is not null
     and not exists (select 1 from public.platforms p where p.id = p_platform_id) then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;

  if p_cursor_file_id is not null then
    select f.created_at, f.platform_id
      into v_cursor_created_at, v_cursor_platform_id
      from public.platform_config_files f
      where f.id = p_cursor_file_id;
    if v_cursor_created_at is null then
      raise exception using errcode = 'P0002', message = 'resource_not_found';
    end if;
    if p_platform_id is not null and v_cursor_platform_id <> p_platform_id then
      raise exception using errcode = '22023', message = 'cross_platform_cursor';
    end if;
  end if;

  v_query := nullif(btrim(p_query), '');
  return query
    select f.id, f.platform_id, f.platform_account_id, f.status, f.write_outcome,
      f.reserved_bytes, f.reserved_count, f.actual_size_bytes, f.original_name,
      f.mime_type, f.created_at, f.updated_at, f.cancel_requested_at
    from public.platform_config_files f
    where f.status <> 'deleted'
      and (p_platform_id is null or f.platform_id = p_platform_id)
      and (p_cursor_file_id is null or (f.created_at, f.id) < (v_cursor_created_at, p_cursor_file_id))
      and (v_query is null or f.id::text ilike '%' || v_query || '%'
        or coalesce(f.original_name, '') ilike '%' || v_query || '%'
        or f.status ilike '%' || v_query || '%'
        or f.write_outcome ilike '%' || v_query || '%'
        or f.mime_type ilike '%' || v_query || '%')
    order by f.created_at desc, f.id desc
    limit p_limit;
end;
$$;

alter function private.admin_file_list_v3(private.admin_context, uuid, uuid, integer, text)
  owner to domain_owner;

revoke all on function private.admin_file_list_v3(private.admin_context, uuid, uuid, integer, text)
  from public, anon, authenticated, account_executor, job_executor, recovery_executor;

grant execute on function private.admin_file_list_v3(private.admin_context, uuid, uuid, integer, text)
  to admin_executor;
