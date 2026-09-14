-- RC-06 / TASK-0609
-- Persist the complete Admin request identity before checking the optimistic
-- version. A client retry after a lost response must replay the original
-- result; a new operation with an old version must still fail closed.

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
  v_existing private.admin_idempotency%rowtype;
  v_scope text;
  v_hash bytea;
  v_new boolean := false;
  v_response jsonb;
begin
  perform private.billing_admin_assert(p_ctx);
  if p_order_id is null or p_operation_id is null or p_expected_version is null
     or p_expected_version < 1 or p_reason is null or length(p_reason) not between 1 and 1024 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  select * into v_order from public.billing_orders where id = p_order_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  v_scope := case
    when v_order.platform_id is null then 'global'
    else 'platform:' || v_order.platform_id::text
  end;
  v_hash := extensions.digest(
    convert_to(
      p_order_id::text || ':' || p_expected_version::text || ':' || p_reason,
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
    'billing_order_requery',
    p_operation_id::text,
    v_hash
  ) on conflict (admin_user_id, scope, operation, idempotency_key)
    do nothing returning true into v_new;
  if not coalesce(v_new, false) then
    select * into v_existing from private.admin_idempotency i
    where i.admin_user_id = (p_ctx).admin_user_id and i.scope = v_scope
      and i.operation = 'billing_order_requery' and i.idempotency_key = p_operation_id::text
    for update;
    if v_existing.request_hash <> v_hash then
      raise exception using errcode = '23505', message = 'idempotency_conflict';
    end if;
    if v_existing.state = 'completed' then
      return query select
        (v_existing.response_body->>'order_id')::uuid,
        (v_existing.response_body->>'job_id')::uuid,
        v_existing.response_body->>'state',
        (v_existing.response_body->>'admin_version')::bigint,
        coalesce((v_existing.response_body->>'replayed')::boolean, false);
      return;
    end if;
    raise exception using errcode = 'P0001', message = 'operation_in_progress';
  end if;

  if v_order.admin_version <> p_expected_version then
    raise exception using errcode = '40001', message = 'precondition_failed';
  end if;
  select * into v_job from public.billing_processing_jobs j
  where j.operation_id = p_operation_id
  for update;
  if found then
    if v_job.billing_order_id is distinct from p_order_id then
      raise exception using errcode = '23505', message = 'idempotency_conflict';
    end if;
    v_response := jsonb_build_object(
      'order_id', v_order.id,
      'job_id', v_job.id,
      'state', v_job.state,
      'admin_version', v_order.admin_version,
      'replayed', true
    );
    update private.admin_idempotency i
    set state = 'completed', response_status = 202, response_body = v_response
    where i.admin_user_id = (p_ctx).admin_user_id and i.scope = v_scope
      and i.operation = 'billing_order_requery' and i.idempotency_key = p_operation_id::text;
    return query select v_job.billing_order_id, v_job.id, v_job.state,
      v_order.admin_version, true;
    return;
  end if;

  select * into v_job from public.billing_processing_jobs j
  where j.billing_order_id = p_order_id and j.state in ('pending', 'processing', 'retryable')
  order by j.created_at desc limit 1
  for update;
  if found then
    v_response := jsonb_build_object(
      'order_id', v_order.id,
      'job_id', v_job.id,
      'state', v_job.state,
      'admin_version', v_order.admin_version,
      'replayed', true
    );
    update private.admin_idempotency i
    set state = 'completed', response_status = 202, response_body = v_response
    where i.admin_user_id = (p_ctx).admin_user_id and i.scope = v_scope
      and i.operation = 'billing_order_requery' and i.idempotency_key = p_operation_id::text;
    return query select v_job.billing_order_id, v_job.id, v_job.state,
      v_order.admin_version, true;
    return;
  end if;

  insert into public.billing_processing_jobs(job_kind, billing_order_id, operation_id, state)
  values ('reconciliation', p_order_id, p_operation_id, 'pending')
  returning * into v_job;
  v_response := jsonb_build_object(
    'order_id', v_order.id,
    'job_id', v_job.id,
    'state', v_job.state,
    'admin_version', v_order.admin_version,
    'replayed', false
  );
  update private.admin_idempotency i
  set state = 'completed', response_status = 202, response_body = v_response
  where i.admin_user_id = (p_ctx).admin_user_id and i.scope = v_scope
    and i.operation = 'billing_order_requery' and i.idempotency_key = p_operation_id::text;
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

  if v_order.admin_version <> p_expected_version then
    raise exception using errcode = '40001', message = 'precondition_failed';
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

alter function private.admin_billing_order_requery(private.admin_context, uuid, uuid, bigint, text)
  owner to domain_owner;
alter function private.admin_billing_order_resolve(private.admin_context, uuid, uuid, bigint, text, text)
  owner to domain_owner;

revoke all on function private.admin_billing_order_requery(private.admin_context, uuid, uuid, bigint, text),
  private.admin_billing_order_resolve(private.admin_context, uuid, uuid, bigint, text, text)
  from public, anon, authenticated, account_executor, job_executor, recovery_executor, billing_ingress;
grant execute on function private.admin_billing_order_requery(private.admin_context, uuid, uuid, bigint, text),
  private.admin_billing_order_resolve(private.admin_context, uuid, uuid, bigint, text, text)
  to admin_executor;
