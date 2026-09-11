-- BILL-08: expose Provider mapping readiness in the public product catalog.
-- The previous catalog function intentionally kept purchasable=false while
-- mappings were not modeled. Once a verified current mapping exists, the
-- read contract must reflect that fact without bypassing the checkout switch.

create or replace function private.subscription_products_list(
  p_platform_id uuid,
  p_platform_key_id uuid
)
returns table (
  product_code text,
  product_name text,
  product_description text,
  price_amount numeric,
  currency text,
  term_kind text,
  duration_value integer,
  duration_unit text,
  price_version integer,
  recommended boolean,
  enabled boolean,
  purchasable boolean,
  reason text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_platform public.platforms;
  v_config public.platform_subscription_config;
  v_paid_plan public.plans;
begin
  select p.* into v_platform
  from public.platforms p
  join private.platform_api_keys k on k.platform_id = p.id
  where p.id = p_platform_id and k.id = p_platform_key_id
    and k.status = 'active' and (k.expires_at is null or k.expires_at > now());
  if not found then
    raise exception using errcode = '28000', message = 'platform_key_invalid';
  end if;

  select * into v_config
  from public.platform_subscription_config c
  where c.platform_id = p_platform_id;
  select p.* into v_paid_plan
  from public.plans p
  where p.platform_id = p_platform_id
    and p.id = v_config.paid_plan_id
    and p.kind = 'paid';

  return query
    select product.code, product.name, product.description, product.price_amount,
      product.currency, product.term_kind, product.duration_value, product.duration_unit,
      product.price_version, product.recommended,
      case
        when v_platform.status <> 'active' then false
        when product.code = 'free' then exists (
          select 1 from public.plans fp
          where fp.platform_id = p_platform_id
            and fp.id = v_platform.default_plan_id
            and fp.kind = 'free' and fp.status = 'active'
        )
        when v_paid_plan.id is null or v_paid_plan.status <> 'active' then false
        when product.code = 'monthly' then v_config.monthly_enabled
        when product.code = 'yearly' then v_config.yearly_enabled
        when product.code = 'lifetime' then v_config.lifetime_enabled
        else false
      end,
      case
        when product.code = 'free' then false
        when v_platform.status <> 'active' then false
        when v_paid_plan.id is null or v_paid_plan.status <> 'active' then false
        when product.code = 'monthly' and not v_config.monthly_enabled then false
        when product.code = 'yearly' and not v_config.yearly_enabled then false
        when product.code = 'lifetime' and not v_config.lifetime_enabled then false
        else exists (
          select 1
          from public.billing_provider_accounts pa
          join public.billing_provider_products pp
            on pp.provider_account_id = pa.id
          where pa.status = 'active'
            and pp.subscription_product_id = product.id
            and pp.published and pp.enabled
            and pp.validation_status = 'verified'
            and pp.price_version = product.price_version
            and pp.expected_show_amount = product.price_amount
            and pp.currency = product.currency
        )
      end,
      case
        when v_platform.status <> 'active' then 'platform_disabled'
        when product.code = 'free' and not exists (
          select 1 from public.plans fp
          where fp.platform_id = p_platform_id
            and fp.id = v_platform.default_plan_id
            and fp.kind = 'free' and fp.status = 'active'
        ) then 'free_plan_not_configured'
        when product.code <> 'free' and v_paid_plan.id is null then 'paid_plan_not_configured'
        when product.code <> 'free' and v_paid_plan.status <> 'active' then 'paid_plan_unavailable'
        when product.code = 'monthly' and not v_config.monthly_enabled then 'product_disabled'
        when product.code = 'yearly' and not v_config.yearly_enabled then 'product_disabled'
        when product.code = 'lifetime' and not v_config.lifetime_enabled then 'product_disabled'
        when product.code <> 'free' and not exists (
          select 1
          from public.billing_provider_accounts pa
          join public.billing_provider_products pp
            on pp.provider_account_id = pa.id
          where pa.status = 'active'
            and pp.subscription_product_id = product.id
            and pp.published and pp.enabled
            and pp.validation_status = 'verified'
            and pp.price_version = product.price_version
            and pp.expected_show_amount = product.price_amount
            and pp.currency = product.currency
        ) then 'provider_mapping_unavailable'
        else 'ready'
      end
    from public.subscription_products product
    where product.status = 'active'
    order by product.sort_order;
end;
$$;

alter function private.subscription_products_list(uuid, uuid) owner to domain_owner;
revoke all on function private.subscription_products_list(uuid, uuid)
  from public, anon, authenticated, admin_executor, job_executor, recovery_executor;
grant execute on function private.subscription_products_list(uuid, uuid)
  to account_executor;
