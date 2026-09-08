-- M5-03: expose only a bounded, redacted Admin audit projection.

create index audit_logs_created_at_id_idx
  on public.audit_logs (created_at desc, id desc);

create or replace function private.admin_audit_list(
  p_ctx private.admin_context,
  p_cursor_id uuid default null,
  p_limit integer default 20,
  p_query text default null
)
returns table (
  audit_id uuid,
  request_id uuid,
  actor_type text,
  actor_id uuid,
  event_type text,
  target_type text,
  target_id uuid,
  outcome text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_cursor_created_at timestamptz;
  v_query text;
begin
  if (p_ctx).admin_user_id is null or (p_ctx).session_id is null
     or p_limit is null or p_limit not between 1 and 100
     or (p_query is not null and length(btrim(p_query)) > 128)
     or not exists (
       select 1 from private.system_admin sa
       where sa.user_id = (p_ctx).admin_user_id
     )
     or not exists (
       select 1 from private.check_user_session(
         (p_ctx).admin_user_id,
         (p_ctx).session_id
       ) where active
     ) then
    raise exception using
      errcode = case
        when p_limit is null or p_limit not between 1 and 100
          or (p_query is not null and length(btrim(p_query)) > 128)
          then '22023'
        else '42501'
      end,
      message = case
        when p_limit is null or p_limit not between 1 and 100
          or (p_query is not null and length(btrim(p_query)) > 128)
          then 'invalid_input'
        else 'admin_required'
      end;
  end if;

  if p_cursor_id is not null then
    select a.created_at into v_cursor_created_at
    from public.audit_logs a
    where a.id = p_cursor_id;
    if v_cursor_created_at is null then
      raise exception using errcode = 'P0002', message = 'resource_not_found';
    end if;
  end if;

  v_query := nullif(btrim(p_query), '');
  return query
    select a.id, a.request_id, a.actor_type, a.actor_user_id,
      a.event_type, a.target_type, a.target_id,
      nullif(a.metadata ->> 'outcome', ''), a.created_at
    from public.audit_logs a
    where (p_cursor_id is null
      or (a.created_at, a.id) < (v_cursor_created_at, p_cursor_id))
      and (
        v_query is null
        or a.id::text ilike '%' || v_query || '%'
        or a.request_id::text ilike '%' || v_query || '%'
        or a.actor_type ilike '%' || v_query || '%'
        or a.event_type ilike '%' || v_query || '%'
        or a.target_type ilike '%' || v_query || '%'
        or a.target_id::text ilike '%' || v_query || '%'
      )
    order by a.created_at desc, a.id desc
    limit p_limit;
end;
$$;

alter function private.admin_audit_list(private.admin_context, uuid, integer, text)
  owner to domain_owner;

revoke all on function private.admin_audit_list(private.admin_context, uuid, integer, text)
  from public, anon, authenticated, account_executor, job_executor, recovery_executor;
grant execute on function private.admin_audit_list(private.admin_context, uuid, integer, text)
  to admin_executor;
