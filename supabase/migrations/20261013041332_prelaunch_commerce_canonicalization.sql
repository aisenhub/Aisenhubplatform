-- Prelaunch Commerce canonicalization.
-- There is no production data to preserve: Offer/Price/Mapping is the only commercial model.

create table public.platform_commerce_policy (
  platform_id uuid primary key references public.platforms(id) on delete restrict,
  purchases_paused boolean not null default false,
  subscription_copy_override text check (
    subscription_copy_override is null or length(subscription_copy_override) <= 1024
  ),
  row_version bigint not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.platform_commerce_policy enable row level security;
alter table public.platform_commerce_policy force row level security;
create policy platform_commerce_policy_domain_owner
  on public.platform_commerce_policy for all to domain_owner using (true) with check (true);
revoke all on public.platform_commerce_policy
  from public, anon, authenticated, account_executor, admin_executor, job_executor,
    recovery_executor, billing_ingress;
grant select, insert, update on public.platform_commerce_policy to domain_owner;
create trigger platform_commerce_policy_updated_at
before update on public.platform_commerce_policy
for each row execute function private.set_updated_at();

insert into public.platform_commerce_policy (
  platform_id, purchases_paused, subscription_copy_override, row_version
)
select p.id, coalesce(c.purchases_paused, false), c.subscription_copy_override,
  coalesce(c.row_version, 1)
from public.platforms p
left join public.platform_subscription_config c on c.platform_id = p.id
on conflict (platform_id) do nothing;

create or replace function private.platform_commerce_policy_init()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private, public
as $$
begin
  insert into public.platform_commerce_policy(platform_id)
  values (new.id) on conflict (platform_id) do nothing;
  return new;
end;
$$;
alter function private.platform_commerce_policy_init() owner to domain_owner;
revoke all on function private.platform_commerce_policy_init()
  from public, anon, authenticated, account_executor, admin_executor, job_executor,
    recovery_executor, billing_ingress;
create trigger platforms_commerce_policy_init
after insert on public.platforms
for each row execute function private.platform_commerce_policy_init();

-- Shared, durable Admin operation-id semantics for high-risk commerce commands.
create or replace function private.admin_operation_claim(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_operation text,
  p_operation_id uuid,
  p_request_hash bytea
)
returns table(outcome text, response_body jsonb)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public, extensions
as $$
declare
  v_existing private.admin_idempotency%rowtype;
  v_new boolean := false;
  v_scope text;
begin
  perform private.billing_admin_assert(p_ctx);
  if p_platform_id is null or p_operation is null or length(p_operation) not between 1 and 128
     or p_operation_id is null or p_request_hash is null then
    raise exception using errcode='22023', message='invalid_input';
  end if;
  v_scope := 'platform:' || p_platform_id::text;
  insert into private.admin_idempotency(
    admin_user_id, platform_id, scope, operation, idempotency_key, request_hash
  ) values (
    (p_ctx).admin_user_id, p_platform_id, v_scope, p_operation,
    p_operation_id::text, p_request_hash
  ) on conflict (admin_user_id, scope, operation, idempotency_key)
    do nothing returning true into v_new;
  if coalesce(v_new, false) then
    return query select 'claimed'::text, null::jsonb;
    return;
  end if;
  select * into v_existing
  from private.admin_idempotency i
  where i.admin_user_id=(p_ctx).admin_user_id and i.scope=v_scope
    and i.operation=p_operation and i.idempotency_key=p_operation_id::text
  for update;
  if v_existing.request_hash <> p_request_hash then
    raise exception using errcode='23505', message='idempotency_conflict';
  end if;
  if v_existing.state='completed' then
    return query select 'replayed'::text, v_existing.response_body;
    return;
  end if;
  raise exception using errcode='P0001', message='operation_in_progress';
end;
$$;

create or replace function private.admin_operation_finalize(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_operation text,
  p_operation_id uuid,
  p_response_body jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
begin
  if p_response_body is null or jsonb_typeof(p_response_body) <> 'object' then
    raise exception using errcode='22023', message='invalid_input';
  end if;
  update private.admin_idempotency i
  set state='completed', response_status=200, response_body=p_response_body
  where i.admin_user_id=(p_ctx).admin_user_id
    and i.scope='platform:'||p_platform_id::text
    and i.operation=p_operation and i.idempotency_key=p_operation_id::text
    and i.state='pending';
  if not found then
    raise exception using errcode='P0001', message='operation_not_claimed';
  end if;
end;
$$;

alter function private.admin_operation_claim(private.admin_context,uuid,text,uuid,bytea) owner to domain_owner;
alter function private.admin_operation_finalize(private.admin_context,uuid,text,uuid,jsonb) owner to domain_owner;
revoke all on function private.admin_operation_claim(private.admin_context,uuid,text,uuid,bytea),
  private.admin_operation_finalize(private.admin_context,uuid,text,uuid,jsonb)
from public, anon, authenticated, account_executor, admin_executor, job_executor,
  recovery_executor, billing_ingress;
grant execute on function private.admin_operation_claim(private.admin_context,uuid,text,uuid,bytea),
  private.admin_operation_finalize(private.admin_context,uuid,text,uuid,jsonb) to domain_owner;

-- Remove compatibility-sensitive references from guards before columns/tables disappear.
create or replace function private.commercial_offer_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private, public
as $$
begin
  if tg_op='UPDATE' then
    if new.platform_id is distinct from old.platform_id or new.code is distinct from old.code then
      raise exception using errcode='P0001', message='commercial_offer_identity_immutable';
    end if;
    if (new.plan_id is distinct from old.plan_id
        or new.term_kind is distinct from old.term_kind
        or new.duration_value is distinct from old.duration_value
        or new.duration_unit is distinct from old.duration_unit)
       and exists(select 1 from public.platform_commercial_prices p where p.offer_id=old.id) then
      raise exception using errcode='P0001', message='commercial_offer_terms_immutable';
    end if;
    if old.status='archived' and new.status<>'archived' then
      raise exception using errcode='P0001', message='commercial_offer_archived';
    end if;
    new.row_version := old.row_version + 1;
  end if;
  if new.status='active' and not exists(
    select 1 from public.plans p where p.platform_id=new.platform_id and p.id=new.plan_id
      and p.kind='paid' and p.status='active'
  ) then
    raise exception using errcode='P0001', message='plan_unavailable';
  end if;
  return new;
end;
$$;

create or replace function private.billing_provider_product_contract_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private, public
as $$
declare v_checkout_exists boolean;
begin
  if tg_op='DELETE' then
    select exists(
      select 1 from public.billing_checkout_intents c
      where c.provider_account_id=old.provider_account_id and c.provider_product_id=old.id
    ) or old.published into v_checkout_exists;
    if v_checkout_exists then
      raise exception using errcode='P0001', message='mapping_immutable';
    end if;
    return old;
  end if;
  select old.published or exists(
    select 1 from public.billing_checkout_intents c
    where c.provider_account_id=old.provider_account_id and c.provider_product_id=old.id
  ) into v_checkout_exists;
  if v_checkout_exists and (
    new.provider_account_id is distinct from old.provider_account_id
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
    raise exception using errcode='P0001', message='mapping_immutable';
  end if;
  return new;
end;
$$;

create or replace function private.billing_checkout_lifecycle_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_platform_status text;
  v_purchases_paused boolean;
  v_plan_status text;
begin
  select p.status into v_platform_status from public.platforms p
  where p.id=new.platform_id for share;
  if v_platform_status is null or v_platform_status<>'active' then
    raise exception using errcode='42501', message='platform_disabled';
  end if;
  select c.purchases_paused into v_purchases_paused
  from public.platform_commerce_policy c where c.platform_id=new.platform_id for share;
  if coalesce(v_purchases_paused,false) then
    raise exception using errcode='P0001', message='purchases_paused';
  end if;
  select p.status into v_plan_status from public.plans p
  where p.platform_id=new.platform_id and p.id=new.entitlement_plan_id for share;
  if v_plan_status is null or v_plan_status<>'active' then
    raise exception using errcode='P0001', message='plan_unavailable';
  end if;
  return new;
end;
$$;

create or replace function private.billing_checkout_snapshot_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_mapping public.billing_provider_products;
  v_offer public.platform_commercial_offers;
  v_price public.platform_commercial_prices;
begin
  if tg_op='UPDATE' then
    if new.platform_id is distinct from old.platform_id
      or new.platform_account_id is distinct from old.platform_account_id
      or new.entitlement_plan_id is distinct from old.entitlement_plan_id
      or new.provider_account_id is distinct from old.provider_account_id
      or new.provider_product_id is distinct from old.provider_product_id
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
      raise exception using errcode='P0001', message='checkout_snapshot_immutable';
    end if;
    return new;
  end if;
  select * into v_mapping from public.billing_provider_products m
  where m.provider_account_id=new.provider_account_id and m.id=new.provider_product_id;
  if not found or not v_mapping.published or not v_mapping.enabled
    or v_mapping.validation_status<>'verified' then
    raise exception using errcode='P0001', message='provider_mapping_unavailable';
  end if;
  select * into v_offer from public.platform_commercial_offers o
  where o.platform_id=new.platform_id and o.id=new.commercial_offer_id;
  select * into v_price from public.platform_commercial_prices p
  where p.platform_id=new.platform_id and p.id=new.commercial_price_id
    and p.offer_id=new.commercial_offer_id;
  if v_offer.id is null or v_price.id is null
    or v_mapping.platform_id<>new.platform_id
    or v_mapping.commercial_price_id<>v_price.id
    or new.entitlement_plan_id<>v_offer.plan_id
    or new.offer_code_snapshot<>v_offer.code
    or new.term_kind_snapshot<>v_offer.term_kind
    or new.duration_value_snapshot<>v_offer.duration_value
    or new.duration_unit_snapshot<>v_offer.duration_unit
    or new.price_amount<>v_price.amount or new.currency<>v_price.currency
    or new.price_version<>v_price.version
    or new.mapping_version<>v_mapping.mapping_version then
    raise exception using errcode='P0001', message='checkout_snapshot_mismatch';
  end if;
  -- The caller selects only the canonical Mapping. Freeze the provider contract
  -- from that verified Mapping inside the same transaction instead of trusting
  -- caller-supplied snapshot fields.
  new.provider_external_plan_id_snapshot := v_mapping.external_plan_id;
  new.provider_product_type_snapshot := v_mapping.product_type;
  new.provider_external_sku_ids_snapshot := v_mapping.external_sku_ids;
  new.provider_sku_count_snapshot := v_mapping.sku_count;
  new.provider_purchase_months_snapshot := v_mapping.purchase_months;
  new.provider_expected_show_amount_snapshot := v_mapping.expected_show_amount;
  new.provider_expected_total_amount_snapshot := v_mapping.expected_total_amount;
  new.provider_price_version_snapshot := v_mapping.price_version;
  return new;
end;
$$;

-- Redemption batches retain one business snapshot only: plan/duration plus optional Offer attribution.
create or replace function private.redemption_batch_snapshot_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private, public
as $$
begin
  if old.platform_id<>new.platform_id or old.plan_id<>new.plan_id
    or old.name<>new.name or old.quantity<>new.quantity
    or old.duration_value<>new.duration_value or old.duration_unit<>new.duration_unit
    or old.creation_operation_id<>new.creation_operation_id
    or old.commercial_offer_id is distinct from new.commercial_offer_id then
    raise exception using errcode='P0001', message='redemption_batch_snapshot_immutable';
  end if;
  return new;
end;
$$;

-- Collapse storage columns to the canonical commercial model.
drop index if exists public.platform_commercial_offers_legacy_code_idx;
alter table public.platform_commercial_offers drop column if exists legacy_product_code;

alter table public.billing_provider_products
  drop constraint if exists billing_provider_products_catalog_target_check,
  drop constraint if exists billing_provider_products_commercial_scope_check;
alter table public.billing_provider_products
  alter column platform_id set not null,
  alter column commercial_price_id set not null;
alter table public.billing_provider_products drop column if exists subscription_product_id;

alter table public.billing_checkout_intents
  drop constraint if exists billing_checkout_catalog_source_check,
  drop constraint if exists billing_checkout_commercial_attribution_check,
  drop constraint if exists billing_checkout_intents_product_code_check;
alter table public.billing_checkout_intents
  alter column commercial_offer_id set not null,
  alter column commercial_price_id set not null,
  alter column offer_code_snapshot set not null;
alter table public.billing_checkout_intents
  drop column if exists subscription_product_id,
  drop column if exists product_code;

alter table public.billing_orders drop column if exists subscription_product_id;

alter table public.redemption_code_batches
  drop column if exists model_version,
  drop column if exists product_code,
  drop column if exists term_kind_snapshot,
  drop column if exists duration_value_snapshot,
  drop column if exists duration_unit_snapshot;

-- Old policy/catalog triggers no longer create or backfill a second commercial model.
drop trigger if exists platforms_subscription_config_init on public.platforms;
drop trigger if exists plans_subscription_config_backfill on public.plans;
drop trigger if exists subscription_products_guard on public.subscription_products;
drop trigger if exists subscription_products_set_updated_at on public.subscription_products;
drop trigger if exists platform_subscription_config_set_updated_at on public.platform_subscription_config;

-- Remove old SQL entrypoints before deleting their source tables.
drop function if exists private.subscription_products_list(uuid,uuid);
drop function if exists private.admin_subscription_config_read(private.admin_context,uuid);
drop function if exists private.admin_subscription_config_patch(private.admin_context,uuid,bigint,uuid,boolean,boolean,boolean,text,text);
drop function if exists private.admin_subscription_config_read_v2(private.admin_context,uuid);
drop function if exists private.admin_subscription_config_patch_v2(private.admin_context,uuid,bigint,uuid,boolean,boolean,boolean,boolean,text,text);
drop function if exists private.subscription_plan_switch_preflight(uuid,uuid);
drop function if exists private.platform_subscription_config_backfill(uuid);
drop function if exists private.platform_subscription_config_backfill_trigger();
drop function if exists private.platform_subscription_config_init();
drop function if exists private.subscription_product_guard();
drop function if exists private.billing_lifetime_purchase_guard();

drop function if exists private.subscription_checkout_create_v2(private.account_context,uuid,text,uuid,text,smallint,bytea);
drop function if exists private.subscription_checkout_create(private.account_context,uuid,text,text,smallint,bytea);
drop function if exists private.subscription_checkout_read_v3(private.account_context,uuid);
drop function if exists private.subscription_checkout_read_by_idempotency_v2(private.account_context,text);
drop function if exists private.subscription_checkout_read_v2(private.account_context,uuid);
drop function if exists private.subscription_checkout_read_by_idempotency(private.account_context,text);
drop function if exists private.subscription_checkout_read(private.account_context,uuid);

drop table public.platform_subscription_config;
drop table public.subscription_products;

-- Canonical policy is deliberately small: purchase pause and presentation copy only.
create or replace function private.admin_commerce_policy_read(
  p_ctx private.admin_context,
  p_platform_id uuid
)
returns table(
  platform_id uuid,
  purchases_paused boolean,
  subscription_copy_override text,
  row_version bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
begin
  perform private.billing_admin_assert(p_ctx);
  if not exists(select 1 from public.platforms p where p.id=p_platform_id) then
    raise exception using errcode='P0002', message='resource_not_found';
  end if;
  return query
  select c.platform_id,c.purchases_paused,c.subscription_copy_override,c.row_version
  from public.platform_commerce_policy c where c.platform_id=p_platform_id;
end;
$$;

create or replace function private.admin_commerce_policy_patch(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_expected_version bigint,
  p_purchases_paused boolean,
  p_subscription_copy_override text,
  p_reason text
)
returns table(
  platform_id uuid,
  purchases_paused boolean,
  subscription_copy_override text,
  row_version bigint
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
begin
  perform private.billing_admin_assert(p_ctx);
  if p_expected_version is null or p_expected_version<1 or p_purchases_paused is null
    or (p_subscription_copy_override is not null and length(p_subscription_copy_override)>1024)
    or p_reason is null or length(p_reason) not between 1 and 1024 then
    raise exception using errcode='22023', message='invalid_input';
  end if;
  perform 1 from public.platforms p where p.id=p_platform_id for update;
  if not found then raise exception using errcode='P0002', message='resource_not_found'; end if;
  update public.platform_commerce_policy c
  set purchases_paused=p_purchases_paused,
      subscription_copy_override=p_subscription_copy_override,
      row_version=c.row_version+1
  where c.platform_id=p_platform_id and c.row_version=p_expected_version;
  if not found then raise exception using errcode='40001', message='precondition_failed'; end if;
  perform private.audit_append((p_ctx).request_id,'admin',(p_ctx).admin_user_id,p_platform_id,null,
    'commerce.policy_updated','platform_commerce_policy',p_platform_id,null,null,
    jsonb_build_object('purchases_paused',p_purchases_paused,'reason',p_reason));
  return query select * from private.admin_commerce_policy_read(p_ctx,p_platform_id);
end;
$$;

-- Consumer catalog now has one authority: active Offer + active immutable Price + ready Mapping.
drop function if exists private.commerce_offers_list(uuid,uuid);
create function private.commerce_offers_list(
  p_platform_id uuid,
  p_platform_key_id uuid
)
returns table(
  offer_id uuid, offer_code text, offer_name text, offer_description text,
  plan_id uuid, plan_code text, plan_name text,
  duration_value integer, duration_unit text, recommended boolean,
  price_id uuid, price_amount numeric, currency text, price_version integer,
  purchasable boolean, reason text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_platform_status text;
  v_purchases_paused boolean := false;
begin
  select p.status into v_platform_status
  from public.platforms p
  join private.platform_api_keys k on k.platform_id=p.id
  where p.id=p_platform_id and k.id=p_platform_key_id
    and k.status='active' and (k.expires_at is null or k.expires_at>now());
  if not found then raise exception using errcode='28000', message='platform_key_invalid'; end if;
  select c.purchases_paused into v_purchases_paused
  from public.platform_commerce_policy c where c.platform_id=p_platform_id;
  return query
  select o.id,o.code,o.name,o.description,p.id,p.code,p.name,
    o.duration_value,o.duration_unit,o.recommended,
    price.id,price.amount,price.currency,price.version,
    (v_platform_status='active' and not coalesce(v_purchases_paused,false)
      and p.status='active' and price.id is not null
      and exists(
        select 1 from public.billing_provider_products m
        join public.billing_provider_accounts pa on pa.id=m.provider_account_id
        where m.platform_id=p_platform_id and m.commercial_price_id=price.id
          and pa.status='active' and m.published and m.enabled
          and m.validation_status='verified'
          and m.expected_show_amount=price.amount and m.currency=price.currency
          and m.price_version=price.version
      )),
    case
      when v_platform_status<>'active' then 'platform_disabled'
      when coalesce(v_purchases_paused,false) then 'purchases_paused'
      when p.status<>'active' then 'plan_unavailable'
      when price.id is null then 'price_unavailable'
      when not exists(
        select 1 from public.billing_provider_products m
        join public.billing_provider_accounts pa on pa.id=m.provider_account_id
        where m.platform_id=p_platform_id and m.commercial_price_id=price.id
          and pa.status='active' and m.published and m.enabled
          and m.validation_status='verified'
          and m.expected_show_amount=price.amount and m.currency=price.currency
          and m.price_version=price.version
      ) then 'provider_mapping_unavailable'
      else 'ready'
    end
  from public.platform_commercial_offers o
  join public.plans p on p.platform_id=o.platform_id and p.id=o.plan_id and p.kind='paid'
  left join public.platform_commercial_prices price
    on price.platform_id=o.platform_id and price.offer_id=o.id and price.status='active'
  where o.platform_id=p_platform_id and o.status='active'
  order by o.sort_order,o.id;
end;
$$;

-- Checkout creation only accepts an Offer id and freezes every business/provider fact.
create function private.subscription_checkout_create(
  p_ctx private.account_context,
  p_checkout_id uuid,
  p_offer_id uuid,
  p_idempotency_key text,
  p_token_key_version smallint default null,
  p_token_digest bytea default null
)
returns table(
  checkout_id uuid,status text,offer_id uuid,offer_code text,
  plan_id uuid,plan_name text,price_amount numeric,currency text,term_kind text,
  duration_value integer,duration_unit text,price_version integer,expires_at timestamptz,
  provider_account_id uuid,provider_product_id uuid,provider_display_name text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public, extensions
as $$
declare
  v_authorization text;
  v_account_id uuid;
  v_offer public.platform_commercial_offers;
  v_price public.platform_commercial_prices;
  v_plan public.plans;
  v_provider public.billing_provider_accounts;
  v_mapping public.billing_provider_products;
  v_existing public.billing_checkout_intents;
  v_checkout public.billing_checkout_intents;
  v_key_hash bytea;
  v_request_hash bytea;
begin
  if p_checkout_id is null or p_offer_id is null
    or p_idempotency_key is null or length(p_idempotency_key) not between 1 and 128 then
    raise exception using errcode='22023', message='invalid_input';
  end if;
  select principal.authorization,principal.platform_account_id into v_authorization,v_account_id
  from private.account_principal(p_ctx) principal;
  if v_authorization<>'allowed' or v_account_id is null then
    raise exception using errcode='42501', message=coalesce(v_authorization,'account_not_activated');
  end if;
  v_key_hash:=extensions.digest(convert_to(p_idempotency_key,'utf8'),'sha256');
  v_request_hash:=extensions.digest(convert_to(jsonb_build_object('offer_id',p_offer_id)::text,'utf8'),'sha256');
  perform 1 from public.platforms p where p.id=(p_ctx).platform_id and p.status='active' for update;
  if not found then raise exception using errcode='42501', message='platform_disabled'; end if;
  perform 1 from public.platform_accounts a
  where a.platform_id=(p_ctx).platform_id and a.id=v_account_id and a.status='active' for update;
  if not found then raise exception using errcode='42501', message='account_suspended'; end if;
  if exists(select 1 from public.platform_commerce_policy c
    where c.platform_id=(p_ctx).platform_id and c.purchases_paused) then
    raise exception using errcode='P0001', message='purchases_paused';
  end if;
  select * into v_existing from public.billing_checkout_intents c
  where c.platform_id=(p_ctx).platform_id and c.platform_account_id=v_account_id
    and c.idempotency_key_hash=v_key_hash for update;
  if found then
    if v_existing.request_hash<>v_request_hash then
      raise exception using errcode='23505', message='idempotency_conflict';
    end if;
    return query
    select v_existing.id,v_existing.status,v_existing.commercial_offer_id,
      v_existing.offer_code_snapshot,v_existing.entitlement_plan_id,p.name,
      v_existing.price_amount,v_existing.currency,v_existing.term_kind_snapshot,
      v_existing.duration_value_snapshot,v_existing.duration_unit_snapshot,
      v_existing.price_version,v_existing.expires_at,v_existing.provider_account_id,
      v_existing.provider_product_id,pa.name
    from public.plans p left join public.billing_provider_accounts pa on pa.id=v_existing.provider_account_id
    where p.platform_id=v_existing.platform_id and p.id=v_existing.entitlement_plan_id;
    return;
  end if;
  select * into v_offer from public.platform_commercial_offers o
  where o.platform_id=(p_ctx).platform_id and o.id=p_offer_id and o.status='active';
  if not found then raise exception using errcode='P0001', message='offer_unavailable'; end if;
  select * into v_price from public.platform_commercial_prices p
  where p.platform_id=v_offer.platform_id and p.offer_id=v_offer.id and p.status='active';
  if not found then raise exception using errcode='P0001', message='price_unavailable'; end if;
  select * into v_plan from public.plans p
  where p.platform_id=v_offer.platform_id and p.id=v_offer.plan_id and p.kind='paid' and p.status='active';
  if not found then raise exception using errcode='P0001', message='plan_unavailable'; end if;
  select m.* into v_mapping
  from public.billing_provider_products m
  join public.billing_provider_accounts pa on pa.id=m.provider_account_id
  where m.platform_id=v_offer.platform_id and m.commercial_price_id=v_price.id
    and pa.status='active' and m.published and m.enabled and m.validation_status='verified'
    and m.expected_show_amount=v_price.amount and m.currency=v_price.currency
    and m.price_version=v_price.version
  order by m.mapping_version desc,m.id limit 1;
  if not found then raise exception using errcode='P0001', message='provider_mapping_unavailable'; end if;
  select * into v_provider from public.billing_provider_accounts pa
  where pa.id=v_mapping.provider_account_id and pa.status='active';
  if not found then raise exception using errcode='P0001', message='provider_mapping_unavailable'; end if;
  if p_token_key_version is null or p_token_digest is null or octet_length(p_token_digest)<>32 then
    raise exception using errcode='P0001', message='checkout_key_unavailable';
  end if;
  insert into public.billing_checkout_intents(
    id,platform_id,platform_account_id,entitlement_plan_id,provider_account_id,
    provider_product_id,commercial_offer_id,commercial_price_id,offer_code_snapshot,
    term_kind_snapshot,duration_value_snapshot,duration_unit_snapshot,price_amount,currency,
    price_version,mapping_version,token_key_version,token_digest,idempotency_key_hash,
    request_hash,expires_at
  ) values (
    p_checkout_id,(p_ctx).platform_id,v_account_id,v_plan.id,v_provider.id,v_mapping.id,
    v_offer.id,v_price.id,v_offer.code,v_offer.term_kind,v_offer.duration_value,
    v_offer.duration_unit,v_price.amount,v_price.currency,v_price.version,v_mapping.mapping_version,
    p_token_key_version,p_token_digest,v_key_hash,v_request_hash,clock_timestamp()+interval '30 minutes'
  ) returning * into v_checkout;
  perform private.audit_append((p_ctx).request_id,'user',(p_ctx).user_id,(p_ctx).platform_id,
    v_account_id,'billing.checkout_created','billing_checkout_intent',v_checkout.id,null,null,
    jsonb_build_object('offer_id',v_offer.id,'offer_code',v_offer.code,'price_id',v_price.id,
      'price_version',v_price.version,'mapping_version',v_mapping.mapping_version));
  return query select v_checkout.id,v_checkout.status,v_offer.id,v_offer.code,v_plan.id,v_plan.name,
    v_checkout.price_amount,v_checkout.currency,v_checkout.term_kind_snapshot,
    v_checkout.duration_value_snapshot,v_checkout.duration_unit_snapshot,v_checkout.price_version,
    v_checkout.expires_at,v_provider.id,v_mapping.id,v_provider.name;
end;
$$;

-- Canonical checkout projection/recovery.
create function private.subscription_checkout_read(
  p_ctx private.account_context,
  p_checkout_id uuid
)
returns table(
  checkout_id uuid,status text,offer_id uuid,offer_code text,plan_id uuid,plan_name text,
  price_amount numeric,currency text,term_kind text,duration_value integer,duration_unit text,
  price_version integer,expires_at timestamptz,provider_display_name text,paid_at timestamptz,
  granted_at timestamptz,provider_status text,verification_status text,entitlement_status text,
  job_state text,status_reason text,next_action text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare v_account_id uuid;
begin
  select principal.platform_account_id into v_account_id
  from private.account_principal(p_ctx) principal where principal.authorization='allowed';
  return query
  with facts as (
    select c.id,c.status as stored_status,c.commercial_offer_id,c.offer_code_snapshot,
      c.entitlement_plan_id,plan.name as plan_name,c.price_amount,c.currency,
      c.term_kind_snapshot,c.duration_value_snapshot,c.duration_unit_snapshot,c.price_version,
      c.expires_at,pa.name as provider_display_name,c.paid_at,c.granted_at,
      case when exists(select 1 from public.billing_orders o where o.checkout_intent_id=c.id and o.provider_status='paid') then 'paid'
        when exists(select 1 from public.billing_orders o where o.checkout_intent_id=c.id and o.provider_status='failed') then 'failed'
        when exists(select 1 from public.billing_orders o where o.checkout_intent_id=c.id and o.provider_status='pending') then 'pending'
        else 'unknown' end as projected_provider_status,
      case when exists(select 1 from public.billing_orders o where o.checkout_intent_id=c.id and o.verification_status='verified') then 'verified'
        when exists(select 1 from public.billing_orders o where o.checkout_intent_id=c.id and o.verification_status='rejected') then 'rejected'
        else 'unverified' end as projected_verification_status,
      case when exists(select 1 from public.billing_orders o where o.checkout_intent_id=c.id and o.entitlement_status='granted') then 'granted'
        when exists(select 1 from public.billing_orders o where o.checkout_intent_id=c.id and o.entitlement_status='blocked') then 'blocked'
        when exists(select 1 from public.billing_orders o where o.checkout_intent_id=c.id and o.entitlement_status='rejected') then 'rejected'
        else 'not_started' end as projected_entitlement_status,
      case when exists(select 1 from public.billing_processing_jobs j join public.billing_orders o on o.id=j.billing_order_id where o.checkout_intent_id=c.id and j.state='manual_review') then 'manual_review'
        when exists(select 1 from public.billing_processing_jobs j join public.billing_orders o on o.id=j.billing_order_id where o.checkout_intent_id=c.id and j.state='processing') then 'processing'
        when exists(select 1 from public.billing_processing_jobs j join public.billing_orders o on o.id=j.billing_order_id where o.checkout_intent_id=c.id and j.state='retryable') then 'retryable'
        when exists(select 1 from public.billing_processing_jobs j join public.billing_orders o on o.id=j.billing_order_id where o.checkout_intent_id=c.id and j.state='pending') then 'pending'
        when exists(select 1 from public.billing_processing_jobs j join public.billing_orders o on o.id=j.billing_order_id where o.checkout_intent_id=c.id and j.state='completed') then 'completed'
        else null end as projected_job_state,
      exists(select 1 from public.billing_settlements s join public.billing_orders o on o.id=s.billing_order_id
        where o.checkout_intent_id=c.id and s.state in ('blocked','review_required')) as settlement_requires_review
    from public.billing_checkout_intents c
    join public.plans plan on plan.platform_id=c.platform_id and plan.id=c.entitlement_plan_id
    left join public.billing_provider_accounts pa on pa.id=c.provider_account_id
    where c.platform_id=(p_ctx).platform_id and c.platform_account_id=v_account_id and c.id=p_checkout_id
  ), projected as (
    select facts.*,
      case when stored_status in ('granted','resolved','paid','verified') then stored_status
        when projected_entitlement_status='granted' then 'granted'
        when projected_entitlement_status in ('blocked','rejected') or projected_job_state='manual_review' or settlement_requires_review then 'review_required'
        when projected_provider_status='paid' then 'paid'
        when stored_status='expired' then 'expired'
        when facts.expires_at<=clock_timestamp() then 'expired'
        else stored_status end as projected_status
    from facts
  )
  select projected.id,projected.projected_status,projected.commercial_offer_id,
    projected.offer_code_snapshot,projected.entitlement_plan_id,projected.plan_name,
    projected.price_amount,projected.currency,projected.term_kind_snapshot,
    projected.duration_value_snapshot,projected.duration_unit_snapshot,projected.price_version,
    projected.expires_at,projected.provider_display_name,projected.paid_at,projected.granted_at,
    projected.projected_provider_status,projected.projected_verification_status,
    projected.projected_entitlement_status,projected.projected_job_state,
    case projected.projected_status when 'granted' then 'entitlement_granted'
      when 'resolved' then 'resolved' when 'review_required' then 'manual_review'
      when 'expired' then 'expired' when 'paid' then 'payment_observed'
      when 'verified' then 'verification_pending' else 'awaiting_payment' end,
    case projected.projected_status when 'granted' then 'none' when 'resolved' then 'none'
      when 'review_required' then 'contact_support' when 'expired' then 'create_new_checkout'
      when 'paid' then 'wait' when 'verified' then 'wait' else 'pay_provider' end
  from projected;
  if not found then raise exception using errcode='P0002', message='resource_not_found'; end if;
end;
$$;

create function private.subscription_checkout_read_by_idempotency(
  p_ctx private.account_context,
  p_idempotency_key text
)
returns table(
  checkout_id uuid,status text,offer_id uuid,offer_code text,plan_id uuid,plan_name text,
  price_amount numeric,currency text,term_kind text,duration_value integer,duration_unit text,
  price_version integer,expires_at timestamptz,provider_display_name text,paid_at timestamptz,
  granted_at timestamptz,provider_status text,verification_status text,entitlement_status text,
  job_state text,status_reason text,next_action text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public, extensions
as $$
declare v_account_id uuid; v_checkout_id uuid; v_key_hash bytea;
begin
  if p_idempotency_key is null or length(p_idempotency_key) not between 1 and 128 then
    raise exception using errcode='22023', message='invalid_input';
  end if;
  select principal.platform_account_id into v_account_id
  from private.account_principal(p_ctx) principal where principal.authorization='allowed';
  if v_account_id is null then raise exception using errcode='42501', message='account_not_activated'; end if;
  v_key_hash:=extensions.digest(convert_to(p_idempotency_key,'utf8'),'sha256');
  select c.id into v_checkout_id from public.billing_checkout_intents c
  where c.platform_id=(p_ctx).platform_id and c.platform_account_id=v_account_id
    and c.idempotency_key_hash=v_key_hash;
  if not found then raise exception using errcode='P0002', message='resource_not_found'; end if;
  return query select * from private.subscription_checkout_read(p_ctx,v_checkout_id);
end;
$$;

-- Linking an observed order never needs a removed fixed-product identity.
create or replace function private.billing_order_link_checkout(
  p_ctx private.job_context,p_job_id uuid,p_order_id uuid,p_fence bigint,p_custom_order_id text
)
returns table(order_id uuid,linked boolean)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_job public.billing_processing_jobs;
  v_order public.billing_orders;
  v_checkout public.billing_checkout_intents;
  v_checkout_count integer:=0;
begin
  if (p_ctx).job_id is null or (p_ctx).lease_owner is null or (p_ctx).fencing_token is null
    or (p_ctx).request_id is null or p_job_id is null or p_order_id is null or p_fence is null
    or p_fence<>(p_ctx).fencing_token then
    raise exception using errcode='22023', message='invalid_input';
  end if;
  select * into v_job from public.billing_processing_jobs j where j.id=p_job_id
    and j.state='processing' and j.lease_owner=(p_ctx).lease_owner and j.fence=p_fence
    and j.lease_until>clock_timestamp() for update;
  if not found then raise exception using errcode='40001', message='fence_conflict'; end if;
  if v_job.billing_order_id is not null and v_job.billing_order_id<>p_order_id then
    raise exception using errcode='40001', message='job_order_conflict';
  end if;
  select * into v_order from public.billing_orders o where o.id=p_order_id for update;
  if not found then raise exception using errcode='P0002', message='resource_not_found'; end if;
  if v_order.checkout_intent_id is null and v_order.linkage_status='unlinked'
    and v_order.resolution_status='open'
    and not exists(select 1 from public.billing_settlements s where s.billing_order_id=v_order.id)
    and p_custom_order_id is not null and length(p_custom_order_id) between 1 and 256 then
    for v_checkout in select * from public.billing_checkout_intents c
      where c.provider_account_id=v_order.provider_account_id and c.custom_order_id=p_custom_order_id
      order by c.created_at desc,c.id desc for update
    loop
      v_checkout_count:=v_checkout_count+1;
      if v_checkout_count>1 then exit; end if;
    end loop;
    if v_checkout_count=1 then
      update public.billing_orders set checkout_intent_id=v_checkout.id,
        platform_id=v_checkout.platform_id,platform_account_id=v_checkout.platform_account_id,
        linkage_status='linked'
      where id=v_order.id and checkout_intent_id is null;
    end if;
  end if;
  update public.billing_processing_jobs set updated_at=clock_timestamp()
  where id=p_job_id and state='processing' and lease_owner=(p_ctx).lease_owner
    and fence=p_fence and lease_until>clock_timestamp();
  if not found then raise exception using errcode='40001', message='fence_conflict'; end if;
  select * into v_order from public.billing_orders o where o.id=p_order_id;
  return query select v_order.id,v_order.checkout_intent_id is not null;
end;
$$;

-- Admin Offer read/write surface without legacy attribution.
drop function if exists private.admin_commercial_offer_list(private.admin_context,uuid);
create function private.admin_commercial_offer_list(p_ctx private.admin_context,p_platform_id uuid)
returns table(
  offer_id uuid,plan_id uuid,plan_code text,plan_name text,offer_code text,offer_name text,
  description text,duration_value integer,duration_unit text,status text,recommended boolean,
  row_version bigint,price_id uuid,price_version integer,price_amount numeric,currency text,
  price_status text,provider_mapping_id uuid,mapping_status text
)
language plpgsql stable security definer
set search_path = pg_catalog, private, public
as $$
begin
  perform private.billing_admin_assert(p_ctx);
  if not exists(select 1 from public.platforms p where p.id=p_platform_id) then
    raise exception using errcode='P0002', message='resource_not_found';
  end if;
  return query
  select o.id,o.plan_id,plan.code,plan.name,o.code,o.name,o.description,o.duration_value,
    o.duration_unit,o.status,o.recommended,o.row_version,price.id,price.version,price.amount,
    price.currency,price.status,mapping.id,
    case when mapping.id is null then 'missing'
      when mapping.published and mapping.enabled and mapping.validation_status='verified' then 'ready'
      when mapping.validation_status='rejected' then 'rejected' else 'draft' end
  from public.platform_commercial_offers o
  join public.plans plan on plan.platform_id=o.platform_id and plan.id=o.plan_id
  left join lateral(select p.* from public.platform_commercial_prices p
    where p.platform_id=o.platform_id and p.offer_id=o.id
    order by p.version desc limit 1) price on true
  left join lateral(select m.* from public.billing_provider_products m
    where m.platform_id=o.platform_id and m.commercial_price_id=price.id
    order by (m.published and m.enabled) desc,m.mapping_version desc limit 1) mapping on true
  where o.platform_id=p_platform_id order by o.sort_order,o.id;
end;
$$;

create or replace function private.admin_commercial_offer_upsert(
  p_ctx private.admin_context,p_platform_id uuid,p_offer_id uuid,p_plan_id uuid,
  p_code text,p_name text,p_description text,p_duration_value integer,p_duration_unit text,
  p_recommended boolean
)
returns public.platform_commercial_offers
language plpgsql volatile security definer
set search_path = pg_catalog, private, public
as $$
declare v_offer public.platform_commercial_offers;
begin
  perform private.billing_admin_assert(p_ctx);
  if p_platform_id is null or p_plan_id is null or p_code is null or p_name is null
    or p_duration_value is null or p_duration_value<=0 or p_duration_unit not in ('day','month','year') then
    raise exception using errcode='22023', message='invalid_input';
  end if;
  if not exists(select 1 from public.plans p where p.platform_id=p_platform_id and p.id=p_plan_id and p.kind='paid' and p.status='active') then
    raise exception using errcode='P0001', message='plan_unavailable';
  end if;
  if p_offer_id is null then
    insert into public.platform_commercial_offers(platform_id,plan_id,code,name,description,
      duration_value,duration_unit,status,recommended)
    values(p_platform_id,p_plan_id,p_code,p_name,p_description,p_duration_value,p_duration_unit,
      'draft',coalesce(p_recommended,false)) returning * into v_offer;
  else
    update public.platform_commercial_offers o set plan_id=p_plan_id,code=p_code,name=p_name,
      description=p_description,duration_value=p_duration_value,duration_unit=p_duration_unit,
      recommended=coalesce(p_recommended,false)
    where o.platform_id=p_platform_id and o.id=p_offer_id and o.status<>'archived'
    returning * into v_offer;
    if not found then raise exception using errcode='P0002', message='resource_not_found'; end if;
  end if;
  perform private.audit_append((p_ctx).request_id,'admin',(p_ctx).admin_user_id,p_platform_id,null,
    'commerce.offer_saved','commercial_offer',v_offer.id,null,null,
    jsonb_build_object('status',v_offer.status,'plan_id',v_offer.plan_id));
  return v_offer;
end;
$$;

create or replace function private.admin_commercial_offer_command(
  p_ctx private.admin_context,p_platform_id uuid,p_offer_id uuid,p_action text,
  p_operation_id uuid,p_reason text
)
returns public.platform_commercial_offers
language plpgsql volatile security definer
set search_path = pg_catalog, private, public, extensions
as $$
declare
  v_offer public.platform_commercial_offers;
  v_claim record;
  v_hash bytea;
  v_response jsonb;
begin
  perform private.billing_admin_assert(p_ctx);
  if p_action not in ('activate','archive') or p_operation_id is null
    or p_reason is null or length(p_reason) not between 1 and 1024 then
    raise exception using errcode='22023', message='invalid_input';
  end if;
  v_hash:=extensions.digest(convert_to(jsonb_build_object('offer_id',p_offer_id,'action',p_action,'reason',p_reason)::text,'utf8'),'sha256');
  select * into v_claim from private.admin_operation_claim(p_ctx,p_platform_id,'commerce_offer_command',p_operation_id,v_hash);
  if v_claim.outcome='replayed' then
    select * into v_offer from jsonb_populate_record(null::public.platform_commercial_offers,v_claim.response_body);
    return v_offer;
  end if;
  select * into v_offer from public.platform_commercial_offers o
  where o.platform_id=p_platform_id and o.id=p_offer_id for update;
  if not found then raise exception using errcode='P0002', message='resource_not_found'; end if;
  if p_action='activate' then
    if v_offer.status='archived' then raise exception using errcode='P0001', message='commercial_offer_archived'; end if;
    if v_offer.status='active' then raise exception using errcode='P0001', message='commercial_offer_already_active'; end if;
    if not exists(select 1 from public.platform_commercial_prices p
      where p.platform_id=p_platform_id and p.offer_id=p_offer_id and p.status='active') then
      raise exception using errcode='P0001', message='price_unavailable';
    end if;
    update public.platform_commercial_offers set status='active' where id=p_offer_id returning * into v_offer;
  else
    if v_offer.status='archived' then raise exception using errcode='P0001', message='commercial_offer_archived'; end if;
    update public.platform_commercial_offers set status='archived' where id=p_offer_id returning * into v_offer;
  end if;
  v_response:=to_jsonb(v_offer);
  perform private.admin_operation_finalize(p_ctx,p_platform_id,'commerce_offer_command',p_operation_id,v_response);
  perform private.audit_append(p_operation_id,'admin',(p_ctx).admin_user_id,p_platform_id,null,
    'commerce.offer_'||p_action,'commercial_offer',p_offer_id,null,null,
    jsonb_build_object('reason',p_reason,'status',v_offer.status));
  return v_offer;
end;
$$;

create or replace function private.admin_commercial_price_create(
  p_ctx private.admin_context,p_platform_id uuid,p_offer_id uuid,p_amount numeric,
  p_currency text default 'CNY'
)
returns public.platform_commercial_prices
language plpgsql volatile security definer
set search_path = pg_catalog, private, public
as $$
declare v_offer public.platform_commercial_offers; v_price public.platform_commercial_prices; v_version integer;
begin
  perform private.billing_admin_assert(p_ctx);
  if p_amount is null or p_amount<=0 or p_currency<>'CNY' then
    raise exception using errcode='22023', message='invalid_input';
  end if;
  select * into v_offer from public.platform_commercial_offers o
  where o.platform_id=p_platform_id and o.id=p_offer_id and o.status<>'archived' for update;
  if not found then raise exception using errcode='P0002', message='resource_not_found'; end if;
  select coalesce(max(p.version),0)+1 into v_version
  from public.platform_commercial_prices p where p.offer_id=p_offer_id;
  insert into public.platform_commercial_prices(platform_id,offer_id,version,amount,currency,status)
  values(p_platform_id,p_offer_id,v_version,p_amount,p_currency,'draft') returning * into v_price;
  perform private.audit_append((p_ctx).request_id,'admin',(p_ctx).admin_user_id,p_platform_id,null,
    'commerce.price_created','commercial_price',v_price.id,null,null,
    jsonb_build_object('offer_id',p_offer_id,'version',v_version,'amount',p_amount,'currency',p_currency));
  return v_price;
end;
$$;

drop function if exists private.admin_commercial_price_publish(private.admin_context,uuid,uuid,uuid,text);
create function private.admin_commercial_price_command(
  p_ctx private.admin_context,p_platform_id uuid,p_price_id uuid,p_action text,
  p_operation_id uuid,p_reason text
)
returns public.platform_commercial_prices
language plpgsql volatile security definer
set search_path = pg_catalog, private, public, extensions
as $$
declare
  v_price public.platform_commercial_prices;
  v_offer_id uuid;
  v_claim record;
  v_hash bytea;
  v_response jsonb;
begin
  perform private.billing_admin_assert(p_ctx);
  if p_action not in ('publish','retire') or p_operation_id is null
    or p_reason is null or length(p_reason) not between 1 and 1024 then
    raise exception using errcode='22023', message='invalid_input';
  end if;
  v_hash:=extensions.digest(convert_to(jsonb_build_object('price_id',p_price_id,'action',p_action,'reason',p_reason)::text,'utf8'),'sha256');
  select * into v_claim from private.admin_operation_claim(p_ctx,p_platform_id,'commerce_price_command',p_operation_id,v_hash);
  if v_claim.outcome='replayed' then
    select * into v_price from jsonb_populate_record(null::public.platform_commercial_prices,v_claim.response_body);
    return v_price;
  end if;
  select p.offer_id into v_offer_id from public.platform_commercial_prices p
  where p.platform_id=p_platform_id and p.id=p_price_id;
  if not found then raise exception using errcode='P0002', message='resource_not_found'; end if;
  perform 1 from public.platform_commercial_offers o
  where o.platform_id=p_platform_id and o.id=v_offer_id for update;
  select * into v_price from public.platform_commercial_prices p
  where p.platform_id=p_platform_id and p.id=p_price_id for update;
  if v_price.status='retired' then raise exception using errcode='P0001', message='commercial_price_retired'; end if;
  if p_action='publish' then
    if v_price.status<>'draft' then raise exception using errcode='P0001', message='commercial_price_transition_invalid'; end if;
    update public.platform_commercial_prices p set status='retired'
    where p.offer_id=v_offer_id and p.status='active' and p.id<>p_price_id;
    update public.platform_commercial_prices set status='active',effective_from=clock_timestamp()
    where id=p_price_id returning * into v_price;
  else
    update public.platform_commercial_prices set status='retired'
    where id=p_price_id and status in ('draft','active') returning * into v_price;
    if not found then raise exception using errcode='P0001', message='commercial_price_transition_invalid'; end if;
  end if;
  v_response:=to_jsonb(v_price);
  perform private.admin_operation_finalize(p_ctx,p_platform_id,'commerce_price_command',p_operation_id,v_response);
  perform private.audit_append(p_operation_id,'admin',(p_ctx).admin_user_id,p_platform_id,null,
    'commerce.price_'||p_action,'commercial_price',p_price_id,null,null,
    jsonb_build_object('reason',p_reason,'offer_id',v_offer_id,'version',v_price.version));
  return v_price;
end;
$$;

create or replace function private.admin_commercial_mapping_upsert(
  p_ctx private.admin_context,p_platform_id uuid,p_mapping_id uuid,p_provider_account_id uuid,
  p_price_id uuid,p_external_plan_id text,p_product_type text,p_external_sku_ids text[],
  p_purchase_months integer,p_validation_status text
)
returns public.billing_provider_products
language plpgsql volatile security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_price public.platform_commercial_prices;
  v_mapping public.billing_provider_products;
  v_version integer;
begin
  perform private.billing_admin_assert(p_ctx);
  if p_validation_status not in ('unverified','verified','rejected') then
    raise exception using errcode='22023', message='invalid_input';
  end if;
  perform 1 from public.billing_provider_accounts pa where pa.id=p_provider_account_id for update;
  if not found then raise exception using errcode='P0002', message='resource_not_found'; end if;
  select * into v_price from public.platform_commercial_prices p
  where p.platform_id=p_platform_id and p.id=p_price_id for update;
  if not found then raise exception using errcode='P0002', message='resource_not_found'; end if;
  if p_mapping_id is null then
    select coalesce(max(m.mapping_version),0)+1 into v_version
    from public.billing_provider_products m
    where m.provider_account_id=p_provider_account_id and m.commercial_price_id=p_price_id;
    insert into public.billing_provider_products(
      provider_account_id,platform_id,commercial_price_id,external_plan_id,product_type,
      external_sku_ids,sku_count,purchase_months,expected_show_amount,expected_total_amount,
      currency,price_version,mapping_version,validation_status,published,enabled
    ) values (
      p_provider_account_id,p_platform_id,p_price_id,p_external_plan_id,p_product_type,
      coalesce(p_external_sku_ids,'{}'::text[]),cardinality(coalesce(p_external_sku_ids,'{}'::text[])),
      p_purchase_months,v_price.amount,v_price.amount,v_price.currency,v_price.version,
      v_version,p_validation_status,false,false
    ) returning * into v_mapping;
  else
    update public.billing_provider_products m set external_plan_id=p_external_plan_id,
      product_type=p_product_type,external_sku_ids=coalesce(p_external_sku_ids,'{}'::text[]),
      sku_count=cardinality(coalesce(p_external_sku_ids,'{}'::text[])),purchase_months=p_purchase_months,
      validation_status=p_validation_status
    where m.id=p_mapping_id and m.platform_id=p_platform_id
      and m.provider_account_id=p_provider_account_id and m.commercial_price_id=p_price_id
      and not m.published returning * into v_mapping;
    if not found then raise exception using errcode='P0002', message='resource_not_found'; end if;
  end if;
  return v_mapping;
end;
$$;

create or replace function private.admin_commercial_mapping_command(
  p_ctx private.admin_context,p_platform_id uuid,p_mapping_id uuid,p_action text,
  p_operation_id uuid,p_reason text
)
returns public.billing_provider_products
language plpgsql volatile security definer
set search_path = pg_catalog, private, public, extensions
as $$
declare
  v_mapping public.billing_provider_products;
  v_price public.platform_commercial_prices;
  v_provider_id uuid;
  v_price_id uuid;
  v_claim record;
  v_hash bytea;
  v_response jsonb;
begin
  perform private.billing_admin_assert(p_ctx);
  if p_action not in ('switch','disable') or p_operation_id is null
    or p_reason is null or length(p_reason) not between 1 and 1024 then
    raise exception using errcode='22023', message='invalid_input';
  end if;
  v_hash:=extensions.digest(convert_to(jsonb_build_object('mapping_id',p_mapping_id,'action',p_action,'reason',p_reason)::text,'utf8'),'sha256');
  select * into v_claim from private.admin_operation_claim(p_ctx,p_platform_id,'commerce_mapping_command',p_operation_id,v_hash);
  if v_claim.outcome='replayed' then
    select * into v_mapping from jsonb_populate_record(null::public.billing_provider_products,v_claim.response_body);
    return v_mapping;
  end if;
  select m.provider_account_id,m.commercial_price_id into v_provider_id,v_price_id
  from public.billing_provider_products m where m.id=p_mapping_id and m.platform_id=p_platform_id;
  if not found then raise exception using errcode='P0002', message='resource_not_found'; end if;
  perform 1 from public.billing_provider_accounts pa where pa.id=v_provider_id for update;
  select * into v_price from public.platform_commercial_prices p
  where p.platform_id=p_platform_id and p.id=v_price_id for update;
  select * into v_mapping from public.billing_provider_products m
  where m.id=p_mapping_id and m.platform_id=p_platform_id for update;
  if p_action='switch' then
    if v_mapping.published and v_mapping.enabled then
      raise exception using errcode='P0001', message='provider_mapping_already_current';
    end if;
    if v_mapping.validation_status<>'verified' or v_price.id is null
      or v_mapping.expected_show_amount<>v_price.amount or v_mapping.currency<>v_price.currency
      or v_mapping.price_version<>v_price.version then
      raise exception using errcode='P0001', message='provider_mapping_unavailable';
    end if;
    update public.billing_provider_products m set enabled=false
    where m.provider_account_id=v_provider_id and m.commercial_price_id=v_price_id
      and m.id<>p_mapping_id and m.published and m.enabled;
    update public.billing_provider_products set published=true,enabled=true
    where id=p_mapping_id returning * into v_mapping;
  else
    update public.billing_provider_products set enabled=false
    where id=p_mapping_id returning * into v_mapping;
  end if;
  v_response:=to_jsonb(v_mapping);
  perform private.admin_operation_finalize(p_ctx,p_platform_id,'commerce_mapping_command',p_operation_id,v_response);
  perform private.audit_append(p_operation_id,'admin',(p_ctx).admin_user_id,p_platform_id,null,
    'commerce.mapping_'||p_action,'billing_provider_product',p_mapping_id,null,null,
    jsonb_build_object('reason',p_reason,'price_id',v_price_id));
  return v_mapping;
end;
$$;

-- Plan metadata and lifecycle are separate boundaries. Lifecycle commands are durable/idempotent.
create or replace function private.admin_plan_save(
  p_ctx private.admin_context,p_platform_id uuid,p_plan_id uuid,p_code text,p_name text,
  p_description text,p_kind text,p_features jsonb
)
returns public.plans
language plpgsql volatile security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_plan public.plans;
  v_existing public.plans;
  v_in_use boolean;
  v_slot_text text;
  v_slot_limit integer;
begin
  perform private.billing_admin_assert(p_ctx);
  if p_platform_id is null or p_code is null or length(p_code) not between 1 and 64
    or p_name is null or length(p_name) not between 1 and 128
    or p_kind not in ('free','paid') or p_features is null or jsonb_typeof(p_features)<>'object'
    or pg_column_size(p_features)>16384 or (p_description is not null and length(p_description)>1024) then
    raise exception using errcode='22023', message='invalid_input';
  end if;
  if p_features ? 'config_slot_limit' then
    if jsonb_typeof(p_features->'config_slot_limit') <> 'number' then
      raise exception using errcode='22023', message='invalid_input';
    end if;
    v_slot_text := p_features->>'config_slot_limit';
    if v_slot_text !~ '^[0-9]+$' or length(v_slot_text) > 4 then
      raise exception using errcode='22023', message='invalid_input';
    end if;
    v_slot_limit := v_slot_text::integer;
    if v_slot_limit not between 0 and 1000 then
      raise exception using errcode='22023', message='invalid_input';
    end if;
  end if;
  perform 1 from public.platforms p where p.id=p_platform_id for update;
  if not found then raise exception using errcode='P0002', message='resource_not_found'; end if;
  if p_plan_id is null then
    insert into public.plans(platform_id,code,name,description,kind,features,status)
    values(p_platform_id,p_code,p_name,p_description,p_kind,p_features,'active') returning * into v_plan;
  else
    select * into v_existing from public.plans p
    where p.platform_id=p_platform_id and p.id=p_plan_id for update;
    if not found then raise exception using errcode='P0002', message='resource_not_found'; end if;
    if v_existing.status='archived' then raise exception using errcode='P0001', message='plan_archived'; end if;
    select exists(select 1 from public.platform_commercial_offers o where o.platform_id=p_platform_id and o.plan_id=p_plan_id)
      or exists(
        select 1 from public.subscription_grants g
        where g.platform_id=p_platform_id and g.plan_id=p_plan_id
          and (g.starts_at>clock_timestamp() or (g.starts_at<=clock_timestamp() and (g.ends_at is null or g.ends_at>clock_timestamp())))
          and not exists(select 1 from public.subscription_events e
            where e.platform_id=g.platform_id and e.platform_account_id=g.platform_account_id
              and e.grant_id=g.id and e.event_type='revoked')
      ) into v_in_use;
    if v_in_use and (v_existing.code<>p_code or v_existing.kind<>p_kind or v_existing.features<>p_features) then
      raise exception using errcode='P0001', message='plan_semantics_in_use';
    end if;
    update public.plans set code=p_code,name=p_name,description=p_description,kind=p_kind,features=p_features
    where id=p_plan_id returning * into v_plan;
  end if;
  perform private.audit_append((p_ctx).request_id,'admin',(p_ctx).admin_user_id,p_platform_id,null,
    'plan.saved','plan',v_plan.id,null,null,jsonb_build_object('code',v_plan.code,'kind',v_plan.kind));
  return v_plan;
end;
$$;

create or replace function private.admin_plan_command(
  p_ctx private.admin_context,p_platform_id uuid,p_plan_id uuid,p_action text,
  p_operation_id uuid,p_reason text
)
returns public.plans
language plpgsql volatile security definer
set search_path = pg_catalog, private, public, extensions
as $$
declare
  v_plan public.plans;
  v_default_plan_id uuid;
  v_claim record;
  v_hash bytea;
  v_response jsonb;
begin
  perform private.billing_admin_assert(p_ctx);
  if p_action not in ('archive','make_default','clear_default') or p_operation_id is null
    or p_reason is null or length(p_reason) not between 1 and 1024 then
    raise exception using errcode='22023', message='invalid_input';
  end if;
  v_hash:=extensions.digest(convert_to(jsonb_build_object('plan_id',p_plan_id,'action',p_action,'reason',p_reason)::text,'utf8'),'sha256');
  select * into v_claim from private.admin_operation_claim(p_ctx,p_platform_id,'plan_command',p_operation_id,v_hash);
  if v_claim.outcome='replayed' then
    select * into v_plan from jsonb_populate_record(null::public.plans,v_claim.response_body);
    return v_plan;
  end if;
  select p.default_plan_id into v_default_plan_id
  from public.platforms p where p.id=p_platform_id for update;
  if not found then raise exception using errcode='P0002', message='resource_not_found'; end if;
  select * into v_plan from public.plans p where p.platform_id=p_platform_id and p.id=p_plan_id for update;
  if not found then raise exception using errcode='P0002', message='resource_not_found'; end if;
  if p_action='archive' then
    if v_plan.status='archived' then raise exception using errcode='P0001', message='plan_archived'; end if;
    if exists(select 1 from public.platforms p where p.id=p_platform_id and p.default_plan_id=p_plan_id) then
      raise exception using errcode='P0001', message='default_plan_in_use';
    end if;
    if exists(select 1 from public.platform_commercial_offers o
      where o.platform_id=p_platform_id and o.plan_id=p_plan_id and o.status='active') then
      raise exception using errcode='P0001', message='active_offer_exists';
    end if;
    if exists(
      select 1 from public.subscription_grants g
      where g.platform_id=p_platform_id and g.plan_id=p_plan_id
        and (g.starts_at>clock_timestamp() or (g.starts_at<=clock_timestamp() and (g.ends_at is null or g.ends_at>clock_timestamp())))
        and not exists(select 1 from public.subscription_events e
          where e.platform_id=g.platform_id and e.platform_account_id=g.platform_account_id
            and e.grant_id=g.id and e.event_type='revoked')
    ) then
      raise exception using errcode='P0001', message='active_or_future_grant';
    end if;
    update public.plans set status='archived' where id=p_plan_id returning * into v_plan;
  elsif p_action='make_default' then
    if v_plan.status<>'active' or v_plan.kind<>'free' then
      raise exception using errcode='P0001', message='plan_unavailable';
    end if;
    if v_default_plan_id=p_plan_id then
      raise exception using errcode='P0001', message='plan_already_default';
    end if;
    update public.platforms set default_plan_id=p_plan_id where id=p_platform_id;
  else
    if v_default_plan_id is distinct from p_plan_id then
      raise exception using errcode='P0001', message='plan_is_not_default';
    end if;
    update public.platforms set default_plan_id=null where id=p_platform_id and default_plan_id=p_plan_id;
  end if;
  v_response:=to_jsonb(v_plan);
  perform private.admin_operation_finalize(p_ctx,p_platform_id,'plan_command',p_operation_id,v_response);
  perform private.audit_append(p_operation_id,'admin',(p_ctx).admin_user_id,p_platform_id,null,
    'plan.'||p_action,'plan',p_plan_id,null,null,jsonb_build_object('reason',p_reason));
  return v_plan;
end;
$$;

drop function if exists private.admin_plan_upsert(private.admin_context,uuid,uuid,text,text,text,text,jsonb,text,boolean,boolean);

-- Redemption has one create command: Offer-derived or explicit Plan+duration.
drop function if exists private.admin_batch_create_v2(private.admin_context,uuid,text,text,integer,timestamptz,timestamptz,uuid,text,jsonb);
drop function if exists private.admin_batch_create_v3(private.admin_context,uuid,uuid,text,integer,timestamptz,timestamptz,uuid,text,jsonb);
drop function if exists private.admin_batch_create(private.admin_context,uuid,uuid,text,integer,integer,text,timestamptz,timestamptz,uuid,text,jsonb);
drop function if exists private.admin_batch_list(private.admin_context,uuid,integer);

create function private.admin_redemption_campaign_create(
  p_ctx private.admin_context,p_platform_id uuid,p_offer_id uuid,p_plan_id uuid,p_name text,
  p_quantity integer,p_duration_value integer,p_duration_unit text,p_expires_at timestamptz,
  p_delivery_deadline timestamptz,p_creation_operation_id uuid,p_delivery_receipt_hmac text,
  p_codes jsonb
)
returns table(batch_id uuid,status text,quantity integer,creation_state text)
language plpgsql volatile security definer
set search_path = pg_catalog, private, public, extensions
as $$
declare
  v_batch public.redemption_code_batches;
  v_offer public.platform_commercial_offers;
  v_plan public.plans;
  v_code jsonb;
  v_resolved_plan_id uuid;
  v_resolved_duration_value integer;
  v_resolved_duration_unit text;
  v_hash bytea;
begin
  perform private.billing_admin_assert(p_ctx);
  if p_platform_id is null or ((p_offer_id is null)=(p_plan_id is null))
    or p_name is null or length(p_name) not between 1 and 256
    or p_quantity not between 1 and 1000 or p_expires_at is null or p_delivery_deadline is null
    or p_creation_operation_id is null or p_delivery_receipt_hmac is null
    or coalesce(jsonb_typeof(p_codes),'')<>'array' or jsonb_array_length(p_codes)<>p_quantity then
    raise exception using errcode='22023', message='invalid_input';
  end if;
  perform 1 from public.platforms p where p.id=p_platform_id for update;
  if not found then raise exception using errcode='P0002', message='resource_not_found'; end if;
  if p_offer_id is not null then
    select * into v_offer from public.platform_commercial_offers o
    where o.platform_id=p_platform_id and o.id=p_offer_id and o.status='active';
    if not found then raise exception using errcode='P0001', message='offer_unavailable'; end if;
    v_resolved_plan_id:=v_offer.plan_id;
    v_resolved_duration_value:=v_offer.duration_value;
    v_resolved_duration_unit:=v_offer.duration_unit;
  else
    if p_duration_value is null or p_duration_value<=0 or p_duration_unit not in ('day','month','year') then
      raise exception using errcode='22023', message='invalid_input';
    end if;
    v_resolved_plan_id:=p_plan_id;
    v_resolved_duration_value:=p_duration_value;
    v_resolved_duration_unit:=p_duration_unit;
  end if;
  select * into v_plan from public.plans p
  where p.platform_id=p_platform_id and p.id=v_resolved_plan_id and p.kind='paid' and p.status='active';
  if not found then raise exception using errcode='P0001', message='plan_unavailable'; end if;
  if p_expires_at<=clock_timestamp() or p_delivery_deadline<=clock_timestamp() then
    raise exception using errcode='22023', message='invalid_input';
  end if;
  v_hash:=extensions.digest(convert_to(jsonb_build_array(p_platform_id,v_resolved_plan_id,p_offer_id,p_name,
    p_quantity,v_resolved_duration_value,v_resolved_duration_unit,p_expires_at,p_delivery_deadline,
    lower(p_delivery_receipt_hmac),p_codes)::text,'utf8'),'sha256');
  select * into v_batch from public.redemption_code_batches b
  where b.platform_id=p_platform_id and b.creation_operation_id=p_creation_operation_id for update;
  if found then
    if v_batch.creation_request_hash<>v_hash then
      raise exception using errcode='23505', message='idempotency_conflict';
    end if;
    return query select v_batch.id,v_batch.status,v_batch.quantity,'replayed_existing'::text;
    return;
  end if;
  insert into public.redemption_code_batches(
    platform_id,plan_id,name,quantity,duration_value,duration_unit,expires_at,delivery_deadline,
    delivery_session_id,delivery_receipt_hmac,created_by,creation_operation_id,creation_request_hash,
    commercial_offer_id
  ) values (
    p_platform_id,v_resolved_plan_id,p_name,p_quantity,v_resolved_duration_value,v_resolved_duration_unit,
    p_expires_at,p_delivery_deadline,(p_ctx).session_id,lower(p_delivery_receipt_hmac),(p_ctx).admin_user_id,
    p_creation_operation_id,v_hash,p_offer_id
  ) returning * into v_batch;
  for v_code in select value from jsonb_array_elements(p_codes) loop
    if jsonb_typeof(v_code)<>'object' or length(coalesce(v_code->>'code_hmac',''))<>64
      or coalesce(v_code->>'code_hmac','')!~'^[0-9a-fA-F]{64}$'
      or nullif(v_code->>'hmac_key_version','') is null then
      raise exception using errcode='22023', message='invalid_input';
    end if;
    insert into public.redemption_codes(platform_id,batch_id,plan_id,code_hmac,hmac_key_version,code_prefix,code_suffix)
    values(p_platform_id,v_batch.id,v_resolved_plan_id,lower(v_code->>'code_hmac'),
      (v_code->>'hmac_key_version')::smallint,v_code->>'code_prefix',v_code->>'code_suffix');
  end loop;
  perform private.audit_append((p_ctx).request_id,'admin',(p_ctx).admin_user_id,p_platform_id,null,
    'redemption.campaign_created','redemption_code_batch',v_batch.id,null,null,
    jsonb_build_object('quantity',p_quantity,'plan_id',v_resolved_plan_id,'offer_id',p_offer_id,
      'duration_value',v_resolved_duration_value,'duration_unit',v_resolved_duration_unit));
  return query select v_batch.id,v_batch.status,v_batch.quantity,'created'::text;
end;
$$;

alter function private.admin_redemption_campaign_list_v2(private.admin_context,uuid,uuid,integer,text,text,uuid,uuid,timestamptz,timestamptz)
  rename to admin_redemption_campaign_list;
alter function private.admin_redemption_campaign_codes_v2(private.admin_context,uuid,uuid,uuid,integer)
  rename to admin_redemption_campaign_codes;

-- Runtime privileges: only canonical entrypoints remain executable.
alter function private.admin_commerce_policy_read(private.admin_context,uuid) owner to domain_owner;
alter function private.admin_commerce_policy_patch(private.admin_context,uuid,bigint,boolean,text,text) owner to domain_owner;
alter function private.commerce_offers_list(uuid,uuid) owner to domain_owner;
alter function private.subscription_checkout_create(private.account_context,uuid,uuid,text,smallint,bytea) owner to domain_owner;
alter function private.subscription_checkout_read(private.account_context,uuid) owner to domain_owner;
alter function private.subscription_checkout_read_by_idempotency(private.account_context,text) owner to domain_owner;
alter function private.admin_commercial_offer_list(private.admin_context,uuid) owner to domain_owner;
alter function private.admin_commercial_offer_upsert(private.admin_context,uuid,uuid,uuid,text,text,text,integer,text,boolean) owner to domain_owner;
alter function private.admin_commercial_offer_command(private.admin_context,uuid,uuid,text,uuid,text) owner to domain_owner;
alter function private.admin_commercial_price_create(private.admin_context,uuid,uuid,numeric,text) owner to domain_owner;
alter function private.admin_commercial_price_command(private.admin_context,uuid,uuid,text,uuid,text) owner to domain_owner;
alter function private.admin_commercial_mapping_upsert(private.admin_context,uuid,uuid,uuid,uuid,text,text,text[],integer,text) owner to domain_owner;
alter function private.admin_commercial_mapping_command(private.admin_context,uuid,uuid,text,uuid,text) owner to domain_owner;
alter function private.admin_plan_save(private.admin_context,uuid,uuid,text,text,text,text,jsonb) owner to domain_owner;
alter function private.admin_plan_command(private.admin_context,uuid,uuid,text,uuid,text) owner to domain_owner;
alter function private.admin_redemption_campaign_create(private.admin_context,uuid,uuid,uuid,text,integer,integer,text,timestamptz,timestamptz,uuid,text,jsonb) owner to domain_owner;

revoke all on function
  private.admin_commerce_policy_read(private.admin_context,uuid),
  private.admin_commerce_policy_patch(private.admin_context,uuid,bigint,boolean,text,text),
  private.commerce_offers_list(uuid,uuid),
  private.subscription_checkout_create(private.account_context,uuid,uuid,text,smallint,bytea),
  private.subscription_checkout_read(private.account_context,uuid),
  private.subscription_checkout_read_by_idempotency(private.account_context,text),
  private.admin_commercial_offer_list(private.admin_context,uuid),
  private.admin_commercial_offer_upsert(private.admin_context,uuid,uuid,uuid,text,text,text,integer,text,boolean),
  private.admin_commercial_offer_command(private.admin_context,uuid,uuid,text,uuid,text),
  private.admin_commercial_price_create(private.admin_context,uuid,uuid,numeric,text),
  private.admin_commercial_price_command(private.admin_context,uuid,uuid,text,uuid,text),
  private.admin_commercial_mapping_upsert(private.admin_context,uuid,uuid,uuid,uuid,text,text,text[],integer,text),
  private.admin_commercial_mapping_command(private.admin_context,uuid,uuid,text,uuid,text),
  private.admin_plan_save(private.admin_context,uuid,uuid,text,text,text,text,jsonb),
  private.admin_plan_command(private.admin_context,uuid,uuid,text,uuid,text),
  private.admin_redemption_campaign_create(private.admin_context,uuid,uuid,uuid,text,integer,integer,text,timestamptz,timestamptz,uuid,text,jsonb)
from public,anon,authenticated,account_executor,admin_executor,job_executor,recovery_executor,billing_ingress;

grant execute on function private.commerce_offers_list(uuid,uuid),
  private.subscription_checkout_create(private.account_context,uuid,uuid,text,smallint,bytea),
  private.subscription_checkout_read(private.account_context,uuid),
  private.subscription_checkout_read_by_idempotency(private.account_context,text)
to account_executor;

grant execute on function
  private.admin_commerce_policy_read(private.admin_context,uuid),
  private.admin_commerce_policy_patch(private.admin_context,uuid,bigint,boolean,text,text),
  private.admin_commercial_offer_list(private.admin_context,uuid),
  private.admin_commercial_offer_upsert(private.admin_context,uuid,uuid,uuid,text,text,text,integer,text,boolean),
  private.admin_commercial_offer_command(private.admin_context,uuid,uuid,text,uuid,text),
  private.admin_commercial_price_create(private.admin_context,uuid,uuid,numeric,text),
  private.admin_commercial_price_command(private.admin_context,uuid,uuid,text,uuid,text),
  private.admin_commercial_mapping_upsert(private.admin_context,uuid,uuid,uuid,uuid,text,text,text[],integer,text),
  private.admin_commercial_mapping_command(private.admin_context,uuid,uuid,text,uuid,text),
  private.admin_plan_save(private.admin_context,uuid,uuid,text,text,text,text,jsonb),
  private.admin_plan_command(private.admin_context,uuid,uuid,text,uuid,text),
  private.admin_redemption_campaign_create(private.admin_context,uuid,uuid,uuid,text,integer,integer,text,timestamptz,timestamptz,uuid,text,jsonb),
  private.admin_redemption_campaign_list(private.admin_context,uuid,uuid,integer,text,text,uuid,uuid,timestamptz,timestamptz),
  private.admin_redemption_campaign_codes(private.admin_context,uuid,uuid,uuid,integer)
to admin_executor;

-- Retire fixed-product read surfaces that no longer have a canonical business
-- responsibility. Provider Mapping is exposed only through the platform-scoped
-- Commerce read model after this migration.
drop function if exists private.admin_billing_provider_product_list(private.admin_context,uuid);
drop function if exists private.subscription_lifetime_purchase_status(private.account_context);

-- Plan is the entitlement authority. Offer attribution is optional metadata for
-- purchases and redemption campaigns; admin grants intentionally have no Offer.
create or replace function private.entitlement_current_read(
  p_ctx private.account_context
)
returns table(
  effective_status text,
  entitlement_kind text,
  plan_id uuid,
  code text,
  name text,
  description text,
  features jsonb,
  offer_code text,
  offer_name text,
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
  v_offer_code text;
  v_offer_name text;
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
      'suspended'::text, 'none'::text, null::uuid, null::text, null::text,
      null::text, '{}'::jsonb, null::text, null::text, null::timestamptz,
      null::timestamptz, v_sub.next_transition_at, v_now;
    return;
  end if;

  if v_sub.plan_id is not null then
    select * into v_plan
    from public.plans p
    where p.platform_id = (p_ctx).platform_id and p.id = v_sub.plan_id;

    select coalesce(ci.offer_code_snapshot, offer.code), offer.name
      into v_offer_code, v_offer_name
    from public.subscription_grants g
    left join public.billing_orders bo on bo.id = g.billing_order_id
    left join public.billing_checkout_intents ci on ci.id = bo.checkout_intent_id
    left join public.redemption_codes rc on rc.id = g.redemption_code_id
    left join public.redemption_code_batches batch
      on batch.platform_id = rc.platform_id and batch.id = rc.batch_id
    left join public.platform_commercial_offers offer
      on offer.platform_id = g.platform_id
     and offer.id = coalesce(ci.commercial_offer_id, batch.commercial_offer_id)
    where g.platform_id = (p_ctx).platform_id
      and g.platform_account_id = v_account_id
      and g.starts_at <= v_now
      and (g.ends_at is null or g.ends_at > v_now)
      and not exists (
        select 1 from public.subscription_events revoked
        where revoked.platform_id = g.platform_id
          and revoked.platform_account_id = g.platform_account_id
          and revoked.grant_id = g.id
          and revoked.event_type = 'revoked'
      )
    order by g.starts_at desc, g.created_at desc, g.id desc
    limit 1;

    return query select
      'active'::text,
      case when v_sub.current_period_end is null then 'perpetual' else 'term' end,
      v_plan.id, v_plan.code, v_plan.name, v_plan.description, v_plan.features,
      v_offer_code, v_offer_name, v_sub.started_at, v_sub.current_period_end,
      v_sub.next_transition_at, v_now;
    return;
  end if;

  select p.* into v_default
  from public.platforms platform
  join public.plans p
    on p.platform_id = platform.id and p.id = platform.default_plan_id
  where platform.id = (p_ctx).platform_id
    and p.status = 'active'
    and p.kind = 'free';
  if found then
    return query select
      'active'::text, 'free'::text, v_default.id, v_default.code,
      v_default.name, v_default.description, v_default.features,
      null::text, null::text, null::timestamptz, null::timestamptz,
      v_sub.next_transition_at, v_now;
  else
    return query select
      'none'::text, 'none'::text, null::uuid, null::text, null::text,
      null::text, '{}'::jsonb, null::text, null::text, null::timestamptz,
      null::timestamptz, v_sub.next_transition_at, v_now;
  end if;
end;
$$;

alter function private.entitlement_current_read(private.account_context) owner to domain_owner;
revoke all on function private.entitlement_current_read(private.account_context)
  from public, anon, authenticated, admin_executor, job_executor, recovery_executor,
    billing_ingress;
grant execute on function private.entitlement_current_read(private.account_context)
  to account_executor;

create or replace function private.config_slot_limit(p_ctx private.account_context)
returns integer
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_entitlement record;
  v_text text;
  v_limit integer;
begin
  select * into v_entitlement from private.entitlement_current_read(p_ctx);
  if not found or v_entitlement.effective_status <> 'active'
     or v_entitlement.features is null
     or jsonb_typeof(v_entitlement.features->'config_slot_limit') <> 'number' then
    return 0;
  end if;
  v_text := v_entitlement.features->>'config_slot_limit';
  if v_text !~ '^[0-9]+$' or length(v_text) > 4 then return 0; end if;
  v_limit := v_text::integer;
  if v_limit not between 0 and 1000 then return 0; end if;
  return v_limit;
end;
$$;

drop function if exists private.entitlement_read(private.account_context);

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
  select a.id, a.user_id, pr.display_name, pr.avatar_url, a.status, s.status,
    plan.id, plan.code, plan.name, winning.id, winning.source,
    winning.billing_order_id, redemption.batch_id, attribution.offer_id,
    attribution.offer_code, attribution.price_id, s.started_at,
    s.current_period_end, s.next_transition_at, s.updated_at
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
      or (s.updated_at, s.platform_account_id) < (p_cursor_updated_at, p_cursor_account_id))
  order by s.updated_at desc, s.platform_account_id desc
  limit p_limit;
end;
$$;


-- Phase 02 canonical Billing order timeline: preserve the evidence contract while
-- replacing the removed fixed-product detail with the immutable Offer snapshot.
create or replace function private.admin_billing_order_read_v2(
  p_ctx private.admin_context,
  p_order_id uuid
)
returns table (
  order_id uuid,
  provider text,
  provider_order_no text,
  provider_user_id text,
  external_plan_id text,
  external_sku_ids text[],
  product_type text,
  purchase_months integer,
  total_amount numeric,
  show_amount numeric,
  currency text,
  provider_facts jsonb,
  platform_id uuid,
  platform_account_id uuid,
  checkout_intent_id uuid,
  custom_order_id text,
  provider_status text,
  verification_status text,
  verification_reason text,
  entitlement_status text,
  linkage_status text,
  resolution_status text,
  resolution_reason text,
  settlement_id uuid,
  settlement_state text,
  settlement_kind text,
  decision_code text,
  grant_id uuid,
  admin_version bigint,
  open_job_count bigint,
  created_at timestamptz,
  updated_at timestamptz,
  timeline jsonb
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_order public.billing_orders;
  v_timeline jsonb;
begin
  perform private.billing_admin_assert(p_ctx);

  select o.* into v_order
  from public.billing_orders o
  where o.id = p_order_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;

  select coalesce(jsonb_agg(t.item order by t.event_at, t.source, t.entity_id), '[]'::jsonb)
    into v_timeline
  from (
    select
      v_order.created_at as event_at,
      'billing_order'::text as source,
      v_order.id::text as entity_id,
      jsonb_build_object(
        'source', 'billing_order',
        'event_type', 'order.created',
        'event_at', v_order.created_at,
        'provider_event_at', v_order.provider_created_at,
        'received_at', null::timestamptz,
        'entity_id', v_order.id,
        'status', v_order.provider_status,
        'state', v_order.entitlement_status,
        'code', null::text,
        'request_id', null::uuid,
        'job_id', null::uuid,
        'actor_type', null::text,
        'actor_id', null::uuid,
        'details', jsonb_build_object(
          'verification_status', v_order.verification_status,
          'linkage_status', v_order.linkage_status,
          'resolution_status', v_order.resolution_status,
          'provider_paid_at', v_order.provider_paid_at
        )
      ) as item

    union all

    select c.created_at, 'checkout', c.id::text,
      jsonb_build_object(
        'source', 'checkout',
        'event_type', 'checkout.created',
        'event_at', c.created_at,
        'provider_event_at', null::timestamptz,
        'received_at', null::timestamptz,
        'entity_id', c.id,
        'status', c.status,
        'state', null::text,
        'code', null::text,
        'request_id', null::uuid,
        'job_id', null::uuid,
        'actor_type', null::text,
        'actor_id', null::uuid,
        'details', jsonb_build_object(
          'offer_code', c.offer_code_snapshot,
          'price_amount', c.price_amount,
          'currency', c.currency,
          'paid_at', c.paid_at,
          'granted_at', c.granted_at
        )
      )
    from public.billing_checkout_intents c
    where c.id = v_order.checkout_intent_id

    union all

    select e.received_at, 'provider_webhook', e.id::text,
      jsonb_build_object(
        'source', 'provider_webhook',
        'event_type', 'webhook.received',
        'event_at', e.received_at,
        'provider_event_at', null::timestamptz,
        'received_at', e.received_at,
        'entity_id', e.id,
        'status', e.processing_status,
        'state', e.signature_status,
        'code', e.error_code,
        'request_id', null::uuid,
        'job_id', null::uuid,
        'actor_type', null::text,
        'actor_id', null::uuid,
        'details', jsonb_build_object(
          'provider_event_key', e.provider_event_key,
          'provider_order_no', e.provider_order_no,
          'signature_status', e.signature_status,
          'processed_at', e.processed_at
        )
      )
    from public.billing_webhook_events e
    where e.provider_account_id = v_order.provider_account_id
      and e.provider_order_no = v_order.provider_order_no

    union all

    select coalesce(j.updated_at, j.created_at), 'processing_job', j.id::text,
      jsonb_build_object(
        'source', 'processing_job',
        'event_type', 'job.' || j.job_kind,
        'event_at', coalesce(j.updated_at, j.created_at),
        'provider_event_at', null::timestamptz,
        'received_at', j.created_at,
        'entity_id', j.id,
        'status', j.state,
        'state', j.job_kind,
        'code', coalesce(j.error_code, j.last_error_code),
        'request_id', null::uuid,
        'job_id', j.id,
        'actor_type', 'job',
        'actor_id', null::uuid,
        'details', jsonb_build_object(
          'attempts', j.attempts,
          'retry_attempts', j.retry_attempts,
          'requeue_count', j.requeue_count,
          'fence', j.fence,
          'webhook_event_id', j.webhook_event_id,
          'dead_lettered_at', j.dead_lettered_at
        )
      )
    from public.billing_processing_jobs j
    where j.billing_order_id = v_order.id

    union all

    select o.observed_at, 'provider_observation', o.id::text,
      jsonb_build_object(
        'source', 'provider_observation',
        'event_type', 'provider.observed',
        'event_at', o.observed_at,
        'provider_event_at', null::timestamptz,
        'received_at', null::timestamptz,
        'entity_id', o.id,
        'status', o.provider_status,
        'state', o.source,
        'code', null::text,
        'request_id', null::uuid,
        'job_id', o.processing_job_id,
        'actor_type', 'job',
        'actor_id', null::uuid,
        'details', jsonb_build_object(
          'provider_contract_version', o.provider_contract_version
        )
      )
    from public.billing_order_observations o
    where o.billing_order_id = v_order.id

    union all

    select s.updated_at, 'settlement', s.id::text,
      jsonb_build_object(
        'source', 'settlement',
        'event_type', 'settlement.updated',
        'event_at', s.updated_at,
        'provider_event_at', null::timestamptz,
        'received_at', s.created_at,
        'entity_id', s.id,
        'status', s.state,
        'state', s.settlement_kind,
        'code', s.decision_code,
        'request_id', s.operation_id,
        'job_id', null::uuid,
        'actor_type', case when s.settlement_kind = 'manual' then 'admin' else 'system' end,
        'actor_id', null::uuid,
        'details', jsonb_build_object(
          'billing_order_id', s.billing_order_id,
          'checkout_intent_id', s.checkout_intent_id,
          'grant_id', s.grant_id,
          'decision_reason', s.decision_reason
        )
      )
    from public.billing_settlements s
    where s.billing_order_id = v_order.id

    union all

    select g.created_at, 'entitlement', g.id::text,
      jsonb_build_object(
        'source', 'entitlement',
        'event_type', 'grant.created',
        'event_at', g.created_at,
        'provider_event_at', null::timestamptz,
        'received_at', null::timestamptz,
        'entity_id', g.id,
        'status', g.source,
        'state', case when g.ends_at is null or g.ends_at > current_timestamp then 'active' else 'expired' end,
        'code', null::text,
        'request_id', g.operation_id,
        'job_id', null::uuid,
        'actor_type', case when g.source = 'admin' then 'admin' else 'system' end,
        'actor_id', g.created_by,
        'details', jsonb_build_object(
          'plan_id', g.plan_id,
          'billing_order_id', g.billing_order_id,
          'starts_at', g.starts_at,
          'ends_at', g.ends_at,
          'reason', g.reason
        )
      )
    from public.subscription_grants g
    where g.billing_order_id = v_order.id

    union all

    select e.created_at, 'entitlement', e.id::text,
      jsonb_build_object(
        'source', 'entitlement',
        'event_type', 'subscription.' || e.event_type,
        'event_at', e.created_at,
        'provider_event_at', null::timestamptz,
        'received_at', null::timestamptz,
        'entity_id', e.id,
        'status', e.event_type,
        'state', null::text,
        'code', null::text,
        'request_id', e.operation_id,
        'job_id', null::uuid,
        'actor_type', case when e.actor_user_id is null then 'system' else 'admin' end,
        'actor_id', e.actor_user_id,
        'details', jsonb_build_object(
          'sequence', e.sequence,
          'subscription_id', e.subscription_id,
          'grant_id', e.grant_id,
          'reason', e.reason
        )
      )
    from public.subscription_events e
    where e.platform_id = v_order.platform_id
      and e.platform_account_id = v_order.platform_account_id
      and e.grant_id in (
        select g.id from public.subscription_grants g
        where g.billing_order_id = v_order.id
      )

    union all

    select c.created_at, 'entitlement_correction', c.id::text,
      jsonb_build_object(
        'source', 'entitlement_correction',
        'event_type', 'grant.corrected',
        'event_at', c.created_at,
        'provider_event_at', null::timestamptz,
        'received_at', null::timestamptz,
        'entity_id', c.id,
        'status', 'applied',
        'state', null::text,
        'code', null::text,
        'request_id', c.operation_id,
        'job_id', null::uuid,
        'actor_type', 'admin',
        'actor_id', c.created_by,
        'details', jsonb_build_object(
          'original_grant_id', c.original_grant_id,
          'replacement_grant_id', c.replacement_grant_id,
          'expected_event_sequence', c.expected_event_sequence,
          'reason', c.reason
        )
      )
    from public.subscription_grant_corrections c
    where c.platform_id = v_order.platform_id
      and c.platform_account_id = v_order.platform_account_id
      and (
        c.original_grant_id in (
          select g.id from public.subscription_grants g
          where g.billing_order_id = v_order.id
        )
        or c.replacement_grant_id in (
          select g.id from public.subscription_grants g
          where g.billing_order_id = v_order.id
        )
      )

    union all

    select a.created_at, 'admin_audit', a.id::text,
      jsonb_build_object(
        'source', 'admin_audit',
        'event_type', a.event_type,
        'event_at', a.created_at,
        'provider_event_at', null::timestamptz,
        'received_at', null::timestamptz,
        'entity_id', a.id,
        'status', null::text,
        'state', a.actor_type,
        'code', null::text,
        'request_id', a.request_id,
        'job_id', null::uuid,
        'actor_type', a.actor_type,
        'actor_id', a.actor_user_id,
        'details', jsonb_strip_nulls(jsonb_build_object(
          'target_type', a.target_type,
          'target_id', a.target_id,
          'reason', nullif(a.metadata ->> 'reason', ''),
          'decision', nullif(a.metadata ->> 'decision', ''),
          'scope', nullif(a.metadata ->> 'scope', '')
        ))
      )
    from public.audit_logs a
    where a.target_type = 'billing_order'
      and a.target_id = v_order.id
  ) t;

  return query
    select o.id, pa.provider, o.provider_order_no, o.provider_user_id,
      o.external_plan_id, o.external_sku_ids, o.product_type,
      o.purchase_months, o.total_amount, o.show_amount, o.currency,
      o.provider_facts, o.platform_id, o.platform_account_id,
      o.checkout_intent_id, o.custom_order_id, o.provider_status,
      o.verification_status, o.verification_reason, o.entitlement_status,
      o.linkage_status, o.resolution_status, o.resolution_reason,
      s.id, s.state, s.settlement_kind, s.decision_code, s.grant_id,
      o.admin_version,
      (select count(*) from public.billing_processing_jobs j
       where j.billing_order_id = o.id
         and j.state in ('pending', 'processing', 'retryable', 'manual_review')),
      o.created_at, o.updated_at, v_timeline
    from public.billing_orders o
    join public.billing_provider_accounts pa on pa.id = o.provider_account_id
    left join public.billing_settlements s on s.billing_order_id = o.id
    where o.id = p_order_id;
end;
$$;

alter function private.admin_billing_order_read_v2(private.admin_context, uuid)
  owner to domain_owner;

revoke all on function private.admin_billing_order_read_v2(private.admin_context, uuid)
  from public, anon, authenticated, account_executor, job_executor,
    recovery_executor, billing_ingress;
grant execute on function private.admin_billing_order_read_v2(private.admin_context, uuid)
  to admin_executor;
