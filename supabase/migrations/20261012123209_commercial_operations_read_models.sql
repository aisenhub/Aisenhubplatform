-- OPT-010 Phase 01: authoritative bounded commercial read models.
-- These functions are Admin-only and never expose provider private identifiers,
-- redemption HMACs, or unverified financial claims.

create index if not exists subscriptions_commerce_platform_updated_idx
  on public.subscriptions(platform_id, updated_at desc, platform_account_id desc);

create index if not exists subscription_grants_commerce_source_created_idx
  on public.subscription_grants(platform_id, source, created_at desc, platform_account_id);

create index if not exists billing_settlements_commerce_finalized_idx
  on public.billing_settlements(state, decision_code, updated_at desc, billing_order_id)
  where state = 'finalized';

create index if not exists redemption_codes_campaign_created_idx
  on public.redemption_codes(platform_id, batch_id, created_at desc, id desc);

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
  with current_grants as (
    select distinct on (g.platform_id, g.platform_account_id)
      g.id, g.platform_id, g.platform_account_id, g.plan_id, g.source,
      g.starts_at, g.ends_at, g.created_at
    from public.subscription_grants g
    where (p_platform_id is null or g.platform_id = p_platform_id)
      and g.starts_at <= v_now
      and (g.ends_at is null or g.ends_at > v_now)
      and not exists (
        select 1
        from public.subscription_events revoked
        where revoked.platform_id = g.platform_id
          and revoked.platform_account_id = g.platform_account_id
          and revoked.grant_id = g.id
          and revoked.event_type = 'revoked'
      )
    order by g.platform_id, g.platform_account_id, g.starts_at desc, g.created_at desc, g.id desc
  ),
  active_paid as (
    select cg.*
    from current_grants cg
    join public.plans p on p.platform_id = cg.platform_id and p.id = cg.plan_id and p.kind = 'paid'
    join public.subscriptions s
      on s.platform_id = cg.platform_id and s.platform_account_id = cg.platform_account_id
     and s.status = 'active'
    join public.platform_accounts a
      on a.platform_id = cg.platform_id and a.id = cg.platform_account_id
     and a.status = 'active'
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
    select o.id, o.platform_id, o.total_amount, o.currency, s.updated_at as finalized_at
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

create or replace function private.admin_commerce_entitlement_list(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_cursor_updated_at timestamptz default null,
  p_cursor_account_id uuid default null,
  p_limit integer default 20,
  p_query text default null,
  p_status text default null,
  p_plan_id uuid default null,
  p_source text default null,
  p_ending_from timestamptz default null,
  p_ending_to timestamptz default null
)
returns table (
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
     or ((p_cursor_updated_at is null) <> (p_cursor_account_id is null))
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
    select 1 from public.subscriptions s
    where s.platform_id = p_platform_id
      and s.platform_account_id = p_cursor_account_id
      and s.updated_at = p_cursor_updated_at
  ) then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;

  return query
  select
    a.id,
    a.user_id,
    pr.display_name,
    pr.avatar_url,
    a.status,
    s.status,
    plan.id,
    plan.code,
    plan.name,
    winning.id,
    winning.source,
    winning.billing_order_id,
    redemption.batch_id,
    attribution.offer_id,
    attribution.offer_code,
    attribution.price_id,
    s.started_at,
    s.current_period_end,
    s.next_transition_at,
    s.updated_at
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
    on plan.platform_id = s.platform_id and plan.id = coalesce(winning.plan_id, s.plan_id)
  left join public.redemption_codes redemption
    on redemption.platform_id = s.platform_id and redemption.id = winning.redemption_code_id
  left join lateral (
    select chosen.offer_id, chosen.offer_code, chosen.price_id
    from (
      select o.id as offer_id, o.code as offer_code, c.commercial_price_id as price_id, 1 as priority
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
      select o.id, o.code, c.commercial_price_id, 2
      from public.billing_checkout_intents c
      join public.platform_commercial_offers o
        on o.platform_id = c.platform_id
       and o.legacy_product_code = c.product_code
      where winning.source = 'billing_order'
        and c.platform_id = s.platform_id
        and c.platform_account_id = s.platform_account_id
        and c.commercial_offer_id is null
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
    and (p_cursor_account_id is null or (s.updated_at, s.platform_account_id) < (p_cursor_updated_at, p_cursor_account_id))
  order by s.updated_at desc, s.platform_account_id desc
  limit p_limit;
end;
$$;

create or replace function private.admin_redemption_campaign_list_v2(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_cursor_batch_id uuid default null,
  p_limit integer default 20,
  p_query text default null,
  p_status text default null,
  p_plan_id uuid default null,
  p_offer_id uuid default null,
  p_created_from timestamptz default null,
  p_created_to timestamptz default null
)
returns table (
  batch_id uuid,
  plan_id uuid,
  plan_code text,
  plan_name text,
  commercial_offer_id uuid,
  offer_code text,
  offer_name text,
  name text,
  status text,
  quantity integer,
  redeemed_count bigint,
  unused_count bigint,
  disabled_count bigint,
  redemption_rate numeric,
  expires_at timestamptz,
  delivery_deadline timestamptz,
  delivered_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_query text := nullif(btrim(p_query), '');
  v_cursor_created_at timestamptz;
begin
  perform private.billing_admin_assert(p_ctx);
  if p_platform_id is null or p_limit is null or p_limit not between 1 and 100
     or (v_query is not null and length(v_query) > 128)
     or (p_status is not null and p_status not in ('pending_delivery', 'active', 'disabled'))
     or (p_created_from is not null and p_created_to is not null and p_created_from > p_created_to) then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if not exists (select 1 from public.platforms p where p.id = p_platform_id) then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  if p_cursor_batch_id is not null then
    select b.created_at into v_cursor_created_at
    from public.redemption_code_batches b
    where b.platform_id = p_platform_id and b.id = p_cursor_batch_id;
    if v_cursor_created_at is null then
      raise exception using errcode = 'P0002', message = 'resource_not_found';
    end if;
  end if;

  return query
  select
    b.id,
    b.plan_id,
    plan.code,
    plan.name,
    b.commercial_offer_id,
    offer.code,
    offer.name,
    b.name,
    b.status,
    b.quantity,
    stats.redeemed_count,
    stats.unused_count,
    stats.disabled_count,
    case when b.quantity = 0 then 0::numeric
      else round(stats.redeemed_count::numeric / b.quantity::numeric, 6) end,
    b.expires_at,
    b.delivery_deadline,
    b.delivered_at,
    b.created_at
  from public.redemption_code_batches b
  join public.plans plan on plan.platform_id = b.platform_id and plan.id = b.plan_id
  left join public.platform_commercial_offers offer
    on offer.platform_id = b.platform_id and offer.id = b.commercial_offer_id
  cross join lateral (
    select
      count(*) filter (where c.status = 'redeemed')::bigint as redeemed_count,
      count(*) filter (where c.status = 'unused')::bigint as unused_count,
      count(*) filter (where c.status = 'disabled')::bigint as disabled_count
    from public.redemption_codes c
    where c.platform_id = b.platform_id and c.batch_id = b.id
  ) stats
  where b.platform_id = p_platform_id
    and (v_query is null
      or b.name ilike '%' || v_query || '%'
      or plan.code ilike '%' || v_query || '%'
      or plan.name ilike '%' || v_query || '%'
      or coalesce(offer.code, '') ilike '%' || v_query || '%'
      or coalesce(offer.name, '') ilike '%' || v_query || '%')
    and (p_status is null or b.status = p_status)
    and (p_plan_id is null or b.plan_id = p_plan_id)
    and (p_offer_id is null or b.commercial_offer_id = p_offer_id)
    and (p_created_from is null or b.created_at >= p_created_from)
    and (p_created_to is null or b.created_at <= p_created_to)
    and (p_cursor_batch_id is null or (b.created_at, b.id) < (v_cursor_created_at, p_cursor_batch_id))
  order by b.created_at desc, b.id desc
  limit p_limit;
end;
$$;

create or replace function private.admin_redemption_campaign_codes_v2(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_batch_id uuid,
  p_cursor_code_id uuid default null,
  p_limit integer default 50
)
returns table (
  redemption_code_id uuid,
  masked_code text,
  status text,
  redeemed_by_platform_account_id uuid,
  redeemed_by_display_name text,
  redeemed_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_cursor_created_at timestamptz;
begin
  perform private.billing_admin_assert(p_ctx);
  if p_platform_id is null or p_batch_id is null or p_limit is null or p_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if not exists (
    select 1 from public.redemption_code_batches b
    where b.platform_id = p_platform_id and b.id = p_batch_id
  ) then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  if p_cursor_code_id is not null then
    select c.created_at into v_cursor_created_at
    from public.redemption_codes c
    where c.platform_id = p_platform_id and c.batch_id = p_batch_id and c.id = p_cursor_code_id;
    if v_cursor_created_at is null then
      raise exception using errcode = 'P0002', message = 'resource_not_found';
    end if;
  end if;

  return query
  select
    c.id,
    case
      when c.code_prefix is null and c.code_suffix is null then '••••'::text
      when c.code_prefix is null then '••••' || c.code_suffix
      when c.code_suffix is null then c.code_prefix || '••••'
      else c.code_prefix || '••••' || c.code_suffix
    end,
    c.status,
    c.redeemed_by_platform_account_id,
    pr.display_name,
    c.redeemed_at,
    c.created_at
  from public.redemption_codes c
  left join public.platform_profiles pr on pr.platform_account_id = c.redeemed_by_platform_account_id
  where c.platform_id = p_platform_id
    and c.batch_id = p_batch_id
    and (p_cursor_code_id is null or (c.created_at, c.id) < (v_cursor_created_at, p_cursor_code_id))
  order by c.created_at desc, c.id desc
  limit p_limit;
end;
$$;

alter function private.admin_commerce_summary(private.admin_context, uuid, timestamptz, timestamptz) owner to domain_owner;
alter function private.admin_commerce_entitlement_list(private.admin_context, uuid, timestamptz, uuid, integer, text, text, uuid, text, timestamptz, timestamptz) owner to domain_owner;
alter function private.admin_redemption_campaign_list_v2(private.admin_context, uuid, uuid, integer, text, text, uuid, uuid, timestamptz, timestamptz) owner to domain_owner;
alter function private.admin_redemption_campaign_codes_v2(private.admin_context, uuid, uuid, uuid, integer) owner to domain_owner;

revoke all on function private.admin_commerce_summary(private.admin_context, uuid, timestamptz, timestamptz),
  private.admin_commerce_entitlement_list(private.admin_context, uuid, timestamptz, uuid, integer, text, text, uuid, text, timestamptz, timestamptz),
  private.admin_redemption_campaign_list_v2(private.admin_context, uuid, uuid, integer, text, text, uuid, uuid, timestamptz, timestamptz),
  private.admin_redemption_campaign_codes_v2(private.admin_context, uuid, uuid, uuid, integer)
from public, anon, authenticated, account_executor, admin_executor, job_executor,
  recovery_executor, billing_ingress;

grant execute on function private.admin_commerce_summary(private.admin_context, uuid, timestamptz, timestamptz),
  private.admin_commerce_entitlement_list(private.admin_context, uuid, timestamptz, uuid, integer, text, text, uuid, text, timestamptz, timestamptz),
  private.admin_redemption_campaign_list_v2(private.admin_context, uuid, uuid, integer, text, text, uuid, uuid, timestamptz, timestamptz),
  private.admin_redemption_campaign_codes_v2(private.admin_context, uuid, uuid, uuid, integer)
to admin_executor;
