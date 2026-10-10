-- OPT-002: structured, readable Admin audit projection.
-- Keep admin_audit_list(v1) intact for rollback/compatibility.

create or replace function private.audit_actor_email(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select u.email::text
  from auth.users u
  where u.id = p_user_id
$$;

revoke all on function private.audit_actor_email(uuid)
  from public, anon, authenticated, account_executor, admin_executor,
    job_executor, recovery_executor;
grant execute on function private.audit_actor_email(uuid) to domain_owner;

create index if not exists audit_logs_event_time_idx
  on public.audit_logs (event_type, created_at desc, id desc);
create index if not exists audit_logs_target_time_idx
  on public.audit_logs (target_type, created_at desc, id desc);
create index if not exists audit_logs_actor_time_idx
  on public.audit_logs (actor_user_id, created_at desc, id desc);

create or replace function private.admin_audit_list_v2(
  p_ctx private.admin_context,
  p_cursor_id uuid default null,
  p_limit integer default 20,
  p_query text default null,
  p_platform_id uuid default null,
  p_actor_query text default null,
  p_action text default null,
  p_target_type text default null,
  p_outcome text default null
)
returns table (
  audit_id uuid,
  request_id uuid,
  platform_id uuid,
  platform_name text,
  platform_code text,
  platform_account_id uuid,
  actor_type text,
  actor_id uuid,
  actor_display_name text,
  actor_email text,
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
  v_query text := nullif(btrim(p_query), '');
  v_actor_query text := nullif(btrim(p_actor_query), '');
  v_action text := nullif(btrim(p_action), '');
  v_target_type text := nullif(btrim(p_target_type), '');
  v_outcome text := nullif(btrim(p_outcome), '');
begin
  if (p_ctx).admin_user_id is null or (p_ctx).session_id is null
     or p_limit is null or p_limit not between 1 and 100
     or (p_query is not null and length(btrim(p_query)) > 128)
     or (p_actor_query is not null and length(btrim(p_actor_query)) > 128)
     or (p_action is not null and length(btrim(p_action)) > 128)
     or (p_target_type is not null and length(btrim(p_target_type)) > 128)
     or (p_outcome is not null and length(btrim(p_outcome)) > 64)
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
    raise exception using
      errcode = case
        when p_limit is null or p_limit not between 1 and 100
          or (p_query is not null and length(btrim(p_query)) > 128)
          or (p_actor_query is not null and length(btrim(p_actor_query)) > 128)
          or (p_action is not null and length(btrim(p_action)) > 128)
          or (p_target_type is not null and length(btrim(p_target_type)) > 128)
          or (p_outcome is not null and length(btrim(p_outcome)) > 64)
          then '22023'
        else '42501'
      end,
      message = case
        when p_limit is null or p_limit not between 1 and 100
          or (p_query is not null and length(btrim(p_query)) > 128)
          or (p_actor_query is not null and length(btrim(p_actor_query)) > 128)
          or (p_action is not null and length(btrim(p_action)) > 128)
          or (p_target_type is not null and length(btrim(p_target_type)) > 128)
          or (p_outcome is not null and length(btrim(p_outcome)) > 64)
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

  return query
    with enriched as (
      select
        a.id as audit_id,
        a.request_id,
        a.platform_id,
        p.name as platform_name,
        p.code as platform_code,
        a.platform_account_id,
        a.actor_type,
        a.actor_user_id as actor_id,
        case
          when a.actor_type = 'user' and actor_account.user_id = a.actor_user_id
            then nullif(actor_profile.display_name, '')
          else null
        end as actor_display_name,
        private.audit_actor_email(a.actor_user_id) as actor_email,
        a.event_type,
        a.target_type,
        a.target_id,
        nullif(a.metadata ->> 'outcome', '') as outcome,
        a.created_at
      from public.audit_logs a
      left join public.platforms p
        on p.id = a.platform_id
      left join public.platform_accounts actor_account
        on a.actor_type = 'user'
       and actor_account.id = a.platform_account_id
       and actor_account.platform_id = a.platform_id
       and actor_account.user_id = a.actor_user_id
      left join public.platform_profiles actor_profile
        on actor_profile.platform_account_id = actor_account.id
      where (p_cursor_id is null
        or (a.created_at, a.id) < (v_cursor_created_at, p_cursor_id))
        and (p_platform_id is null or a.platform_id = p_platform_id)
        and (v_action is null or a.event_type = v_action)
        and (v_target_type is null or a.target_type = v_target_type)
        and (
          v_outcome is null
          or (lower(v_outcome) = 'unrecorded'
            and nullif(a.metadata ->> 'outcome', '') is null)
          or (lower(v_outcome) <> 'unrecorded'
            and lower(nullif(a.metadata ->> 'outcome', '')) = lower(v_outcome))
        )
    )
    select
      e.audit_id,
      e.request_id,
      e.platform_id,
      e.platform_name,
      e.platform_code,
      e.platform_account_id,
      e.actor_type,
      e.actor_id,
      e.actor_display_name,
      e.actor_email,
      e.event_type,
      e.target_type,
      e.target_id,
      e.outcome,
      e.created_at
    from enriched e
    where (
      v_actor_query is null
      or e.actor_type ilike '%' || v_actor_query || '%'
      or e.actor_id::text ilike '%' || v_actor_query || '%'
      or e.actor_display_name ilike '%' || v_actor_query || '%'
      or e.actor_email ilike '%' || v_actor_query || '%'
    ) and (
      v_query is null
      or e.audit_id::text ilike '%' || v_query || '%'
      or e.request_id::text ilike '%' || v_query || '%'
      or e.platform_id::text ilike '%' || v_query || '%'
      or e.platform_name ilike '%' || v_query || '%'
      or e.platform_code ilike '%' || v_query || '%'
      or e.platform_account_id::text ilike '%' || v_query || '%'
      or e.actor_type ilike '%' || v_query || '%'
      or e.actor_id::text ilike '%' || v_query || '%'
      or e.actor_display_name ilike '%' || v_query || '%'
      or e.actor_email ilike '%' || v_query || '%'
      or e.event_type ilike '%' || v_query || '%'
      or e.target_type ilike '%' || v_query || '%'
      or e.target_id::text ilike '%' || v_query || '%'
      or e.outcome ilike '%' || v_query || '%'
    )
    order by e.created_at desc, e.audit_id desc
    limit p_limit;
end;
$$;

alter function private.admin_audit_list_v2(
  private.admin_context, uuid, integer, text, uuid, text, text, text, text
) owner to domain_owner;

revoke all on function private.admin_audit_list_v2(
  private.admin_context, uuid, integer, text, uuid, text, text, text, text
) from public, anon, authenticated, account_executor, job_executor, recovery_executor;
grant execute on function private.admin_audit_list_v2(
  private.admin_context, uuid, integer, text, uuid, text, text, text, text
) to admin_executor;
