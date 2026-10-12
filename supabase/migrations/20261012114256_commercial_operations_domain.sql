-- OPT-010 Phase 01: additive commercial Offer / immutable Price domain.
-- Existing fixed subscription_products remain the legacy compatibility surface.

create table public.platform_commercial_offers (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null,
  plan_id uuid not null,
  code text not null check (length(code) between 1 and 64 and code ~ '^[a-z0-9][a-z0-9_-]*$'),
  name text not null check (length(name) between 1 and 128),
  description text check (description is null or length(description) <= 1024),
  term_kind text not null default 'finite' check (term_kind = 'finite'),
  duration_value integer not null check (duration_value > 0),
  duration_unit text not null check (duration_unit in ('day', 'month', 'year')),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  sort_order integer not null default 100 check (sort_order > 0),
  recommended boolean not null default false,
  legacy_product_code text check (legacy_product_code is null or legacy_product_code in ('monthly', 'yearly', 'lifetime')),
  row_version bigint not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform_id, code),
  unique (platform_id, id),
  foreign key (platform_id) references public.platforms(id) on delete restrict,
  foreign key (platform_id, plan_id) references public.plans(platform_id, id) on delete restrict
);

create unique index platform_commercial_offers_legacy_code_idx
  on public.platform_commercial_offers(platform_id, legacy_product_code)
  where legacy_product_code is not null;
create index platform_commercial_offers_plan_status_idx
  on public.platform_commercial_offers(platform_id, plan_id, status, sort_order, id);

create table public.platform_commercial_prices (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null,
  offer_id uuid not null,
  version integer not null check (version > 0),
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'CNY' check (currency = 'CNY'),
  status text not null default 'draft' check (status in ('draft', 'active', 'retired')),
  effective_from timestamptz,
  row_version bigint not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (offer_id, version),
  unique (platform_id, id),
  foreign key (platform_id, offer_id)
    references public.platform_commercial_offers(platform_id, id) on delete restrict,
  check (status <> 'active' or effective_from is not null)
);

create unique index platform_commercial_prices_one_active_idx
  on public.platform_commercial_prices(offer_id) where status = 'active';
create index platform_commercial_prices_offer_status_idx
  on public.platform_commercial_prices(platform_id, offer_id, status, version desc);

alter table public.platform_commercial_offers enable row level security;
alter table public.platform_commercial_offers force row level security;
alter table public.platform_commercial_prices enable row level security;
alter table public.platform_commercial_prices force row level security;

create policy platform_commercial_offers_domain_owner
  on public.platform_commercial_offers for all to domain_owner using (true) with check (true);
create policy platform_commercial_prices_domain_owner
  on public.platform_commercial_prices for all to domain_owner using (true) with check (true);

revoke all on public.platform_commercial_offers, public.platform_commercial_prices
  from public, anon, authenticated, account_executor, admin_executor, job_executor,
    recovery_executor, billing_ingress;
grant select, insert, update on public.platform_commercial_offers, public.platform_commercial_prices
  to domain_owner;

create or replace function private.commercial_offer_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private, public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.platform_id is distinct from old.platform_id
      or new.code is distinct from old.code then
      raise exception using errcode = 'P0001', message = 'commercial_offer_identity_immutable';
    end if;
    if (new.plan_id is distinct from old.plan_id
        or new.term_kind is distinct from old.term_kind
        or new.duration_value is distinct from old.duration_value
        or new.duration_unit is distinct from old.duration_unit
        or new.legacy_product_code is distinct from old.legacy_product_code)
       and exists (
         select 1 from public.platform_commercial_prices p where p.offer_id = old.id
       ) then
      raise exception using errcode = 'P0001', message = 'commercial_offer_terms_immutable';
    end if;
    if old.status = 'archived' and new.status <> 'archived' then
      raise exception using errcode = 'P0001', message = 'commercial_offer_archived';
    end if;
    new.row_version := old.row_version + 1;
  end if;
  if new.status = 'active' and not exists (
    select 1 from public.plans p
    where p.platform_id = new.platform_id and p.id = new.plan_id
      and p.kind = 'paid' and p.status = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'plan_unavailable';
  end if;
  return new;
end;
$$;

create or replace function private.commercial_price_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private, public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.platform_id is distinct from old.platform_id
      or new.offer_id is distinct from old.offer_id
      or new.version is distinct from old.version
      or new.amount is distinct from old.amount
      or new.currency is distinct from old.currency
      or new.effective_from is distinct from old.effective_from then
      raise exception using errcode = 'P0001', message = 'commercial_price_immutable';
    end if;
    if old.status = 'retired' and new.status <> 'retired' then
      raise exception using errcode = 'P0001', message = 'commercial_price_retired';
    end if;
    if old.status = 'active' and new.status not in ('active', 'retired') then
      raise exception using errcode = 'P0001', message = 'commercial_price_transition_invalid';
    end if;
    new.row_version := old.row_version + 1;
  end if;
  return new;
end;
$$;

alter function private.commercial_offer_guard() owner to domain_owner;
alter function private.commercial_price_guard() owner to domain_owner;
revoke all on function private.commercial_offer_guard(), private.commercial_price_guard()
  from public, anon, authenticated, account_executor, admin_executor, job_executor,
    recovery_executor, billing_ingress;

create trigger platform_commercial_offers_guard
before insert or update on public.platform_commercial_offers
for each row execute function private.commercial_offer_guard();
create trigger platform_commercial_offers_updated_at
before update on public.platform_commercial_offers
for each row execute function private.set_updated_at();
create trigger platform_commercial_prices_guard
before update on public.platform_commercial_prices
for each row execute function private.commercial_price_guard();
create trigger platform_commercial_prices_updated_at
before update on public.platform_commercial_prices
for each row execute function private.set_updated_at();

-- Bootstrap the fixed catalog into platform-scoped Offers. Disabled legacy
-- products remain draft so the migration cannot silently open purchasing.
insert into public.platform_commercial_offers (
  platform_id, plan_id, code, name, description, term_kind,
  duration_value, duration_unit, status, sort_order, recommended, legacy_product_code
)
select c.platform_id, c.paid_plan_id,
  'legacy-' || product.code, product.name, product.description, 'finite',
  product.duration_value, product.duration_unit,
  case
    when p.status = 'active' and (
      (product.code = 'monthly' and c.monthly_enabled)
      or (product.code = 'yearly' and c.yearly_enabled)
      or (product.code = 'lifetime' and c.lifetime_enabled)
    ) then 'active' else 'draft'
  end,
  product.sort_order, product.recommended, product.code
from public.platform_subscription_config c
join public.plans p on p.platform_id = c.platform_id and p.id = c.paid_plan_id and p.kind = 'paid'
join public.subscription_products product
  on product.code in ('monthly', 'yearly', 'lifetime') and product.status = 'active'
where c.paid_plan_id is not null
on conflict (platform_id, code) do nothing;

insert into public.platform_commercial_prices (
  platform_id, offer_id, version, amount, currency, status, effective_from
)
select offer.platform_id, offer.id, product.price_version, product.price_amount,
  product.currency, 'active', offer.created_at
from public.platform_commercial_offers offer
join public.subscription_products product on product.code = offer.legacy_product_code
where offer.legacy_product_code is not null
on conflict (offer_id, version) do nothing;

-- Attribution fields are additive in Phase 01. Legacy NOT NULL checkout and
-- mapping columns intentionally remain until the Phase 02 compatibility switch.
alter table public.billing_provider_products
  add column platform_id uuid,
  add column commercial_price_id uuid,
  add constraint billing_provider_products_commercial_scope_check check (
    (platform_id is null and commercial_price_id is null)
    or (platform_id is not null and commercial_price_id is not null)
  ),
  add constraint billing_provider_products_commercial_price_fk
    foreign key (platform_id, commercial_price_id)
    references public.platform_commercial_prices(platform_id, id) on delete restrict;

create index billing_provider_products_commercial_price_idx
  on public.billing_provider_products(platform_id, commercial_price_id, mapping_version desc)
  where commercial_price_id is not null;

alter table public.billing_checkout_intents
  add column commercial_offer_id uuid,
  add column commercial_price_id uuid,
  add column offer_code_snapshot text,
  add constraint billing_checkout_commercial_offer_fk
    foreign key (platform_id, commercial_offer_id)
    references public.platform_commercial_offers(platform_id, id) on delete restrict,
  add constraint billing_checkout_commercial_price_fk
    foreign key (platform_id, commercial_price_id)
    references public.platform_commercial_prices(platform_id, id) on delete restrict,
  add constraint billing_checkout_commercial_attribution_check check (
    (commercial_offer_id is null and commercial_price_id is null and offer_code_snapshot is null)
    or (commercial_offer_id is not null and commercial_price_id is not null and offer_code_snapshot is not null)
  );

create index billing_checkout_commercial_offer_idx
  on public.billing_checkout_intents(platform_id, commercial_offer_id, created_at desc)
  where commercial_offer_id is not null;

alter table public.redemption_code_batches
  add column commercial_offer_id uuid,
  add constraint redemption_batches_commercial_offer_fk
    foreign key (platform_id, commercial_offer_id)
    references public.platform_commercial_offers(platform_id, id) on delete restrict;

create index redemption_batches_commercial_offer_idx
  on public.redemption_code_batches(platform_id, commercial_offer_id, created_at desc)
  where commercial_offer_id is not null;

-- Extend the existing provider mapping immutability fence to the new commercial
-- attribution without changing legacy mapping behavior yet.
create or replace function private.billing_provider_product_contract_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_checkout_exists boolean;
begin
  if tg_op = 'DELETE' then
    select exists (
      select 1 from public.billing_checkout_intents c
      where c.provider_account_id = old.provider_account_id and c.provider_product_id = old.id
    ) or old.published into v_checkout_exists;
    if v_checkout_exists then
      raise exception using errcode = 'P0001', message = 'mapping_immutable';
    end if;
    return old;
  end if;

  select old.published or exists (
    select 1 from public.billing_checkout_intents c
    where c.provider_account_id = old.provider_account_id and c.provider_product_id = old.id
  ) into v_checkout_exists;
  if v_checkout_exists and (
    new.provider_account_id is distinct from old.provider_account_id
    or new.subscription_product_id is distinct from old.subscription_product_id
    or new.platform_id is distinct from old.platform_id
    or new.commercial_price_id is distinct from old.commercial_price_id
    or new.external_plan_id is distinct from old.external_plan_id
    or new.product_type is distinct from old.product_type
    or new.external_sku_ids is distinct from old.external_sku_ids
    or new.sku_count is distinct from old.sku_count
    or new.purchase_months is distinct from old.purchase_months
    or new.expected_show_amount is distinct from old.expected_show_amount
    or new.expected_total_amount is distinct from old.expected_total_amount
    or new.currency is distinct from old.currency
    or new.price_version is distinct from old.price_version
    or new.mapping_version is distinct from old.mapping_version
  ) then
    raise exception using errcode = 'P0001', message = 'mapping_immutable';
  end if;
  return new;
end;
$$;

-- Phase 01 remains a hybrid/legacy checkout path. When commercial attribution
-- is supplied it must exactly describe the frozen entitlement/price snapshot.
create or replace function private.billing_checkout_snapshot_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_mapping public.billing_provider_products;
  v_product public.subscription_products;
  v_offer public.platform_commercial_offers;
  v_price public.platform_commercial_prices;
  v_has_snapshot boolean;
begin
  if tg_op = 'UPDATE' then
    if new.platform_id is distinct from old.platform_id
      or new.platform_account_id is distinct from old.platform_account_id
      or new.subscription_product_id is distinct from old.subscription_product_id
      or new.entitlement_plan_id is distinct from old.entitlement_plan_id
      or new.provider_account_id is distinct from old.provider_account_id
      or new.provider_product_id is distinct from old.provider_product_id
      or new.product_code is distinct from old.product_code
      or new.commercial_offer_id is distinct from old.commercial_offer_id
      or new.commercial_price_id is distinct from old.commercial_price_id
      or new.offer_code_snapshot is distinct from old.offer_code_snapshot
      or new.term_kind_snapshot is distinct from old.term_kind_snapshot
      or new.duration_value_snapshot is distinct from old.duration_value_snapshot
      or new.duration_unit_snapshot is distinct from old.duration_unit_snapshot
      or new.price_amount is distinct from old.price_amount
      or new.currency is distinct from old.currency
      or new.price_version is distinct from old.price_version
      or new.mapping_version is distinct from old.mapping_version
      or new.custom_order_id is distinct from old.custom_order_id
      or new.provider_external_plan_id_snapshot is distinct from old.provider_external_plan_id_snapshot
      or new.provider_product_type_snapshot is distinct from old.provider_product_type_snapshot
      or new.provider_external_sku_ids_snapshot is distinct from old.provider_external_sku_ids_snapshot
      or new.provider_sku_count_snapshot is distinct from old.provider_sku_count_snapshot
      or new.provider_purchase_months_snapshot is distinct from old.provider_purchase_months_snapshot
      or new.provider_expected_show_amount_snapshot is distinct from old.provider_expected_show_amount_snapshot
      or new.provider_expected_total_amount_snapshot is distinct from old.provider_expected_total_amount_snapshot
      or new.provider_price_version_snapshot is distinct from old.provider_price_version_snapshot then
      raise exception using errcode = 'P0001', message = 'checkout_snapshot_immutable';
    end if;
    return new;
  end if;

  if new.provider_product_id is null then
    if new.provider_external_plan_id_snapshot is not null
      or new.provider_product_type_snapshot is not null
      or new.provider_external_sku_ids_snapshot is not null
      or new.provider_sku_count_snapshot is not null
      or new.provider_purchase_months_snapshot is not null
      or new.provider_expected_show_amount_snapshot is not null
      or new.provider_expected_total_amount_snapshot is not null
      or new.provider_price_version_snapshot is not null then
      raise exception using errcode = '22023', message = 'invalid_input';
    end if;
    return new;
  end if;

  select p.* into v_mapping from public.billing_provider_products p
  where p.provider_account_id = new.provider_account_id and p.id = new.provider_product_id;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;

  select p.* into v_product from public.subscription_products p where p.id = new.subscription_product_id;
  if not found
    or new.product_code is distinct from v_product.code
    or new.term_kind_snapshot is distinct from v_product.term_kind
    or new.duration_value_snapshot is distinct from v_product.duration_value
    or new.duration_unit_snapshot is distinct from v_product.duration_unit
    or new.price_amount is distinct from v_product.price_amount
    or new.price_version is distinct from v_product.price_version
    or new.price_amount is distinct from v_mapping.expected_show_amount
    or new.currency is distinct from v_product.currency
    or new.currency is distinct from v_mapping.currency
    or new.mapping_version is distinct from v_mapping.mapping_version
    or v_mapping.subscription_product_id is distinct from new.subscription_product_id then
    raise exception using errcode = 'P0001', message = 'checkout_snapshot_conflict';
  end if;

  if new.commercial_offer_id is not null then
    select o.* into v_offer from public.platform_commercial_offers o
    where o.platform_id = new.platform_id and o.id = new.commercial_offer_id;
    select p.* into v_price from public.platform_commercial_prices p
    where p.platform_id = new.platform_id and p.id = new.commercial_price_id;
    if v_offer.id is null or v_price.id is null
      or v_price.offer_id <> v_offer.id
      or v_offer.plan_id <> new.entitlement_plan_id
      or v_offer.code <> new.offer_code_snapshot
      or v_offer.term_kind <> new.term_kind_snapshot
      or v_offer.duration_value <> new.duration_value_snapshot
      or v_offer.duration_unit <> new.duration_unit_snapshot
      or v_price.amount <> new.price_amount
      or v_price.currency <> new.currency
      or v_price.version <> new.price_version
      or (v_mapping.commercial_price_id is not null and (
        v_mapping.platform_id <> new.platform_id
        or v_mapping.commercial_price_id <> new.commercial_price_id
      )) then
      raise exception using errcode = 'P0001', message = 'checkout_commercial_snapshot_conflict';
    end if;
  end if;

  v_has_snapshot := new.provider_external_plan_id_snapshot is not null
    or new.provider_product_type_snapshot is not null
    or new.provider_external_sku_ids_snapshot is not null
    or new.provider_sku_count_snapshot is not null
    or new.provider_price_version_snapshot is not null
    or new.provider_expected_show_amount_snapshot is not null
    or new.provider_expected_total_amount_snapshot is not null;
  if not v_has_snapshot then
    new.provider_external_plan_id_snapshot := v_mapping.external_plan_id;
    new.provider_product_type_snapshot := v_mapping.product_type;
    new.provider_external_sku_ids_snapshot := v_mapping.external_sku_ids;
    new.provider_sku_count_snapshot := v_mapping.sku_count;
    new.provider_purchase_months_snapshot := v_mapping.purchase_months;
    new.provider_expected_show_amount_snapshot := v_mapping.expected_show_amount;
    new.provider_expected_total_amount_snapshot := v_mapping.expected_total_amount;
    new.provider_price_version_snapshot := v_mapping.price_version;
  elsif new.provider_external_plan_id_snapshot is distinct from v_mapping.external_plan_id
    or new.provider_product_type_snapshot is distinct from v_mapping.product_type
    or new.provider_external_sku_ids_snapshot is distinct from v_mapping.external_sku_ids
    or new.provider_sku_count_snapshot is distinct from v_mapping.sku_count
    or new.provider_purchase_months_snapshot is distinct from v_mapping.purchase_months
    or new.provider_expected_show_amount_snapshot is distinct from v_mapping.expected_show_amount
    or new.provider_expected_total_amount_snapshot is distinct from v_mapping.expected_total_amount
    or new.provider_price_version_snapshot is distinct from v_mapping.price_version then
    raise exception using errcode = 'P0001', message = 'checkout_snapshot_conflict';
  end if;
  return new;
end;
$$;

alter function private.billing_provider_product_contract_guard() owner to domain_owner;
alter function private.billing_checkout_snapshot_guard() owner to domain_owner;
revoke all on function private.billing_provider_product_contract_guard(), private.billing_checkout_snapshot_guard()
  from public, anon, authenticated, account_executor, admin_executor,
    job_executor, recovery_executor, billing_ingress;
