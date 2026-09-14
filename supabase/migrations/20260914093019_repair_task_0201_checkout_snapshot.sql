-- TASK-0201: freeze the Provider contract at Checkout creation time.
-- Existing rows remain readable but, without a provable snapshot, settlement
-- must fail closed into manual review rather than infer the historical facts.
alter table public.billing_checkout_intents
  add column provider_external_plan_id_snapshot text,
  add column provider_product_type_snapshot text,
  add column provider_external_sku_ids_snapshot text[],
  add column provider_sku_count_snapshot integer,
  add column provider_purchase_months_snapshot integer,
  add column provider_expected_show_amount_snapshot numeric(12, 2),
  add column provider_expected_total_amount_snapshot numeric(12, 2),
  add column provider_price_version_snapshot integer;

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
      where c.provider_account_id = old.provider_account_id
        and c.provider_product_id = old.id
    ) or old.published
    into v_checkout_exists;
    if v_checkout_exists then
      raise exception using errcode = 'P0001', message = 'mapping_immutable';
    end if;
    return old;
  end if;

  select old.published or exists (
    select 1 from public.billing_checkout_intents c
    where c.provider_account_id = old.provider_account_id
      and c.provider_product_id = old.id
  ) into v_checkout_exists;
  if v_checkout_exists and (
    new.provider_account_id is distinct from old.provider_account_id
    or new.subscription_product_id is distinct from old.subscription_product_id
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

alter function private.billing_provider_product_contract_guard() owner to domain_owner;
revoke all on function private.billing_provider_product_contract_guard()
  from public, anon, authenticated, account_executor, admin_executor,
    job_executor, recovery_executor, billing_ingress;
drop trigger if exists billing_provider_product_contract_guard on public.billing_provider_products;
create trigger billing_provider_product_contract_guard
  before update or delete on public.billing_provider_products
  for each row execute function private.billing_provider_product_contract_guard();

create or replace function private.billing_checkout_snapshot_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_mapping public.billing_provider_products;
  v_product public.subscription_products;
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
  where p.provider_account_id = new.provider_account_id
    and p.id = new.provider_product_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;

  select p.* into v_product
  from public.subscription_products p
  where p.id = new.subscription_product_id;
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

alter function private.billing_checkout_snapshot_guard() owner to domain_owner;
revoke all on function private.billing_checkout_snapshot_guard()
  from public, anon, authenticated, account_executor, admin_executor,
    job_executor, recovery_executor, billing_ingress;
drop trigger if exists billing_checkout_snapshot_guard on public.billing_checkout_intents;
create trigger billing_checkout_snapshot_guard
  before insert or update on public.billing_checkout_intents
  for each row execute function private.billing_checkout_snapshot_guard();

-- Payment-link reconstruction must use the same immutable Checkout snapshot as
-- settlement.  Reading the current provider mapping here would let a future
-- mapping pointer change alter an existing unpaid link.
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
    checkout.provider_external_plan_id_snapshot,
    checkout.provider_product_type_snapshot,
    checkout.provider_external_sku_ids_snapshot
  from public.billing_checkout_intents checkout
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

-- Settlement consumes only the Checkout's immutable provider snapshot.  A
-- legacy Checkout without that proof is isolated as contract_conflict.
create or replace function private.billing_order_verify_and_settle(
  p_ctx private.job_context,
  p_job_id uuid,
  p_order_id uuid,
  p_fence bigint,
  p_facts jsonb
)
returns table (
  order_id uuid,
  verification_status text,
  entitlement_status text,
  settlement_id uuid,
  settlement_state text,
  grant_id uuid,
  decision_code text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_job public.billing_processing_jobs;
  v_order public.billing_orders;
  v_checkout public.billing_checkout_intents;
  v_settlement public.billing_settlements;
  v_existing_auto public.billing_settlements;
  v_grant record;
  v_status text;
  v_provider_user_id text;
  v_external_plan_id text;
  v_product_type text;
  v_custom_order_id text;
  v_currency text;
  v_purchase_months integer;
  v_total_amount numeric(12, 2);
  v_show_amount numeric(12, 2);
  v_sku_ids text[] := '{}'::text[];
  v_quantity integer := 0;
  v_sku_items_valid boolean := true;
  v_valid boolean := false;
  v_decision text;
  v_settlement_state text;
  v_verification_status text;
  v_entitlement_status text;
  v_grant_id uuid;
  v_settlement_id uuid;
  v_error text;
  v_contract_version integer;
begin
  if (p_ctx).job_id is null or (p_ctx).lease_owner is null
     or (p_ctx).fencing_token is null or (p_ctx).request_id is null
     or p_job_id is null or p_order_id is null or p_fence is null
     or p_fence <> (p_ctx).fencing_token or jsonb_typeof(p_facts) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  select * into v_job
  from public.billing_processing_jobs j
  where j.id = p_job_id and j.state = 'processing'
    and j.lease_owner = (p_ctx).lease_owner and j.fence = p_fence
    and j.lease_until > clock_timestamp()
  for update;
  if not found then raise exception using errcode = '40001', message = 'fence_conflict'; end if;

  select * into v_order from public.billing_orders o where o.id = p_order_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  if v_job.billing_order_id is not null and v_job.billing_order_id <> p_order_id then
    raise exception using errcode = '40001', message = 'job_order_conflict';
  end if;
  select * into v_settlement from public.billing_settlements s
  where s.billing_order_id = p_order_id for update;

  update public.billing_processing_jobs set billing_order_id = p_order_id
  where id = p_job_id and (billing_order_id is null or billing_order_id = p_order_id)
    and lease_owner = (p_ctx).lease_owner and fence = p_fence
    and lease_until > clock_timestamp();
  if not found then raise exception using errcode = '40001', message = 'fence_conflict'; end if;

  v_status := lower(nullif(p_facts->>'status', ''));
  if v_status is null then v_status := 'unknown'; end if;
  v_provider_user_id := nullif(p_facts->>'provider_user_id', '');
  v_external_plan_id := nullif(p_facts->>'external_plan_id', '');
  v_product_type := nullif(p_facts->>'product_type', '');
  v_custom_order_id := nullif(p_facts->>'custom_order_id', '');
  v_currency := nullif(p_facts->>'currency', '');
  if nullif(p_facts->>'purchase_months', '') ~ '^[0-9]+$' then
    v_purchase_months := (p_facts->>'purchase_months')::integer;
  end if;
  if nullif(p_facts->>'total_amount', '') ~ '^[0-9]+(\.[0-9]+)?$' then
    v_total_amount := (p_facts->>'total_amount')::numeric;
  end if;
  if nullif(p_facts->>'show_amount', '') ~ '^[0-9]+(\.[0-9]+)?$' then
    v_show_amount := (p_facts->>'show_amount')::numeric;
  end if;

  if jsonb_typeof(p_facts->'sku_items') = 'array' then
    select coalesce(array_agg(nullif(item->>'external_sku_id', '') order by item->>'external_sku_id'), '{}'::text[]),
      coalesce(sum(case when item->>'quantity' ~ '^[1-9][0-9]*$' then (item->>'quantity')::integer else 0 end), 0),
      coalesce(bool_and(
        jsonb_typeof(item) = 'object'
        and nullif(item->>'external_sku_id', '') is not null
        and item->>'quantity' ~ '^[1-9][0-9]*$'
        and case when item->>'quantity' ~ '^[1-9][0-9]*$'
          then (item->>'quantity')::integer between 1 and 1000
          else false end
      ), true)
    into v_sku_ids, v_quantity, v_sku_items_valid
    from jsonb_array_elements(p_facts->'sku_items') as sku(item);
  elsif jsonb_typeof(p_facts->'sku_ids') = 'array' then
    select coalesce(array_agg(value order by value), '{}'::text[]), coalesce(cardinality(array_agg(value)), 0)
    into v_sku_ids, v_quantity
    from jsonb_array_elements_text(p_facts->'sku_ids') as sku(value)
    where nullif(value, '') is not null;
  end if;
  if nullif(p_facts->>'quantity', '') ~ '^[1-9][0-9]*$' then
    v_quantity := (p_facts->>'quantity')::integer;
  end if;
  if v_product_type = '0' and cardinality(v_sku_ids) = 0 and v_quantity = 0 then
    v_quantity := 1;
  end if;
  if nullif(p_facts->>'contract_version', '') ~ '^[1-9][0-9]*$' then
    v_contract_version := (p_facts->>'contract_version')::integer;
  else
    v_contract_version := 1;
  end if;

  update public.billing_orders set
    provider_status = v_status,
    provider_user_id = v_provider_user_id,
    external_plan_id = v_external_plan_id,
    product_type = v_product_type,
    external_sku_ids = v_sku_ids,
    quantity = nullif(v_quantity, 0),
    purchase_months = v_purchase_months,
    total_amount = v_total_amount,
    show_amount = v_show_amount,
    currency = v_currency,
    custom_order_id = v_custom_order_id,
    discount_metadata = case when jsonb_typeof(p_facts->'discount_metadata') = 'object'
      then p_facts->'discount_metadata' else '{}'::jsonb end,
    provider_facts = p_facts,
    provider_paid_at = case when v_status = 'paid' then coalesce(v_order.provider_paid_at, clock_timestamp()) else v_order.provider_paid_at end,
    last_observed_at = clock_timestamp()
  where id = p_order_id
  returning * into v_order;

  insert into public.billing_order_observations (
    billing_order_id, processing_job_id, provider_status,
    provider_contract_version, source, provider_facts, observed_at
  ) values (
    v_order.id, p_job_id, v_status, v_contract_version, v_job.job_kind,
    p_facts, clock_timestamp()
  ) on conflict (billing_order_id, processing_job_id) do update set
    provider_status = excluded.provider_status,
    provider_contract_version = excluded.provider_contract_version,
    source = excluded.source,
    provider_facts = excluded.provider_facts,
    observed_at = excluded.observed_at;

  if v_settlement.state = 'finalized' then
    update public.billing_processing_jobs set
      state = 'completed', lease_owner = null, lease_until = null,
      error_class = null, error_code = null
    where id = p_job_id and lease_owner = (p_ctx).lease_owner and fence = p_fence
      and lease_until > clock_timestamp();
    if not found then raise exception using errcode = '40001', message = 'fence_conflict'; end if;
    return query select v_order.id, v_order.verification_status, v_order.entitlement_status,
      v_settlement.id, v_settlement.state, v_settlement.grant_id, v_settlement.decision_code;
    return;
  end if;

  if v_status = 'pending' or v_status = 'unknown' then
    update public.billing_processing_jobs set state = 'retryable', lease_owner = null,
      lease_until = null, error_class = 'provider_observation', error_code = 'PROVIDER_STATUS_UNKNOWN',
      next_attempt_at = clock_timestamp() + interval '1 minute'
    where id = p_job_id and lease_owner = (p_ctx).lease_owner and fence = p_fence
      and lease_until > clock_timestamp();
    if not found then raise exception using errcode = '40001', message = 'fence_conflict'; end if;
    return query select v_order.id, v_order.verification_status, v_order.entitlement_status,
      null::uuid, null::text, null::uuid, 'retryable'::text;
    return;
  end if;

  if v_order.checkout_intent_id is not null then
    select * into v_checkout from public.billing_checkout_intents c
    where c.platform_id = v_order.platform_id and c.platform_account_id = v_order.platform_account_id
      and c.id = v_order.checkout_intent_id for update;
    if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
    v_valid := (
      v_status = 'paid'
      and v_sku_items_valid
      and v_order.provider_account_id = v_checkout.provider_account_id
      and v_provider_user_id is not null
      and v_external_plan_id is not null
      and v_product_type is not null
      and v_custom_order_id is not null
      and v_currency is not null
      and v_total_amount is not null
      and v_show_amount is not null
      and v_checkout.provider_external_plan_id_snapshot is not null
      and v_checkout.provider_product_type_snapshot is not null
      and v_checkout.provider_external_sku_ids_snapshot is not null
      and v_checkout.provider_sku_count_snapshot is not null
      and v_checkout.provider_expected_show_amount_snapshot is not null
      and v_checkout.provider_expected_total_amount_snapshot is not null
      and v_checkout.provider_price_version_snapshot is not null
      and v_custom_order_id = v_checkout.custom_order_id
      and v_external_plan_id = v_checkout.provider_external_plan_id_snapshot
      and v_product_type = v_checkout.provider_product_type_snapshot
      and v_sku_ids = v_checkout.provider_external_sku_ids_snapshot
      and case when v_checkout.provider_product_type_snapshot = '0'
        then v_quantity = 1 else v_quantity = v_checkout.provider_sku_count_snapshot end
      and (
        (v_checkout.provider_product_type_snapshot = '1' and v_checkout.provider_purchase_months_snapshot is null)
        or v_purchase_months is not distinct from v_checkout.provider_purchase_months_snapshot
      )
      and v_total_amount is not distinct from v_checkout.provider_expected_total_amount_snapshot
      and v_show_amount is not distinct from v_checkout.provider_expected_show_amount_snapshot
      and v_currency = v_checkout.currency
      and v_checkout.provider_price_version_snapshot = v_checkout.price_version
    ) is true;
  end if;

  if v_status = 'failed' then
    v_verification_status := 'verified';
    v_entitlement_status := 'rejected';
    v_decision := 'provider_not_paid';
    v_settlement_state := 'finalized';
  elsif v_checkout.id is null then
    v_verification_status := case when v_status = 'paid' then 'verified' else 'rejected' end;
    v_entitlement_status := 'blocked';
    v_decision := 'unlinked_order';
    v_settlement_state := 'review_required';
  elsif v_valid is not true then
    v_verification_status := 'rejected';
    v_entitlement_status := 'blocked';
    v_decision := 'contract_conflict';
    v_settlement_state := 'review_required';
  else
    select * into v_existing_auto from public.billing_settlements s
    where s.checkout_intent_id = v_checkout.id and s.settlement_kind = 'automatic'
    for update;
    if found and v_existing_auto.billing_order_id <> v_order.id then
      v_verification_status := 'verified';
      v_entitlement_status := 'blocked';
      v_decision := 'duplicate_payment';
      v_settlement_state := 'review_required';
    else
      begin
        select * into v_grant from private.entitlement_apply(
          v_order.platform_id, v_order.platform_account_id, v_checkout.entitlement_plan_id,
          'billing_order', v_order.id, v_checkout.duration_value_snapshot,
          v_checkout.duration_unit_snapshot, null, 'billing_order_settlement', null
        );
        v_grant_id := v_grant.grant_id;
        v_verification_status := 'verified';
        v_entitlement_status := 'granted';
        v_decision := 'granted';
        v_settlement_state := 'finalized';
      exception when others then
        if sqlerrm like '%plan_conflict%' then v_error := 'plan_conflict';
        elsif sqlerrm like '%entitlement_perpetual%' then v_error := 'already_perpetual';
        elsif sqlerrm like '%account_not_active%' then v_error := 'account_not_active';
        elsif sqlerrm like '%plan_unavailable%' then v_error := 'plan_unavailable';
        else raise;
        end if;
        v_verification_status := 'verified';
        v_entitlement_status := 'blocked';
        v_decision := v_error;
        v_settlement_state := 'review_required';
      end;
    end if;
  end if;

  if v_decision = 'granted' then
    if v_settlement is null then
      insert into public.billing_settlements (
        billing_order_id, checkout_intent_id, platform_id, platform_account_id,
        settlement_kind, state, operation_id, grant_id, decision_reason, decision_code
      ) values (
        v_order.id, v_checkout.id, v_order.platform_id, v_order.platform_account_id,
        'automatic', 'finalized', v_order.id, v_grant_id, 'billing_order_settlement', v_decision
      ) returning id into v_settlement_id;
    else
      update public.billing_settlements set
        state = 'finalized', grant_id = v_grant_id,
        decision_reason = 'billing_order_settlement', decision_code = v_decision,
        updated_at = clock_timestamp()
      where id = v_settlement.id
      returning id into v_settlement_id;
    end if;
    update public.billing_checkout_intents set status = 'granted', paid_at = coalesce(paid_at, clock_timestamp()),
      granted_at = clock_timestamp() where id = v_checkout.id;
  elsif v_decision in ('provider_not_paid', 'duplicate_payment', 'contract_conflict', 'unlinked_order', 'plan_conflict', 'already_perpetual', 'account_not_active', 'plan_unavailable') then
    if v_settlement is null then
      insert into public.billing_settlements (
        billing_order_id, checkout_intent_id, platform_id, platform_account_id,
        settlement_kind, state, operation_id, decision_reason, decision_code
      ) values (
        v_order.id, v_checkout.id, v_order.platform_id, v_order.platform_account_id,
        'manual', v_settlement_state, v_order.id, v_decision, v_decision
      ) returning id into v_settlement_id;
    else
      update public.billing_settlements set
        state = v_settlement_state, grant_id = null,
        decision_reason = v_decision, decision_code = v_decision,
        updated_at = clock_timestamp()
      where id = v_settlement.id
      returning id into v_settlement_id;
    end if;
  end if;

  update public.billing_orders set
    verification_status = v_verification_status,
    verification_reason = v_decision,
    verified_at = clock_timestamp(),
    entitlement_status = v_entitlement_status,
    linkage_status = case when v_checkout.id is null then 'unlinked' else 'linked' end
  where id = v_order.id returning * into v_order;
  update public.billing_processing_jobs set
    state = case when v_decision in ('duplicate_payment', 'contract_conflict', 'unlinked_order', 'plan_conflict', 'already_perpetual', 'account_not_active', 'plan_unavailable') then 'manual_review' else 'completed' end,
    lease_owner = null, lease_until = null, error_class = case when v_decision = 'granted' then null else 'billing_verification' end,
    error_code = case when v_decision = 'granted' then null else v_decision end
  where id = p_job_id and lease_owner = (p_ctx).lease_owner and fence = p_fence
    and lease_until > clock_timestamp();
  if not found then raise exception using errcode = '40001', message = 'fence_conflict'; end if;
  return query select v_order.id, v_order.verification_status, v_order.entitlement_status,
    v_settlement_id, v_settlement_state, v_grant_id, v_decision;
end;
$$;

alter function private.billing_order_verify_and_settle(private.job_context, uuid, uuid, bigint, jsonb)
  owner to domain_owner;
revoke all on function private.billing_order_verify_and_settle(private.job_context, uuid, uuid, bigint, jsonb)
  from public, anon, authenticated, account_executor, admin_executor, recovery_executor, billing_ingress;
grant execute on function private.billing_order_verify_and_settle(private.job_context, uuid, uuid, bigint, jsonb)
  to job_executor;
