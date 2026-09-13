-- BILL-19: a lifetime purchase is a one-time account action.
-- Pending/expired checkouts may be retried. Once a lifetime checkout has
-- reached a paid or resolution state, every later lifetime transition for
-- the same platform account is rejected at the database boundary.

create or replace function private.billing_lifetime_purchase_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private, public
as $$
begin
  if new.product_code = 'lifetime'
     and new.status in ('paid', 'verified', 'granted', 'review_required', 'resolved') then
    perform pg_advisory_xact_lock(
      hashtextextended(
        new.platform_id::text || ':' || new.platform_account_id::text,
        0
      )
    );

    if exists (
      select 1
      from public.billing_checkout_intents existing
      where existing.platform_id = new.platform_id
        and existing.platform_account_id = new.platform_account_id
        and existing.product_code = 'lifetime'
        and existing.status in ('paid', 'verified', 'granted', 'review_required', 'resolved')
        and existing.id <> new.id
    ) then
      raise exception using errcode = 'P0001', message = 'lifetime_already_purchased';
    end if;
  end if;

  return new;
end;
$$;

alter function private.billing_lifetime_purchase_guard() owner to domain_owner;
revoke all on function private.billing_lifetime_purchase_guard()
  from public, anon, authenticated, account_executor, admin_executor,
    job_executor, recovery_executor, billing_ingress;

create index if not exists billing_checkout_intents_lifetime_purchase_idx
  on public.billing_checkout_intents(platform_id, platform_account_id, status)
  where product_code = 'lifetime'
    and status in ('paid', 'verified', 'granted', 'review_required', 'resolved');

drop trigger if exists billing_checkout_intents_lifetime_purchase_guard
  on public.billing_checkout_intents;
create trigger billing_checkout_intents_lifetime_purchase_guard
  before insert or update of platform_id, platform_account_id, product_code, status
  on public.billing_checkout_intents
  for each row execute function private.billing_lifetime_purchase_guard();
