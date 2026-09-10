-- M3: make batch creation retries safe at the domain/API boundary.
-- A replay may return metadata only; generated plaintext is never recoverable.

alter table public.redemption_code_batches
  add column creation_request_hash bytea;

update public.redemption_code_batches b
set creation_request_hash = extensions.digest(
  convert_to(
    jsonb_build_array(
      b.platform_id::text,
      b.plan_id::text,
      b.name,
      b.quantity,
      b.duration_value,
      b.duration_unit,
      b.expires_at,
      b.delivery_deadline
    )::text,
    'utf8'
  ),
  'sha256'
)
where b.creation_request_hash is null;

comment on column public.redemption_code_batches.creation_request_hash is
  'Hash of the logical batch-create request; replay validation excludes plaintext delivery material.';

drop function if exists private.admin_batch_create(
  private.admin_context,
  uuid,
  uuid,
  text,
  integer,
  integer,
  text,
  timestamptz,
  timestamptz,
  uuid,
  text,
  jsonb
);

create function private.admin_batch_create(
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
returns table (
  batch_id uuid,
  status text,
  quantity integer,
  creation_state text
)
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
  v_request_hash bytea;
begin
  if (p_ctx).admin_user_id is null or p_platform_id is null or p_plan_id is null
     or p_name is null or length(p_name) not between 1 and 256
     or p_quantity not between 1 and 1000 or p_duration_value is null or p_duration_value <= 0
     or p_duration_unit not in ('day', 'month', 'year') or p_expires_at is null
     or p_delivery_deadline is null or p_creation_operation_id is null
     or p_delivery_receipt_hmac is null or coalesce(jsonb_typeof(p_codes), '') <> 'array'
     or coalesce(jsonb_array_length(p_codes), -1) <> p_quantity then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if not exists (select 1 from private.system_admin where user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active) then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
  select * into v_platform from public.platforms p where p.id = p_platform_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;

  v_request_hash := extensions.digest(
    convert_to(
      jsonb_build_array(
        p_platform_id::text,
        p_plan_id::text,
        p_name,
        p_quantity,
        p_duration_value,
        p_duration_unit,
        p_expires_at,
        p_delivery_deadline
      )::text,
      'utf8'
    ),
    'sha256'
  );

  select * into v_batch from public.redemption_code_batches b
  where b.platform_id = p_platform_id and b.creation_operation_id = p_creation_operation_id
  for update;
  if found then
    if v_batch.creation_request_hash is not null
       and v_batch.creation_request_hash <> v_request_hash then
      raise exception using errcode = '23505', message = 'idempotency_conflict';
    end if;
    return query select v_batch.id, v_batch.status, v_batch.quantity, 'replayed_existing'::text;
    return;
  end if;

  select * into v_plan from public.plans p where p.platform_id = p_platform_id and p.id = p_plan_id;
  if not found or v_plan.status <> 'active' or v_plan.kind <> 'paid' then
    raise exception using errcode = 'P0001', message = 'plan_unavailable';
  end if;
  if p_expires_at <= clock_timestamp() or p_delivery_deadline <= clock_timestamp() then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  insert into public.redemption_code_batches (
    platform_id, plan_id, name, quantity, duration_value, duration_unit,
    expires_at, delivery_deadline, delivery_session_id, delivery_receipt_hmac,
    created_by, creation_operation_id, creation_request_hash
  ) values (
    p_platform_id, p_plan_id, p_name, p_quantity, p_duration_value, p_duration_unit,
    p_expires_at, p_delivery_deadline, (p_ctx).session_id, lower(p_delivery_receipt_hmac),
    (p_ctx).admin_user_id, p_creation_operation_id, v_request_hash
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
  return query select v_batch.id, v_batch.status, v_batch.quantity, 'created'::text;
end;
$$;

alter function private.admin_batch_create(
  private.admin_context,
  uuid,
  uuid,
  text,
  integer,
  integer,
  text,
  timestamptz,
  timestamptz,
  uuid,
  text,
  jsonb
) owner to domain_owner;

revoke all on function private.admin_batch_create(
  private.admin_context,
  uuid,
  uuid,
  text,
  integer,
  integer,
  text,
  timestamptz,
  timestamptz,
  uuid,
  text,
  jsonb
) from public, anon, authenticated, account_executor, job_executor, recovery_executor;

grant execute on function private.admin_batch_create(
  private.admin_context,
  uuid,
  uuid,
  text,
  integer,
  integer,
  text,
  timestamptz,
  timestamptz,
  uuid,
  text,
  jsonb
) to admin_executor;
