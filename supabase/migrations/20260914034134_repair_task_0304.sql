-- RC-03 / TASK-0304
-- An order discovered without a checkout is still a real payment fact. Keep it
-- in the settlement ledger with an explicitly empty ownership scope instead of
-- inventing a platform/account pair or rolling the transaction back.

alter table public.billing_settlements
  alter column platform_id drop not null,
  alter column platform_account_id drop not null;

alter table public.billing_settlements
  add constraint billing_settlements_scope_check check (
    (
      platform_id is null
      and platform_account_id is null
      and checkout_intent_id is null
      and grant_id is null
    )
    or (platform_id is not null and platform_account_id is not null)
  );

create or replace function private.billing_order_link_checkout(
  p_ctx private.job_context,
  p_job_id uuid,
  p_order_id uuid,
  p_fence bigint,
  p_custom_order_id text
)
returns table (order_id uuid, linked boolean)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_job public.billing_processing_jobs;
  v_order public.billing_orders;
  v_checkout public.billing_checkout_intents;
  v_checkout_count integer := 0;
begin
  if (p_ctx).job_id is null or (p_ctx).lease_owner is null
     or (p_ctx).fencing_token is null or (p_ctx).request_id is null
     or p_job_id is null or p_order_id is null or p_fence is null
     or p_fence <> (p_ctx).fencing_token then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_job from public.billing_processing_jobs j
  where j.id = p_job_id and j.state = 'processing'
    and j.lease_owner = (p_ctx).lease_owner and j.fence = p_fence
    and j.lease_until > clock_timestamp()
  for update;
  if not found then raise exception using errcode = '40001', message = 'fence_conflict'; end if;
  if v_job.billing_order_id is not null and v_job.billing_order_id <> p_order_id then
    raise exception using errcode = '40001', message = 'job_order_conflict';
  end if;

  select * into v_order from public.billing_orders o where o.id = p_order_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  if v_order.checkout_intent_id is null
     and v_order.linkage_status = 'unlinked'
     and v_order.resolution_status = 'open'
     and not exists (
       select 1 from public.billing_settlements s where s.billing_order_id = v_order.id
     )
     and p_custom_order_id is not null
     and length(p_custom_order_id) between 1 and 256 then
    for v_checkout in
      select *
      from public.billing_checkout_intents c
      where c.provider_account_id = v_order.provider_account_id
        and c.custom_order_id = p_custom_order_id
      order by c.created_at desc, c.id desc
      for update
    loop
      v_checkout_count := v_checkout_count + 1;
      if v_checkout_count > 1 then exit; end if;
    end loop;
    if v_checkout_count = 1 then
      update public.billing_orders set
        checkout_intent_id = v_checkout.id,
        platform_id = v_checkout.platform_id,
        platform_account_id = v_checkout.platform_account_id,
        subscription_product_id = v_checkout.subscription_product_id,
        linkage_status = 'linked'
      where id = v_order.id and checkout_intent_id is null;
    end if;
  end if;

  update public.billing_processing_jobs set updated_at = clock_timestamp()
  where id = p_job_id and state = 'processing'
    and lease_owner = (p_ctx).lease_owner and fence = p_fence
    and lease_until > clock_timestamp();
  if not found then raise exception using errcode = '40001', message = 'fence_conflict'; end if;
  select * into v_order from public.billing_orders o where o.id = p_order_id;
  return query select v_order.id, v_order.checkout_intent_id is not null;
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
     or (p_status is not null and p_status not in (
       'pending', 'retryable', 'manual_review', 'finalized', 'granted',
       'rejected', 'unlinked'
     )) then
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
        or (p_status = 'unlinked' and o.linkage_status = 'unlinked')
      )
    order by o.created_at desc, o.id desc
    limit p_limit;
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
  v_existing private.admin_idempotency%rowtype;
  v_scope text;
  v_hash bytea;
  v_new boolean := false;
  v_response jsonb;
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
  v_scope := case
    when v_order.platform_id is null then 'global'
    else 'platform:' || v_order.platform_id::text
  end;
  v_hash := extensions.digest(
    convert_to(
      p_order_id::text || ':' || p_decision || ':' || p_expected_version::text || ':' || p_reason,
      'utf8'
    ),
    'sha256'
  );
  insert into private.admin_idempotency(
    admin_user_id, platform_id, scope, operation, idempotency_key, request_hash
  ) values (
    (p_ctx).admin_user_id,
    case when v_scope = 'global' then null else v_order.platform_id end,
    v_scope,
    'billing_order_resolve',
    p_operation_id::text,
    v_hash
  ) on conflict (admin_user_id, scope, operation, idempotency_key)
    do nothing returning true into v_new;
  if not coalesce(v_new, false) then
    select * into v_existing from private.admin_idempotency i
    where i.admin_user_id = (p_ctx).admin_user_id and i.scope = v_scope
      and i.operation = 'billing_order_resolve' and i.idempotency_key = p_operation_id::text
    for update;
    if v_existing.request_hash <> v_hash then
      raise exception using errcode = '23505', message = 'idempotency_conflict';
    end if;
    if v_existing.state = 'completed' then
      return query select
        (v_existing.response_body->>'order_id')::uuid,
        v_existing.response_body->>'resolution_status',
        v_existing.response_body->>'settlement_state',
        (v_existing.response_body->>'admin_version')::bigint;
      return;
    end if;
    raise exception using errcode = 'P0001', message = 'operation_in_progress';
  end if;
  select * into v_settlement from public.billing_settlements where billing_order_id = p_order_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'settlement_required'; end if;
  if v_order.linkage_status = 'unlinked'
     and (v_settlement.platform_id is not null or v_settlement.platform_account_id is not null
       or v_settlement.checkout_intent_id is not null or v_settlement.grant_id is not null) then
    raise exception using errcode = 'P0001', message = 'settlement_scope_conflict';
  end if;
  update public.billing_settlements set state = 'finalized', decision_reason = p_reason
  where id = v_settlement.id;
  update public.billing_orders set resolution_status = 'resolved', resolved_by = (p_ctx).admin_user_id,
    resolved_at = clock_timestamp(), resolution_reason = p_reason
  where id = p_order_id
  returning * into v_order;
  update public.billing_processing_jobs
  set state = 'completed', lease_owner = null, lease_until = null,
    error_class = null, error_code = null
  where billing_order_id = p_order_id and state = 'manual_review';
  v_response := jsonb_build_object(
    'order_id', v_order.id,
    'resolution_status', v_order.resolution_status,
    'settlement_state', 'finalized',
    'admin_version', v_order.admin_version
  );
  update private.admin_idempotency i
  set state = 'completed', response_status = 200, response_body = v_response
  where i.admin_user_id = (p_ctx).admin_user_id and i.scope = v_scope
    and i.operation = 'billing_order_resolve' and i.idempotency_key = p_operation_id::text;
  perform private.audit_append(p_operation_id, 'admin', (p_ctx).admin_user_id,
    v_order.platform_id, v_order.platform_account_id, 'billing.order.resolved',
    'billing_order', v_order.id, null, null,
    jsonb_build_object('decision', p_decision, 'reason', p_reason));
  return query select v_order.id, v_order.resolution_status, 'finalized'::text, v_order.admin_version;
end;
$$;

alter function private.admin_billing_order_list(private.admin_context, timestamptz, integer, text)
  owner to domain_owner;
alter function private.billing_order_link_checkout(private.job_context, uuid, uuid, bigint, text)
  owner to domain_owner;
alter function private.admin_billing_order_resolve(private.admin_context, uuid, uuid, bigint, text, text)
  owner to domain_owner;

revoke all on function private.billing_order_link_checkout(private.job_context, uuid, uuid, bigint, text)
  from public, anon, authenticated, account_executor, admin_executor, recovery_executor, billing_ingress;
grant execute on function private.billing_order_link_checkout(private.job_context, uuid, uuid, bigint, text)
  to job_executor;

revoke all on function private.admin_billing_order_list(private.admin_context, timestamptz, integer, text),
  private.admin_billing_order_resolve(private.admin_context, uuid, uuid, bigint, text, text)
  from public, anon, authenticated, account_executor, job_executor, recovery_executor, billing_ingress;
grant execute on function private.admin_billing_order_list(private.admin_context, timestamptz, integer, text),
  private.admin_billing_order_resolve(private.admin_context, uuid, uuid, bigint, text, text)
  to admin_executor;
