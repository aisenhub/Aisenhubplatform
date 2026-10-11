-- OPT-007 Phase 02: Account/Consumer content boundaries for Config resources.
-- Legacy /v1/config-files upload primitives remain legacy-only; Config Version
-- upload/download and Gallery delivery use explicit Config-domain wrappers.

create or replace function private.file_upload_state_by_kind(
  p_ctx private.account_context,
  p_file_id uuid,
  p_resource_kind text
)
returns table (
  file_id uuid,
  platform_account_id uuid,
  original_name text,
  mime_type text,
  requested_size_bytes bigint,
  actual_size_bytes bigint,
  sha256 text,
  status text,
  write_outcome text,
  storage_bucket text,
  storage_path text,
  intent_expires_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_principal record;
begin
  if (p_ctx).request_id is null or p_file_id is null
     or p_resource_kind not in ('legacy', 'config_version') then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_principal from private.account_principal(p_ctx);
  if v_principal.authorization <> 'allowed' then
    raise exception using errcode = '42501', message = v_principal.authorization;
  end if;
  return query
    select f.id, f.platform_account_id, f.original_name, f.mime_type,
      f.requested_size_bytes, f.actual_size_bytes, f.sha256, f.status,
      f.write_outcome, f.storage_bucket, f.storage_path, f.intent_expires_at,
      f.created_at, f.updated_at
    from public.platform_config_files f
    where f.platform_id = (p_ctx).platform_id
      and f.platform_account_id = v_principal.platform_account_id
      and f.id = p_file_id and f.resource_kind = p_resource_kind;
  if not found then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
end;
$$;

create or replace function private.file_upload_state(
  p_ctx private.account_context,
  p_file_id uuid
)
returns table (
  file_id uuid,
  platform_account_id uuid,
  original_name text,
  mime_type text,
  requested_size_bytes bigint,
  actual_size_bytes bigint,
  sha256 text,
  status text,
  write_outcome text,
  storage_bucket text,
  storage_path text,
  intent_expires_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, private, public
as $$
  select * from private.file_upload_state_by_kind(p_ctx, p_file_id, 'legacy')
$$;

create or replace function private.file_receive_claim_by_kind(
  p_ctx private.account_context,
  p_file_id uuid,
  p_resource_kind text,
  p_lease_owner text,
  p_lease_seconds integer default 15
)
returns table (
  file_id uuid,
  platform_account_id uuid,
  status text,
  write_outcome text,
  requested_size_bytes bigint,
  max_file_bytes bigint,
  reserved_bytes bigint,
  reserved_count integer,
  lease_until timestamptz,
  fencing_token bigint,
  storage_path text,
  mime_type text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_authorization text;
  v_account_id uuid;
  v_account public.platform_accounts;
  v_file public.platform_config_files;
  v_policy public.platform_file_policies;
  v_now timestamptz := clock_timestamp();
begin
  if (p_ctx).request_id is null or p_file_id is null
     or p_resource_kind not in ('legacy', 'config_version')
     or p_lease_owner is null or length(p_lease_owner) not between 1 and 128
     or p_lease_seconds not between 1 and 15 then
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
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  select * into v_policy from public.platform_file_policies p
  where p.platform_id = (p_ctx).platform_id for update;
  select * into v_file from public.platform_config_files f
  where f.platform_id = (p_ctx).platform_id
    and f.platform_account_id = v_account_id and f.id = p_file_id
    and f.resource_kind = p_resource_kind for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  if v_file.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'operation_in_progress';
  end if;
  if v_file.intent_expires_at <= v_now then
    raise exception using errcode = 'P0001', message = 'intent_expired';
  end if;
  if v_file.lease_until is not null and v_file.lease_until > v_now then
    raise exception using errcode = 'P0001', message = 'operation_in_progress';
  end if;
  update public.platform_config_files f
  set status = 'receiving', lease_owner = p_lease_owner,
      lease_until = v_now + make_interval(secs => p_lease_seconds),
      fencing_token = f.fencing_token + 1
  where f.id = v_file.id
  returning f.id, f.platform_account_id, f.status, f.write_outcome,
    f.requested_size_bytes, v_policy.max_file_bytes, f.reserved_bytes,
    f.reserved_count, f.lease_until, f.fencing_token, f.storage_path, f.mime_type
  into file_id, platform_account_id, status, write_outcome,
    requested_size_bytes, max_file_bytes, reserved_bytes, reserved_count,
    lease_until, fencing_token, storage_path, mime_type;
  perform private.audit_append(
    (p_ctx).request_id, 'user', (p_ctx).user_id, (p_ctx).platform_id, v_account_id,
    'file.receive_claimed', 'platform_config_file', p_file_id, null, null,
    jsonb_build_object('fencing_token', fencing_token, 'resource_kind', p_resource_kind)
  );
  return next;
end;
$$;

create or replace function private.file_receive_claim(
  p_ctx private.account_context,
  p_file_id uuid,
  p_lease_owner text,
  p_lease_seconds integer default 15
)
returns table (
  file_id uuid,
  platform_account_id uuid,
  status text,
  write_outcome text,
  requested_size_bytes bigint,
  max_file_bytes bigint,
  reserved_bytes bigint,
  reserved_count integer,
  lease_until timestamptz,
  fencing_token bigint,
  storage_path text,
  mime_type text
)
language sql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
  select * from private.file_receive_claim_by_kind(
    p_ctx, p_file_id, 'legacy', p_lease_owner, p_lease_seconds
  )
$$;

create or replace function private.file_prepare_store_by_kind(
  p_ctx private.account_context,
  p_file_id uuid,
  p_resource_kind text,
  p_actual_size_bytes bigint,
  p_sha256 text,
  p_idempotency_key text,
  p_operation text
)
returns table (
  file_id uuid,
  status text,
  write_outcome text,
  reserved_bytes bigint,
  reserved_count integer,
  actual_size_bytes bigint,
  sha256 text,
  storage_path text,
  write_attempt_id uuid
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_authorization text;
  v_account_id uuid;
  v_account public.platform_accounts;
  v_file public.platform_config_files;
  v_policy public.platform_file_policies;
  v_attempt private.file_write_attempts;
  v_claim private.idempotency_keys%rowtype;
  v_new_claim boolean := false;
  v_hash bytea;
  v_response jsonb;
begin
  if p_file_id is null or p_resource_kind not in ('legacy', 'config_version')
     or p_actual_size_bytes not between 1 and 1048576
     or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$'
     or p_idempotency_key is null or length(p_idempotency_key) not between 1 and 128
     or p_operation not in ('file_prepare_store', 'config_version_prepare_store') then
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
  select * into v_file from public.platform_config_files f
  where f.platform_id = (p_ctx).platform_id
    and f.platform_account_id = v_account_id and f.id = p_file_id
    and f.resource_kind = p_resource_kind for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  v_hash := extensions.digest(convert_to(
    p_file_id::text || ':' || p_actual_size_bytes::text || ':' || p_sha256,
    'utf8'), 'sha256');
  insert into private.idempotency_keys (
    platform_id, platform_account_id, operation, actor_scope, idempotency_key, request_hash
  ) values (
    (p_ctx).platform_id, v_account_id, p_operation,
    'user:' || (p_ctx).user_id::text, p_idempotency_key, v_hash
  ) on conflict (platform_id, platform_account_id, operation, actor_scope, idempotency_key)
    do nothing returning true into v_new_claim;
  if not coalesce(v_new_claim, false) then
    select * into v_claim from private.idempotency_keys i
    where i.platform_id = (p_ctx).platform_id and i.platform_account_id = v_account_id
      and i.operation = p_operation
      and i.actor_scope = 'user:' || (p_ctx).user_id::text
      and i.idempotency_key = p_idempotency_key for update;
    if v_claim.request_hash <> v_hash then
      raise exception using errcode = '23505', message = 'idempotency_conflict';
    end if;
    if v_claim.state = 'completed' then
      return query select (v_claim.response_body->>'file_id')::uuid,
        v_claim.response_body->>'status', v_claim.response_body->>'write_outcome',
        (v_claim.response_body->>'reserved_bytes')::bigint,
        (v_claim.response_body->>'reserved_count')::integer,
        (v_claim.response_body->>'actual_size_bytes')::bigint,
        v_claim.response_body->>'sha256', v_claim.response_body->>'storage_path',
        (v_claim.response_body->>'write_attempt_id')::uuid;
      return;
    end if;
    raise exception using errcode = 'P0001', message = 'operation_in_progress';
  end if;
  if v_file.status <> 'receiving' or v_file.lease_until is null
     or v_file.lease_until <= clock_timestamp() then
    raise exception using errcode = 'P0001', message = 'operation_in_progress';
  end if;
  if p_actual_size_bytes > v_file.requested_size_bytes then
    raise exception using errcode = '22023', message = 'size_mismatch';
  end if;
  select * into v_policy from public.platform_file_policies p
  where p.platform_id = (p_ctx).platform_id for update;
  if not found or not v_policy.enabled or p_actual_size_bytes > v_policy.max_file_bytes then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  insert into private.file_write_attempts (
    platform_id, platform_account_id, file_id, fencing_token,
    state, actual_size_bytes, sha256
  ) values (
    (p_ctx).platform_id, v_account_id, v_file.id, v_file.fencing_token,
    'in_flight', p_actual_size_bytes, p_sha256
  ) returning * into v_attempt;
  update public.platform_config_files f
  set status = 'storing', write_outcome = 'in_flight',
      actual_size_bytes = p_actual_size_bytes, sha256 = p_sha256,
      reserved_bytes = p_actual_size_bytes, lease_until = null, lease_owner = null
  where f.id = v_file.id;
  perform private.audit_append(
    (p_ctx).request_id, 'user', (p_ctx).user_id, (p_ctx).platform_id, v_account_id,
    'file.store_prepared', 'platform_config_file', v_file.id, null, null,
    jsonb_build_object('actual_size_bytes', p_actual_size_bytes,
      'write_attempt_id', v_attempt.id, 'resource_kind', p_resource_kind)
  );
  v_response := jsonb_build_object(
    'file_id', v_file.id, 'status', 'storing', 'write_outcome', 'in_flight',
    'reserved_bytes', p_actual_size_bytes, 'reserved_count', v_file.reserved_count,
    'actual_size_bytes', p_actual_size_bytes, 'sha256', p_sha256,
    'storage_path', v_file.storage_path, 'write_attempt_id', v_attempt.id
  );
  perform private.idempotency_finalize(
    (p_ctx).platform_id, v_account_id, p_operation,
    'user:' || (p_ctx).user_id::text, p_idempotency_key, v_hash, 200, v_response
  );
  return query select v_file.id, 'storing'::text, 'in_flight'::text,
    p_actual_size_bytes, v_file.reserved_count, p_actual_size_bytes,
    p_sha256, v_file.storage_path, v_attempt.id;
end;
$$;

create or replace function private.file_prepare_store(
  p_ctx private.account_context,
  p_file_id uuid,
  p_actual_size_bytes bigint,
  p_sha256 text,
  p_idempotency_key text
)
returns table (
  file_id uuid,
  status text,
  write_outcome text,
  reserved_bytes bigint,
  reserved_count integer,
  actual_size_bytes bigint,
  sha256 text,
  storage_path text,
  write_attempt_id uuid
)
language sql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
  select * from private.file_prepare_store_by_kind(
    p_ctx, p_file_id, 'legacy', p_actual_size_bytes, p_sha256,
    p_idempotency_key, 'file_prepare_store'
  )
$$;

create or replace function private.file_write_attempt_mark_unknown_by_kind(
  p_ctx private.account_context,
  p_file_id uuid,
  p_resource_kind text,
  p_attempt_id uuid,
  p_error_code text
)
returns table (file_id uuid, status text, write_outcome text, write_attempt_id uuid)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_authorization text;
  v_account_id uuid;
  v_file public.platform_config_files;
  v_attempt private.file_write_attempts;
begin
  if (p_ctx).request_id is null or p_file_id is null or p_attempt_id is null
     or p_resource_kind not in ('legacy', 'config_version')
     or p_error_code is null or length(p_error_code) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select principal.authorization, principal.platform_account_id
    into v_authorization, v_account_id
  from private.account_principal(p_ctx) principal;
  if v_authorization not in ('allowed', 'suspended') then
    raise exception using errcode = '42501', message = v_authorization;
  end if;
  select * into v_file from public.platform_config_files f
  where f.platform_id = (p_ctx).platform_id
    and f.platform_account_id = v_account_id and f.id = p_file_id
    and f.resource_kind = p_resource_kind for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  select * into v_attempt from private.file_write_attempts a
  where a.platform_id = (p_ctx).platform_id and a.platform_account_id = v_account_id
    and a.file_id = p_file_id and a.id = p_attempt_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  if v_attempt.state = 'unknown' then
    return query select v_file.id, v_file.status, v_file.write_outcome, v_attempt.id;
    return;
  end if;
  if v_file.status <> 'storing' or v_attempt.state <> 'in_flight'
     or v_file.write_outcome <> 'in_flight' then
    raise exception using errcode = 'P0001', message = 'operation_in_progress';
  end if;
  update private.file_write_attempts
  set state = 'unknown', error_code = p_error_code
  where id = v_attempt.id;
  update public.platform_config_files set write_outcome = 'unknown'
  where id = v_file.id;
  perform private.audit_append(
    (p_ctx).request_id, 'user', (p_ctx).user_id, (p_ctx).platform_id, v_account_id,
    'file.store_unknown', 'platform_config_file', v_file.id, null, null,
    jsonb_build_object('write_attempt_id', v_attempt.id, 'error_code', p_error_code,
      'resource_kind', p_resource_kind)
  );
  return query select v_file.id, v_file.status, 'unknown'::text, v_attempt.id;
end;
$$;

create or replace function private.file_write_attempt_mark_unknown(
  p_ctx private.account_context,
  p_file_id uuid,
  p_attempt_id uuid,
  p_error_code text
)
returns table (file_id uuid, status text, write_outcome text, write_attempt_id uuid)
language sql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
  select * from private.file_write_attempt_mark_unknown_by_kind(
    p_ctx, p_file_id, 'legacy', p_attempt_id, p_error_code
  )
$$;

create or replace function private.file_write_attempt_finalize_by_kind(
  p_ctx private.account_context,
  p_file_id uuid,
  p_resource_kind text,
  p_attempt_id uuid,
  p_actual_size_bytes bigint,
  p_sha256 text,
  p_provider_request_id text
)
returns table (
  file_id uuid,
  status text,
  write_outcome text,
  actual_size_bytes bigint,
  sha256 text,
  reserved_bytes bigint,
  reserved_count integer,
  uploaded_at timestamptz,
  original_name text,
  mime_type text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_authorization text;
  v_account_id uuid;
  v_file public.platform_config_files;
  v_attempt private.file_write_attempts;
begin
  if (p_ctx).request_id is null or p_file_id is null or p_attempt_id is null
     or p_resource_kind not in ('legacy', 'config_version')
     or p_actual_size_bytes not between 1 and 1048576
     or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$'
     or p_provider_request_id is not null and length(p_provider_request_id) > 256 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select principal.authorization, principal.platform_account_id
    into v_authorization, v_account_id
  from private.account_principal(p_ctx) principal;
  if v_authorization not in ('allowed', 'suspended') then
    raise exception using errcode = '42501', message = v_authorization;
  end if;
  select * into v_file from public.platform_config_files f
  where f.platform_id = (p_ctx).platform_id
    and f.platform_account_id = v_account_id and f.id = p_file_id
    and f.resource_kind = p_resource_kind for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  select * into v_attempt from private.file_write_attempts a
  where a.platform_id = (p_ctx).platform_id and a.platform_account_id = v_account_id
    and a.file_id = p_file_id and a.id = p_attempt_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  if v_file.status = 'active' and v_file.write_outcome = 'confirmed'
     and v_file.actual_size_bytes = p_actual_size_bytes and v_file.sha256 = p_sha256 then
    return query select v_file.id, v_file.status, v_file.write_outcome,
      v_file.actual_size_bytes, v_file.sha256, v_file.reserved_bytes,
      v_file.reserved_count, v_file.uploaded_at, v_file.original_name, v_file.mime_type;
    return;
  end if;
  if v_file.status <> 'storing' or v_file.write_outcome <> 'in_flight'
     or v_attempt.state <> 'in_flight'
     or v_attempt.actual_size_bytes <> p_actual_size_bytes
     or v_attempt.sha256 <> p_sha256 then
    raise exception using errcode = 'P0001', message = 'operation_in_progress';
  end if;
  update private.file_write_attempts
  set state = 'confirmed', settled_at = clock_timestamp(),
      provider_request_id = p_provider_request_id
  where id = v_attempt.id;
  update public.platform_config_files f
  set status = 'active', write_outcome = 'confirmed', uploaded_at = clock_timestamp()
  where f.id = v_file.id
  returning f.id, f.status, f.write_outcome, f.actual_size_bytes, f.sha256,
    f.reserved_bytes, f.reserved_count, f.uploaded_at, f.original_name, f.mime_type
  into file_id, status, write_outcome, actual_size_bytes, sha256,
    reserved_bytes, reserved_count, uploaded_at, original_name, mime_type;
  perform private.audit_append(
    (p_ctx).request_id, 'user', (p_ctx).user_id, (p_ctx).platform_id, v_account_id,
    'file.store_confirmed', 'platform_config_file', v_file.id, null, null,
    jsonb_build_object('write_attempt_id', v_attempt.id,
      'provider_request_id', p_provider_request_id, 'resource_kind', p_resource_kind)
  );
  return next;
end;
$$;

create or replace function private.file_write_attempt_finalize(
  p_ctx private.account_context,
  p_file_id uuid,
  p_attempt_id uuid,
  p_actual_size_bytes bigint,
  p_sha256 text,
  p_provider_request_id text
)
returns table (
  file_id uuid,
  status text,
  write_outcome text,
  actual_size_bytes bigint,
  sha256 text,
  reserved_bytes bigint,
  reserved_count integer,
  uploaded_at timestamptz,
  original_name text,
  mime_type text,
  replace_outcome text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_authorization text;
  v_account_id uuid;
  v_file public.platform_config_files;
  v_replace public.platform_config_files;
  v_attempt private.file_write_attempts;
  v_replace_id uuid;
begin
  if (p_ctx).request_id is null or p_file_id is null or p_attempt_id is null
     or p_actual_size_bytes not between 1 and 1048576
     or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$'
     or p_provider_request_id is not null and length(p_provider_request_id) > 256 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select principal.authorization, principal.platform_account_id
    into v_authorization, v_account_id
  from private.account_principal(p_ctx) principal;
  if v_authorization not in ('allowed', 'suspended') then
    raise exception using errcode = '42501', message = v_authorization;
  end if;
  select f.replaces_file_id into v_replace_id
  from public.platform_config_files f
  where f.platform_id = (p_ctx).platform_id
    and f.platform_account_id = v_account_id and f.id = p_file_id
    and f.resource_kind = 'legacy';
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  perform 1 from public.platform_accounts a
  where a.platform_id = (p_ctx).platform_id and a.id = v_account_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;

  if v_replace_id is null then
    select * into v_file from public.platform_config_files f
    where f.platform_id = (p_ctx).platform_id
      and f.platform_account_id = v_account_id and f.id = p_file_id
      and f.resource_kind = 'legacy' for update;
  elsif v_replace_id < p_file_id then
    select * into v_replace from public.platform_config_files f
    where f.platform_id = (p_ctx).platform_id
      and f.platform_account_id = v_account_id and f.id = v_replace_id
      and f.resource_kind = 'legacy' for update;
    select * into v_file from public.platform_config_files f
    where f.platform_id = (p_ctx).platform_id
      and f.platform_account_id = v_account_id and f.id = p_file_id
      and f.resource_kind = 'legacy' for update;
  else
    select * into v_file from public.platform_config_files f
    where f.platform_id = (p_ctx).platform_id
      and f.platform_account_id = v_account_id and f.id = p_file_id
      and f.resource_kind = 'legacy' for update;
    select * into v_replace from public.platform_config_files f
    where f.platform_id = (p_ctx).platform_id
      and f.platform_account_id = v_account_id and f.id = v_replace_id
      and f.resource_kind = 'legacy' for update;
  end if;
  if v_file.id is null then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  select * into v_attempt from private.file_write_attempts a
  where a.platform_id = (p_ctx).platform_id and a.platform_account_id = v_account_id
    and a.file_id = p_file_id and a.id = p_attempt_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  if v_file.status = 'active' and v_file.write_outcome = 'confirmed'
     and v_file.actual_size_bytes = p_actual_size_bytes and v_file.sha256 = p_sha256 then
    replace_outcome := case when v_replace_id is null then null else 'switched' end;
    return query select v_file.id, v_file.status, v_file.write_outcome,
      v_file.actual_size_bytes, v_file.sha256, v_file.reserved_bytes,
      v_file.reserved_count, v_file.uploaded_at, v_file.original_name,
      v_file.mime_type, replace_outcome;
    return;
  end if;
  if v_file.status <> 'storing' or v_file.write_outcome <> 'in_flight'
     or v_attempt.state <> 'in_flight'
     or v_attempt.actual_size_bytes <> p_actual_size_bytes
     or v_attempt.sha256 <> p_sha256 then
    raise exception using errcode = 'P0001', message = 'operation_in_progress';
  end if;
  update private.file_write_attempts
  set state = 'confirmed', settled_at = clock_timestamp(),
      provider_request_id = p_provider_request_id
  where id = v_attempt.id;

  if v_replace_id is not null and (v_replace.id is null
     or v_replace.status <> 'active' or v_replace.write_outcome <> 'confirmed') then
    update public.platform_config_files f
    set status = 'deleting', write_outcome = 'confirmed',
        uploaded_at = clock_timestamp(), next_attempt_at = clock_timestamp()
    where f.id = v_file.id
    returning f.id, f.status, f.write_outcome, f.actual_size_bytes, f.sha256,
      f.reserved_bytes, f.reserved_count, f.uploaded_at, f.original_name,
      f.mime_type into file_id, status, write_outcome, actual_size_bytes,
      sha256, reserved_bytes, reserved_count, uploaded_at, original_name,
      mime_type;
    perform private.audit_append(
      (p_ctx).request_id, 'user', (p_ctx).user_id, (p_ctx).platform_id, v_account_id,
      'file.replace_target_busy', 'platform_config_file', v_file.id, null, null,
      jsonb_build_object('replaces_file_id', v_replace_id,
        'target_status', v_replace.status)
    );
    replace_outcome := 'file_busy';
    return next;
    return;
  end if;

  update public.platform_config_files f
  set status = 'active', write_outcome = 'confirmed', uploaded_at = clock_timestamp()
  where f.id = v_file.id
  returning f.id, f.status, f.write_outcome, f.actual_size_bytes, f.sha256,
    f.reserved_bytes, f.reserved_count, f.uploaded_at, f.original_name,
    f.mime_type into file_id, status, write_outcome, actual_size_bytes,
    sha256, reserved_bytes, reserved_count, uploaded_at, original_name,
    mime_type;
  if v_replace_id is null then
    replace_outcome := null;
  else
    update public.platform_config_files f
    set status = 'deleting',
      cancel_requested_at = coalesce(f.cancel_requested_at, clock_timestamp()),
      next_attempt_at = clock_timestamp()
    where f.id = v_replace.id;
    perform private.audit_append(
      (p_ctx).request_id, 'user', (p_ctx).user_id, (p_ctx).platform_id, v_account_id,
      'file.replace_switched', 'platform_config_file', v_replace.id, null, null,
      jsonb_build_object('replacement_file_id', v_file.id)
    );
    replace_outcome := 'switched';
  end if;
  perform private.audit_append(
    (p_ctx).request_id, 'user', (p_ctx).user_id, (p_ctx).platform_id, v_account_id,
    'file.store_confirmed', 'platform_config_file', v_file.id, null, null,
    jsonb_build_object('write_attempt_id', v_attempt.id,
      'provider_request_id', p_provider_request_id,
      'replace_outcome', replace_outcome, 'resource_kind', 'legacy')
  );
  return next;
end;
$$;

create or replace function private.config_version_file_resolve(
  p_ctx private.account_context,
  p_config_id uuid,
  p_version_id uuid,
  p_require_active_config boolean default false
)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_principal record;
  v_file_id uuid;
begin
  if (p_ctx).request_id is null or p_config_id is null or p_version_id is null
     or p_require_active_config is null then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_principal from private.account_principal(p_ctx);
  if v_principal.authorization not in ('allowed', 'suspended') then
    raise exception using errcode = '42501', message = v_principal.authorization;
  end if;
  select v.file_id into v_file_id
  from public.platform_config_versions v
  join public.platform_configs c
    on c.platform_id = v.platform_id and c.id = v.config_id
      and c.platform_account_id = v.platform_account_id
  join public.platform_config_files f on f.id = v.file_id
  where v.platform_id = (p_ctx).platform_id
    and v.platform_account_id = v_principal.platform_account_id
    and v.config_id = p_config_id and v.id = p_version_id
    and c.status <> 'deleted'
    and (not p_require_active_config or c.status = 'active')
    and f.resource_kind = 'config_version';
  if v_file_id is null then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  return v_file_id;
end;
$$;

create or replace function private.config_version_upload_state(
  p_ctx private.account_context,
  p_config_id uuid,
  p_version_id uuid
)
returns table (
  file_id uuid,
  platform_account_id uuid,
  original_name text,
  mime_type text,
  requested_size_bytes bigint,
  actual_size_bytes bigint,
  sha256 text,
  status text,
  write_outcome text,
  storage_bucket text,
  storage_path text,
  intent_expires_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare v_file_id uuid;
begin
  v_file_id := private.config_version_file_resolve(p_ctx, p_config_id, p_version_id, true);
  return query select * from private.file_upload_state_by_kind(
    p_ctx, v_file_id, 'config_version'
  );
end;
$$;

create or replace function private.config_version_receive_claim(
  p_ctx private.account_context,
  p_config_id uuid,
  p_version_id uuid,
  p_lease_owner text,
  p_lease_seconds integer default 15
)
returns table (
  file_id uuid,
  platform_account_id uuid,
  status text,
  write_outcome text,
  requested_size_bytes bigint,
  max_file_bytes bigint,
  reserved_bytes bigint,
  reserved_count integer,
  lease_until timestamptz,
  fencing_token bigint,
  storage_path text,
  mime_type text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare v_file_id uuid;
begin
  v_file_id := private.config_version_file_resolve(p_ctx, p_config_id, p_version_id, true);
  return query select * from private.file_receive_claim_by_kind(
    p_ctx, v_file_id, 'config_version', p_lease_owner, p_lease_seconds
  );
end;
$$;

create or replace function private.config_version_prepare_store(
  p_ctx private.account_context,
  p_config_id uuid,
  p_version_id uuid,
  p_actual_size_bytes bigint,
  p_sha256 text,
  p_idempotency_key text
)
returns table (
  file_id uuid,
  status text,
  write_outcome text,
  reserved_bytes bigint,
  reserved_count integer,
  actual_size_bytes bigint,
  sha256 text,
  storage_path text,
  write_attempt_id uuid
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare v_file_id uuid;
begin
  v_file_id := private.config_version_file_resolve(p_ctx, p_config_id, p_version_id, true);
  return query select * from private.file_prepare_store_by_kind(
    p_ctx, v_file_id, 'config_version', p_actual_size_bytes, p_sha256,
    p_idempotency_key, 'config_version_prepare_store'
  );
end;
$$;

create or replace function private.config_version_write_attempt_mark_unknown(
  p_ctx private.account_context,
  p_config_id uuid,
  p_version_id uuid,
  p_attempt_id uuid,
  p_error_code text
)
returns table (file_id uuid, status text, write_outcome text, write_attempt_id uuid)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare v_file_id uuid;
begin
  v_file_id := private.config_version_file_resolve(p_ctx, p_config_id, p_version_id, false);
  return query select * from private.file_write_attempt_mark_unknown_by_kind(
    p_ctx, v_file_id, 'config_version', p_attempt_id, p_error_code
  );
end;
$$;

create or replace function private.config_version_write_attempt_finalize(
  p_ctx private.account_context,
  p_config_id uuid,
  p_version_id uuid,
  p_attempt_id uuid,
  p_actual_size_bytes bigint,
  p_sha256 text,
  p_provider_request_id text
)
returns table (
  file_id uuid,
  status text,
  write_outcome text,
  actual_size_bytes bigint,
  sha256 text,
  reserved_bytes bigint,
  reserved_count integer,
  uploaded_at timestamptz,
  original_name text,
  mime_type text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_file_id uuid;
  v_current_version_id uuid;
  v_current_number integer;
  v_target_number integer;
begin
  v_file_id := private.config_version_file_resolve(p_ctx, p_config_id, p_version_id, false);
  return query select * from private.file_write_attempt_finalize_by_kind(
    p_ctx, v_file_id, 'config_version', p_attempt_id, p_actual_size_bytes,
    p_sha256, p_provider_request_id
  );
  select c.current_version_id, current_v.version_number, target_v.version_number
    into v_current_version_id, v_current_number, v_target_number
  from public.platform_configs c
  join public.platform_config_versions target_v
    on target_v.config_id = c.id and target_v.id = p_version_id
  left join public.platform_config_versions current_v
    on current_v.config_id = c.id and current_v.id = c.current_version_id
  where c.id = p_config_id and c.status = 'active';
  if found and (
    v_current_version_id is null
    or (v_current_version_id is distinct from p_version_id and v_current_number < v_target_number)
  ) then
    perform 1 from private.config_version_activate(p_ctx, p_config_id, p_version_id);
  end if;
end;
$$;

create or replace function private.config_version_download_authorize(
  p_ctx private.account_context,
  p_config_id uuid,
  p_version_id uuid
)
returns table (
  file_id uuid,
  version_id uuid,
  storage_bucket text,
  storage_path text,
  original_name text,
  mime_type text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_file_id uuid;
begin
  v_file_id := private.config_version_file_resolve(p_ctx, p_config_id, p_version_id, true);
  return query
    select f.id, p_version_id, f.storage_bucket, f.storage_path,
      f.original_name, coalesce(f.mime_type, 'application/octet-stream')
    from public.platform_config_files f
    where f.id = v_file_id and f.resource_kind = 'config_version'
      and f.status = 'active' and f.write_outcome = 'confirmed';
  if not found then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
end;
$$;

create or replace function private.config_delete_request(
  p_ctx private.account_context,
  p_config_id uuid
)
returns table (
  config_id uuid,
  status text,
  row_version bigint,
  delete_requested_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_principal record;
  v_config public.platform_configs;
  v_now timestamptz := clock_timestamp();
begin
  if (p_ctx).request_id is null or p_config_id is null then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_principal from private.account_principal(p_ctx);
  if v_principal.authorization <> 'allowed' then
    raise exception using errcode = '42501', message = v_principal.authorization;
  end if;
  select * into v_config from public.platform_configs c
  where c.platform_id = (p_ctx).platform_id
    and c.platform_account_id = v_principal.platform_account_id
    and c.id = p_config_id and c.status <> 'deleted' for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  if v_config.status = 'active' then
    update public.platform_configs c
    set status = 'deleting', delete_requested_at = coalesce(c.delete_requested_at, v_now),
      row_version = c.row_version + 1
    where c.id = v_config.id returning * into v_config;
    update public.platform_config_gallery_entries e
    set status = 'removed', governance_reason = 'author_delete_requested'
    where e.platform_id = v_config.platform_id and e.config_id = v_config.id
      and e.status = 'approved';
    update public.platform_config_gallery_submissions s
    set status = 'cancelled', reviewed_at = coalesce(s.reviewed_at, v_now),
      review_reason = coalesce(s.review_reason, 'author_delete_requested')
    where s.platform_id = v_config.platform_id and s.config_id = v_config.id
      and s.status = 'pending';
    update public.platform_config_files f
    set status = 'deleting',
      cancel_requested_at = coalesce(f.cancel_requested_at, v_now),
      delete_requested_at = coalesce(f.delete_requested_at, v_now),
      next_attempt_at = v_now
    where f.id in (
      select v.file_id from public.platform_config_versions v
      where v.platform_id = v_config.platform_id and v.config_id = v_config.id
    ) and f.status <> 'deleted';
    perform private.audit_append(
      (p_ctx).request_id, 'user', (p_ctx).user_id, v_config.platform_id,
      v_config.platform_account_id, 'config.delete_requested', 'platform_config',
      v_config.id, null, null, '{}'::jsonb
    );
  end if;
  return query select v_config.id, v_config.status, v_config.row_version,
    v_config.delete_requested_at;
end;
$$;

create or replace function private.config_gallery_list(
  p_ctx private.account_context,
  p_cursor_config_id uuid default null,
  p_limit integer default 20
)
returns table (
  config_id uuid,
  title text,
  description text,
  author_display_name text,
  published_version_id uuid,
  version_number integer,
  schema_key text,
  schema_version text,
  changelog text,
  like_count bigint,
  download_count bigint,
  apply_delivery_count bigint,
  liked boolean,
  approved_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_principal record;
  v_cursor_approved_at timestamptz;
begin
  if (p_ctx).request_id is null or p_limit is null or p_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_principal from private.account_principal(p_ctx);
  if v_principal.authorization <> 'allowed' then
    raise exception using errcode = '42501', message = v_principal.authorization;
  end if;
  if p_cursor_config_id is not null then
    select e.approved_at into v_cursor_approved_at
    from public.platform_config_gallery_entries e
    join public.platform_configs c on c.platform_id = e.platform_id and c.id = e.config_id
    join public.platform_accounts a on a.platform_id = c.platform_id and a.id = c.platform_account_id
    join public.platform_config_versions v on v.platform_id = e.platform_id
      and v.config_id = e.config_id and v.id = e.published_version_id
    join public.platform_config_files f on f.id = v.file_id
    where e.platform_id = (p_ctx).platform_id and e.config_id = p_cursor_config_id
      and e.status = 'approved' and c.status = 'active' and a.status = 'active'
      and f.resource_kind = 'config_version' and f.status = 'active'
      and f.write_outcome = 'confirmed';
    if v_cursor_approved_at is null then
      raise exception using errcode = 'P0002', message = 'resource_not_found';
    end if;
  end if;
  return query
    select c.id, c.title, c.description, p.display_name,
      e.published_version_id, v.version_number, v.schema_key, v.schema_version,
      v.changelog,
      (select count(*) from public.platform_config_likes l
        where l.platform_id = e.platform_id and l.config_id = e.config_id),
      (select count(*) from public.platform_config_usage_events u
        where u.platform_id = e.platform_id and u.config_id = e.config_id
          and u.event_type = 'download_completed'),
      (select count(*) from public.platform_config_usage_events u
        where u.platform_id = e.platform_id and u.config_id = e.config_id
          and u.event_type = 'apply_delivery_completed'),
      exists (select 1 from public.platform_config_likes l
        where l.platform_id = e.platform_id and l.config_id = e.config_id
          and l.platform_account_id = v_principal.platform_account_id),
      e.approved_at, e.updated_at
    from public.platform_config_gallery_entries e
    join public.platform_configs c
      on c.platform_id = e.platform_id and c.id = e.config_id
    join public.platform_accounts a
      on a.platform_id = c.platform_id and a.id = c.platform_account_id
    left join public.platform_profiles p on p.platform_account_id = a.id
    join public.platform_config_versions v
      on v.platform_id = e.platform_id and v.config_id = e.config_id
        and v.id = e.published_version_id
    join public.platform_config_files f on f.id = v.file_id
    where e.platform_id = (p_ctx).platform_id and e.status = 'approved'
      and c.status = 'active' and a.status = 'active'
      and f.resource_kind = 'config_version' and f.status = 'active'
      and f.write_outcome = 'confirmed'
      and (p_cursor_config_id is null or (e.approved_at, e.config_id) <
        (v_cursor_approved_at, p_cursor_config_id))
    order by e.approved_at desc, e.config_id desc
    limit p_limit;
end;
$$;

create or replace function private.config_gallery_read(
  p_ctx private.account_context,
  p_config_id uuid
)
returns table (
  config_id uuid,
  title text,
  description text,
  author_display_name text,
  published_version_id uuid,
  version_number integer,
  schema_key text,
  schema_version text,
  changelog text,
  like_count bigint,
  download_count bigint,
  apply_delivery_count bigint,
  liked boolean,
  approved_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare v_principal record;
begin
  if (p_ctx).request_id is null or p_config_id is null then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_principal from private.account_principal(p_ctx);
  if v_principal.authorization <> 'allowed' then
    raise exception using errcode = '42501', message = v_principal.authorization;
  end if;
  return query
    select c.id, c.title, c.description, p.display_name,
      e.published_version_id, v.version_number, v.schema_key, v.schema_version,
      v.changelog,
      (select count(*) from public.platform_config_likes l
        where l.platform_id = e.platform_id and l.config_id = e.config_id),
      (select count(*) from public.platform_config_usage_events u
        where u.platform_id = e.platform_id and u.config_id = e.config_id
          and u.event_type = 'download_completed'),
      (select count(*) from public.platform_config_usage_events u
        where u.platform_id = e.platform_id and u.config_id = e.config_id
          and u.event_type = 'apply_delivery_completed'),
      exists (select 1 from public.platform_config_likes l
        where l.platform_id = e.platform_id and l.config_id = e.config_id
          and l.platform_account_id = v_principal.platform_account_id),
      e.approved_at, e.updated_at
    from public.platform_config_gallery_entries e
    join public.platform_configs c
      on c.platform_id = e.platform_id and c.id = e.config_id
    join public.platform_accounts a
      on a.platform_id = c.platform_id and a.id = c.platform_account_id
    left join public.platform_profiles p on p.platform_account_id = a.id
    join public.platform_config_versions v
      on v.platform_id = e.platform_id and v.config_id = e.config_id
        and v.id = e.published_version_id
    join public.platform_config_files f on f.id = v.file_id
    where e.platform_id = (p_ctx).platform_id and e.config_id = p_config_id
      and e.status = 'approved' and c.status = 'active' and a.status = 'active'
      and f.resource_kind = 'config_version' and f.status = 'active'
      and f.write_outcome = 'confirmed';
  if not found then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
end;
$$;

create or replace function private.config_gallery_content_authorize(
  p_ctx private.account_context,
  p_config_id uuid,
  p_delivery_kind text
)
returns table (
  file_id uuid,
  version_id uuid,
  storage_bucket text,
  storage_path text,
  original_name text,
  mime_type text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_principal record;
begin
  if (p_ctx).request_id is null or p_config_id is null
     or p_delivery_kind not in ('download', 'apply') then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_principal from private.account_principal(p_ctx);
  if v_principal.authorization <> 'allowed' then
    raise exception using errcode = '42501', message = v_principal.authorization;
  end if;
  perform private.config_rate_limit_require(
    (p_ctx).platform_id, v_principal.platform_account_id,
    'config_gallery_delivery', 3600, 600
  );
  return query
    select f.id, e.published_version_id, f.storage_bucket, f.storage_path,
      f.original_name, coalesce(f.mime_type, 'application/octet-stream')
    from public.platform_config_gallery_entries e
    join public.platform_configs c
      on c.platform_id = e.platform_id and c.id = e.config_id
    join public.platform_accounts a
      on a.platform_id = c.platform_id and a.id = c.platform_account_id
    join public.platform_config_versions v
      on v.platform_id = e.platform_id and v.config_id = e.config_id
        and v.id = e.published_version_id
    join public.platform_config_files f on f.id = v.file_id
    where e.platform_id = (p_ctx).platform_id and e.config_id = p_config_id
      and e.status = 'approved' and c.status = 'active' and a.status = 'active'
      and f.resource_kind = 'config_version' and f.status = 'active'
      and f.write_outcome = 'confirmed';
  if not found then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
end;
$$;

-- Delivery is rate-limited before Storage streaming starts. This recorder only
-- appends the central fact after a complete delivery and preserves idempotency.
create or replace function private.config_gallery_usage_record(
  p_ctx private.account_context,
  p_config_id uuid,
  p_event_type text,
  p_event_key text
)
returns table (
  usage_event_id uuid,
  config_id uuid,
  version_id uuid,
  event_type text,
  occurred_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_principal record;
  v_entry public.platform_config_gallery_entries;
  v_event public.platform_config_usage_events;
begin
  if (p_ctx).request_id is null or p_config_id is null
     or p_event_type not in ('download_completed', 'apply_delivery_completed')
     or p_event_key is null or length(p_event_key) not between 1 and 128
     or p_event_key ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_principal from private.account_principal(p_ctx);
  if v_principal.authorization <> 'allowed' then
    raise exception using errcode = '42501', message = v_principal.authorization;
  end if;
  select e.* into v_entry
  from public.platform_config_gallery_entries e
  join public.platform_configs c
    on c.platform_id = e.platform_id and c.id = e.config_id
  join public.platform_accounts author
    on author.platform_id = c.platform_id and author.id = c.platform_account_id
  join public.platform_config_versions v
    on v.platform_id = e.platform_id and v.config_id = e.config_id
      and v.id = e.published_version_id
  join public.platform_config_files f on f.id = v.file_id
  where e.platform_id = (p_ctx).platform_id and e.config_id = p_config_id
    and e.status = 'approved' and c.status = 'active' and author.status = 'active'
    and f.resource_kind = 'config_version' and f.status = 'active'
    and f.write_outcome = 'confirmed';
  if not found then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  insert into public.platform_config_usage_events(
    platform_id, config_id, version_id, actor_platform_account_id,
    event_type, event_key
  ) values (
    (p_ctx).platform_id, p_config_id, v_entry.published_version_id,
    v_principal.platform_account_id, p_event_type, p_event_key
  )
  on conflict on constraint platform_config_usage_events_platform_id_event_type_event_k_key do nothing
  returning * into v_event;
  if not found then
    select * into v_event from public.platform_config_usage_events u
    where u.platform_id = (p_ctx).platform_id
      and u.event_type = p_event_type and u.event_key = p_event_key;
    if v_event.config_id <> p_config_id
       or v_event.version_id <> v_entry.published_version_id
       or v_event.actor_platform_account_id is distinct from v_principal.platform_account_id then
      raise exception using errcode = '23505', message = 'idempotency_conflict';
    end if;
  end if;
  return query select v_event.id, v_event.config_id, v_event.version_id,
    v_event.event_type, v_event.occurred_at;
end;
$$;

alter function private.file_upload_state_by_kind(private.account_context, uuid, text) owner to domain_owner;
alter function private.file_receive_claim_by_kind(private.account_context, uuid, text, text, integer) owner to domain_owner;
alter function private.file_prepare_store_by_kind(private.account_context, uuid, text, bigint, text, text, text) owner to domain_owner;
alter function private.file_write_attempt_mark_unknown_by_kind(private.account_context, uuid, text, uuid, text) owner to domain_owner;
alter function private.file_write_attempt_finalize_by_kind(private.account_context, uuid, text, uuid, bigint, text, text) owner to domain_owner;
alter function private.file_upload_state(private.account_context, uuid) owner to domain_owner;
alter function private.file_receive_claim(private.account_context, uuid, text, integer) owner to domain_owner;
alter function private.file_prepare_store(private.account_context, uuid, bigint, text, text) owner to domain_owner;
alter function private.file_write_attempt_mark_unknown(private.account_context, uuid, uuid, text) owner to domain_owner;
alter function private.file_write_attempt_finalize(private.account_context, uuid, uuid, bigint, text, text) owner to domain_owner;
alter function private.config_version_file_resolve(private.account_context, uuid, uuid, boolean) owner to domain_owner;
alter function private.config_version_upload_state(private.account_context, uuid, uuid) owner to domain_owner;
alter function private.config_version_receive_claim(private.account_context, uuid, uuid, text, integer) owner to domain_owner;
alter function private.config_version_prepare_store(private.account_context, uuid, uuid, bigint, text, text) owner to domain_owner;
alter function private.config_version_write_attempt_mark_unknown(private.account_context, uuid, uuid, uuid, text) owner to domain_owner;
alter function private.config_version_write_attempt_finalize(private.account_context, uuid, uuid, uuid, bigint, text, text) owner to domain_owner;
alter function private.config_version_download_authorize(private.account_context, uuid, uuid) owner to domain_owner;
alter function private.config_delete_request(private.account_context, uuid) owner to domain_owner;
alter function private.config_gallery_list(private.account_context, uuid, integer) owner to domain_owner;
alter function private.config_gallery_read(private.account_context, uuid) owner to domain_owner;
alter function private.config_gallery_content_authorize(private.account_context, uuid, text) owner to domain_owner;
alter function private.config_gallery_usage_record(private.account_context, uuid, text, text) owner to domain_owner;

revoke all on function private.file_upload_state_by_kind(private.account_context, uuid, text),
  private.file_receive_claim_by_kind(private.account_context, uuid, text, text, integer),
  private.file_prepare_store_by_kind(private.account_context, uuid, text, bigint, text, text, text),
  private.file_write_attempt_mark_unknown_by_kind(private.account_context, uuid, text, uuid, text),
  private.file_write_attempt_finalize_by_kind(private.account_context, uuid, text, uuid, bigint, text, text),
  private.config_version_file_resolve(private.account_context, uuid, uuid, boolean)
from public, anon, authenticated, account_executor, admin_executor, job_executor, recovery_executor;

revoke all on function private.file_upload_state(private.account_context, uuid),
  private.file_receive_claim(private.account_context, uuid, text, integer),
  private.file_prepare_store(private.account_context, uuid, bigint, text, text),
  private.file_write_attempt_mark_unknown(private.account_context, uuid, uuid, text),
  private.file_write_attempt_finalize(private.account_context, uuid, uuid, bigint, text, text),
  private.config_version_upload_state(private.account_context, uuid, uuid),
  private.config_version_receive_claim(private.account_context, uuid, uuid, text, integer),
  private.config_version_prepare_store(private.account_context, uuid, uuid, bigint, text, text),
  private.config_version_write_attempt_mark_unknown(private.account_context, uuid, uuid, uuid, text),
  private.config_version_write_attempt_finalize(private.account_context, uuid, uuid, uuid, bigint, text, text),
  private.config_version_download_authorize(private.account_context, uuid, uuid),
  private.config_delete_request(private.account_context, uuid),
  private.config_gallery_list(private.account_context, uuid, integer),
  private.config_gallery_read(private.account_context, uuid),
  private.config_gallery_content_authorize(private.account_context, uuid, text),
  private.config_gallery_usage_record(private.account_context, uuid, text, text)
from public, anon, authenticated, admin_executor, job_executor, recovery_executor;

grant execute on function private.file_upload_state(private.account_context, uuid),
  private.file_receive_claim(private.account_context, uuid, text, integer),
  private.file_prepare_store(private.account_context, uuid, bigint, text, text),
  private.file_write_attempt_mark_unknown(private.account_context, uuid, uuid, text),
  private.file_write_attempt_finalize(private.account_context, uuid, uuid, bigint, text, text),
  private.config_version_upload_state(private.account_context, uuid, uuid),
  private.config_version_receive_claim(private.account_context, uuid, uuid, text, integer),
  private.config_version_prepare_store(private.account_context, uuid, uuid, bigint, text, text),
  private.config_version_write_attempt_mark_unknown(private.account_context, uuid, uuid, uuid, text),
  private.config_version_write_attempt_finalize(private.account_context, uuid, uuid, uuid, bigint, text, text),
  private.config_version_download_authorize(private.account_context, uuid, uuid),
  private.config_delete_request(private.account_context, uuid),
  private.config_gallery_list(private.account_context, uuid, integer),
  private.config_gallery_read(private.account_context, uuid),
  private.config_gallery_content_authorize(private.account_context, uuid, text),
  private.config_gallery_usage_record(private.account_context, uuid, text, text)
to account_executor;
