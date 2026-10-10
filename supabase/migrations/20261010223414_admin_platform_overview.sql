-- OPT-004: authoritative per-platform operational overview.
-- Keep all counts server-side so bounded Admin resource lists are never used as
-- total metrics. Revenue is intentionally excluded until the commercial
-- settlement/refund policy is frozen separately.

create index if not exists platform_accounts_overview_created_idx
  on public.platform_accounts(platform_id, created_at);

create index if not exists platform_accounts_overview_closed_idx
  on public.platform_accounts(platform_id, closed_at)
  where closed_at is not null;

create index if not exists platform_accounts_overview_status_idx
  on public.platform_accounts(platform_id, status);

create index if not exists subscriptions_overview_platform_idx
  on public.subscriptions(platform_id, status, current_period_end);

create index if not exists billing_orders_overview_platform_created_idx
  on public.billing_orders(platform_id, created_at desc);

create or replace function private.admin_platform_overview(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_days integer default 30
)
returns table (
  platform_id uuid,
  period_days integer,
  period_start timestamptz,
  period_end timestamptz,
  previous_start timestamptz,
  total_accounts bigint,
  active_accounts bigint,
  suspended_accounts bigint,
  closed_accounts bigint,
  new_accounts bigint,
  previous_new_accounts bigint,
  period_closed_accounts bigint,
  previous_closed_accounts bigint,
  net_accounts bigint,
  previous_net_accounts bigint,
  active_paid_accounts bigint,
  orders bigint,
  previous_orders bigint,
  granted_orders bigint,
  previous_granted_orders bigint,
  attention_orders bigint,
  previous_attention_orders bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_now timestamptz := now();
  v_period interval;
  v_period_start timestamptz;
  v_previous_start timestamptz;
begin
  perform private.billing_admin_assert(p_ctx);

  if p_platform_id is null or p_days is null or p_days not in (7, 30, 90) then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  if not exists (select 1 from public.platforms p where p.id = p_platform_id) then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;

  v_period := make_interval(days => p_days);
  v_period_start := v_now - v_period;
  v_previous_start := v_period_start - v_period;

  return query
  with account_metrics as (
    select
      count(*)::bigint as total_accounts,
      count(*) filter (where a.status = 'active')::bigint as active_accounts,
      count(*) filter (where a.status = 'suspended')::bigint as suspended_accounts,
      count(*) filter (where a.status = 'closed')::bigint as closed_accounts,
      count(*) filter (
        where a.created_at >= v_period_start and a.created_at < v_now
      )::bigint as new_accounts,
      count(*) filter (
        where a.created_at >= v_previous_start and a.created_at < v_period_start
      )::bigint as previous_new_accounts,
      count(*) filter (
        where a.closed_at >= v_period_start and a.closed_at < v_now
      )::bigint as period_closed_accounts,
      count(*) filter (
        where a.closed_at >= v_previous_start and a.closed_at < v_period_start
      )::bigint as previous_closed_accounts
    from public.platform_accounts a
    where a.platform_id = p_platform_id
  ),
  paid_metrics as (
    select count(distinct s.platform_account_id)::bigint as active_paid_accounts
    from public.subscriptions s
    join public.plans p
      on p.platform_id = s.platform_id and p.id = s.plan_id
    where s.platform_id = p_platform_id
      and s.status = 'active'
      and p.kind = 'paid'
      and s.started_at <= v_now
      and (s.current_period_end is null or s.current_period_end > v_now)
  ),
  order_metrics as (
    select
      count(*) filter (
        where o.created_at >= v_period_start and o.created_at < v_now
      )::bigint as orders,
      count(*) filter (
        where o.created_at >= v_previous_start and o.created_at < v_period_start
      )::bigint as previous_orders,
      count(*) filter (
        where o.created_at >= v_period_start and o.created_at < v_now
          and o.entitlement_status = 'granted'
      )::bigint as granted_orders,
      count(*) filter (
        where o.created_at >= v_previous_start and o.created_at < v_period_start
          and o.entitlement_status = 'granted'
      )::bigint as previous_granted_orders,
      count(*) filter (
        where o.created_at >= v_period_start and o.created_at < v_now
          and (
            o.linkage_status = 'ambiguous'
            or o.entitlement_status = 'blocked'
            or (
              o.provider_paid_at is not null
              and o.verification_status <> 'verified'
              and o.resolution_status = 'open'
            )
            or exists (
              select 1
              from public.billing_processing_jobs j
              where j.billing_order_id = o.id
                and j.state in ('retryable', 'manual_review')
            )
          )
      )::bigint as attention_orders,
      count(*) filter (
        where o.created_at >= v_previous_start and o.created_at < v_period_start
          and (
            o.linkage_status = 'ambiguous'
            or o.entitlement_status = 'blocked'
            or (
              o.provider_paid_at is not null
              and o.verification_status <> 'verified'
              and o.resolution_status = 'open'
            )
            or exists (
              select 1
              from public.billing_processing_jobs j
              where j.billing_order_id = o.id
                and j.state in ('retryable', 'manual_review')
            )
          )
      )::bigint as previous_attention_orders
    from public.billing_orders o
    where o.platform_id = p_platform_id
      and o.created_at >= v_previous_start
      and o.created_at < v_now
  )
  select
    p_platform_id,
    p_days,
    v_period_start,
    v_now,
    v_previous_start,
    a.total_accounts,
    a.active_accounts,
    a.suspended_accounts,
    a.closed_accounts,
    a.new_accounts,
    a.previous_new_accounts,
    a.period_closed_accounts,
    a.previous_closed_accounts,
    a.new_accounts - a.period_closed_accounts,
    a.previous_new_accounts - a.previous_closed_accounts,
    paid.active_paid_accounts,
    o.orders,
    o.previous_orders,
    o.granted_orders,
    o.previous_granted_orders,
    o.attention_orders,
    o.previous_attention_orders
  from account_metrics a
  cross join paid_metrics paid
  cross join order_metrics o;
end;
$$;

alter function private.admin_platform_overview(private.admin_context, uuid, integer)
  owner to domain_owner;

revoke all on function private.admin_platform_overview(private.admin_context, uuid, integer)
  from public, anon, authenticated, account_executor, job_executor,
    recovery_executor, billing_ingress;

grant execute on function private.admin_platform_overview(private.admin_context, uuid, integer)
  to admin_executor;
