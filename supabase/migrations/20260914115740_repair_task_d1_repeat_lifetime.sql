-- D1: a 99-year product is a repeatable contribution. Every successful
-- purchase remains its own immutable checkout/order/settlement/grant fact;
-- the shared entitlement writer starts the next grant at the current grant's
-- end, so another purchase adds another 99 years without rewriting history.

drop trigger if exists billing_checkout_intents_lifetime_purchase_guard
  on public.billing_checkout_intents;

-- Keep the old helper for migration compatibility and observability. The
-- repeat-purchase policy is now enforced by the shared entitlement writer:
-- same plan may extend, while a different active plan still conflicts.
create or replace function private.billing_lifetime_purchase_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private, public
as $$
begin
  return new;
end;
$$;

alter function private.billing_lifetime_purchase_guard() owner to domain_owner;
revoke all on function private.billing_lifetime_purchase_guard()
  from public, anon, authenticated, account_executor, admin_executor,
    job_executor, recovery_executor, billing_ingress;
