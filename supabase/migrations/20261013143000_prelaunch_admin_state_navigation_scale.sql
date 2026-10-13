-- Phase 06: stable Admin platform pagination for the platform switcher/directory.

create index if not exists platforms_admin_cursor_idx
  on public.platforms (created_at desc, id desc);

create or replace function private.admin_platform_list_v3(
  p_ctx private.admin_context,
  p_query text default null,
  p_limit integer default 20,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null
)
returns table (
  platform_id uuid,
  code text,
  name text,
  status text,
  allow_activation boolean,
  default_locale text,
  default_plan_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_query text;
  v_cursor_created_at timestamptz;
begin
  if p_limit is null or p_limit not between 1 and 100
     or (p_query is not null and length(btrim(p_query)) > 128)
     or ((p_cursor_created_at is null) <> (p_cursor_id is null))
  then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  if not exists (
       select 1 from private.system_admin sa
       where sa.user_id = (p_ctx).admin_user_id
     )
     or not exists (
       select 1
       from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id)
       where active
     )
  then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;

  if p_cursor_id is not null then
    select p.created_at
      into v_cursor_created_at
    from public.platforms p
    where p.id = p_cursor_id;

    if v_cursor_created_at is null then
      raise exception using errcode = 'P0002', message = 'resource_not_found';
    end if;
  end if;

  v_query := nullif(btrim(p_query), '');
  return query
    select p.id, p.code, p.name, p.status, p.allow_activation,
      p.default_locale, p.default_plan_id, p.created_at, p.updated_at
    from public.platforms p
    where (
      v_query is null
      or p.id::text ilike '%' || v_query || '%'
      or p.code ilike '%' || v_query || '%'
      or p.name ilike '%' || v_query || '%'
      or p.status ilike '%' || v_query || '%'
    )
      and (
        p_cursor_id is null
        or (p.created_at, p.id) < (v_cursor_created_at, p_cursor_id)
      )
    order by p.created_at desc, p.id desc
    limit p_limit;
end;
$$;

alter function private.admin_platform_list_v3(
  private.admin_context, text, integer, timestamptz, uuid
) owner to domain_owner;

revoke all on function private.admin_platform_list_v3(
  private.admin_context, text, integer, timestamptz, uuid
) from public, anon, authenticated, account_executor, job_executor, recovery_executor;
grant execute on function private.admin_platform_list_v3(
  private.admin_context, text, integer, timestamptz, uuid
) to admin_executor;

revoke all on function private.admin_platform_list_v2(
  private.admin_context, text, integer
) from public, anon, authenticated, account_executor, admin_executor, job_executor, recovery_executor;
drop function private.admin_platform_list_v2(private.admin_context, text, integer);
