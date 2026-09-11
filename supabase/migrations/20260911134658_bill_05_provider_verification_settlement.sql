-- BILL-05: provider-neutral order verification, shared billing settlement and
-- dual-progress reconciliation state. Real Provider credentials remain out of
-- this migration; the SQL boundary only consumes normalized observations.

alter table public.billing_checkout_intents
  add column custom_order_id text;

update public.billing_checkout_intents
set custom_order_id = id::text
where custom_order_id is null;

alter table public.billing_checkout_intents
  alter column custom_order_id set not null,
  add constraint billing_checkout_custom_order_check
    check (length(custom_order_id) between 1 and 256);

create or replace function private.billing_checkout_custom_order_id()
returns trigger
language plpgsql
set search_path = pg_catalog, private
as $$
begin
  if new.custom_order_id is null then new.custom_order_id := new.id::text; end if;
  return new;
end;
$$;

alter function private.billing_checkout_custom_order_id() owner to domain_owner;
revoke all on function private.billing_checkout_custom_order_id() from public, anon, authenticated,
  account_executor, admin_executor, job_executor, recovery_executor, billing_ingress;
create trigger billing_checkout_custom_order_id
  before insert on public.billing_checkout_intents for each row
  execute function private.billing_checkout_custom_order_id();

alter table public.billing_orders
  add column custom_order_id text,
  add column provider_facts jsonb not null default '{}'::jsonb,
  add column verification_reason text,
  add column verified_at timestamptz,
  add constraint billing_order_provider_facts_object_check
    check (jsonb_typeof(provider_facts) = 'object');

alter table public.billing_settlements
  add column decision_code text,
  add constraint billing_settlement_decision_check
    check (decision_code is null or decision_code in (
      'granted', 'duplicate_payment', 'contract_conflict', 'unlinked_order',
      'provider_not_paid', 'plan_conflict', 'already_perpetual',
      'account_not_active', 'plan_unavailable', 'retryable'
    ));

create table public.billing_reconciliation_cursors (
  id uuid primary key default gen_random_uuid(),
  provider_account_id uuid not null references public.billing_provider_accounts(id) on delete restrict,
  stream text not null check (stream in ('discovery', 'processing')),
  version bigint not null default 1 check (version > 0),
  high_water_created_at timestamptz,
  high_water_order_no text,
  page_cursor text,
  head_scan_at timestamptz,
  last_success_at timestamptz,
  last_error_code text,
  updated_at timestamptz not null default now(),
  unique (provider_account_id, stream)
);

alter table public.billing_reconciliation_cursors enable row level security;
alter table public.billing_reconciliation_cursors force row level security;
create policy billing_reconciliation_cursors_domain_owner
  on public.billing_reconciliation_cursors for all to domain_owner
  using (true) with check (true);
revoke all on public.billing_reconciliation_cursors
  from public, anon, authenticated, account_executor, admin_executor,
    job_executor, recovery_executor, billing_ingress;
grant select, insert, update on public.billing_reconciliation_cursors to domain_owner;
create trigger billing_reconciliation_cursors_set_updated_at
  before update on public.billing_reconciliation_cursors for each row
  execute function private.set_updated_at();

-- Extend the one shared entitlement write entry. Billing settlement still calls
-- this function; no executor receives direct Grant/Event table DML.
create or replace function private.entitlement_apply(
  p_platform_id uuid,
  p_platform_account_id uuid,
  p_plan_id uuid,
  p_source text,
  p_operation_id uuid,
  p_duration_value integer,
  p_duration_unit text,
  p_actor_user_id uuid,
  p_reason text,
  p_redemption_code_id uuid default null
)
returns table (grant_id uuid, plan_id uuid, starts_at timestamptz, ends_at timestamptz, event_sequence bigint)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_account public.platform_accounts;
  v_plan public.plans;
  v_existing public.subscription_grants;
  v_now timestamptz := clock_timestamp();
  v_start timestamptz;
  v_end timestamptz;
  v_sequence bigint;
begin
  if p_source not in ('admin', 'redemption_code', 'billing_order')
     or p_operation_id is null or p_plan_id is null
     or p_reason is null or length(p_reason) not between 1 and 1024
     or (p_source = 'redemption_code' and (p_duration_value is null or p_duration_unit is null or p_redemption_code_id is null))
     or (p_source = 'billing_order' and p_redemption_code_id is not null)
     or (p_duration_value is not null and (p_duration_value <= 0 or p_duration_unit not in ('day', 'month', 'year'))) then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_existing from public.subscription_grants g
  where g.platform_id = p_platform_id and g.source = p_source and g.operation_id = p_operation_id;
  if found then
    return query select v_existing.id, v_existing.plan_id, v_existing.starts_at, v_existing.ends_at,
      (select e.sequence from public.subscription_events e where e.grant_id = v_existing.id and e.event_type = 'granted');
    return;
  end if;

  select * into v_account from public.platform_accounts a
  where a.platform_id = p_platform_id and a.id = p_platform_account_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  if v_account.status <> 'active' then raise exception using errcode = '42501', message = 'account_not_active'; end if;
  select * into v_plan from public.plans p where p.platform_id = p_platform_id and p.id = p_plan_id;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  if v_plan.status <> 'active' or v_plan.kind <> 'paid' then raise exception using errcode = 'P0001', message = 'plan_unavailable'; end if;

  if exists (
    select 1 from public.subscription_grants g
    where g.platform_id = p_platform_id and g.platform_account_id = p_platform_account_id
      and g.plan_id <> p_plan_id and (g.ends_at is null or g.ends_at > v_now)
      and not exists (select 1 from public.subscription_events r where r.grant_id = g.id and r.event_type = 'revoked')
  ) then raise exception using errcode = 'P0001', message = 'plan_conflict'; end if;
  if exists (
    select 1 from public.subscription_grants g
    where g.platform_id = p_platform_id and g.platform_account_id = p_platform_account_id
      and g.plan_id = p_plan_id and g.ends_at is null
      and not exists (select 1 from public.subscription_events r where r.grant_id = g.id and r.event_type = 'revoked')
  ) then raise exception using errcode = 'P0001', message = 'entitlement_perpetual'; end if;
  if p_source = 'admin' and p_duration_value is null and exists (
    select 1 from public.subscription_grants g
    where g.platform_id = p_platform_id and g.platform_account_id = p_platform_account_id
      and (g.ends_at is null or g.ends_at > v_now)
      and not exists (select 1 from public.subscription_events r where r.grant_id = g.id and r.event_type = 'revoked')
  ) then raise exception using errcode = 'P0001', message = 'plan_conflict'; end if;

  select greatest(v_now, coalesce(max(g.ends_at), v_now)) into v_start
  from public.subscription_grants g
  where g.platform_id = p_platform_id and g.platform_account_id = p_platform_account_id
    and g.plan_id = p_plan_id and g.ends_at is not null and g.ends_at > v_now
    and not exists (select 1 from public.subscription_events r where r.grant_id = g.id and r.event_type = 'revoked');
  if p_duration_value is null then v_end := null;
  elsif p_duration_unit = 'day' then v_end := v_start + make_interval(days => p_duration_value);
  elsif p_duration_unit = 'month' then v_end := v_start + make_interval(months => p_duration_value);
  else v_end := v_start + make_interval(years => p_duration_value);
  end if;

  insert into public.subscription_grants (
    platform_id, platform_account_id, plan_id, source, operation_id,
    redemption_code_id, billing_order_id, starts_at, ends_at, created_by, reason
  ) values (
    p_platform_id, p_platform_account_id, p_plan_id, p_source, p_operation_id,
    p_redemption_code_id,
    case when p_source = 'billing_order' then p_operation_id else null end,
    v_start, v_end, p_actor_user_id, p_reason
  ) returning id into grant_id;

  select coalesce(max(e.sequence), 0) + 1 into v_sequence
  from public.subscription_events e
  where e.platform_id = p_platform_id and e.platform_account_id = p_platform_account_id;
  insert into public.subscription_events (
    platform_id, platform_account_id, sequence, event_type, grant_id,
    operation_id, actor_user_id, reason
  ) values (
    p_platform_id, p_platform_account_id, v_sequence, 'granted', grant_id,
    p_operation_id, p_actor_user_id, p_reason
  );
  perform private.entitlement_recompute(p_platform_id, p_platform_account_id);
  perform private.audit_append(p_operation_id, case when p_source = 'admin' then 'admin' else 'system' end,
    p_actor_user_id, p_platform_id, p_platform_account_id, 'entitlement.granted',
    'subscription_grant', grant_id, null, null,
    jsonb_build_object('plan_id', p_plan_id, 'source', p_source));
  return query select grant_id, p_plan_id, v_start, v_end, v_sequence;
end;
$$;

alter function private.entitlement_apply(uuid, uuid, uuid, text, uuid, integer, text, uuid, text, uuid) owner to domain_owner;

create or replace function private.billing_order_query_target(
  p_ctx private.job_context,
  p_job_id uuid,
  p_order_id uuid,
  p_fence bigint
)
returns table (provider_account_id uuid, provider_order_no text)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_job public.billing_processing_jobs;
  v_order public.billing_orders;
begin
  if (p_ctx).job_id is null or (p_ctx).lease_owner is null
     or (p_ctx).fencing_token is null or (p_ctx).request_id is null
     or p_job_id is null or p_order_id is null or p_fence is null
     or p_fence <> (p_ctx).fencing_token then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_job from public.billing_processing_jobs j
  where j.id = p_job_id and j.state = 'processing'
    and j.lease_owner = (p_ctx).lease_owner and j.fence = p_fence;
  if not found then raise exception using errcode = '40001', message = 'fence_conflict'; end if;
  if v_job.billing_order_id is not null and v_job.billing_order_id <> p_order_id then
    raise exception using errcode = '40001', message = 'job_order_conflict';
  end if;
  select * into v_order from public.billing_orders o where o.id = p_order_id;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  return query select v_order.provider_account_id, v_order.provider_order_no;
end;
$$;

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
  v_valid boolean := false;
  v_decision text;
  v_settlement_state text;
  v_verification_status text;
  v_entitlement_status text;
  v_grant_id uuid;
  v_settlement_id uuid;
  v_error text;
begin
  if (p_ctx).job_id is null or (p_ctx).lease_owner is null
     or (p_ctx).fencing_token is null or (p_ctx).request_id is null
     or p_job_id is null or p_order_id is null or p_fence is null
     or p_fence <> (p_ctx).fencing_token or jsonb_typeof(p_facts) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_job from public.billing_processing_jobs j
  where j.id = p_job_id and j.state = 'processing'
    and j.lease_owner = (p_ctx).lease_owner and j.fence = p_fence for update;
  if not found then raise exception using errcode = '40001', message = 'fence_conflict'; end if;
  select * into v_order from public.billing_orders o where o.id = p_order_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  if v_job.billing_order_id is not null and v_job.billing_order_id <> p_order_id then
    raise exception using errcode = '40001', message = 'job_order_conflict';
  end if;
  select * into v_settlement from public.billing_settlements s
  where s.billing_order_id = p_order_id for update;
  if found then
    update public.billing_processing_jobs set
      state = case when v_settlement.state = 'review_required' then 'manual_review' else 'completed' end,
      lease_owner = null, lease_until = null, error_class = null, error_code = null
    where id = p_job_id and lease_owner = (p_ctx).lease_owner and fence = p_fence;
    return query select v_order.id, v_order.verification_status, v_order.entitlement_status,
      v_settlement.id, v_settlement.state, v_settlement.grant_id, v_settlement.decision_code;
    return;
  end if;
  update public.billing_processing_jobs set billing_order_id = p_order_id
  where id = p_job_id and billing_order_id is null;

  v_status := lower(coalesce(p_facts->>'status', 'unknown'));
  v_provider_user_id := nullif(p_facts->>'provider_user_id', '');
  v_external_plan_id := nullif(p_facts->>'external_plan_id', '');
  v_product_type := nullif(p_facts->>'product_type', '');
  v_custom_order_id := nullif(p_facts->>'custom_order_id', '');
  v_currency := nullif(p_facts->>'currency', '');
  v_purchase_months := nullif(p_facts->>'purchase_months', '')::integer;
  v_total_amount := nullif(p_facts->>'total_amount', '')::numeric;
  v_show_amount := nullif(p_facts->>'show_amount', '')::numeric;
  if jsonb_typeof(p_facts->'sku_ids') = 'array' then
    select coalesce(array_agg(value order by value), '{}'::text[]) into v_sku_ids
    from jsonb_array_elements_text(p_facts->'sku_ids') as sku(value);
  end if;
  update public.billing_orders set
    provider_status = v_status,
    provider_user_id = v_provider_user_id,
    external_plan_id = v_external_plan_id,
    product_type = v_product_type,
    external_sku_ids = v_sku_ids,
    purchase_months = v_purchase_months,
    total_amount = v_total_amount,
    show_amount = v_show_amount,
    currency = v_currency,
    custom_order_id = v_custom_order_id,
    provider_facts = p_facts,
    provider_paid_at = case when v_status = 'paid' then coalesce(v_order.provider_paid_at, clock_timestamp()) else v_order.provider_paid_at end,
    last_observed_at = clock_timestamp()
  where id = p_order_id
  returning * into v_order;

  if v_status = 'pending' then
    update public.billing_processing_jobs set state = 'retryable', lease_owner = null,
      lease_until = null, next_attempt_at = clock_timestamp() + interval '1 minute'
    where id = p_job_id and lease_owner = (p_ctx).lease_owner and fence = p_fence;
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
    v_valid := v_status = 'paid'
      and v_order.provider_account_id = v_checkout.provider_account_id
      and v_custom_order_id = v_checkout.custom_order_id
      and v_external_plan_id = v_mapping.external_plan_id
      and v_product_type = v_mapping.product_type
      and v_sku_ids = (select coalesce(array_agg(value order by value), '{}'::text[]) from unnest(v_mapping.external_sku_ids) as sku(value))
      and v_purchase_months is not distinct from v_mapping.purchase_months
      and v_total_amount is not distinct from v_mapping.expected_total_amount
      and v_show_amount is not distinct from v_mapping.expected_show_amount
      and v_currency = v_mapping.currency
      and v_checkout.price_version = v_mapping.price_version
      and v_checkout.mapping_version = v_mapping.mapping_version;
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
  elsif not v_valid then
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
    insert into public.billing_settlements (
      billing_order_id, checkout_intent_id, platform_id, platform_account_id,
      settlement_kind, state, operation_id, grant_id, decision_reason, decision_code
    ) values (
      v_order.id, v_checkout.id, v_order.platform_id, v_order.platform_account_id,
      'automatic', 'finalized', v_order.id, v_grant_id, 'billing_order_settlement', v_decision
    ) returning id into v_settlement_id;
    update public.billing_checkout_intents set status = 'granted', paid_at = coalesce(paid_at, clock_timestamp()),
      granted_at = clock_timestamp() where id = v_checkout.id;
  elsif v_decision in ('provider_not_paid', 'duplicate_payment', 'contract_conflict', 'unlinked_order', 'plan_conflict', 'already_perpetual', 'account_not_active', 'plan_unavailable') then
    insert into public.billing_settlements (
      billing_order_id, checkout_intent_id, platform_id, platform_account_id,
      settlement_kind, state, operation_id, decision_reason, decision_code
    ) values (
      v_order.id, v_checkout.id, v_order.platform_id, v_order.platform_account_id,
      'manual', v_settlement_state, v_order.id, v_decision, v_decision
    ) on conflict (billing_order_id) do nothing returning id into v_settlement_id;
    if v_settlement_id is null then
      select s.id into v_settlement_id from public.billing_settlements s where s.billing_order_id = v_order.id;
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
  where id = p_job_id and lease_owner = (p_ctx).lease_owner and fence = p_fence;
  return query select v_order.id, v_order.verification_status, v_order.entitlement_status,
    v_settlement_id, v_settlement_state, v_grant_id, v_decision;
end;
$$;

create or replace function private.billing_reconciliation_cursor_update(
  p_ctx private.job_context,
  p_provider_account_id uuid,
  p_stream text,
  p_expected_version bigint,
  p_high_water_created_at timestamptz,
  p_high_water_order_no text,
  p_page_cursor text,
  p_success boolean,
  p_error_code text default null
)
returns table (
  provider_account_id uuid,
  stream text,
  version bigint,
  high_water_created_at timestamptz,
  high_water_order_no text,
  page_cursor text,
  last_success_at timestamptz,
  last_error_code text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_cursor public.billing_reconciliation_cursors;
begin
  if (p_ctx).job_id is null or (p_ctx).lease_owner is null or (p_ctx).request_id is null
     or p_provider_account_id is null or p_stream not in ('discovery', 'processing')
     or p_expected_version is null or p_expected_version < 0 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_cursor from public.billing_reconciliation_cursors c
  where c.provider_account_id = p_provider_account_id and c.stream = p_stream for update;
  if not found then
    if p_expected_version <> 0 then raise exception using errcode = '40001', message = 'cursor_conflict'; end if;
    insert into public.billing_reconciliation_cursors (
      provider_account_id, stream, version, high_water_created_at, high_water_order_no,
      page_cursor, head_scan_at, last_success_at, last_error_code
    ) values (
      p_provider_account_id, p_stream, 1, p_high_water_created_at, p_high_water_order_no,
      p_page_cursor, clock_timestamp(), case when p_success then clock_timestamp() else null end,
      case when p_success then null else p_error_code end
    ) returning * into v_cursor;
  else
    if v_cursor.version <> p_expected_version then
      raise exception using errcode = '40001', message = 'cursor_conflict';
    end if;
    update public.billing_reconciliation_cursors as c set
      version = c.version + 1,
      high_water_created_at = case when p_high_water_created_at is not null and (c.high_water_created_at is null or (p_high_water_created_at, coalesce(p_high_water_order_no, '')) > (c.high_water_created_at, coalesce(c.high_water_order_no, ''))) then p_high_water_created_at else c.high_water_created_at end,
      high_water_order_no = case when p_high_water_created_at is not null and (c.high_water_created_at is null or (p_high_water_created_at, coalesce(p_high_water_order_no, '')) > (c.high_water_created_at, coalesce(c.high_water_order_no, ''))) then p_high_water_order_no else c.high_water_order_no end,
      page_cursor = p_page_cursor,
      head_scan_at = clock_timestamp(),
      last_success_at = case when p_success then clock_timestamp() else c.last_success_at end,
      last_error_code = case when p_success then null else p_error_code end
    where c.id = v_cursor.id returning c.* into v_cursor;
  end if;
  return query select v_cursor.provider_account_id, v_cursor.stream, v_cursor.version,
    v_cursor.high_water_created_at, v_cursor.high_water_order_no, v_cursor.page_cursor,
    v_cursor.last_success_at, v_cursor.last_error_code;
end;
$$;

alter function private.billing_order_verify_and_settle(private.job_context, uuid, uuid, bigint, jsonb) owner to domain_owner;
alter function private.billing_reconciliation_cursor_update(private.job_context, uuid, text, bigint, timestamptz, text, text, boolean, text) owner to domain_owner;
alter function private.billing_order_query_target(private.job_context, uuid, uuid, bigint) owner to domain_owner;
revoke all on function private.billing_order_verify_and_settle(private.job_context, uuid, uuid, bigint, jsonb)
  from public, anon, authenticated, account_executor, admin_executor, recovery_executor, billing_ingress;
revoke all on function private.billing_reconciliation_cursor_update(private.job_context, uuid, text, bigint, timestamptz, text, text, boolean, text)
  from public, anon, authenticated, account_executor, admin_executor, recovery_executor, billing_ingress;
revoke all on function private.billing_order_query_target(private.job_context, uuid, uuid, bigint)
  from public, anon, authenticated, account_executor, admin_executor, recovery_executor, billing_ingress;
grant execute on function private.billing_order_verify_and_settle(private.job_context, uuid, uuid, bigint, jsonb) to job_executor;
grant execute on function private.billing_reconciliation_cursor_update(private.job_context, uuid, text, bigint, timestamptz, text, text, boolean, text) to job_executor;
grant execute on function private.billing_order_query_target(private.job_context, uuid, uuid, bigint) to job_executor;
