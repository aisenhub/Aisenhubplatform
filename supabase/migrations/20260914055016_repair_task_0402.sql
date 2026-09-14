-- TASK-0402: persist every normalized provider observation while keeping the
-- original settlement decision idempotent. A finalized settlement is a
-- historical decision; a later observation may update facts but cannot grant
-- again. A review settlement can be re-evaluated by a newer verified fact.
create table public.billing_order_observations (
  id uuid primary key default gen_random_uuid(),
  billing_order_id uuid not null references public.billing_orders(id) on delete restrict,
  processing_job_id uuid not null references public.billing_processing_jobs(id) on delete restrict,
  provider_status text not null,
  provider_contract_version integer not null default 1 check (provider_contract_version > 0),
  source text not null check (source in ('webhook_order_discovery', 'order_verification', 'settlement', 'reconciliation')),
  provider_facts jsonb not null check (jsonb_typeof(provider_facts) = 'object'),
  observed_at timestamptz not null default clock_timestamp(),
  unique (billing_order_id, processing_job_id)
);

create index billing_order_observations_order_idx
  on public.billing_order_observations(billing_order_id, observed_at desc, id desc);

alter table public.billing_order_observations enable row level security;
alter table public.billing_order_observations force row level security;
create policy billing_order_observations_domain_owner
  on public.billing_order_observations for all to domain_owner
  using (true) with check (true);
revoke all on public.billing_order_observations
  from public, anon, authenticated, account_executor, admin_executor,
    job_executor, recovery_executor, billing_ingress;
grant select, insert, update on public.billing_order_observations to domain_owner;

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
  v_mapping public.billing_provider_products;
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

  -- A finalized settlement is immutable business history. The observation is
  -- still refreshed above, but no late provider status can revive its Grant.
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
    select * into v_mapping from public.billing_provider_products p
    where p.provider_account_id = v_checkout.provider_account_id and p.id = v_checkout.provider_product_id;
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
      and v_mapping.id is not null
      and v_custom_order_id = v_checkout.custom_order_id
      and v_external_plan_id = v_mapping.external_plan_id
      and v_product_type = v_mapping.product_type
      and v_sku_ids = (select coalesce(array_agg(value order by value), '{}'::text[]) from unnest(v_mapping.external_sku_ids) as sku(value))
      and case when v_mapping.product_type = '0' then v_quantity = 1 else v_quantity = v_mapping.sku_count end
      and (
        (v_mapping.product_type = '1' and v_mapping.purchase_months is null)
        or v_purchase_months is not distinct from v_mapping.purchase_months
      )
      and v_total_amount is not distinct from v_mapping.expected_total_amount
      and v_show_amount is not distinct from v_mapping.expected_show_amount
      and v_currency = v_mapping.currency
      and v_checkout.price_version = v_mapping.price_version
      and v_checkout.mapping_version = v_mapping.mapping_version
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
