-- BILL-18: expose the concrete paid product (monthly/yearly/lifetime) that
-- currently supplies the effective entitlement. The access plan remains a
-- separate field because all paid products may share one platform plan.

drop function private.entitlement_read(private.account_context);

create function private.entitlement_read(
  p_ctx private.account_context
)
returns table (
  effective_status text,
  entitlement_kind text,
  plan_id uuid,
  code text,
  name text,
  description text,
  features jsonb,
  subscription_product_code text,
  subscription_product_name text,
  started_at timestamptz,
  current_period_end timestamptz,
  next_transition_at timestamptz,
  evaluated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_authorization text;
  v_account_id uuid;
  v_sub public.subscriptions;
  v_plan public.plans;
  v_default public.plans;
  v_subscription_product_code text;
  v_subscription_product_name text;
  v_now timestamptz := clock_timestamp();
begin
  select principal.authorization, principal.platform_account_id
  into v_authorization, v_account_id
  from private.account_principal(p_ctx) principal;
  if v_authorization <> 'allowed' then
    raise exception using errcode = '42501', message = v_authorization;
  end if;

  perform private.entitlement_recompute((p_ctx).platform_id, v_account_id);
  select * into v_sub
  from public.subscriptions s
  where s.platform_account_id = v_account_id;

  if v_sub.status = 'suspended' then
    return query select
      'suspended'::text,
      'none'::text,
      null::uuid,
      null::text,
      null::text,
      null::text,
      '{}'::jsonb,
      null::text,
      null::text,
      null::timestamptz,
      null::timestamptz,
      v_sub.next_transition_at,
      v_now;
    return;
  end if;

  if v_sub.plan_id is not null then
    select * into v_plan
    from public.plans p
    where p.platform_id = (p_ctx).platform_id and p.id = v_sub.plan_id;

    select
      ci.product_code as subscription_product_code,
      product.name as subscription_product_name
    into v_subscription_product_code, v_subscription_product_name
    from public.subscription_grants g
    left join public.billing_orders bo on bo.id = g.billing_order_id
    left join public.billing_checkout_intents ci on ci.id = bo.checkout_intent_id
    left join public.subscription_products product on product.code = ci.product_code
    where g.platform_id = (p_ctx).platform_id
      and g.platform_account_id = v_account_id
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
    order by g.starts_at desc, g.created_at desc
    limit 1;

    return query select
      'active'::text,
      case when v_sub.current_period_end is null then 'perpetual' else 'term' end,
      v_plan.id,
      v_plan.code,
      v_plan.name,
      v_plan.description,
      v_plan.features,
      v_subscription_product_code,
      v_subscription_product_name,
      v_sub.started_at,
      v_sub.current_period_end,
      v_sub.next_transition_at,
      v_now;
    return;
  end if;

  select p.* into v_default
  from public.platforms platform
  join public.plans p
    on p.platform_id = platform.id
   and p.id = platform.default_plan_id
  where platform.id = (p_ctx).platform_id
    and p.status = 'active'
    and p.kind = 'free';

  if found then
    return query select
      'active'::text,
      'free'::text,
      v_default.id,
      v_default.code,
      v_default.name,
      v_default.description,
      v_default.features,
      'free'::text,
      v_default.name,
      null::timestamptz,
      null::timestamptz,
      v_sub.next_transition_at,
      v_now;
  else
    return query select
      'none'::text,
      'none'::text,
      null::uuid,
      null::text,
      null::text,
      null::text,
      '{}'::jsonb,
      null::text,
      null::text,
      null::timestamptz,
      null::timestamptz,
      v_sub.next_transition_at,
      v_now;
  end if;
end;
$$;

alter function private.entitlement_read(private.account_context) owner to domain_owner;
revoke all on function private.entitlement_read(private.account_context)
  from public, anon, authenticated, admin_executor, job_executor, recovery_executor;
grant execute on function private.entitlement_read(private.account_context)
  to account_executor;
