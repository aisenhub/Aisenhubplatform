-- BILL-12: expose only the verified Provider mapping facts needed to build a
-- one-time Afdian Checkout URL for an existing local Checkout intent.

create or replace function private.subscription_checkout_payment_facts(
  p_ctx private.account_context,
  p_checkout_id uuid
)
returns table (
  custom_order_id text,
  external_plan_id text,
  product_type text,
  external_sku_ids text[]
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_account_id uuid;
begin
  select principal.platform_account_id into v_account_id
  from private.account_principal(p_ctx) principal
  where principal.authorization = 'allowed';
  if v_account_id is null then
    raise exception using errcode = '42501', message = 'account_not_activated';
  end if;

  return query
  select checkout.custom_order_id,
    mapping.external_plan_id,
    mapping.product_type,
    mapping.external_sku_ids
  from public.billing_checkout_intents checkout
  left join public.billing_provider_products mapping
    on mapping.provider_account_id = checkout.provider_account_id
    and mapping.id = checkout.provider_product_id
  where checkout.platform_id = (p_ctx).platform_id
    and checkout.platform_account_id = v_account_id
    and checkout.id = p_checkout_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
end;
$$;

alter function private.subscription_checkout_payment_facts(private.account_context, uuid)
  owner to domain_owner;
revoke all on function private.subscription_checkout_payment_facts(private.account_context, uuid)
  from public, anon, authenticated, admin_executor, job_executor, recovery_executor,
  billing_ingress;
grant execute on function private.subscription_checkout_payment_facts(private.account_context, uuid)
  to account_executor;
