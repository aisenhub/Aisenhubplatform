-- Prelaunch Phase 05: unify paid-entitlement facts and make Admin pagination
-- boundaries immutable. Also retire the legacy Billing list entry point.

create or replace function private.commerce_active_paid_entitlements(
  p_platform_id uuid default null,
  p_at timestamptz default now()
)
returns table (
  platform_id uuid,
  platform_account_id uuid,
  grant_id uuid,
  plan_id uuid,
  ends_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, private, public
as $$
  with current_grants as (
    select distinct on (g.platform_id, g.platform_account_id)
      g.id, g.platform_id, g.platform_account_id, g.plan_id,
      g.ends_at, g.starts_at, g.created_at
    from public.subscription_grants g
    where (p_platform_id is null or g.platform_id = p_platform_id)
      and g.starts_at <= p_at
      and (g.ends_at is null or g.ends_at > p_at)
      and not exists (
        select 1
        from public.subscription_events revoked
        where revoked.platform_id = g.platform_id
          and revoked.platform_account_id = g.platform_account_id
          and revoked.grant_id = g.id
          and revoked.event_type = 'revoked'
      )
    order by g.platform_id, g.platform_account_id,
      g.starts_at desc, g.created_at desc, g.id desc
  )
  select cg.platform_id, cg.platform_account_id, cg.id, cg.plan_id, cg.ends_at
  from current_grants cg
  join public.plans p
    on p.platform_id = cg.platform_id and p.id = cg.plan_id
   and p.kind = 'paid' and p.status = 'active'
  join public.subscriptions s
    on s.platform_id = cg.platform_id
   and s.platform_account_id = cg.platform_account_id
   and s.status = 'active'
  join public.platform_accounts a
    on a.platform_id = cg.platform_id and a.id = cg.platform_account_id
   and a.status = 'active'
$$;

alter function private.commerce_active_paid_entitlements(uuid, timestamptz) owner to domain_owner;
revoke all on function private.commerce_active_paid_entitlements(uuid, timestamptz)
from public, anon, authenticated, account_executor, admin_executor, job_executor,
  recovery_executor, billing_ingress;

create or replace function private.admin_commerce_summary(
  p_ctx private.admin_context,
  p_platform_id uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  platform_id uuid,
  period_start timestamptz,
  period_end timestamptz,
  currency text,
  active_paid_entitlement_accounts bigint,
  billing_grant_count bigint,
  admin_grant_count bigint,
  redemption_grant_count bigint,
  verified_gross_amount numeric,
  compensated_refund_amount numeric,
  net_verified_amount numeric,
  amount_unknown_count bigint,
  refund_amount_unknown_count bigint,
  expiring_paid_entitlement_accounts bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_now timestamptz := now();
  v_from timestamptz := coalesce(p_from, v_now - interval '30 days');
  v_to timestamptz := coalesce(p_to, v_now);
begin
  perform private.billing_admin_assert(p_ctx);
  if v_from >= v_to or v_to - v_from > interval '366 days' then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if p_platform_id is not null and not exists (
    select 1 from public.platforms p where p.id = p_platform_id
  ) then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;

  return query
  with active_paid as (
    select *
    from private.commerce_active_paid_entitlements(p_platform_id, v_now)
  ),
  grant_metrics as (
    select
      count(*) filter (where g.source = 'billing_order')::bigint as billing_grant_count,
      count(*) filter (where g.source = 'admin')::bigint as admin_grant_count,
      count(*) filter (where g.source = 'redemption_code')::bigint as redemption_grant_count
    from public.subscription_grants g
    where (p_platform_id is null or g.platform_id = p_platform_id)
      and g.created_at >= v_from and g.created_at < v_to
  ),
  eligible_success_orders as (
    select o.id, o.platform_id, o.total_amount, o.currency,
      s.updated_at as finalized_at
    from public.billing_orders o
    join public.billing_settlements s on s.billing_order_id = o.id
    where s.state = 'finalized'
      and s.decision_code = 'granted'
      and o.verification_status = 'verified'
      and o.entitlement_status = 'granted'
      and o.linkage_status = 'linked'
      and o.checkout_intent_id is not null
      and o.platform_id is not null
      and o.platform_account_id is not null
      and (p_platform_id is null or o.platform_id = p_platform_id)
  ),
  gross_metrics as (
    select
      coalesce(sum(e.total_amount) filter (
        where e.total_amount is not null and e.currency = 'CNY'
      ), 0::numeric) as verified_gross_amount,
      count(*) filter (
        where e.total_amount is null or e.currency is null or e.currency <> 'CNY'
      )::bigint as amount_unknown_count
    from eligible_success_orders e
    where e.finalized_at >= v_from and e.finalized_at < v_to
  ),
  refund_metrics as (
    select
      coalesce(sum(r.refund_amount) filter (
        where r.refund_amount is not null and r.currency = 'CNY'
      ), 0::numeric) as compensated_refund_amount,
      count(*) filter (
        where r.refund_amount is null or r.currency is null or r.currency <> 'CNY'
      )::bigint as refund_amount_unknown_count
    from private.billing_refund_observations r
    join eligible_success_orders e on e.id = r.billing_order_id
    where r.status = 'compensated'
      and r.compensated_at >= v_from and r.compensated_at < v_to
  )
  select
    p_platform_id,
    v_from,
    v_to,
    'CNY'::text,
    (select count(*)::bigint from active_paid),
    grants.billing_grant_count,
    grants.admin_grant_count,
    grants.redemption_grant_count,
    gross.verified_gross_amount,
    refunds.compensated_refund_amount,
    gross.verified_gross_amount - refunds.compensated_refund_amount,
    gross.amount_unknown_count,
    refunds.refund_amount_unknown_count,
    (select count(*)::bigint from active_paid ap
      where ap.ends_at is not null
        and ap.ends_at > v_now
        and ap.ends_at <= v_now + interval '30 days')
  from grant_metrics grants
  cross join gross_metrics gross
  cross join refund_metrics refunds;
end;
$$;

alter function private.admin_commerce_summary(
  private.admin_context, uuid, timestamptz, timestamptz
) owner to domain_owner;

drop function private.admin_commerce_entitlement_list(
  private.admin_context, uuid, timestamptz, uuid, integer,
  text, text, uuid, text, timestamptz, timestamptz
);

create function private.admin_commerce_entitlement_list(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_cursor_created_at timestamptz default null,
  p_cursor_account_id uuid default null,
  p_limit integer default 20,
  p_query text default null,
  p_status text default null,
  p_plan_id uuid default null,
  p_source text default null,
  p_ending_from timestamptz default null,
  p_ending_to timestamptz default null
)
returns table(
  platform_account_id uuid,
  user_id uuid,
  display_name text,
  avatar_url text,
  account_status text,
  subscription_status text,
  plan_id uuid,
  plan_code text,
  plan_name text,
  grant_id uuid,
  entitlement_source text,
  billing_order_id uuid,
  redemption_batch_id uuid,
  commercial_offer_id uuid,
  offer_code text,
  commercial_price_id uuid,
  started_at timestamptz,
  current_period_end timestamptz,
  next_transition_at timestamptz,
  account_created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_query text := nullif(btrim(p_query), '');
begin
  perform private.billing_admin_assert(p_ctx);
  if p_platform_id is null or p_limit is null or p_limit not between 1 and 100
     or ((p_cursor_created_at is null) <> (p_cursor_account_id is null))
     or (v_query is not null and length(v_query) > 128)
     or (p_status is not null and p_status not in ('active', 'suspended'))
     or (p_source is not null and p_source not in ('billing_order', 'redemption_code', 'admin'))
     or (p_ending_from is not null and p_ending_to is not null and p_ending_from > p_ending_to) then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if not exists (select 1 from public.platforms p where p.id = p_platform_id) then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  if p_cursor_account_id is not null and not exists (
    select 1
    from public.platform_accounts a
    where a.platform_id = p_platform_id
      and a.id = p_cursor_account_id
      and a.created_at = p_cursor_created_at
  ) then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;

  return query
  select a.id, a.user_id, pr.display_name, pr.avatar_url, a.status, s.status,
    plan.id, plan.code, plan.name, winning.id, winning.source,
    winning.billing_order_id, redemption.batch_id, attribution.offer_id,
    attribution.offer_code, attribution.price_id, s.started_at,
    s.current_period_end, s.next_transition_at, a.created_at, s.updated_at
  from public.subscriptions s
  join public.platform_accounts a
    on a.platform_id = s.platform_id and a.id = s.platform_account_id
  left join public.platform_profiles pr on pr.platform_account_id = a.id
  left join lateral (
    select g.id, g.plan_id, g.source, g.billing_order_id, g.redemption_code_id,
      g.starts_at, g.ends_at, g.created_at
    from public.subscription_grants g
    where g.platform_id = s.platform_id
      and g.platform_account_id = s.platform_account_id
      and g.starts_at <= now()
      and (g.ends_at is null or g.ends_at > now())
      and not exists (
        select 1 from public.subscription_events revoked
        where revoked.platform_id = g.platform_id
          and revoked.platform_account_id = g.platform_account_id
          and revoked.grant_id = g.id
          and revoked.event_type = 'revoked'
      )
    order by g.starts_at desc, g.created_at desc, g.id desc
    limit 1
  ) winning on true
  left join public.plans plan
    on plan.platform_id = s.platform_id
   and plan.id = coalesce(winning.plan_id, s.plan_id)
  left join public.redemption_codes redemption
    on redemption.platform_id = s.platform_id
   and redemption.id = winning.redemption_code_id
  left join lateral (
    select chosen.offer_id, chosen.offer_code, chosen.price_id
    from (
      select o.id as offer_id, o.code as offer_code,
        c.commercial_price_id as price_id, 1 as priority
      from public.billing_checkout_intents c
      join public.platform_commercial_offers o
        on o.platform_id = c.platform_id and o.id = c.commercial_offer_id
      where winning.source = 'billing_order'
        and c.platform_id = s.platform_id
        and c.platform_account_id = s.platform_account_id
        and c.id = (
          select bo.checkout_intent_id from public.billing_orders bo
          where bo.id = winning.billing_order_id
        )
      union all
      select o.id, o.code, null::uuid, 1
      from public.redemption_code_batches b
      join public.platform_commercial_offers o
        on o.platform_id = b.platform_id and o.id = b.commercial_offer_id
      where winning.source = 'redemption_code'
        and b.platform_id = s.platform_id
        and b.id = redemption.batch_id
    ) chosen
    order by chosen.priority
    limit 1
  ) attribution on true
  where s.platform_id = p_platform_id
    and s.plan_id is not null
    and (v_query is null
      or a.id::text ilike '%' || v_query || '%'
      or coalesce(a.user_id::text, '') ilike '%' || v_query || '%'
      or coalesce(pr.display_name, '') ilike '%' || v_query || '%'
      or coalesce(plan.code, '') ilike '%' || v_query || '%'
      or coalesce(plan.name, '') ilike '%' || v_query || '%')
    and (p_status is null or s.status = p_status)
    and (p_plan_id is null or plan.id = p_plan_id)
    and (p_source is null or winning.source = p_source)
    and (p_ending_from is null or winning.ends_at >= p_ending_from)
    and (p_ending_to is null or winning.ends_at <= p_ending_to)
    and (p_cursor_account_id is null
      or (a.created_at, a.id) < (p_cursor_created_at, p_cursor_account_id))
  order by a.created_at desc, a.id desc
  limit p_limit;
end;
$$;

alter function private.admin_commerce_entitlement_list(
  private.admin_context, uuid, timestamptz, uuid, integer,
  text, text, uuid, text, timestamptz, timestamptz
) owner to domain_owner;
revoke all on function private.admin_commerce_entitlement_list(
  private.admin_context, uuid, timestamptz, uuid, integer,
  text, text, uuid, text, timestamptz, timestamptz
) from public, anon, authenticated, account_executor, admin_executor, job_executor,
  recovery_executor, billing_ingress;
grant execute on function private.admin_commerce_entitlement_list(
  private.admin_context, uuid, timestamptz, uuid, integer,
  text, text, uuid, text, timestamptz, timestamptz
) to admin_executor;

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
  previous_attention_orders bigint,
  pending_config_reviews bigint,
  pending_feedback bigint
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
    select count(*)::bigint as total_accounts,
      count(*) filter (where a.status = 'active')::bigint as active_accounts,
      count(*) filter (where a.status = 'suspended')::bigint as suspended_accounts,
      count(*) filter (where a.status = 'closed')::bigint as closed_accounts,
      count(*) filter (where a.created_at >= v_period_start and a.created_at < v_now)::bigint as new_accounts,
      count(*) filter (where a.created_at >= v_previous_start and a.created_at < v_period_start)::bigint as previous_new_accounts,
      count(*) filter (where a.closed_at >= v_period_start and a.closed_at < v_now)::bigint as period_closed_accounts,
      count(*) filter (where a.closed_at >= v_previous_start and a.closed_at < v_period_start)::bigint as previous_closed_accounts
    from public.platform_accounts a where a.platform_id = p_platform_id
  ), paid_metrics as (
    select count(*)::bigint as active_paid_accounts
    from private.commerce_active_paid_entitlements(p_platform_id, v_now)
  ), order_metrics as (
    select
      count(*) filter (where o.created_at >= v_period_start and o.created_at < v_now)::bigint as orders,
      count(*) filter (where o.created_at >= v_previous_start and o.created_at < v_period_start)::bigint as previous_orders,
      count(*) filter (where o.created_at >= v_period_start and o.created_at < v_now and o.entitlement_status = 'granted')::bigint as granted_orders,
      count(*) filter (where o.created_at >= v_previous_start and o.created_at < v_period_start and o.entitlement_status = 'granted')::bigint as previous_granted_orders,
      count(*) filter (where o.created_at >= v_period_start and o.created_at < v_now and (
        o.linkage_status = 'ambiguous' or o.entitlement_status = 'blocked'
        or (o.provider_paid_at is not null and o.verification_status <> 'verified' and o.resolution_status = 'open')
        or exists (select 1 from public.billing_processing_jobs j where j.billing_order_id = o.id and j.state in ('retryable','manual_review'))
      ))::bigint as attention_orders,
      count(*) filter (where o.created_at >= v_previous_start and o.created_at < v_period_start and (
        o.linkage_status = 'ambiguous' or o.entitlement_status = 'blocked'
        or (o.provider_paid_at is not null and o.verification_status <> 'verified' and o.resolution_status = 'open')
        or exists (select 1 from public.billing_processing_jobs j where j.billing_order_id = o.id and j.state in ('retryable','manual_review'))
      ))::bigint as previous_attention_orders
    from public.billing_orders o
    where o.platform_id = p_platform_id
      and o.created_at >= v_previous_start and o.created_at < v_now
  ), review_metrics as (
    select count(*)::bigint as pending_config_reviews
    from public.platform_config_gallery_submissions s
    where s.platform_id = p_platform_id and s.status = 'pending'
  ), feedback_metrics as (
    select count(*)::bigint as pending_feedback
    from public.platform_feedback f
    where f.platform_id = p_platform_id and f.status in ('new','reviewing')
  )
  select p_platform_id, p_days, v_period_start, v_now, v_previous_start,
    a.total_accounts, a.active_accounts, a.suspended_accounts, a.closed_accounts,
    a.new_accounts, a.previous_new_accounts,
    a.period_closed_accounts, a.previous_closed_accounts,
    a.new_accounts - a.period_closed_accounts,
    a.previous_new_accounts - a.previous_closed_accounts,
    paid.active_paid_accounts,
    o.orders, o.previous_orders, o.granted_orders, o.previous_granted_orders,
    o.attention_orders, o.previous_attention_orders,
    r.pending_config_reviews, f.pending_feedback
  from account_metrics a
  cross join paid_metrics paid
  cross join order_metrics o
  cross join review_metrics r
  cross join feedback_metrics f;
end;
$$;

alter function private.admin_platform_overview(private.admin_context, uuid, integer)
  owner to domain_owner;

drop function if exists private.admin_billing_order_list(
  private.admin_context, timestamptz, integer, text
);
