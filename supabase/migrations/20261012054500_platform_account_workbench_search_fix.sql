-- OPT-009 Phase 02 forward fix: keep v2-compatible status text search on the
-- new cursor-based account list while retaining all v3 filters and ordering.

create or replace function private.admin_account_list_v3(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_cursor_account_id uuid default null,
  p_limit integer default 20,
  p_query text default null,
  p_status text default null,
  p_plan_id uuid default null,
  p_subscription_status text default null,
  p_tag text default null,
  p_joined_from timestamptz default null,
  p_joined_to timestamptz default null
)
returns table (
  platform_account_id uuid,
  user_id uuid,
  account_status text,
  display_name text,
  avatar_url text,
  plan_id uuid,
  plan_code text,
  plan_name text,
  plan_kind text,
  subscription_status text,
  current_period_end timestamptz,
  tags text[],
  activated_at timestamptz,
  suspended_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_query text := nullif(btrim(p_query), '');
  v_tag text := nullif(lower(btrim(p_tag)), '');
  v_cursor_created_at timestamptz;
begin
  perform private.billing_admin_assert(p_ctx);
  if p_platform_id is null or p_limit is null or p_limit not between 1 and 100
     or v_query is not null and length(v_query) > 128
     or p_status is not null and p_status not in ('active', 'suspended', 'closed')
     or p_subscription_status is not null and p_subscription_status not in ('active', 'suspended', 'none')
     or v_tag is not null and (length(v_tag) > 32 or v_tag ~ '[[:cntrl:]]')
     or p_joined_from is not null and p_joined_to is not null and p_joined_from > p_joined_to then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if not exists (select 1 from public.platforms p where p.id = p_platform_id) then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  if p_cursor_account_id is not null then
    select a.created_at into v_cursor_created_at
    from public.platform_accounts a
    where a.platform_id = p_platform_id and a.id = p_cursor_account_id;
    if v_cursor_created_at is null then
      raise exception using errcode = 'P0002', message = 'resource_not_found';
    end if;
  end if;

  return query
  select a.id, a.user_id, a.status, pr.display_name, pr.avatar_url,
    pl.id, pl.code, pl.name, pl.kind, coalesce(s.status, 'none'::text),
    s.current_period_end,
    coalesce((
      select array_agg(t.tag order by t.tag)
      from public.platform_account_admin_tags t
      where t.platform_id = a.platform_id and t.platform_account_id = a.id
    ), '{}'::text[]),
    a.activated_at, a.suspended_at, a.closed_at, a.created_at, a.updated_at
  from public.platform_accounts a
  left join public.platform_profiles pr on pr.platform_account_id = a.id
  left join public.subscriptions s
    on s.platform_id = a.platform_id and s.platform_account_id = a.id
  left join public.plans pl
    on pl.platform_id = a.platform_id and pl.id = s.plan_id
  where a.platform_id = p_platform_id
    and (v_query is null
      or a.id::text ilike '%' || v_query || '%'
      or coalesce(a.user_id::text, '') ilike '%' || v_query || '%'
      or a.status ilike '%' || v_query || '%'
      or coalesce(pr.display_name, '') ilike '%' || v_query || '%'
      or coalesce(pl.name, '') ilike '%' || v_query || '%'
      or coalesce(pl.code, '') ilike '%' || v_query || '%')
    and (p_status is null or a.status = p_status)
    and (p_plan_id is null or s.plan_id = p_plan_id)
    and (p_subscription_status is null
      or p_subscription_status = 'none' and s.id is null
      or p_subscription_status in ('active', 'suspended') and s.status = p_subscription_status)
    and (v_tag is null or exists (
      select 1 from public.platform_account_admin_tags t
      where t.platform_id = a.platform_id and t.platform_account_id = a.id and t.tag = v_tag
    ))
    and (p_joined_from is null or a.created_at >= p_joined_from)
    and (p_joined_to is null or a.created_at <= p_joined_to)
    and (p_cursor_account_id is null or (a.created_at, a.id) < (v_cursor_created_at, p_cursor_account_id))
  order by a.created_at desc, a.id desc
  limit p_limit;
end;
$$;

alter function private.admin_account_list_v3(private.admin_context, uuid, uuid, integer, text, text, uuid, text, text, timestamptz, timestamptz) owner to domain_owner;
revoke all on function private.admin_account_list_v3(private.admin_context, uuid, uuid, integer, text, text, uuid, text, text, timestamptz, timestamptz)
  from public, anon, authenticated, account_executor, admin_executor, job_executor, recovery_executor;
grant execute on function private.admin_account_list_v3(private.admin_context, uuid, uuid, integer, text, text, uuid, text, text, timestamptz, timestamptz)
  to admin_executor;
