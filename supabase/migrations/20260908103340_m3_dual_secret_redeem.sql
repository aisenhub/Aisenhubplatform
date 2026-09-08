-- M3 API rotation: select a matching current/previous HMAC before claiming
-- the public idempotency key. Trying candidates in separate calls would make
-- an invalid current-version attempt finalize the request before the old
-- verify-only version can be checked.
create or replace function private.redeem_subscription_code_candidates(
  p_ctx private.account_context,
  p_code_hmacs text[],
  p_hmac_key_versions smallint[],
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
  v_code_hmac text;
  v_hmac_key_version smallint;
begin
  if p_idempotency_key is null or length(p_idempotency_key) not between 1 and 128
     or p_code_hmacs is null
     or coalesce(array_length(p_code_hmacs, 1), 0) not between 1 and 2
     or p_hmac_key_versions is null
     or array_length(p_code_hmacs, 1) <> array_length(p_hmac_key_versions, 1)
     or exists (
       select 1 from unnest(p_code_hmacs) as candidate(value)
       where candidate.value is null or length(candidate.value) <> 64
     )
     or exists (
       select 1 from unnest(p_hmac_key_versions) as candidate(value)
       where candidate.value is null or candidate.value < 1
     ) then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  select principal.authorization, principal.platform_account_id
    into v_authorization, v_account_id
  from private.account_principal(p_ctx) principal;
  if v_authorization <> 'allowed' then
    raise exception using errcode = '42501', message = v_authorization;
  end if;

  select * into v_account from public.platform_accounts a
  where a.platform_id = (p_ctx).platform_id and a.id = v_account_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;

  -- Pick the first matching candidate without locking the code. The account
  -- lock above preserves the original lock order; the code is locked below
  -- only after the idempotency claim has been established.
  select candidate.code_hmac, candidate.key_version
    into v_code_hmac, v_hmac_key_version
  from unnest(p_code_hmacs, p_hmac_key_versions) with ordinality
    as candidate(code_hmac, key_version, position)
  join public.redemption_codes c
    on c.platform_id = (p_ctx).platform_id
   and c.hmac_key_version = candidate.key_version
   and c.code_hmac = lower(candidate.code_hmac)
  order by candidate.position
  limit 1;

  if v_code_hmac is null then
    v_code_hmac := lower(p_code_hmacs[1]);
    v_hmac_key_version := p_hmac_key_versions[1];
  end if;
  v_hash := extensions.digest(
    convert_to(lower(v_code_hmac) || ':' || v_hmac_key_version::text, 'utf8'),
    'sha256'
  );
  insert into private.idempotency_keys (
    platform_id, platform_account_id, operation, actor_scope, idempotency_key, request_hash
  ) values (
    (p_ctx).platform_id, v_account_id, 'redeem_subscription_code',
    'user:' || (p_ctx).user_id::text, p_idempotency_key, v_hash
  ) on conflict (platform_id, platform_account_id, operation, actor_scope, idempotency_key)
    do nothing returning true into v_new_claim;
  if not coalesce(v_new_claim, false) then
    select * into v_claim from private.idempotency_keys i
    where i.platform_id = (p_ctx).platform_id and i.platform_account_id = v_account_id
      and i.operation = 'redeem_subscription_code'
      and i.actor_scope = 'user:' || (p_ctx).user_id::text
      and i.idempotency_key = p_idempotency_key for update;
    if v_claim.request_hash <> v_hash then
      raise exception using errcode = '23505', message = 'idempotency_conflict';
    end if;
  end if;
  if not coalesce(v_new_claim, false) and v_claim.state = 'completed' then
    if v_claim.response_body->>'error_code' is not null then
      return query select 'rejected'::text, null::uuid, null::uuid,
        v_claim.response_body->>'error_code';
    else
      return query select 'replayed'::text,
        (v_claim.response_body->>'grant_id')::uuid,
        (v_claim.response_body->>'plan_id')::uuid, null::text;
    end if;
    return;
  end if;

  select * into v_code from public.redemption_codes c
  where c.platform_id = (p_ctx).platform_id
    and c.hmac_key_version = v_hmac_key_version
    and c.code_hmac = lower(v_code_hmac) for update;
  if not found then
    v_error := 'INVALID_CODE';
  else
    select * into v_batch from public.redemption_code_batches b
    where b.id = v_code.batch_id for update;
    if v_account.status <> 'active' then v_error := 'ACCOUNT_SUSPENDED';
    elsif v_code.status <> 'unused' then v_error := 'CODE_ALREADY_REDEEMED';
    elsif v_batch.status <> 'active' or v_batch.expires_at <= clock_timestamp() then
      v_error := 'CODE_EXPIRED';
    elsif exists (
      select 1 from public.plans p
      where p.id = v_code.plan_id and (p.status <> 'active' or p.kind <> 'paid')
    ) then v_error := 'PLAN_CONFLICT';
    end if;
  end if;
  if v_error is not null then
    insert into public.redemption_events(
      platform_id, platform_account_id, redemption_code_id, result, error_code, request_id
    ) values (
      (p_ctx).platform_id, v_account_id, v_code.id, 'rejected', v_error, (p_ctx).request_id
    );
    perform private.idempotency_finalize(
      (p_ctx).platform_id, v_account_id, 'redeem_subscription_code',
      'user:' || (p_ctx).user_id::text, p_idempotency_key, v_hash, 409,
      jsonb_build_object('error_code', v_error)
    );
    return query select 'rejected'::text, null::uuid, null::uuid, v_error;
    return;
  end if;

  begin
    select * into v_grant from private.entitlement_apply(
      (p_ctx).platform_id, v_account_id, v_code.plan_id, 'redemption_code', v_code.id,
      v_batch.duration_value, v_batch.duration_unit, (p_ctx).user_id,
      'subscription code redemption', v_code.id
    );
  exception when sqlstate 'P0001' then
    v_error := upper(replace(sqlerrm, ' ', '_'));
  end;
  if v_error is not null then
    insert into public.redemption_events(
      platform_id, platform_account_id, redemption_code_id, result, error_code, request_id
    ) values (
      (p_ctx).platform_id, v_account_id, v_code.id, 'rejected', v_error, (p_ctx).request_id
    );
    perform private.idempotency_finalize(
      (p_ctx).platform_id, v_account_id, 'redeem_subscription_code',
      'user:' || (p_ctx).user_id::text, p_idempotency_key, v_hash, 409,
      jsonb_build_object('error_code', v_error)
    );
    return query select 'rejected'::text, null::uuid, null::uuid, v_error;
    return;
  end if;

  update public.redemption_codes c
  set status = 'redeemed', redeemed_by_platform_account_id = v_account_id,
      redeemed_at = clock_timestamp()
  where c.id = v_code.id;
  insert into public.redemption_events(
    platform_id, platform_account_id, redemption_code_id, grant_id, result, request_id
  ) values (
    (p_ctx).platform_id, v_account_id, v_code.id, v_grant.grant_id, 'success', (p_ctx).request_id
  );
  v_response := jsonb_build_object('grant_id', v_grant.grant_id, 'plan_id', v_code.plan_id);
  perform private.idempotency_finalize(
    (p_ctx).platform_id, v_account_id, 'redeem_subscription_code',
    'user:' || (p_ctx).user_id::text, p_idempotency_key, v_hash, 200, v_response
  );
  return query select 'applied'::text, v_grant.grant_id, v_code.plan_id, null::text;
end;
$$;

create or replace function private.redeem_subscription_code(
  p_ctx private.account_context,
  p_code_hmac text,
  p_hmac_key_version smallint,
  p_idempotency_key text
)
returns table (outcome text, grant_id uuid, plan_id uuid, error_code text)
language sql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
  select * from private.redeem_subscription_code_candidates(
    p_ctx, array[p_code_hmac], array[p_hmac_key_version], p_idempotency_key
  );
$$;

alter function private.redeem_subscription_code_candidates(
  private.account_context, text[], smallint[], text
) owner to domain_owner;
alter function private.redeem_subscription_code(
  private.account_context, text, smallint, text
) owner to domain_owner;
revoke all on function private.redeem_subscription_code_candidates(
  private.account_context, text[], smallint[], text
) from public, anon, authenticated, admin_executor, job_executor, recovery_executor;
grant execute on function private.redeem_subscription_code_candidates(
  private.account_context, text[], smallint[], text
) to account_executor;

create or replace function private.admin_batch_confirm_candidates(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_batch_id uuid,
  p_receipt_hmacs text[]
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
  if p_receipt_hmacs is null
     or coalesce(array_length(p_receipt_hmacs, 1), 0) not between 1 and 2
     or exists (
       select 1 from unnest(p_receipt_hmacs) as candidate(value)
       where candidate.value is null or length(candidate.value) <> 64
     ) then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if not exists (select 1 from private.system_admin where user_id = (p_ctx).admin_user_id)
     or not exists (
       select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id)
       where active
     ) then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
  select * into v_batch from public.redemption_code_batches b
  where b.platform_id = p_platform_id and b.id = p_batch_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  if v_batch.status = 'disabled' then
    raise exception using errcode = 'P0001', message = 'batch_disabled';
  end if;
  if v_batch.status = 'active' then
    return query select v_batch.id, v_batch.status, v_batch.delivered_at;
    return;
  end if;
  if v_batch.delivery_session_id <> (p_ctx).session_id
     or not (v_batch.delivery_receipt_hmac = any(p_receipt_hmacs))
     or v_batch.delivery_deadline <= clock_timestamp() then
    raise exception using errcode = '42501', message = 'delivery_confirmation_invalid';
  end if;
  update public.redemption_code_batches b
  set status = 'active', delivered_at = clock_timestamp(),
      delivery_confirmed_by = (p_ctx).admin_user_id
  where b.id = v_batch.id
  returning b.id, b.status, b.delivered_at into batch_id, status, delivered_at;
  perform private.audit_append(
    (p_ctx).request_id, 'admin', (p_ctx).admin_user_id, p_platform_id, null,
    'redemption.batch_confirmed', 'redemption_code_batch', batch_id, null, null, '{}'::jsonb
  );
  return next;
end;
$$;

create or replace function private.admin_batch_confirm(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_batch_id uuid,
  p_receipt_hmac text
)
returns table (batch_id uuid, status text, delivered_at timestamptz)
language sql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
  select * from private.admin_batch_confirm_candidates(
    p_ctx, p_platform_id, p_batch_id, array[p_receipt_hmac]
  );
$$;

alter function private.admin_batch_confirm_candidates(
  private.admin_context, uuid, uuid, text[]
) owner to domain_owner;
alter function private.admin_batch_confirm(
  private.admin_context, uuid, uuid, text
) owner to domain_owner;
revoke all on function private.admin_batch_confirm_candidates(
  private.admin_context, uuid, uuid, text[]
) from public, anon, authenticated, account_executor, job_executor, recovery_executor;
grant execute on function private.admin_batch_confirm_candidates(
  private.admin_context, uuid, uuid, text[]
) to admin_executor;
