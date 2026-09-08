-- M4-03: policy update, bounded intent reservation and receiving state.
-- Storage I/O, final settlement and workers are intentionally delivered later.

alter table public.platform_config_files
  add column lease_owner text
    check (lease_owner is null or length(lease_owner) between 1 and 128);

create or replace function private.admin_file_policy_update(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_enabled boolean,
  p_max_file_bytes bigint,
  p_max_files integer,
  p_max_total_bytes bigint
)
returns table (
  platform_id uuid,
  enabled boolean,
  max_file_bytes bigint,
  max_files integer,
  max_total_bytes bigint,
  updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_policy public.platform_file_policies;
begin
  if (p_ctx).admin_user_id is null or (p_ctx).session_id is null
     or (p_ctx).request_id is null or p_platform_id is null
     or p_enabled is null or p_max_file_bytes not between 1 and 1048576
     or p_max_files <= 0 or p_max_total_bytes <= 0
     or p_max_file_bytes > p_max_total_bytes then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if not exists (select 1 from private.system_admin where user_id = (p_ctx).admin_user_id)
     or not exists (
       select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id)
       where active
     ) then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
  if not exists (select 1 from public.platforms where id = p_platform_id) then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  insert into public.platform_file_policies (
    platform_id, enabled, max_file_bytes, max_files, max_total_bytes
  ) values (
    p_platform_id, p_enabled, p_max_file_bytes, p_max_files, p_max_total_bytes
  ) on conflict (platform_id) do update set
    enabled = excluded.enabled,
    max_file_bytes = excluded.max_file_bytes,
    max_files = excluded.max_files,
    max_total_bytes = excluded.max_total_bytes
  returning * into v_policy;
  perform private.audit_append(
    (p_ctx).request_id, 'admin', (p_ctx).admin_user_id, p_platform_id, null,
    'file.policy_updated', 'platform_file_policy', p_platform_id, null, null,
    jsonb_build_object('enabled', v_policy.enabled,
      'max_file_bytes', v_policy.max_file_bytes,
      'max_files', v_policy.max_files,
      'max_total_bytes', v_policy.max_total_bytes)
  );
  return query select v_policy.platform_id, v_policy.enabled,
    v_policy.max_file_bytes, v_policy.max_files, v_policy.max_total_bytes,
    v_policy.updated_at;
end;
$$;

create or replace function private.file_intent_create(
  p_ctx private.account_context,
  p_original_name text,
  p_requested_size_bytes bigint,
  p_mime_type text,
  p_purpose text,
  p_replaces_file_id uuid,
  p_idempotency_key text
)
returns table (
  file_id uuid,
  status text,
  write_outcome text,
  reserved_bytes bigint,
  reserved_count integer,
  actual_size_bytes bigint,
  intent_expires_at timestamptz,
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
  v_policy public.platform_file_policies;
  v_replace public.platform_config_files;
  v_file public.platform_config_files;
  v_claim private.idempotency_keys%rowtype;
  v_new_claim boolean := false;
  v_hash bytea;
  v_response jsonb;
  v_now timestamptz := clock_timestamp();
begin
  if (p_ctx).user_id is null or (p_ctx).session_id is null
     or (p_ctx).platform_id is null or (p_ctx).platform_key_id is null
     or (p_ctx).request_id is null or p_original_name is null
     or length(p_original_name) not between 1 and 255
     or p_original_name ~ '[[:cntrl:]]'
     or p_requested_size_bytes is null
     or p_requested_size_bytes not between 1 and 1048576
     or p_mime_type is not null and length(p_mime_type) not between 1 and 255
     or p_purpose is not null and length(p_purpose) not between 1 and 128
     or p_idempotency_key is null or length(p_idempotency_key) not between 1 and 128 then
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

  v_hash := extensions.digest(
    convert_to(
      p_original_name || ':' || p_requested_size_bytes::text || ':'
        || coalesce(p_mime_type, '') || ':' || coalesce(p_purpose, '') || ':'
        || coalesce(p_replaces_file_id::text, ''),
      'utf8'
    ), 'sha256'
  );
  insert into private.idempotency_keys (
    platform_id, platform_account_id, operation, actor_scope, idempotency_key, request_hash
  ) values (
    (p_ctx).platform_id, v_account_id, 'file_intent_create', 'user:' || (p_ctx).user_id::text,
    p_idempotency_key, v_hash
  ) on conflict (platform_id, platform_account_id, operation, actor_scope, idempotency_key)
    do nothing returning true into v_new_claim;
  if not coalesce(v_new_claim, false) then
    select * into v_claim from private.idempotency_keys i
    where i.platform_id = (p_ctx).platform_id and i.platform_account_id = v_account_id
      and i.operation = 'file_intent_create'
      and i.actor_scope = 'user:' || (p_ctx).user_id::text
      and i.idempotency_key = p_idempotency_key for update;
    if v_claim.request_hash <> v_hash then
      raise exception using errcode = '23505', message = 'idempotency_conflict';
    end if;
    if v_claim.state = 'completed' then
      return query select
        (v_claim.response_body->>'file_id')::uuid,
        v_claim.response_body->>'status',
        v_claim.response_body->>'write_outcome',
        (v_claim.response_body->>'reserved_bytes')::bigint,
        (v_claim.response_body->>'reserved_count')::integer,
        nullif(v_claim.response_body->>'actual_size_bytes', '')::bigint,
        (v_claim.response_body->>'intent_expires_at')::timestamptz,
        v_claim.response_body->>'storage_path',
        nullif(v_claim.response_body->>'write_attempt_id', '')::uuid;
      return;
    end if;
    raise exception using errcode = 'P0001', message = 'operation_in_progress';
  end if;

  insert into public.platform_file_policies (platform_id)
    values ((p_ctx).platform_id) on conflict (platform_id) do nothing;
  select * into v_policy from public.platform_file_policies p
  where p.platform_id = (p_ctx).platform_id for update;
  if not v_policy.enabled then
    raise exception using errcode = '42501', message = 'platform_file_policy_disabled';
  end if;
  if (select coalesce(sum(f.reserved_count), 0) + 1
      from public.platform_config_files f
      where f.platform_id = (p_ctx).platform_id
        and f.platform_account_id = v_account_id) > v_policy.max_files then
    raise exception using errcode = 'P0001', message = 'quota_exceeded';
  end if;
  if (select coalesce(sum(f.reserved_bytes), 0) + p_requested_size_bytes
      from public.platform_config_files f
      where f.platform_id = (p_ctx).platform_id
        and f.platform_account_id = v_account_id) > v_policy.max_total_bytes then
    raise exception using errcode = 'P0001', message = 'quota_exceeded';
  end if;
  if p_replaces_file_id is not null then
    select * into v_replace from public.platform_config_files f
    where f.platform_id = (p_ctx).platform_id
      and f.platform_account_id = v_account_id and f.id = p_replaces_file_id
    for update;
    if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
    if v_replace.status <> 'active' then
      raise exception using errcode = 'P0001', message = 'file_busy';
    end if;
  end if;

  v_file.id := gen_random_uuid();
  insert into public.platform_config_files (
    id, platform_id, platform_account_id, original_name, storage_path,
    mime_type, purpose, requested_size_bytes, reserved_bytes, reserved_count,
    status, replaces_file_id, intent_expires_at
  ) values (
    v_file.id, (p_ctx).platform_id, v_account_id, p_original_name,
    (p_ctx).platform_id::text || '/' || v_account_id::text || '/' || v_file.id::text,
    p_mime_type, p_purpose, p_requested_size_bytes, p_requested_size_bytes, 1,
    'pending', p_replaces_file_id, v_now + interval '10 minutes'
  ) returning * into v_file;
  perform private.audit_append(
    (p_ctx).request_id, 'user', (p_ctx).user_id, (p_ctx).platform_id, v_account_id,
    'file.intent_created', 'platform_config_file', v_file.id, null, null,
    jsonb_build_object('requested_size_bytes', v_file.requested_size_bytes,
      'replaces', p_replaces_file_id is not null)
  );
  v_response := jsonb_build_object(
    'file_id', v_file.id, 'status', v_file.status, 'write_outcome', v_file.write_outcome,
    'reserved_bytes', v_file.reserved_bytes, 'reserved_count', v_file.reserved_count,
    'actual_size_bytes', '', 'intent_expires_at', v_file.intent_expires_at,
    'storage_path', v_file.storage_path, 'write_attempt_id', ''
  );
  perform private.idempotency_finalize(
    (p_ctx).platform_id, v_account_id, 'file_intent_create', 'user:' || (p_ctx).user_id::text,
    p_idempotency_key, v_hash, 201, v_response
  );
  return query select v_file.id, v_file.status, v_file.write_outcome,
    v_file.reserved_bytes, v_file.reserved_count, v_file.actual_size_bytes,
    v_file.intent_expires_at, v_file.storage_path, null::uuid;
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
  status text,
  write_outcome text,
  reserved_bytes bigint,
  reserved_count integer,
  lease_until timestamptz,
  fencing_token bigint
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
  v_now timestamptz := clock_timestamp();
begin
  if (p_ctx).request_id is null or p_file_id is null
     or p_lease_owner is null or length(p_lease_owner) not between 1 and 128
     or p_lease_seconds not between 1 and 60 then
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
    and f.platform_account_id = v_account_id and f.id = p_file_id for update;
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
  returning f.id, f.status, f.write_outcome, f.reserved_bytes,
    f.reserved_count, f.lease_until, f.fencing_token
    into file_id, status, write_outcome, reserved_bytes, reserved_count,
      lease_until, fencing_token;
  perform private.audit_append(
    (p_ctx).request_id, 'user', (p_ctx).user_id, (p_ctx).platform_id, v_account_id,
    'file.receive_claimed', 'platform_config_file', p_file_id, null, null,
    jsonb_build_object('fencing_token', fencing_token)
  );
  return next;
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
  if p_file_id is null or p_actual_size_bytes not between 1 and 1048576
     or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$'
     or p_idempotency_key is null or length(p_idempotency_key) not between 1 and 128 then
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
    and f.platform_account_id = v_account_id and f.id = p_file_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  v_hash := extensions.digest(convert_to(p_file_id::text || ':' || p_actual_size_bytes::text || ':' || p_sha256, 'utf8'), 'sha256');
  insert into private.idempotency_keys (
    platform_id, platform_account_id, operation, actor_scope, idempotency_key, request_hash
  ) values (
    (p_ctx).platform_id, v_account_id, 'file_prepare_store', 'user:' || (p_ctx).user_id::text,
    p_idempotency_key, v_hash
  ) on conflict (platform_id, platform_account_id, operation, actor_scope, idempotency_key)
    do nothing returning true into v_new_claim;
  if not coalesce(v_new_claim, false) then
    select * into v_claim from private.idempotency_keys i
    where i.platform_id = (p_ctx).platform_id and i.platform_account_id = v_account_id
      and i.operation = 'file_prepare_store'
      and i.actor_scope = 'user:' || (p_ctx).user_id::text
      and i.idempotency_key = p_idempotency_key for update;
    if v_claim.request_hash <> v_hash then raise exception using errcode = '23505', message = 'idempotency_conflict'; end if;
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
      'write_attempt_id', v_attempt.id)
  );
  v_response := jsonb_build_object(
    'file_id', v_file.id, 'status', 'storing', 'write_outcome', 'in_flight',
    'reserved_bytes', p_actual_size_bytes, 'reserved_count', v_file.reserved_count,
    'actual_size_bytes', p_actual_size_bytes, 'sha256', p_sha256,
    'storage_path', v_file.storage_path, 'write_attempt_id', v_attempt.id
  );
  perform private.idempotency_finalize(
    (p_ctx).platform_id, v_account_id, 'file_prepare_store', 'user:' || (p_ctx).user_id::text,
    p_idempotency_key, v_hash, 200, v_response
  );
  return query select v_file.id, 'storing'::text, 'in_flight'::text,
    p_actual_size_bytes, v_file.reserved_count, p_actual_size_bytes,
    p_sha256, v_file.storage_path, v_attempt.id;
end;
$$;

alter function private.admin_file_policy_update(private.admin_context, uuid, boolean, bigint, integer, bigint) owner to domain_owner;
alter function private.file_intent_create(private.account_context, text, bigint, text, text, uuid, text) owner to domain_owner;
alter function private.file_receive_claim(private.account_context, uuid, text, integer) owner to domain_owner;
alter function private.file_prepare_store(private.account_context, uuid, bigint, text, text) owner to domain_owner;

revoke all on function private.admin_file_policy_update(private.admin_context, uuid, boolean, bigint, integer, bigint)
  from public, anon, authenticated, account_executor, job_executor, recovery_executor;
revoke all on function private.file_intent_create(private.account_context, text, bigint, text, text, uuid, text)
  from public, anon, authenticated, admin_executor, job_executor, recovery_executor;
revoke all on function private.file_receive_claim(private.account_context, uuid, text, integer)
  from public, anon, authenticated, admin_executor, job_executor, recovery_executor;
revoke all on function private.file_prepare_store(private.account_context, uuid, bigint, text, text)
  from public, anon, authenticated, admin_executor, job_executor, recovery_executor;

grant execute on function private.admin_file_policy_update(private.admin_context, uuid, boolean, bigint, integer, bigint) to admin_executor;
grant execute on function private.file_intent_create(private.account_context, text, bigint, text, text, uuid, text) to account_executor;
grant execute on function private.file_receive_claim(private.account_context, uuid, text, integer) to account_executor;
grant execute on function private.file_prepare_store(private.account_context, uuid, bigint, text, text) to account_executor;
