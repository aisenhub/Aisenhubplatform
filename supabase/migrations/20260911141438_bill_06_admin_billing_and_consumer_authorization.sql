-- BILL-06: central Admin read/closeout wrappers and provider-neutral consumer
-- authorization helpers. Admin HTTP code calls these wrappers only; executor
-- roles never receive direct billing table DML.

alter table public.billing_processing_jobs
  add column operation_id uuid;

create unique index billing_processing_jobs_operation_idx
  on public.billing_processing_jobs(operation_id)
  where operation_id is not null;

alter table public.billing_orders
  add column admin_version bigint not null default 1
    check (admin_version > 0);

create or replace function private.billing_orders_admin_version()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.admin_version := old.admin_version + 1;
  return new;
end;
$$;

alter function private.billing_orders_admin_version() owner to domain_owner;
revoke all on function private.billing_orders_admin_version() from public, anon, authenticated,
  account_executor, admin_executor, job_executor, recovery_executor, billing_ingress;
create trigger billing_orders_admin_version
  before update on public.billing_orders for each row
  execute function private.billing_orders_admin_version();

create or replace function private.billing_admin_assert(p_ctx private.admin_context)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
begin
  if (p_ctx).admin_user_id is null or (p_ctx).session_id is null
     or (p_ctx).request_id is null
     or not exists (select 1 from private.system_admin a where a.user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) s where s.active)
  then raise exception using errcode = '42501', message = 'admin_required'; end if;
end;
$$;

create or replace function private.admin_billing_order_list(
  p_ctx private.admin_context,
  p_cursor timestamptz default null,
  p_limit integer default 50,
  p_status text default null
)
returns table (
  order_id uuid,
  provider text,
  provider_order_no text,
  platform_id uuid,
  platform_account_id uuid,
  checkout_intent_id uuid,
  provider_status text,
  verification_status text,
  entitlement_status text,
  linkage_status text,
  resolution_status text,
  settlement_state text,
  settlement_kind text,
  decision_code text,
  admin_version bigint,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
begin
  perform private.billing_admin_assert(p_ctx);
  if p_limit is null or p_limit not between 1 and 100
     or (p_status is not null and p_status not in ('pending', 'retryable', 'manual_review', 'finalized', 'granted', 'rejected')) then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  return query
    select o.id, pa.provider, o.provider_order_no, o.platform_id,
      o.platform_account_id, o.checkout_intent_id, o.provider_status,
      o.verification_status, o.entitlement_status, o.linkage_status,
      o.resolution_status, s.state, s.settlement_kind, s.decision_code,
      o.admin_version, o.created_at, o.updated_at
    from public.billing_orders o
    join public.billing_provider_accounts pa on pa.id = o.provider_account_id
    left join public.billing_settlements s on s.billing_order_id = o.id
    where (p_cursor is null or o.created_at < p_cursor)
      and (
        p_status is null
        or p_status = coalesce(s.state, o.entitlement_status)
        or (p_status = 'manual_review' and exists (
          select 1
          from public.billing_processing_jobs j
          where j.billing_order_id = o.id and j.state = 'manual_review'
        ))
      )
    order by o.created_at desc, o.id desc
    limit p_limit;
end;
$$;

create or replace function private.admin_billing_order_read(
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
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
begin
  perform private.billing_admin_assert(p_ctx);
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
       where j.billing_order_id = o.id and j.state in ('pending', 'processing', 'retryable', 'manual_review')),
      o.created_at, o.updated_at
    from public.billing_orders o
    join public.billing_provider_accounts pa on pa.id = o.provider_account_id
    left join public.billing_settlements s on s.billing_order_id = o.id
    where o.id = p_order_id;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
end;
$$;

create or replace function private.admin_billing_metrics(p_ctx private.admin_context)
returns table (
  pending_count bigint,
  retryable_count bigint,
  manual_review_count bigint,
  duplicate_payment_count bigint,
  oldest_pending_age_seconds numeric,
  discovery_last_success_at timestamptz,
  processing_last_success_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
begin
  perform private.billing_admin_assert(p_ctx);
  return query
    select
      (select count(*) from public.billing_processing_jobs where state = 'pending'),
      (select count(*) from public.billing_processing_jobs where state = 'retryable'),
      (select count(*) from public.billing_processing_jobs where state = 'manual_review'),
      (select count(*) from public.billing_settlements where decision_code = 'duplicate_payment'),
      coalesce(extract(epoch from (now() - min(next_attempt_at))), 0),
      (select max(last_success_at) from public.billing_reconciliation_cursors where stream = 'discovery'),
      (select max(last_success_at) from public.billing_reconciliation_cursors where stream = 'processing')
    from public.billing_processing_jobs
    where state in ('pending', 'retryable');
end;
$$;

create or replace function private.admin_billing_provider_product_list(
  p_ctx private.admin_context,
  p_provider_account_id uuid default null
)
returns table (
  provider_account_id uuid,
  provider text,
  provider_name text,
  provider_status text,
  provider_product_id uuid,
  subscription_product_id uuid,
  external_plan_id text,
  product_type text,
  price_version integer,
  mapping_version integer,
  validation_status text,
  published boolean,
  enabled boolean,
  expected_total_amount numeric,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
begin
  perform private.billing_admin_assert(p_ctx);
  return query
    select a.id, a.provider, a.name, a.status, p.id, p.subscription_product_id,
      p.external_plan_id, p.product_type, p.price_version, p.mapping_version,
      p.validation_status, p.published, p.enabled, p.expected_total_amount,
      p.updated_at
    from public.billing_provider_accounts a
    join public.billing_provider_products p on p.provider_account_id = a.id
    where p_provider_account_id is null or a.id = p_provider_account_id
    order by a.provider, p.subscription_product_id, p.mapping_version desc;
end;
$$;

create or replace function private.admin_billing_order_requery(
  p_ctx private.admin_context,
  p_order_id uuid,
  p_operation_id uuid,
  p_expected_version bigint,
  p_reason text
)
returns table (order_id uuid, job_id uuid, state text, admin_version bigint, replayed boolean)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_order public.billing_orders;
  v_job public.billing_processing_jobs;
begin
  perform private.billing_admin_assert(p_ctx);
  if p_order_id is null or p_operation_id is null or p_expected_version is null
     or p_expected_version < 1 or p_reason is null or length(p_reason) not between 1 and 1024 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_order from public.billing_orders where id = p_order_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  if v_order.admin_version <> p_expected_version then
    raise exception using errcode = '40001', message = 'precondition_failed';
  end if;
  select * into v_job from public.billing_processing_jobs j
  where j.operation_id = p_operation_id;
  if found then
    return query select v_order.id, v_job.id, v_job.state, v_order.admin_version, true;
    return;
  end if;
  select * into v_job from public.billing_processing_jobs j
  where j.billing_order_id = p_order_id and j.state in ('pending', 'processing', 'retryable')
  order by j.created_at desc limit 1;
  if found then
    return query select v_order.id, v_job.id, v_job.state, v_order.admin_version, true;
    return;
  end if;
  insert into public.billing_processing_jobs(job_kind, billing_order_id, operation_id, state)
  values ('reconciliation', p_order_id, p_operation_id, 'pending')
  returning * into v_job;
  perform private.audit_append(p_operation_id, 'admin', (p_ctx).admin_user_id,
    v_order.platform_id, v_order.platform_account_id, 'billing.order.requery_requested',
    'billing_order', v_order.id, null, null, jsonb_build_object('reason', p_reason));
  return query select v_order.id, v_job.id, v_job.state, v_order.admin_version, false;
end;
$$;

create or replace function private.admin_billing_order_resolve(
  p_ctx private.admin_context,
  p_order_id uuid,
  p_operation_id uuid,
  p_expected_version bigint,
  p_decision text,
  p_reason text
)
returns table (order_id uuid, resolution_status text, settlement_state text, admin_version bigint)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_order public.billing_orders;
  v_settlement public.billing_settlements;
begin
  perform private.billing_admin_assert(p_ctx);
  if p_order_id is null or p_operation_id is null or p_expected_version is null
     or p_expected_version < 1 or p_decision not in ('refund_confirmed', 'closed_anomaly', 'manual_correction')
     or p_reason is null or length(p_reason) not between 1 and 1024 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_order from public.billing_orders where id = p_order_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  if v_order.admin_version <> p_expected_version then
    raise exception using errcode = '40001', message = 'precondition_failed';
  end if;
  select * into v_settlement from public.billing_settlements where billing_order_id = p_order_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'settlement_required'; end if;
  update public.billing_settlements set state = 'finalized', decision_reason = p_reason
  where id = v_settlement.id;
  update public.billing_orders set resolution_status = 'resolved', resolved_by = (p_ctx).admin_user_id,
    resolved_at = clock_timestamp(), resolution_reason = p_reason
  where id = p_order_id
  returning * into v_order;
  perform private.audit_append(p_operation_id, 'admin', (p_ctx).admin_user_id,
    v_order.platform_id, v_order.platform_account_id, 'billing.order.resolved',
    'billing_order', v_order.id, null, null,
    jsonb_build_object('decision', p_decision, 'reason', p_reason));
  return query select v_order.id, v_order.resolution_status, 'finalized'::text, v_order.admin_version;
end;
$$;

alter function private.billing_admin_assert(private.admin_context) owner to domain_owner;
alter function private.admin_billing_order_list(private.admin_context, timestamptz, integer, text) owner to domain_owner;
alter function private.admin_billing_order_read(private.admin_context, uuid) owner to domain_owner;
alter function private.admin_billing_metrics(private.admin_context) owner to domain_owner;
alter function private.admin_billing_provider_product_list(private.admin_context, uuid) owner to domain_owner;
alter function private.admin_billing_order_requery(private.admin_context, uuid, uuid, bigint, text) owner to domain_owner;
alter function private.admin_billing_order_resolve(private.admin_context, uuid, uuid, bigint, text, text) owner to domain_owner;

revoke all on function private.billing_admin_assert(private.admin_context),
  private.admin_billing_order_list(private.admin_context, timestamptz, integer, text),
  private.admin_billing_order_read(private.admin_context, uuid),
  private.admin_billing_metrics(private.admin_context),
  private.admin_billing_provider_product_list(private.admin_context, uuid),
  private.admin_billing_order_requery(private.admin_context, uuid, uuid, bigint, text),
  private.admin_billing_order_resolve(private.admin_context, uuid, uuid, bigint, text, text)
  from public, anon, authenticated, account_executor, job_executor, recovery_executor, billing_ingress;
grant execute on function private.admin_billing_order_list(private.admin_context, timestamptz, integer, text),
  private.admin_billing_order_read(private.admin_context, uuid),
  private.admin_billing_metrics(private.admin_context),
  private.admin_billing_provider_product_list(private.admin_context, uuid),
  private.admin_billing_order_requery(private.admin_context, uuid, uuid, bigint, text),
  private.admin_billing_order_resolve(private.admin_context, uuid, uuid, bigint, text, text)
  to admin_executor;
