-- M3: one-time delivery metadata and atomic subscription-code redemption.

create extension if not exists pgcrypto;
grant usage on schema extensions to domain_owner;

create or replace function private.admin_batch_create(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_plan_id uuid,
  p_name text,
  p_quantity integer,
  p_duration_value integer,
  p_duration_unit text,
  p_expires_at timestamptz,
  p_delivery_deadline timestamptz,
  p_creation_operation_id uuid,
  p_delivery_receipt_hmac text,
  p_codes jsonb
)
returns table (batch_id uuid, status text, quantity integer)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_batch public.redemption_code_batches;
  v_plan public.plans;
  v_platform public.platforms;
  v_code jsonb;
  v_count integer;
begin
  if (p_ctx).admin_user_id is null or p_platform_id is null or p_plan_id is null
     or p_name is null or length(p_name) not between 1 and 256
     or p_quantity not between 1 and 1000 or p_duration_value <= 0
     or p_duration_unit not in ('day', 'month', 'year') or p_expires_at is null
     or p_delivery_deadline is null or p_creation_operation_id is null
     or p_delivery_receipt_hmac is null or jsonb_typeof(p_codes) <> 'array'
     or jsonb_array_length(p_codes) <> p_quantity then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if not exists (select 1 from private.system_admin where user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active) then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
  select * into v_platform from public.platforms p where p.id = p_platform_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  select * into v_plan from public.plans p where p.platform_id = p_platform_id and p.id = p_plan_id;
  if not found or v_plan.status <> 'active' or v_plan.kind <> 'paid' then
    raise exception using errcode = 'P0001', message = 'plan_unavailable';
  end if;
  if p_expires_at <= clock_timestamp() or p_delivery_deadline <= clock_timestamp() then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_batch from public.redemption_code_batches b
  where b.platform_id = p_platform_id and b.creation_operation_id = p_creation_operation_id;
  if found then return query select v_batch.id, v_batch.status, v_batch.quantity; return; end if;

  insert into public.redemption_code_batches (
    platform_id, plan_id, name, quantity, duration_value, duration_unit,
    expires_at, delivery_deadline, delivery_session_id, delivery_receipt_hmac,
    created_by, creation_operation_id
  ) values (
    p_platform_id, p_plan_id, p_name, p_quantity, p_duration_value, p_duration_unit,
    p_expires_at, p_delivery_deadline, (p_ctx).session_id, lower(p_delivery_receipt_hmac),
    (p_ctx).admin_user_id, p_creation_operation_id
  ) returning * into v_batch;

  for v_code in select value from jsonb_array_elements(p_codes) loop
    if jsonb_typeof(v_code) <> 'object'
       or length(coalesce(v_code->>'code_hmac', '')) <> 64
       or coalesce(v_code->>'code_hmac', '') !~ '^[0-9a-fA-F]{64}$'
       or nullif(v_code->>'hmac_key_version', '') is null then
      raise exception using errcode = '22023', message = 'invalid_input';
    end if;
    insert into public.redemption_codes (
      platform_id, batch_id, plan_id, code_hmac, hmac_key_version, code_prefix, code_suffix
    ) values (
      p_platform_id, v_batch.id, p_plan_id, lower(v_code->>'code_hmac'),
      (v_code->>'hmac_key_version')::smallint, v_code->>'code_prefix', v_code->>'code_suffix'
    );
  end loop;
  perform private.audit_append((p_ctx).request_id, 'admin', (p_ctx).admin_user_id, p_platform_id, null,
    'redemption.batch_created', 'redemption_code_batch', v_batch.id, null, null,
    jsonb_build_object('quantity', p_quantity, 'plan_id', p_plan_id, 'status', 'pending_delivery'));
  return query select v_batch.id, v_batch.status, v_batch.quantity;
end;
$$;

create or replace function private.admin_batch_confirm(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_batch_id uuid,
  p_receipt_hmac text
)
returns table (batch_id uuid, status text, delivered_at timestamptz)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_batch public.redemption_code_batches;
begin
  if not exists (select 1 from private.system_admin where user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active) then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
  select * into v_batch from public.redemption_code_batches b
  where b.platform_id = p_platform_id and b.id = p_batch_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  if v_batch.status = 'disabled' then raise exception using errcode = 'P0001', message = 'batch_disabled'; end if;
  if v_batch.status = 'active' then return query select v_batch.id, v_batch.status, v_batch.delivered_at; return; end if;
  if v_batch.delivery_session_id <> (p_ctx).session_id or v_batch.delivery_receipt_hmac <> lower(p_receipt_hmac)
     or v_batch.delivery_deadline <= clock_timestamp() then
    raise exception using errcode = '42501', message = 'delivery_confirmation_invalid';
  end if;
  update public.redemption_code_batches b
  set status = 'active', delivered_at = clock_timestamp(), delivery_confirmed_by = (p_ctx).admin_user_id
  where b.id = v_batch.id
  returning b.id, b.status, b.delivered_at into batch_id, status, delivered_at;
  perform private.audit_append((p_ctx).request_id, 'admin', (p_ctx).admin_user_id, p_platform_id, null,
    'redemption.batch_confirmed', 'redemption_code_batch', batch_id, null, null, '{}'::jsonb);
  return next;
end;
$$;

create or replace function private.admin_batch_disable(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_batch_id uuid
)
returns table (batch_id uuid, status text)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_batch public.redemption_code_batches;
begin
  if not exists (select 1 from private.system_admin where user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active) then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
  select * into v_batch from public.redemption_code_batches b
  where b.platform_id = p_platform_id and b.id = p_batch_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  update public.redemption_code_batches b set status = 'disabled' where b.id = v_batch.id
  returning b.id, b.status into batch_id, status;
  perform private.audit_append((p_ctx).request_id, 'admin', (p_ctx).admin_user_id, p_platform_id, null,
    'redemption.batch_disabled', 'redemption_code_batch', batch_id, null, null, '{}'::jsonb);
  return next;
end;
$$;

create or replace function private.redeem_subscription_code(
  p_ctx private.account_context,
  p_code_hmac text,
  p_hmac_key_version smallint,
  p_idempotency_key text
)
returns table (outcome text, grant_id uuid, plan_id uuid, error_code text)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_authorization text;
  v_account_id uuid;
  v_account public.platform_accounts;
  v_code public.redemption_codes;
  v_batch public.redemption_code_batches;
  v_claim record;
  v_new_claim boolean := false;
  v_hash bytea;
  v_response jsonb;
  v_grant record;
  v_error text;
begin
  if p_idempotency_key is null or length(p_idempotency_key) not between 1 and 128
     or p_code_hmac is null or length(p_code_hmac) <> 64 or p_hmac_key_version is null then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select principal.authorization, principal.platform_account_id into v_authorization, v_account_id
  from private.account_principal(p_ctx) principal;
  if v_authorization <> 'allowed' then raise exception using errcode = '42501', message = v_authorization; end if;
  select * into v_account from public.platform_accounts a
  where a.platform_id = (p_ctx).platform_id and a.id = v_account_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  v_hash := extensions.digest(convert_to(lower(p_code_hmac) || ':' || p_hmac_key_version::text, 'utf8'), 'sha256');
  insert into private.idempotency_keys (
    platform_id, platform_account_id, operation, actor_scope, idempotency_key, request_hash
  ) values (
    (p_ctx).platform_id, v_account_id, 'redeem_subscription_code', 'user:' || (p_ctx).user_id::text,
    p_idempotency_key, v_hash
  ) on conflict (platform_id, platform_account_id, operation, actor_scope, idempotency_key)
    do nothing returning true into v_new_claim;
  if not coalesce(v_new_claim, false) then
    select * into v_claim from private.idempotency_keys i
    where i.platform_id = (p_ctx).platform_id and i.platform_account_id = v_account_id
      and i.operation = 'redeem_subscription_code' and i.actor_scope = 'user:' || (p_ctx).user_id::text
      and i.idempotency_key = p_idempotency_key for update;
    if v_claim.request_hash <> v_hash then raise exception using errcode = '23505', message = 'idempotency_conflict'; end if;
  end if;
  if not coalesce(v_new_claim, false) then
    if v_claim.state = 'completed' then
      if v_claim.response_body->>'error_code' is not null then
        return query select 'rejected'::text, null::uuid, null::uuid, v_claim.response_body->>'error_code';
      else
        return query select 'replayed'::text, (v_claim.response_body->>'grant_id')::uuid,
          (v_claim.response_body->>'plan_id')::uuid, null::text;
      end if;
      return;
    end if;
  end if;

  select * into v_code from public.redemption_codes c
  where c.platform_id = (p_ctx).platform_id and c.hmac_key_version = p_hmac_key_version and c.code_hmac = lower(p_code_hmac) for update;
  if not found then v_error := 'INVALID_CODE';
  else
    select * into v_batch from public.redemption_code_batches b where b.id = v_code.batch_id for update;
    if v_account.status <> 'active' then v_error := 'ACCOUNT_SUSPENDED';
    elsif v_code.status <> 'unused' then v_error := 'CODE_ALREADY_REDEEMED';
    elsif v_batch.status <> 'active' or v_batch.expires_at <= clock_timestamp() then v_error := 'CODE_EXPIRED';
    elsif exists (select 1 from public.plans p where p.id = v_code.plan_id and (p.status <> 'active' or p.kind <> 'paid')) then v_error := 'PLAN_CONFLICT';
    end if;
  end if;
  if v_error is not null then
    insert into public.redemption_events(platform_id, platform_account_id, redemption_code_id, result, error_code, request_id)
      values ((p_ctx).platform_id, v_account_id, v_code.id, 'rejected', v_error, (p_ctx).request_id);
    perform private.idempotency_finalize((p_ctx).platform_id, v_account_id, 'redeem_subscription_code', 'user:' || (p_ctx).user_id::text, p_idempotency_key, v_hash, 409,
      jsonb_build_object('error_code', v_error));
    return query select 'rejected'::text, null::uuid, null::uuid, v_error;
    return;
  end if;

  begin
    select * into v_grant from private.entitlement_apply(
      (p_ctx).platform_id, v_account_id, v_code.plan_id, 'redemption_code', v_code.id,
      v_batch.duration_value, v_batch.duration_unit, (p_ctx).user_id, 'subscription code redemption', v_code.id
    );
  exception when sqlstate 'P0001' then
    v_error := upper(replace(sqlerrm, ' ', '_'));
  end;
  if v_error is not null then
    insert into public.redemption_events(platform_id, platform_account_id, redemption_code_id, result, error_code, request_id)
      values ((p_ctx).platform_id, v_account_id, v_code.id, 'rejected', v_error, (p_ctx).request_id);
    perform private.idempotency_finalize((p_ctx).platform_id, v_account_id, 'redeem_subscription_code', 'user:' || (p_ctx).user_id::text, p_idempotency_key, v_hash, 409,
      jsonb_build_object('error_code', v_error));
    return query select 'rejected'::text, null::uuid, null::uuid, v_error;
    return;
  end if;
  update public.redemption_codes c set status = 'redeemed', redeemed_by_platform_account_id = v_account_id, redeemed_at = clock_timestamp()
  where c.id = v_code.id;
  insert into public.redemption_events(platform_id, platform_account_id, redemption_code_id, grant_id, result, request_id)
    values ((p_ctx).platform_id, v_account_id, v_code.id, v_grant.grant_id, 'success', (p_ctx).request_id);
  v_response := jsonb_build_object('grant_id', v_grant.grant_id, 'plan_id', v_code.plan_id);
  perform private.idempotency_finalize((p_ctx).platform_id, v_account_id, 'redeem_subscription_code', 'user:' || (p_ctx).user_id::text, p_idempotency_key, v_hash, 200, v_response);
  return query select 'applied'::text, v_grant.grant_id, v_code.plan_id, null::text;
end;
$$;

alter function private.admin_batch_create(private.admin_context, uuid, uuid, text, integer, integer, text, timestamptz, timestamptz, uuid, text, jsonb) owner to domain_owner;
alter function private.admin_batch_confirm(private.admin_context, uuid, uuid, text) owner to domain_owner;
alter function private.admin_batch_disable(private.admin_context, uuid, uuid) owner to domain_owner;
alter function private.redeem_subscription_code(private.account_context, text, smallint, text) owner to domain_owner;

revoke all on function private.admin_batch_create(private.admin_context, uuid, uuid, text, integer, integer, text, timestamptz, timestamptz, uuid, text, jsonb) from public, anon, authenticated, account_executor, job_executor, recovery_executor;
revoke all on function private.admin_batch_confirm(private.admin_context, uuid, uuid, text) from public, anon, authenticated, account_executor, job_executor, recovery_executor;
revoke all on function private.admin_batch_disable(private.admin_context, uuid, uuid) from public, anon, authenticated, account_executor, job_executor, recovery_executor;
revoke all on function private.redeem_subscription_code(private.account_context, text, smallint, text) from public, anon, authenticated, admin_executor, job_executor, recovery_executor;
grant execute on function private.admin_batch_create(private.admin_context, uuid, uuid, text, integer, integer, text, timestamptz, timestamptz, uuid, text, jsonb) to admin_executor;
grant execute on function private.admin_batch_confirm(private.admin_context, uuid, uuid, text) to admin_executor;
grant execute on function private.admin_batch_disable(private.admin_context, uuid, uuid) to admin_executor;
grant execute on function private.redeem_subscription_code(private.account_context, text, smallint, text) to account_executor;
