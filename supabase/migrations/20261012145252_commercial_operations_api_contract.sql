-- OPT-010 Phase 02: Offer-aware API/checkout compatibility and Admin catalog commands.
-- Legacy product_code paths remain supported; new commercial facts are additive.

alter table public.billing_provider_products
  alter column subscription_product_id drop not null,
  add constraint billing_provider_products_catalog_target_check check (
    subscription_product_id is not null or commercial_price_id is not null
  );

create unique index billing_provider_products_commercial_version_idx
  on public.billing_provider_products(provider_account_id, commercial_price_id, mapping_version)
  where commercial_price_id is not null;

create unique index billing_provider_products_commercial_current_idx
  on public.billing_provider_products(provider_account_id, commercial_price_id)
  where commercial_price_id is not null and published and enabled;

alter table public.billing_checkout_intents
  alter column subscription_product_id drop not null,
  alter column product_code drop not null,
  drop constraint billing_checkout_intents_product_code_check,
  drop constraint billing_checkout_intents_duration_unit_snapshot_check,
  add constraint billing_checkout_intents_product_code_check check (
    product_code is null or product_code in ('monthly', 'yearly', 'lifetime')
  ),
  add constraint billing_checkout_intents_duration_unit_snapshot_check check (
    duration_unit_snapshot in ('day', 'month', 'year')
  ),
  add constraint billing_checkout_catalog_source_check check (
    (subscription_product_id is null) = (product_code is null)
    and (product_code is not null or commercial_offer_id is not null)
  );

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
      or new.currency is distinct from old.currency then
      raise exception using errcode = 'P0001', message = 'commercial_price_immutable';
    end if;
    if new.effective_from is distinct from old.effective_from
      and not (old.status = 'draft' and new.status = 'active'
        and old.effective_from is null and new.effective_from is not null) then
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

alter function private.commercial_price_guard() owner to domain_owner;
revoke all on function private.commercial_price_guard()
  from public, anon, authenticated, account_executor, admin_executor, job_executor,
    recovery_executor, billing_ingress;

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

  select p.* into v_mapping
  from public.billing_provider_products p
  where p.provider_account_id = new.provider_account_id and p.id = new.provider_product_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;

  if new.commercial_offer_id is not null then
    select o.* into v_offer
    from public.platform_commercial_offers o
    where o.platform_id = new.platform_id and o.id = new.commercial_offer_id;
    select p.* into v_price
    from public.platform_commercial_prices p
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
      or v_price.version <> new.price_version then
      raise exception using errcode = 'P0001', message = 'checkout_commercial_snapshot_conflict';
    end if;
    if v_mapping.commercial_price_id is not null then
      if v_mapping.platform_id <> new.platform_id
        or v_mapping.commercial_price_id <> new.commercial_price_id
        or v_mapping.expected_show_amount <> v_price.amount
        or v_mapping.currency <> v_price.currency
        or v_mapping.price_version <> v_price.version then
        raise exception using errcode = 'P0001', message = 'checkout_commercial_snapshot_conflict';
      end if;
    elsif new.subscription_product_id is null
      or v_mapping.subscription_product_id is distinct from new.subscription_product_id then
      raise exception using errcode = 'P0001', message = 'checkout_commercial_snapshot_conflict';
    end if;
  end if;

  if new.subscription_product_id is not null then
    select p.* into v_product
    from public.subscription_products p where p.id = new.subscription_product_id;
    if not found
      or new.product_code is distinct from v_product.code
      or new.term_kind_snapshot is distinct from v_product.term_kind
      or new.duration_value_snapshot is distinct from v_product.duration_value
      or new.duration_unit_snapshot is distinct from v_product.duration_unit
      or (new.commercial_offer_id is null and new.price_amount is distinct from v_product.price_amount)
      or (new.commercial_offer_id is null and new.price_version is distinct from v_product.price_version)
      or new.currency is distinct from v_product.currency
      or (v_mapping.subscription_product_id is not null
        and v_mapping.subscription_product_id is distinct from new.subscription_product_id) then
      raise exception using errcode = 'P0001', message = 'checkout_snapshot_conflict';
    end if;
  elsif new.product_code is not null then
    raise exception using errcode = 'P0001', message = 'checkout_snapshot_conflict';
  end if;

  if new.mapping_version is distinct from v_mapping.mapping_version
    or new.price_amount is distinct from v_mapping.expected_show_amount
    or new.currency is distinct from v_mapping.currency then
    raise exception using errcode = 'P0001', message = 'checkout_snapshot_conflict';
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

create or replace function private.commerce_offers_list(
  p_platform_id uuid,
  p_platform_key_id uuid
)
returns table (
  offer_id uuid,
  offer_code text,
  offer_name text,
  offer_description text,
  plan_id uuid,
  plan_code text,
  plan_name text,
  duration_value integer,
  duration_unit text,
  recommended boolean,
  legacy_product_code text,
  price_id uuid,
  price_amount numeric,
  currency text,
  price_version integer,
  purchasable boolean,
  reason text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_platform_status text;
  v_purchases_paused boolean;
begin
  select p.status into v_platform_status
  from public.platforms p
  join private.platform_api_keys k on k.platform_id = p.id
  where p.id = p_platform_id and k.id = p_platform_key_id
    and k.status = 'active' and (k.expires_at is null or k.expires_at > now());
  if not found then
    raise exception using errcode = '28000', message = 'platform_key_invalid';
  end if;
  select coalesce(c.purchases_paused, false) into v_purchases_paused
  from public.platform_subscription_config c where c.platform_id = p_platform_id;

  return query
  select o.id, o.code, o.name, o.description, p.id, p.code, p.name,
    o.duration_value, o.duration_unit, o.recommended, o.legacy_product_code,
    price.id, price.amount, price.currency, price.version,
    (v_platform_status = 'active'
      and not coalesce(v_purchases_paused, false)
      and p.status = 'active'
      and price.id is not null
      and exists (
        select 1
        from public.billing_provider_accounts pa
        join public.billing_provider_products m on m.provider_account_id = pa.id
        where pa.status = 'active' and m.published and m.enabled
          and m.validation_status = 'verified'
          and (
            (m.platform_id = p_platform_id and m.commercial_price_id = price.id)
            or (o.legacy_product_code is not null
              and m.subscription_product_id = (
                select sp.id from public.subscription_products sp
                where sp.code = o.legacy_product_code and sp.status = 'active'
              )
              and m.price_version = price.version
              and m.expected_show_amount = price.amount
              and m.currency = price.currency)
          )
      )) as purchasable,
    case
      when v_platform_status <> 'active' then 'platform_disabled'
      when coalesce(v_purchases_paused, false) then 'purchases_paused'
      when p.status <> 'active' then 'plan_unavailable'
      when price.id is null then 'price_unavailable'
      when not exists (
        select 1
        from public.billing_provider_accounts pa
        join public.billing_provider_products m on m.provider_account_id = pa.id
        where pa.status = 'active' and m.published and m.enabled
          and m.validation_status = 'verified'
          and (
            (m.platform_id = p_platform_id and m.commercial_price_id = price.id)
            or (o.legacy_product_code is not null
              and m.subscription_product_id = (
                select sp.id from public.subscription_products sp
                where sp.code = o.legacy_product_code and sp.status = 'active'
              )
              and m.price_version = price.version
              and m.expected_show_amount = price.amount
              and m.currency = price.currency)
          )
      ) then 'provider_mapping_unavailable'
      else 'ready'
    end
  from public.platform_commercial_offers o
  join public.plans p on p.platform_id = o.platform_id and p.id = o.plan_id and p.kind = 'paid'
  left join public.platform_commercial_prices price
    on price.platform_id = o.platform_id and price.offer_id = o.id and price.status = 'active'
  where o.platform_id = p_platform_id and o.status = 'active'
  order by o.sort_order, o.id;
end;
$$;

create or replace function private.subscription_checkout_create_v2(
  p_ctx private.account_context,
  p_checkout_id uuid,
  p_product_code text,
  p_offer_id uuid,
  p_idempotency_key text,
  p_token_key_version smallint default null,
  p_token_digest bytea default null
)
returns table (
  checkout_id uuid,
  status text,
  product_code text,
  offer_id uuid,
  offer_code text,
  plan_id uuid,
  plan_name text,
  price_amount numeric,
  currency text,
  term_kind text,
  duration_value integer,
  duration_unit text,
  price_version integer,
  expires_at timestamptz,
  provider_account_id uuid,
  provider_product_id uuid,
  provider_display_name text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_authorization text;
  v_account_id uuid;
  v_platform public.platforms;
  v_account public.platform_accounts;
  v_config public.platform_subscription_config;
  v_product public.subscription_products;
  v_offer public.platform_commercial_offers;
  v_price public.platform_commercial_prices;
  v_plan public.plans;
  v_provider public.billing_provider_accounts;
  v_mapping public.billing_provider_products;
  v_existing public.billing_checkout_intents;
  v_checkout public.billing_checkout_intents;
  v_request_hash bytea;
  v_key_hash bytea;
begin
  if p_checkout_id is null
    or ((p_product_code is null) = (p_offer_id is null))
    or (p_product_code is not null and p_product_code not in ('monthly', 'yearly', 'lifetime'))
    or p_idempotency_key is null or length(p_idempotency_key) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select principal.authorization, principal.platform_account_id into v_authorization, v_account_id
  from private.account_principal(p_ctx) principal;
  if v_authorization <> 'allowed' or v_account_id is null then
    raise exception using errcode = '42501', message = coalesce(v_authorization, 'account_not_activated');
  end if;
  v_key_hash := extensions.digest(convert_to(p_idempotency_key, 'utf8'), 'sha256');
  v_request_hash := extensions.digest(
    convert_to(jsonb_build_object('product_code', p_product_code, 'offer_id', p_offer_id)::text, 'utf8'),
    'sha256'
  );

  select p.* into v_platform from public.platforms p where p.id = (p_ctx).platform_id for update;
  if not found or v_platform.status <> 'active' then
    raise exception using errcode = '42501', message = 'platform_disabled';
  end if;
  select a.* into v_account from public.platform_accounts a
  where a.platform_id = (p_ctx).platform_id and a.id = v_account_id for update;
  if not found or v_account.status <> 'active' then
    raise exception using errcode = '42501', message = 'account_suspended';
  end if;
  select c.* into v_config from public.platform_subscription_config c
  where c.platform_id = (p_ctx).platform_id;
  if coalesce(v_config.purchases_paused, false) then
    raise exception using errcode = 'P0001', message = 'purchases_paused';
  end if;

  select c.* into v_existing from public.billing_checkout_intents c
  where c.platform_id = (p_ctx).platform_id and c.platform_account_id = v_account_id
    and c.idempotency_key_hash = v_key_hash for update;
  if found then
    if v_existing.request_hash <> v_request_hash then
      raise exception using errcode = '23505', message = 'idempotency_conflict';
    end if;
    return query
      select v_existing.id, v_existing.status, v_existing.product_code,
        v_existing.commercial_offer_id, v_existing.offer_code_snapshot,
        v_existing.entitlement_plan_id, p.name, v_existing.price_amount,
        v_existing.currency, v_existing.term_kind_snapshot,
        v_existing.duration_value_snapshot, v_existing.duration_unit_snapshot,
        v_existing.price_version, v_existing.expires_at,
        v_existing.provider_account_id, v_existing.provider_product_id,
        pa.name
      from public.plans p
      left join public.billing_provider_accounts pa on pa.id = v_existing.provider_account_id
      where p.platform_id = v_existing.platform_id and p.id = v_existing.entitlement_plan_id;
    return;
  end if;

  if p_offer_id is not null then
    select o.* into v_offer from public.platform_commercial_offers o
    where o.platform_id = (p_ctx).platform_id and o.id = p_offer_id and o.status = 'active';
    if not found then raise exception using errcode = 'P0001', message = 'offer_unavailable'; end if;
  else
    select o.* into v_offer from public.platform_commercial_offers o
    where o.platform_id = (p_ctx).platform_id and o.legacy_product_code = p_product_code
      and o.status = 'active';
    if not found then
      -- Pre-migration compatibility fallback remains available for exceptional old platforms.
      return query select l.checkout_id, l.status, l.product_code, null::uuid, null::text,
        cfg.paid_plan_id, plan.name, l.price_amount, l.currency, l.term_kind,
        l.duration_value, l.duration_unit, product.price_version, l.expires_at,
        l.provider_account_id, l.provider_product_id, l.provider_display_name
      from private.subscription_checkout_create(
        p_ctx, p_checkout_id, p_product_code, p_idempotency_key,
        p_token_key_version, p_token_digest
      ) l
      join public.subscription_products product on product.code = l.product_code
      join public.platform_subscription_config cfg on cfg.platform_id = (p_ctx).platform_id
      join public.plans plan on plan.platform_id = cfg.platform_id and plan.id = cfg.paid_plan_id;
      return;
    end if;
  end if;

  select price.* into v_price from public.platform_commercial_prices price
  where price.platform_id = v_offer.platform_id and price.offer_id = v_offer.id
    and price.status = 'active';
  if not found then raise exception using errcode = 'P0001', message = 'price_unavailable'; end if;
  select p.* into v_plan from public.plans p
  where p.platform_id = v_offer.platform_id and p.id = v_offer.plan_id and p.kind = 'paid';
  if not found or v_plan.status <> 'active' then
    raise exception using errcode = 'P0001', message = 'plan_unavailable';
  end if;

  if v_offer.legacy_product_code is not null then
    select product.* into v_product from public.subscription_products product
    where product.code = v_offer.legacy_product_code and product.status = 'active';
  end if;

  select m.* into v_mapping
  from public.billing_provider_products m
  join public.billing_provider_accounts pa on pa.id = m.provider_account_id
  where pa.status = 'active' and m.published and m.enabled
    and m.validation_status = 'verified'
    and m.expected_show_amount = v_price.amount
    and m.currency = v_price.currency
    and m.price_version = v_price.version
    and (
      (m.platform_id = v_offer.platform_id and m.commercial_price_id = v_price.id)
      or (v_product.id is not null and m.subscription_product_id = v_product.id)
    )
  order by (m.commercial_price_id is not null) desc, m.mapping_version desc, m.id
  limit 1;
  if not found then raise exception using errcode = 'P0001', message = 'provider_mapping_unavailable'; end if;
  select pa.* into v_provider from public.billing_provider_accounts pa
  where pa.id = v_mapping.provider_account_id and pa.status = 'active';
  if not found then raise exception using errcode = 'P0001', message = 'provider_mapping_unavailable'; end if;
  if p_token_key_version is null or p_token_digest is null or octet_length(p_token_digest) <> 32 then
    raise exception using errcode = 'P0001', message = 'checkout_key_unavailable';
  end if;

  insert into public.billing_checkout_intents (
    id, platform_id, platform_account_id, subscription_product_id, entitlement_plan_id,
    provider_account_id, provider_product_id, product_code, commercial_offer_id,
    commercial_price_id, offer_code_snapshot, term_kind_snapshot,
    duration_value_snapshot, duration_unit_snapshot, price_amount, currency,
    price_version, mapping_version, token_key_version, token_digest,
    idempotency_key_hash, request_hash, expires_at
  ) values (
    p_checkout_id, (p_ctx).platform_id, v_account_id, v_product.id, v_plan.id,
    v_provider.id, v_mapping.id, v_offer.legacy_product_code, v_offer.id,
    v_price.id, v_offer.code, v_offer.term_kind, v_offer.duration_value,
    v_offer.duration_unit, v_price.amount, v_price.currency, v_price.version,
    v_mapping.mapping_version, p_token_key_version, p_token_digest, v_key_hash,
    v_request_hash, clock_timestamp() + interval '30 minutes'
  ) returning * into v_checkout;
  perform private.audit_append((p_ctx).request_id, 'user', (p_ctx).user_id,
    (p_ctx).platform_id, v_account_id, 'billing.checkout_created',
    'billing_checkout_intent', v_checkout.id, null, null,
    jsonb_build_object('product_code', v_checkout.product_code, 'offer_id', v_offer.id,
      'offer_code', v_offer.code, 'price_id', v_price.id, 'price_version', v_price.version,
      'mapping_version', v_mapping.mapping_version));
  return query select v_checkout.id, v_checkout.status, v_checkout.product_code,
    v_offer.id, v_offer.code, v_plan.id, v_plan.name, v_checkout.price_amount,
    v_checkout.currency, v_checkout.term_kind_snapshot,
    v_checkout.duration_value_snapshot, v_checkout.duration_unit_snapshot,
    v_checkout.price_version, v_checkout.expires_at, v_provider.id, v_mapping.id,
    v_provider.name;
end;
$$;

create or replace function private.subscription_checkout_read_v3(
  p_ctx private.account_context,
  p_checkout_id uuid
)
returns table (
  checkout_id uuid, status text, product_code text, offer_id uuid, offer_code text,
  plan_id uuid, plan_name text, price_amount numeric, currency text, term_kind text,
  duration_value integer, duration_unit text, price_version integer,
  expires_at timestamptz, provider_display_name text, paid_at timestamptz,
  granted_at timestamptz, provider_status text, verification_status text,
  entitlement_status text, job_state text, status_reason text, next_action text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
begin
  return query
  select r.checkout_id, r.status, r.product_code, c.commercial_offer_id,
    c.offer_code_snapshot, c.entitlement_plan_id, plan.name, r.price_amount,
    r.currency, r.term_kind, r.duration_value, r.duration_unit, c.price_version,
    r.expires_at, r.provider_display_name, r.paid_at, r.granted_at,
    r.provider_status, r.verification_status, r.entitlement_status, r.job_state,
    r.status_reason, r.next_action
  from private.subscription_checkout_read_v2(p_ctx, p_checkout_id) r
  join public.billing_checkout_intents c on c.id = r.checkout_id
  join public.plans plan on plan.platform_id = c.platform_id and plan.id = c.entitlement_plan_id;
end;
$$;

create or replace function private.subscription_checkout_read_by_idempotency_v2(
  p_ctx private.account_context,
  p_idempotency_key text
)
returns table (
  checkout_id uuid, status text, product_code text, offer_id uuid, offer_code text,
  plan_id uuid, plan_name text, price_amount numeric, currency text, term_kind text,
  duration_value integer, duration_unit text, price_version integer,
  expires_at timestamptz, provider_display_name text, paid_at timestamptz,
  granted_at timestamptz, provider_status text, verification_status text,
  entitlement_status text, job_state text, status_reason text, next_action text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_account_id uuid;
  v_checkout_id uuid;
  v_key_hash bytea;
begin
  if p_idempotency_key is null or length(p_idempotency_key) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select principal.platform_account_id into v_account_id
  from private.account_principal(p_ctx) principal where principal.authorization = 'allowed';
  if v_account_id is null then raise exception using errcode = '42501', message = 'account_not_activated'; end if;
  v_key_hash := extensions.digest(convert_to(p_idempotency_key, 'utf8'), 'sha256');
  select c.id into v_checkout_id from public.billing_checkout_intents c
  where c.platform_id = (p_ctx).platform_id and c.platform_account_id = v_account_id
    and c.idempotency_key_hash = v_key_hash;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  return query select * from private.subscription_checkout_read_v3(p_ctx, v_checkout_id);
end;
$$;

-- Admin catalog read model used by the Plan/Offer workspace.
create or replace function private.admin_commercial_offer_list(
  p_ctx private.admin_context,
  p_platform_id uuid
)
returns table (
  offer_id uuid, plan_id uuid, plan_code text, plan_name text, offer_code text,
  offer_name text, description text, duration_value integer, duration_unit text,
  status text, recommended boolean, legacy_product_code text, row_version bigint,
  price_id uuid, price_version integer, price_amount numeric, currency text,
  price_status text, provider_mapping_id uuid, mapping_status text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
begin
  perform private.billing_admin_assert(p_ctx);
  if not exists (select 1 from public.platforms p where p.id = p_platform_id) then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  return query
  select o.id, o.plan_id, plan.code, plan.name, o.code, o.name, o.description,
    o.duration_value, o.duration_unit, o.status, o.recommended,
    o.legacy_product_code, o.row_version, price.id, price.version, price.amount,
    price.currency, price.status, mapping.id,
    case
      when mapping.id is null then 'missing'
      when mapping.published and mapping.enabled and mapping.validation_status = 'verified' then 'ready'
      when mapping.validation_status = 'rejected' then 'rejected'
      else 'draft'
    end
  from public.platform_commercial_offers o
  join public.plans plan on plan.platform_id = o.platform_id and plan.id = o.plan_id
  left join lateral (
    select p.* from public.platform_commercial_prices p
    where p.platform_id = o.platform_id and p.offer_id = o.id
    order by (p.status = 'active') desc, p.version desc limit 1
  ) price on true
  left join lateral (
    select m.* from public.billing_provider_products m
    where m.platform_id = o.platform_id and m.commercial_price_id = price.id
    order by (m.published and m.enabled) desc, m.mapping_version desc limit 1
  ) mapping on true
  where o.platform_id = p_platform_id
  order by o.sort_order, o.id;
end;
$$;

create or replace function private.admin_commercial_offer_upsert(
  p_ctx private.admin_context, p_platform_id uuid, p_offer_id uuid,
  p_plan_id uuid, p_code text, p_name text, p_description text,
  p_duration_value integer, p_duration_unit text, p_recommended boolean
)
returns public.platform_commercial_offers
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare v_offer public.platform_commercial_offers;
begin
  perform private.billing_admin_assert(p_ctx);
  if p_platform_id is null or p_plan_id is null or p_code is null or p_name is null
    or p_duration_value is null or p_duration_value <= 0
    or p_duration_unit not in ('day','month','year') then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if not exists (select 1 from public.plans p where p.platform_id=p_platform_id and p.id=p_plan_id and p.kind='paid') then
    raise exception using errcode = 'P0001', message = 'plan_unavailable';
  end if;
  if p_offer_id is null then
    insert into public.platform_commercial_offers(platform_id,plan_id,code,name,description,
      duration_value,duration_unit,status,recommended)
    values(p_platform_id,p_plan_id,p_code,p_name,p_description,p_duration_value,p_duration_unit,'draft',coalesce(p_recommended,false))
    returning * into v_offer;
  else
    update public.platform_commercial_offers o set plan_id=p_plan_id, code=p_code,
      name=p_name, description=p_description, duration_value=p_duration_value,
      duration_unit=p_duration_unit, recommended=coalesce(p_recommended,false)
    where o.platform_id=p_platform_id and o.id=p_offer_id and o.status <> 'archived'
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
  p_ctx private.admin_context, p_platform_id uuid, p_offer_id uuid,
  p_action text, p_operation_id uuid, p_reason text
)
returns public.platform_commercial_offers
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare v_offer public.platform_commercial_offers;
begin
  perform private.billing_admin_assert(p_ctx);
  if p_action not in ('activate','archive') or p_operation_id is null
    or p_reason is null or length(p_reason) not between 1 and 1024 then
    raise exception using errcode='22023', message='invalid_input';
  end if;
  select * into v_offer from public.platform_commercial_offers o
  where o.platform_id=p_platform_id and o.id=p_offer_id for update;
  if not found then raise exception using errcode='P0002', message='resource_not_found'; end if;
  if p_action='activate' then
    if v_offer.status='archived' then raise exception using errcode='P0001', message='commercial_offer_archived'; end if;
    if not exists(select 1 from public.platform_commercial_prices p where p.platform_id=p_platform_id and p.offer_id=p_offer_id and p.status='active') then
      raise exception using errcode='P0001', message='price_unavailable';
    end if;
    update public.platform_commercial_offers set status='active' where id=p_offer_id returning * into v_offer;
  else
    update public.platform_commercial_offers set status='archived' where id=p_offer_id returning * into v_offer;
  end if;
  perform private.audit_append(p_operation_id,'admin',(p_ctx).admin_user_id,p_platform_id,null,
    'commerce.offer_'||p_action,'commercial_offer',p_offer_id,null,null,
    jsonb_build_object('reason',p_reason,'status',v_offer.status));
  return v_offer;
end;
$$;

create or replace function private.admin_commercial_price_create(
  p_ctx private.admin_context, p_platform_id uuid, p_offer_id uuid,
  p_amount numeric, p_currency text default 'CNY'
)
returns public.platform_commercial_prices
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare v_price public.platform_commercial_prices; v_version integer;
begin
  perform private.billing_admin_assert(p_ctx);
  if p_amount is null or p_amount <= 0 or p_currency <> 'CNY' then
    raise exception using errcode='22023', message='invalid_input';
  end if;
  if not exists(select 1 from public.platform_commercial_offers o where o.platform_id=p_platform_id and o.id=p_offer_id and o.status<>'archived') then
    raise exception using errcode='P0002', message='resource_not_found';
  end if;
  select coalesce(max(p.version),0)+1 into v_version from public.platform_commercial_prices p where p.offer_id=p_offer_id;
  insert into public.platform_commercial_prices(platform_id,offer_id,version,amount,currency,status)
  values(p_platform_id,p_offer_id,v_version,p_amount,p_currency,'draft') returning * into v_price;
  perform private.audit_append((p_ctx).request_id,'admin',(p_ctx).admin_user_id,p_platform_id,null,
    'commerce.price_created','commercial_price',v_price.id,null,null,
    jsonb_build_object('offer_id',p_offer_id,'version',v_version,'amount',p_amount,'currency',p_currency));
  return v_price;
end;
$$;

create or replace function private.admin_commercial_price_publish(
  p_ctx private.admin_context, p_platform_id uuid, p_price_id uuid,
  p_operation_id uuid, p_reason text
)
returns public.platform_commercial_prices
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare v_price public.platform_commercial_prices;
begin
  perform private.billing_admin_assert(p_ctx);
  if p_operation_id is null or p_reason is null or length(p_reason) not between 1 and 1024 then
    raise exception using errcode='22023', message='invalid_input';
  end if;
  select * into v_price from public.platform_commercial_prices p
  where p.platform_id=p_platform_id and p.id=p_price_id for update;
  if not found then raise exception using errcode='P0002', message='resource_not_found'; end if;
  if v_price.status='retired' then raise exception using errcode='P0001', message='commercial_price_retired'; end if;
  update public.platform_commercial_prices p set status='retired'
  where p.offer_id=v_price.offer_id and p.status='active' and p.id<>p_price_id;
  update public.platform_commercial_prices set status='active', effective_from=coalesce(effective_from,clock_timestamp())
  where id=p_price_id returning * into v_price;
  perform private.audit_append(p_operation_id,'admin',(p_ctx).admin_user_id,p_platform_id,null,
    'commerce.price_published','commercial_price',p_price_id,null,null,
    jsonb_build_object('reason',p_reason,'offer_id',v_price.offer_id,'version',v_price.version));
  return v_price;
end;
$$;

create or replace function private.admin_commercial_mapping_list(
  p_ctx private.admin_context, p_platform_id uuid, p_price_id uuid default null
)
returns table (
  mapping_id uuid, provider_account_id uuid, provider_name text, commercial_price_id uuid,
  offer_id uuid, price_version integer, price_amount numeric, external_plan_id text,
  product_type text, external_sku_ids text[], mapping_version integer,
  validation_status text, published boolean, enabled boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
begin
  perform private.billing_admin_assert(p_ctx);
  return query
  select m.id,m.provider_account_id,pa.name,m.commercial_price_id,price.offer_id,
    price.version,price.amount,m.external_plan_id,m.product_type,m.external_sku_ids,
    m.mapping_version,m.validation_status,m.published,m.enabled
  from public.billing_provider_products m
  join public.billing_provider_accounts pa on pa.id=m.provider_account_id
  join public.platform_commercial_prices price on price.platform_id=m.platform_id and price.id=m.commercial_price_id
  where m.platform_id=p_platform_id and (p_price_id is null or m.commercial_price_id=p_price_id)
  order by price.offer_id,price.version desc,m.mapping_version desc;
end;
$$;

create or replace function private.admin_commercial_mapping_upsert(
  p_ctx private.admin_context, p_platform_id uuid, p_mapping_id uuid,
  p_provider_account_id uuid, p_price_id uuid, p_external_plan_id text,
  p_product_type text, p_external_sku_ids text[], p_purchase_months integer,
  p_validation_status text
)
returns public.billing_provider_products
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare v_price public.platform_commercial_prices; v_mapping public.billing_provider_products; v_version integer;
begin
  perform private.billing_admin_assert(p_ctx);
  select * into v_price from public.platform_commercial_prices p where p.platform_id=p_platform_id and p.id=p_price_id;
  if not found then raise exception using errcode='P0002', message='resource_not_found'; end if;
  if p_validation_status not in ('unverified','verified','rejected') then raise exception using errcode='22023', message='invalid_input'; end if;
  if p_mapping_id is null then
    select coalesce(max(m.mapping_version),0)+1 into v_version from public.billing_provider_products m
    where m.provider_account_id=p_provider_account_id and m.commercial_price_id=p_price_id;
    insert into public.billing_provider_products(provider_account_id,subscription_product_id,platform_id,commercial_price_id,
      external_plan_id,product_type,external_sku_ids,sku_count,purchase_months,expected_show_amount,
      expected_total_amount,currency,price_version,mapping_version,validation_status,published,enabled)
    values(p_provider_account_id,null,p_platform_id,p_price_id,p_external_plan_id,p_product_type,
      coalesce(p_external_sku_ids,'{}'::text[]),cardinality(coalesce(p_external_sku_ids,'{}'::text[])),p_purchase_months,
      v_price.amount,v_price.amount,v_price.currency,v_price.version,v_version,p_validation_status,false,false)
    returning * into v_mapping;
  else
    update public.billing_provider_products m set external_plan_id=p_external_plan_id,
      product_type=p_product_type,external_sku_ids=coalesce(p_external_sku_ids,'{}'::text[]),
      sku_count=cardinality(coalesce(p_external_sku_ids,'{}'::text[])),purchase_months=p_purchase_months,
      validation_status=p_validation_status
    where m.id=p_mapping_id and m.platform_id=p_platform_id and m.commercial_price_id=p_price_id and not m.published
    returning * into v_mapping;
    if not found then raise exception using errcode='P0002', message='resource_not_found'; end if;
  end if;
  return v_mapping;
end;
$$;

create or replace function private.admin_commercial_mapping_command(
  p_ctx private.admin_context, p_platform_id uuid, p_mapping_id uuid,
  p_action text, p_operation_id uuid, p_reason text
)
returns public.billing_provider_products
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare v_mapping public.billing_provider_products; v_price public.platform_commercial_prices;
begin
  perform private.billing_admin_assert(p_ctx);
  if p_action not in ('publish','disable') or p_operation_id is null or p_reason is null or length(p_reason) not between 1 and 1024 then
    raise exception using errcode='22023', message='invalid_input';
  end if;
  select * into v_mapping from public.billing_provider_products m where m.id=p_mapping_id and m.platform_id=p_platform_id for update;
  if not found then raise exception using errcode='P0002', message='resource_not_found'; end if;
  if p_action='publish' then
    select * into v_price from public.platform_commercial_prices p where p.platform_id=p_platform_id and p.id=v_mapping.commercial_price_id;
    if v_mapping.validation_status<>'verified' or v_price.id is null
      or v_mapping.expected_show_amount<>v_price.amount or v_mapping.currency<>v_price.currency
      or v_mapping.price_version<>v_price.version then
      raise exception using errcode='P0001', message='provider_mapping_unavailable';
    end if;
    update public.billing_provider_products set published=true,enabled=true where id=p_mapping_id returning * into v_mapping;
  else
    update public.billing_provider_products set enabled=false where id=p_mapping_id returning * into v_mapping;
  end if;
  perform private.audit_append(p_operation_id,'admin',(p_ctx).admin_user_id,p_platform_id,null,
    'commerce.mapping_'||p_action,'billing_provider_product',p_mapping_id,null,null,jsonb_build_object('reason',p_reason));
  return v_mapping;
end;
$$;

create or replace function private.admin_batch_create_v3(
  p_ctx private.admin_context, p_platform_id uuid, p_offer_id uuid, p_name text,
  p_quantity integer, p_expires_at timestamptz, p_delivery_deadline timestamptz,
  p_creation_operation_id uuid, p_delivery_receipt_hmac text, p_codes jsonb
)
returns table(batch_id uuid,status text,quantity integer,creation_state text)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare v_offer public.platform_commercial_offers; v_existing uuid; v_result record;
begin
  select b.id into v_existing from public.redemption_code_batches b
  where b.platform_id=p_platform_id and b.creation_operation_id=p_creation_operation_id;
  select * into v_offer from public.platform_commercial_offers o
  where o.platform_id=p_platform_id and o.id=p_offer_id and o.status='active';
  if not found then raise exception using errcode='P0001', message='offer_unavailable'; end if;
  select * into v_result from private.admin_batch_create(p_ctx,p_platform_id,v_offer.plan_id,p_name,p_quantity,
    v_offer.duration_value,v_offer.duration_unit,p_expires_at,p_delivery_deadline,p_creation_operation_id,
    p_delivery_receipt_hmac,p_codes);
  update public.redemption_code_batches set commercial_offer_id=p_offer_id
  where platform_id=p_platform_id and id=v_result.batch_id and commercial_offer_id is null;
  return query select v_result.batch_id,v_result.status,v_result.quantity,
    case when v_existing is null then 'created' else 'replayed_existing' end;
end;
$$;

alter function private.billing_checkout_snapshot_guard() owner to domain_owner;
alter function private.commerce_offers_list(uuid,uuid) owner to domain_owner;
alter function private.subscription_checkout_create_v2(private.account_context,uuid,text,uuid,text,smallint,bytea) owner to domain_owner;
alter function private.subscription_checkout_read_v3(private.account_context,uuid) owner to domain_owner;
alter function private.subscription_checkout_read_by_idempotency_v2(private.account_context,text) owner to domain_owner;
alter function private.admin_commercial_offer_list(private.admin_context,uuid) owner to domain_owner;
alter function private.admin_commercial_offer_upsert(private.admin_context,uuid,uuid,uuid,text,text,text,integer,text,boolean) owner to domain_owner;
alter function private.admin_commercial_offer_command(private.admin_context,uuid,uuid,text,uuid,text) owner to domain_owner;
alter function private.admin_commercial_price_create(private.admin_context,uuid,uuid,numeric,text) owner to domain_owner;
alter function private.admin_commercial_price_publish(private.admin_context,uuid,uuid,uuid,text) owner to domain_owner;
alter function private.admin_commercial_mapping_list(private.admin_context,uuid,uuid) owner to domain_owner;
alter function private.admin_commercial_mapping_upsert(private.admin_context,uuid,uuid,uuid,uuid,text,text,text[],integer,text) owner to domain_owner;
alter function private.admin_commercial_mapping_command(private.admin_context,uuid,uuid,text,uuid,text) owner to domain_owner;
alter function private.admin_batch_create_v3(private.admin_context,uuid,uuid,text,integer,timestamptz,timestamptz,uuid,text,jsonb) owner to domain_owner;

revoke all on function private.commerce_offers_list(uuid,uuid),
  private.subscription_checkout_create_v2(private.account_context,uuid,text,uuid,text,smallint,bytea),
  private.subscription_checkout_read_v3(private.account_context,uuid),
  private.subscription_checkout_read_by_idempotency_v2(private.account_context,text)
from public,anon,authenticated,admin_executor,job_executor,recovery_executor,billing_ingress;
grant execute on function private.commerce_offers_list(uuid,uuid),
  private.subscription_checkout_create_v2(private.account_context,uuid,text,uuid,text,smallint,bytea),
  private.subscription_checkout_read_v3(private.account_context,uuid),
  private.subscription_checkout_read_by_idempotency_v2(private.account_context,text)
to account_executor;

revoke all on function private.admin_commercial_offer_list(private.admin_context,uuid),
  private.admin_commercial_offer_upsert(private.admin_context,uuid,uuid,uuid,text,text,text,integer,text,boolean),
  private.admin_commercial_offer_command(private.admin_context,uuid,uuid,text,uuid,text),
  private.admin_commercial_price_create(private.admin_context,uuid,uuid,numeric,text),
  private.admin_commercial_price_publish(private.admin_context,uuid,uuid,uuid,text),
  private.admin_commercial_mapping_list(private.admin_context,uuid,uuid),
  private.admin_commercial_mapping_upsert(private.admin_context,uuid,uuid,uuid,uuid,text,text,text[],integer,text),
  private.admin_commercial_mapping_command(private.admin_context,uuid,uuid,text,uuid,text),
  private.admin_batch_create_v3(private.admin_context,uuid,uuid,text,integer,timestamptz,timestamptz,uuid,text,jsonb)
from public,anon,authenticated,account_executor,job_executor,recovery_executor,billing_ingress;
grant execute on function private.admin_commercial_offer_list(private.admin_context,uuid),
  private.admin_commercial_offer_upsert(private.admin_context,uuid,uuid,uuid,text,text,text,integer,text,boolean),
  private.admin_commercial_offer_command(private.admin_context,uuid,uuid,text,uuid,text),
  private.admin_commercial_price_create(private.admin_context,uuid,uuid,numeric,text),
  private.admin_commercial_price_publish(private.admin_context,uuid,uuid,uuid,text),
  private.admin_commercial_mapping_list(private.admin_context,uuid,uuid),
  private.admin_commercial_mapping_upsert(private.admin_context,uuid,uuid,uuid,uuid,text,text,text[],integer,text),
  private.admin_commercial_mapping_command(private.admin_context,uuid,uuid,text,uuid,text),
  private.admin_batch_create_v3(private.admin_context,uuid,uuid,text,integer,timestamptz,timestamptz,uuid,text,jsonb)
to admin_executor;
