-- BILL-03: versioned redemption snapshots, finite catalog terms and an
-- auditable admin correction chain. Legacy batches remain readable/redeemable
-- with their original plan/duration/HMAC interpretation.

alter table public.redemption_code_batches
  add column model_version smallint not null default 1,
  add column product_code text,
  add column term_kind_snapshot text,
  add column duration_value_snapshot integer,
  add column duration_unit_snapshot text;

alter table public.redemption_code_batches
  add constraint redemption_batch_model_version_check
    check (model_version in (1, 2)),
  add constraint redemption_batch_snapshot_check
    check (
      (model_version = 1
        and product_code is null
        and term_kind_snapshot is null
        and duration_value_snapshot is null
        and duration_unit_snapshot is null)
      or
      (model_version = 2
        and product_code in ('monthly', 'yearly', 'lifetime')
        and term_kind_snapshot = 'finite'
        and duration_value_snapshot = duration_value
        and duration_unit_snapshot = duration_unit
        and (
          (product_code = 'monthly' and duration_value_snapshot = 1 and duration_unit_snapshot = 'month')
          or (product_code = 'yearly' and duration_value_snapshot = 1 and duration_unit_snapshot = 'year')
          or (product_code = 'lifetime' and duration_value_snapshot = 99 and duration_unit_snapshot = 'year')
        ))
    );

create index redemption_batch_product_idx
  on public.redemption_code_batches(platform_id, product_code, model_version, created_at desc);

create or replace function private.redemption_batch_snapshot_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, private
as $$
begin
  if old.model_version <> new.model_version
     or old.plan_id <> new.plan_id
     or old.name <> new.name
     or old.quantity <> new.quantity
     or old.duration_value <> new.duration_value
     or old.duration_unit <> new.duration_unit
     or old.product_code is distinct from new.product_code
     or old.term_kind_snapshot is distinct from new.term_kind_snapshot
     or old.duration_value_snapshot is distinct from new.duration_value_snapshot
     or old.duration_unit_snapshot is distinct from new.duration_unit_snapshot
     or old.creation_operation_id <> new.creation_operation_id then
    raise exception using errcode = 'P0001', message = 'redemption_batch_snapshot_immutable';
  end if;
  return new;
end;
$$;

create trigger redemption_batch_snapshot_guard
before update on public.redemption_code_batches
for each row execute function private.redemption_batch_snapshot_guard();

create or replace function private.admin_batch_create_v2(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_product_code text,
  p_name text,
  p_quantity integer,
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
  v_config public.platform_subscription_config;
  v_plan public.plans;
  v_product public.subscription_products;
  v_code jsonb;
  v_request_hash bytea;
begin
  if (p_ctx).admin_user_id is null or p_platform_id is null
     or p_product_code is null or p_product_code not in ('monthly', 'yearly', 'lifetime')
     or p_name is null or length(p_name) not between 1 and 256
     or p_quantity not between 1 and 1000
     or p_expires_at is null or p_delivery_deadline is null
     or p_creation_operation_id is null or p_delivery_receipt_hmac is null
     or coalesce(jsonb_typeof(p_codes), '') <> 'array'
     or coalesce(jsonb_array_length(p_codes), -1) <> p_quantity then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if not exists (select 1 from private.system_admin where user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active) then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;

  perform 1 from public.platforms p
  where p.id = p_platform_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;

  select c.* into v_config
  from public.platform_subscription_config c
  where c.platform_id = p_platform_id
  for update;
  if not found or v_config.paid_plan_id is null then
    raise exception using errcode = 'P0001', message = 'plan_unavailable';
  end if;

  select p.* into v_plan
  from public.plans p
  where p.platform_id = p_platform_id and p.id = v_config.paid_plan_id
  for update;
  if not found or v_plan.kind <> 'paid' or v_plan.status <> 'active' then
    raise exception using errcode = 'P0001', message = 'plan_unavailable';
  end if;

  select product.* into v_product
  from public.subscription_products product
  where product.code = p_product_code and product.status = 'active';
  if not found or v_product.term_kind <> 'finite'
     or v_product.duration_value is null or v_product.duration_unit is null then
    raise exception using errcode = 'P0001', message = 'product_unavailable';
  end if;
  if p_expires_at <= clock_timestamp() or p_delivery_deadline <= clock_timestamp() then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  v_request_hash := extensions.digest(
    convert_to(
      jsonb_build_array(
        p_platform_id::text,
        v_plan.id::text,
        p_product_code,
        p_name,
        p_quantity,
        v_product.term_kind,
        v_product.duration_value,
        v_product.duration_unit,
        p_expires_at,
        p_delivery_deadline
      )::text,
      'utf8'
    ),
    'sha256'
  );

  select b.* into v_batch
  from public.redemption_code_batches b
  where b.platform_id = p_platform_id
    and b.creation_operation_id = p_creation_operation_id
  for update;
  if found then
    if btrim(encode(v_batch.creation_request_hash, 'hex')) <> btrim(encode(v_request_hash, 'hex')) then
      raise exception using errcode = '23505', message = 'idempotency_conflict';
    end if;
    return query select v_batch.id, v_batch.status, v_batch.quantity, 'replayed_existing'::text;
    return;
  end if;

  insert into public.redemption_code_batches (
    platform_id, plan_id, name, quantity, duration_value, duration_unit,
    expires_at, delivery_deadline, delivery_session_id, delivery_receipt_hmac,
    created_by, creation_operation_id, creation_request_hash,
    model_version, product_code, term_kind_snapshot,
    duration_value_snapshot, duration_unit_snapshot
  ) values (
    p_platform_id, v_plan.id, p_name, p_quantity, v_product.duration_value,
    v_product.duration_unit, p_expires_at, p_delivery_deadline, (p_ctx).session_id,
    lower(p_delivery_receipt_hmac), (p_ctx).admin_user_id, p_creation_operation_id,
    v_request_hash, 2, p_product_code, v_product.term_kind,
    v_product.duration_value, v_product.duration_unit
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
      p_platform_id, v_batch.id, v_plan.id, lower(v_code->>'code_hmac'),
      (v_code->>'hmac_key_version')::smallint, v_code->>'code_prefix', v_code->>'code_suffix'
    );
  end loop;

  perform private.audit_append(
    (p_ctx).request_id, 'admin', (p_ctx).admin_user_id, p_platform_id, null,
    'redemption.batch_created', 'redemption_code_batch', v_batch.id, null, null,
    jsonb_build_object(
      'quantity', p_quantity, 'plan_id', v_plan.id, 'product_code', p_product_code,
      'model_version', 2, 'duration_value', v_product.duration_value,
      'duration_unit', v_product.duration_unit, 'status', 'pending_delivery'
    )
  );
  return query select v_batch.id, v_batch.status, v_batch.quantity, 'created'::text;
end;
$$;

-- Replace only the privileged read wrapper so the existing Admin route can
-- display both legacy and V2 batches without exposing the underlying table.
drop function if exists private.admin_batch_list(private.admin_context, uuid, integer);

create function private.admin_batch_list(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_limit integer default 20
)
returns table (
  batch_id uuid,
  plan_id uuid,
  plan_code text,
  product_code text,
  model_version smallint,
  term_kind text,
  duration_value integer,
  duration_unit text,
  name text,
  quantity integer,
  status text,
  expires_at timestamptz,
  delivery_deadline timestamptz,
  delivered_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
begin
  if (p_ctx).admin_user_id is null or (p_ctx).session_id is null
     or p_limit is null or p_limit not between 1 and 100
     or not exists (select 1 from private.system_admin where user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active) then
    raise exception using errcode = case when p_limit is null or p_limit not between 1 and 100 then '22023' else '42501' end,
      message = case when p_limit is null or p_limit not between 1 and 100 then 'invalid_input' else 'admin_required' end;
  end if;
  if not exists (select 1 from public.platforms where id = p_platform_id) then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  return query
    select b.id, b.plan_id, p.code, b.product_code, b.model_version,
      coalesce(b.term_kind_snapshot, case when b.duration_value is null then 'perpetual' else 'finite' end),
      b.duration_value, b.duration_unit, b.name, b.quantity, b.status,
      b.expires_at, b.delivery_deadline, b.delivered_at, b.created_at
    from public.redemption_code_batches b
    join public.plans p on p.platform_id = b.platform_id and p.id = b.plan_id
    where b.platform_id = p_platform_id
    order by b.created_at desc, b.id desc
    limit p_limit;
end;
$$;

create table public.subscription_grant_corrections (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null,
  platform_account_id uuid not null,
  operation_id uuid not null,
  original_grant_id uuid not null,
  replacement_grant_id uuid not null,
  expected_event_sequence bigint not null check (expected_event_sequence >= 0),
  reason text not null check (length(reason) between 1 and 1024),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (platform_id, platform_account_id)
    references public.platform_accounts(platform_id, id) on delete restrict,
  foreign key (platform_id, platform_account_id, original_grant_id)
    references public.subscription_grants(platform_id, platform_account_id, id) on delete restrict,
  foreign key (platform_id, platform_account_id, replacement_grant_id)
    references public.subscription_grants(platform_id, platform_account_id, id) on delete restrict,
  unique (platform_id, operation_id),
  unique (platform_id, original_grant_id)
);

alter table public.subscription_grant_corrections enable row level security;
alter table public.subscription_grant_corrections force row level security;
revoke all on public.subscription_grant_corrections
  from public, anon, authenticated, account_executor, admin_executor, job_executor, recovery_executor;
create policy subscription_grant_corrections_domain_owner
  on public.subscription_grant_corrections
  for all to domain_owner using (true) with check (true);
grant select, insert on public.subscription_grant_corrections to domain_owner;

create or replace function private.admin_entitlement_correction_preview(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_platform_account_id uuid,
  p_grant_id uuid
)
returns table (
  original_grant_id uuid,
  plan_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  already_revoked boolean,
  current_event_sequence bigint,
  later_grant_count bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
begin
  if not exists (select 1 from private.system_admin where user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active) then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
  return query
    select g.id, g.plan_id, g.starts_at, g.ends_at,
      exists (
        select 1 from public.subscription_events revoked
        where revoked.platform_id = g.platform_id
          and revoked.platform_account_id = g.platform_account_id
          and revoked.grant_id = g.id and revoked.event_type = 'revoked'
      ),
      coalesce((select s.last_event_sequence from public.subscriptions s
        where s.platform_id = g.platform_id and s.platform_account_id = g.platform_account_id), 0),
      (select count(*) from public.subscription_grants later
        where later.platform_id = g.platform_id
          and later.platform_account_id = g.platform_account_id
          and later.starts_at >= g.starts_at and later.id <> g.id)
    from public.subscription_grants g
    where g.platform_id = p_platform_id
      and g.platform_account_id = p_platform_account_id
      and g.id = p_grant_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
end;
$$;

create or replace function private.admin_entitlement_correction_apply(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_platform_account_id uuid,
  p_original_grant_id uuid,
  p_expected_event_sequence bigint,
  p_replacement_plan_id uuid,
  p_replacement_duration_value integer,
  p_replacement_duration_unit text,
  p_operation_id uuid,
  p_reason text
)
returns table (
  outcome text,
  original_grant_id uuid,
  replacement_grant_id uuid,
  event_sequence bigint
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_subscription public.subscriptions;
  v_existing public.subscription_grant_corrections;
  v_revoke_operation_id uuid;
  v_grant_operation_id uuid;
  v_replacement record;
  v_current_sequence bigint;
begin
  if p_platform_id is null or p_platform_account_id is null or p_original_grant_id is null
     or p_expected_event_sequence is null or p_expected_event_sequence < 0
     or p_replacement_plan_id is null or p_replacement_duration_value is null
     or p_replacement_duration_value <= 0
     or p_replacement_duration_unit not in ('month', 'year')
     or p_operation_id is null or p_reason is null or length(p_reason) not between 1 and 1024 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if not exists (select 1 from private.system_admin where user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active) then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
  if not (
    (p_replacement_duration_value = 1 and p_replacement_duration_unit = 'month')
    or (p_replacement_duration_value = 1 and p_replacement_duration_unit = 'year')
    or (p_replacement_duration_value = 99 and p_replacement_duration_unit = 'year')
  ) then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  perform 1 from public.platforms p
  where p.id = p_platform_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  perform 1 from public.platform_accounts a
  where a.platform_id = p_platform_id and a.id = p_platform_account_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  select s.* into v_subscription from public.subscriptions s
  where s.platform_id = p_platform_id and s.platform_account_id = p_platform_account_id
  for update;
  v_current_sequence := coalesce(v_subscription.last_event_sequence, 0);
  if v_current_sequence <> p_expected_event_sequence then
    raise exception using errcode = '40001', message = 'precondition_failed';
  end if;

  select c.* into v_existing from public.subscription_grant_corrections c
  where c.platform_id = p_platform_id and c.operation_id = p_operation_id;
  if found then
    return query select 'replayed'::text, v_existing.original_grant_id,
      v_existing.replacement_grant_id, v_current_sequence;
    return;
  end if;
  if exists (select 1 from public.subscription_grant_corrections c
             where c.platform_id = p_platform_id and c.original_grant_id = p_original_grant_id) then
    raise exception using errcode = '23505', message = 'correction_exists';
  end if;
  perform 1 from public.subscription_grants g
  where g.platform_id = p_platform_id and g.platform_account_id = p_platform_account_id
    and g.id = p_original_grant_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  if exists (select 1 from public.subscription_events e
             where e.platform_id = p_platform_id and e.platform_account_id = p_platform_account_id
               and e.grant_id = p_original_grant_id and e.event_type = 'revoked') then
    raise exception using errcode = 'P0001', message = 'grant_already_revoked';
  end if;
  if not exists (select 1 from public.plans p
                 where p.platform_id = p_platform_id and p.id = p_replacement_plan_id
                   and p.kind = 'paid' and p.status = 'active') then
    raise exception using errcode = 'P0001', message = 'plan_unavailable';
  end if;

  v_revoke_operation_id := (
    substr(md5(p_operation_id::text || ':correction:revoke'), 1, 8) || '-' ||
    substr(md5(p_operation_id::text || ':correction:revoke'), 9, 4) || '-' ||
    substr(md5(p_operation_id::text || ':correction:revoke'), 13, 4) || '-' ||
    substr(md5(p_operation_id::text || ':correction:revoke'), 17, 4) || '-' ||
    substr(md5(p_operation_id::text || ':correction:revoke'), 21, 12)
  )::uuid;
  v_grant_operation_id := (
    substr(md5(p_operation_id::text || ':correction:grant'), 1, 8) || '-' ||
    substr(md5(p_operation_id::text || ':correction:grant'), 9, 4) || '-' ||
    substr(md5(p_operation_id::text || ':correction:grant'), 13, 4) || '-' ||
    substr(md5(p_operation_id::text || ':correction:grant'), 17, 4) || '-' ||
    substr(md5(p_operation_id::text || ':correction:grant'), 21, 12)
  )::uuid;

  perform private.admin_entitlement_command(
    p_ctx, p_platform_id, p_platform_account_id, 'revoke',
    v_revoke_operation_id, null, null, null, p_original_grant_id,
    'correction: ' || p_reason
  );
  select * into v_replacement from private.entitlement_apply(
    p_platform_id, p_platform_account_id, p_replacement_plan_id, 'admin',
    v_grant_operation_id, p_replacement_duration_value, p_replacement_duration_unit,
    (p_ctx).admin_user_id, 'correction: ' || p_reason, null
  );
  insert into public.subscription_grant_corrections (
    platform_id, platform_account_id, operation_id, original_grant_id,
    replacement_grant_id, expected_event_sequence, reason, created_by
  ) values (
    p_platform_id, p_platform_account_id, p_operation_id, p_original_grant_id,
    v_replacement.grant_id, p_expected_event_sequence, p_reason, (p_ctx).admin_user_id
  );
  select coalesce(s.last_event_sequence, 0) into v_current_sequence
  from public.subscriptions s
  where s.platform_id = p_platform_id and s.platform_account_id = p_platform_account_id;
  return query select 'applied'::text, p_original_grant_id, v_replacement.grant_id, v_current_sequence;
end;
$$;

alter function private.redemption_batch_snapshot_guard() owner to domain_owner;
alter function private.admin_batch_create_v2(private.admin_context, uuid, text, text, integer, timestamptz, timestamptz, uuid, text, jsonb) owner to domain_owner;
alter function private.admin_batch_list(private.admin_context, uuid, integer) owner to domain_owner;
alter function private.admin_entitlement_correction_preview(private.admin_context, uuid, uuid, uuid) owner to domain_owner;
alter function private.admin_entitlement_correction_apply(private.admin_context, uuid, uuid, uuid, bigint, uuid, integer, text, uuid, text) owner to domain_owner;

revoke all on function private.redemption_batch_snapshot_guard() from public, anon, authenticated, account_executor, admin_executor, job_executor, recovery_executor;
revoke all on function private.admin_batch_create_v2(private.admin_context, uuid, text, text, integer, timestamptz, timestamptz, uuid, text, jsonb) from public, anon, authenticated, account_executor, job_executor, recovery_executor;
revoke all on function private.admin_batch_list(private.admin_context, uuid, integer) from public, anon, authenticated, account_executor, job_executor, recovery_executor;
revoke all on function private.admin_entitlement_correction_preview(private.admin_context, uuid, uuid, uuid) from public, anon, authenticated, account_executor, job_executor, recovery_executor;
revoke all on function private.admin_entitlement_correction_apply(private.admin_context, uuid, uuid, uuid, bigint, uuid, integer, text, uuid, text) from public, anon, authenticated, account_executor, job_executor, recovery_executor;
grant execute on function private.admin_batch_create_v2(private.admin_context, uuid, text, text, integer, timestamptz, timestamptz, uuid, text, jsonb) to admin_executor;
grant execute on function private.admin_batch_list(private.admin_context, uuid, integer) to admin_executor;
grant execute on function private.admin_entitlement_correction_preview(private.admin_context, uuid, uuid, uuid) to admin_executor;
grant execute on function private.admin_entitlement_correction_apply(private.admin_context, uuid, uuid, uuid, bigint, uuid, integer, text, uuid, text) to admin_executor;
