-- BILL-20: expose one-time lifetime purchase history to authenticated product
-- reads so the consumer UI can disable a previously purchased lifetime plan
-- even while a later queued entitlement is not yet effective.

create or replace function private.subscription_lifetime_purchase_status(
  p_ctx private.account_context
)
returns table (lifetime_purchased boolean)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_authorization text;
  v_account_id uuid;
begin
  select principal.authorization, principal.platform_account_id
  into v_authorization, v_account_id
  from private.account_principal(p_ctx) principal;
  if v_authorization <> 'allowed' or v_account_id is null then
    raise exception using errcode = '42501', message = coalesce(v_authorization, 'account_not_activated');
  end if;

  return query
    select exists (
      select 1
      from public.billing_checkout_intents checkout_intent
      where checkout_intent.platform_id = (p_ctx).platform_id
        and checkout_intent.platform_account_id = v_account_id
        and checkout_intent.product_code = 'lifetime'
        and checkout_intent.status in ('paid', 'verified', 'granted', 'review_required', 'resolved')
    );
end;
$$;

alter function private.subscription_lifetime_purchase_status(private.account_context)
  owner to domain_owner;
revoke all on function private.subscription_lifetime_purchase_status(private.account_context)
  from public, anon, authenticated, admin_executor, job_executor, recovery_executor,
    billing_ingress;
grant execute on function private.subscription_lifetime_purchase_status(private.account_context)
  to account_executor;
