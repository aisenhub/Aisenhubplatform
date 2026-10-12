-- OPT-009 Phase 03 forward fix: project the same effective Plan semantics used
-- by entitlement reads. A missing paid grant falls back to the active default
-- free Plan; an explicitly suspended subscription has no effective Plan.

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
  join public.platforms platform on platform.id = a.platform_id
  left join public.platform_profiles pr on pr.platform_account_id = a.id
  left join public.subscriptions s
    on s.platform_id = a.platform_id and s.platform_account_id = a.id
  left join public.plans pl
    on pl.platform_id = a.platform_id
   and pl.id = case
     when s.status = 'suspended' then null::uuid
     when s.plan_id is not null then s.plan_id
     else platform.default_plan_id
   end
   and (s.plan_id is not null or (pl.status = 'active' and pl.kind = 'free'))
  where a.platform_id = p_platform_id
    and (v_query is null
      or a.id::text ilike '%' || v_query || '%'
      or coalesce(a.user_id::text, '') ilike '%' || v_query || '%'
      or a.status ilike '%' || v_query || '%'
      or coalesce(pr.display_name, '') ilike '%' || v_query || '%'
      or coalesce(pl.name, '') ilike '%' || v_query || '%'
      or coalesce(pl.code, '') ilike '%' || v_query || '%')
    and (p_status is null or a.status = p_status)
    and (p_plan_id is null or pl.id = p_plan_id)
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

create or replace function private.admin_account_workbench_read(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_platform_account_id uuid
)
returns table (
  platform_account_id uuid,
  user_id uuid,
  account_status text,
  activated_at timestamptz,
  suspended_at timestamptz,
  closed_at timestamptz,
  anonymized_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  display_name text,
  avatar_url text,
  bio text,
  locale text,
  timezone text,
  plan_id uuid,
  plan_code text,
  plan_name text,
  plan_kind text,
  subscription_status text,
  subscription_started_at timestamptz,
  current_period_end timestamptz,
  next_transition_at timestamptz,
  billing_order_count bigint,
  billing_attention_count bigint,
  billing_latest jsonb,
  config_active_count bigint,
  config_published_count bigint,
  config_pending_review_count bigint,
  config_latest_updated_at timestamptz,
  feedback_count bigint,
  feedback_open_count bigint,
  feedback_latest_submitted_at timestamptz,
  tags text[],
  notes jsonb,
  governance_events jsonb
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
begin
  perform private.billing_admin_assert(p_ctx);
  if p_platform_id is null or p_platform_account_id is null then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if not exists (
    select 1 from public.platform_accounts a
    where a.platform_id = p_platform_id and a.id = p_platform_account_id
  ) then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;

  return query
  select a.id, a.user_id, a.status, a.activated_at, a.suspended_at, a.closed_at,
    a.anonymized_at, a.created_at, a.updated_at,
    pr.display_name, pr.avatar_url, pr.bio, pr.locale, pr.timezone,
    pl.id, pl.code, pl.name, pl.kind, coalesce(s.status, 'none'::text),
    s.started_at, s.current_period_end, s.next_transition_at,
    (select count(*) from public.billing_orders bo
      where bo.platform_id = a.platform_id and bo.platform_account_id = a.id),
    (select count(*) from public.billing_orders bo
      left join public.billing_settlements bs on bs.billing_order_id = bo.id
      where bo.platform_id = a.platform_id and bo.platform_account_id = a.id
        and bo.resolution_status = 'open'
        and (bo.verification_status <> 'verified'
          or bo.entitlement_status in ('not_started', 'blocked')
          or bo.linkage_status <> 'linked'
          or bs.state in ('retryable', 'blocked', 'review_required'))),
    coalesce((select jsonb_build_object(
        'order_id', bo.id,
        'provider_status', bo.provider_status,
        'verification_status', bo.verification_status,
        'entitlement_status', bo.entitlement_status,
        'linkage_status', bo.linkage_status,
        'resolution_status', bo.resolution_status,
        'settlement_state', bs.state,
        'updated_at', bo.updated_at
      )
      from public.billing_orders bo
      left join public.billing_settlements bs on bs.billing_order_id = bo.id
      where bo.platform_id = a.platform_id and bo.platform_account_id = a.id
      order by bo.updated_at desc, bo.id desc limit 1), '{}'::jsonb),
    (select count(*) from public.platform_configs c
      where c.platform_id = a.platform_id and c.platform_account_id = a.id and c.status = 'active'),
    (select count(*) from public.platform_configs c
      join public.platform_config_gallery_entries ge
        on ge.platform_id = c.platform_id and ge.config_id = c.id and ge.status = 'approved'
      where c.platform_id = a.platform_id and c.platform_account_id = a.id),
    (select count(*) from public.platform_config_gallery_submissions gs
      where gs.platform_id = a.platform_id and gs.submitted_by_account_id = a.id and gs.status = 'pending'),
    (select max(c.updated_at) from public.platform_configs c
      where c.platform_id = a.platform_id and c.platform_account_id = a.id and c.status <> 'deleted'),
    (select count(*) from public.platform_feedback f
      where f.platform_id = a.platform_id and f.platform_account_id = a.id and f.status not in ('draft', 'deleted')),
    (select count(*) from public.platform_feedback f
      where f.platform_id = a.platform_id and f.platform_account_id = a.id and f.status in ('new', 'reviewing')),
    (select max(f.submitted_at) from public.platform_feedback f
      where f.platform_id = a.platform_id and f.platform_account_id = a.id and f.status not in ('draft', 'deleted')),
    coalesce((select array_agg(t.tag order by t.tag)
      from public.platform_account_admin_tags t
      where t.platform_id = a.platform_id and t.platform_account_id = a.id), '{}'::text[]),
    coalesce((select jsonb_agg(jsonb_build_object(
        'id', n.id, 'body', n.body, 'created_by', n.created_by,
        'created_at', n.created_at, 'redacted_at', n.redacted_at
      ) order by n.created_at desc, n.id desc)
      from (select * from public.platform_account_admin_notes nx
        where nx.platform_id = a.platform_id and nx.platform_account_id = a.id
        order by nx.created_at desc, nx.id desc limit 20) n), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
        'id', g.id, 'action', g.action, 'reason', g.reason,
        'actor_admin_user_id', g.actor_admin_user_id, 'created_at', g.created_at
      ) order by g.created_at desc, g.id desc)
      from (select * from public.platform_account_governance_events gx
        where gx.platform_id = a.platform_id and gx.platform_account_id = a.id
        order by gx.created_at desc, gx.id desc limit 50) g), '[]'::jsonb)
  from public.platform_accounts a
  join public.platforms platform on platform.id = a.platform_id
  left join public.platform_profiles pr on pr.platform_account_id = a.id
  left join public.subscriptions s
    on s.platform_id = a.platform_id and s.platform_account_id = a.id
  left join public.plans pl
    on pl.platform_id = a.platform_id
   and pl.id = case
     when s.status = 'suspended' then null::uuid
     when s.plan_id is not null then s.plan_id
     else platform.default_plan_id
   end
   and (s.plan_id is not null or (pl.status = 'active' and pl.kind = 'free'))
  where a.platform_id = p_platform_id and a.id = p_platform_account_id;
end;
$$;

alter function private.admin_account_list_v3(private.admin_context, uuid, uuid, integer, text, text, uuid, text, text, timestamptz, timestamptz) owner to domain_owner;
alter function private.admin_account_workbench_read(private.admin_context, uuid, uuid) owner to domain_owner;

revoke all on function private.admin_account_list_v3(private.admin_context, uuid, uuid, integer, text, text, uuid, text, text, timestamptz, timestamptz)
  from public, anon, authenticated, account_executor, admin_executor, job_executor, recovery_executor;
revoke all on function private.admin_account_workbench_read(private.admin_context, uuid, uuid)
  from public, anon, authenticated, account_executor, admin_executor, job_executor, recovery_executor;
grant execute on function private.admin_account_list_v3(private.admin_context, uuid, uuid, integer, text, text, uuid, text, text, timestamptz, timestamptz)
  to admin_executor;
grant execute on function private.admin_account_workbench_read(private.admin_context, uuid, uuid)
  to admin_executor;
