-- OPT-007 Phase 01 compatibility layer.
-- The canonical /v1/config-files surface remains legacy-only while all physical
-- objects share one platform-level reserved-byte ceiling.

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
        and f.platform_account_id = v_account_id
        and f.resource_kind = 'legacy') > v_policy.max_files then
    raise exception using errcode = 'P0001', message = 'quota_exceeded';
  end if;
  if (select coalesce(sum(f.reserved_bytes), 0) + p_requested_size_bytes
      from public.platform_config_files f
      where f.platform_id = (p_ctx).platform_id
        and f.platform_account_id = v_account_id
        and f.resource_kind = 'legacy') > v_policy.max_total_bytes then
    raise exception using errcode = 'P0001', message = 'quota_exceeded';
  end if;
  if (select coalesce(sum(f.reserved_bytes), 0) + p_requested_size_bytes
      from public.platform_config_files f
      where f.platform_id = (p_ctx).platform_id) > v_policy.max_platform_total_bytes then
    raise exception using errcode = 'P0001', message = 'platform_storage_quota_exceeded';
  end if;
  if p_replaces_file_id is not null then
    select * into v_replace from public.platform_config_files f
    where f.platform_id = (p_ctx).platform_id
      and f.platform_account_id = v_account_id and f.id = p_replaces_file_id
      and f.resource_kind = 'legacy'
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
    status, replaces_file_id, intent_expires_at, resource_kind
  ) values (
    v_file.id, (p_ctx).platform_id, v_account_id, p_original_name,
    (p_ctx).platform_id::text || '/' || v_account_id::text || '/' || v_file.id::text,
    p_mime_type, p_purpose, p_requested_size_bytes, p_requested_size_bytes, 1,
    'pending', p_replaces_file_id, v_now + interval '10 minutes', 'legacy'
  ) returning * into v_file;
  perform private.audit_append(
    (p_ctx).request_id, 'user', (p_ctx).user_id, (p_ctx).platform_id, v_account_id,
    'file.intent_created', 'platform_config_file', v_file.id, null, null,
    jsonb_build_object('requested_size_bytes', v_file.requested_size_bytes,
      'replaces', p_replaces_file_id is not null, 'resource_kind', 'legacy')
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

create or replace function private.file_budget_read(
  p_ctx private.account_context
)
returns table (
  platform_id uuid,
  enabled boolean,
  max_file_bytes bigint,
  max_files integer,
  max_total_bytes bigint,
  reserved_bytes bigint,
  reserved_count integer,
  available_bytes bigint,
  available_count integer,
  over_quota boolean,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_principal record;
  v_policy public.platform_file_policies;
  v_reserved_bytes bigint;
  v_reserved_count integer;
begin
  if (p_ctx).request_id is null then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_principal from private.account_principal(p_ctx);
  if v_principal.authorization not in ('allowed', 'suspended') then
    raise exception using errcode = '42501', message = v_principal.authorization;
  end if;
  select * into v_policy from public.platform_file_policies p
  where p.platform_id = (p_ctx).platform_id;
  select coalesce(sum(f.reserved_bytes), 0)::bigint,
    coalesce(sum(f.reserved_count), 0)::integer
    into v_reserved_bytes, v_reserved_count
  from public.platform_config_files f
  where f.platform_id = (p_ctx).platform_id
    and f.platform_account_id = v_principal.platform_account_id
    and f.resource_kind = 'legacy';
  return query select
    (p_ctx).platform_id,
    coalesce(v_policy.enabled, true),
    coalesce(v_policy.max_file_bytes, 1048576::bigint),
    coalesce(v_policy.max_files, 10),
    coalesce(v_policy.max_total_bytes, 10485760::bigint),
    v_reserved_bytes,
    v_reserved_count,
    greatest(0::bigint, coalesce(v_policy.max_total_bytes, 10485760::bigint) - v_reserved_bytes),
    greatest(0, coalesce(v_policy.max_files, 10) - v_reserved_count),
    v_reserved_bytes > coalesce(v_policy.max_total_bytes, 10485760::bigint)
      or v_reserved_count > coalesce(v_policy.max_files, 10),
    v_policy.updated_at;
end;
$$;

create or replace function private.file_list(
  p_ctx private.account_context,
  p_cursor_file_id uuid default null,
  p_limit integer default 20
)
returns table (
  file_id uuid, status text, write_outcome text, reserved_bytes bigint,
  reserved_count integer, actual_size_bytes bigint, original_name text,
  mime_type text, created_at timestamptz, updated_at timestamptz,
  cancel_requested_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_principal record;
  v_cursor_created_at timestamptz;
begin
  if (p_ctx).request_id is null or p_limit is null or p_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_principal from private.account_principal(p_ctx);
  if v_principal.authorization not in ('allowed', 'suspended') then
    raise exception using errcode = '42501', message = v_principal.authorization;
  end if;
  if p_cursor_file_id is not null then
    select f.created_at into v_cursor_created_at
    from public.platform_config_files f
    where f.platform_id = (p_ctx).platform_id
      and f.platform_account_id = v_principal.platform_account_id
      and f.id = p_cursor_file_id and f.resource_kind = 'legacy';
    if v_cursor_created_at is null then
      raise exception using errcode = 'P0002', message = 'resource_not_found';
    end if;
  end if;
  return query
    select f.id, f.status, f.write_outcome, f.reserved_bytes, f.reserved_count,
      f.actual_size_bytes, f.original_name, f.mime_type, f.created_at, f.updated_at,
      f.cancel_requested_at
    from public.platform_config_files f
    where f.platform_id = (p_ctx).platform_id
      and f.platform_account_id = v_principal.platform_account_id
      and f.resource_kind = 'legacy'
      and f.status <> 'deleted'
      and (p_cursor_file_id is null or (f.created_at, f.id) <
        (v_cursor_created_at, p_cursor_file_id))
    order by f.created_at desc, f.id desc
    limit p_limit;
end;
$$;

create or replace function private.file_read(
  p_ctx private.account_context,
  p_file_id uuid
)
returns table (
  file_id uuid, status text, write_outcome text, reserved_bytes bigint,
  reserved_count integer, actual_size_bytes bigint, original_name text,
  mime_type text, created_at timestamptz, updated_at timestamptz,
  cancel_requested_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_principal record;
begin
  if (p_ctx).request_id is null or p_file_id is null then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_principal from private.account_principal(p_ctx);
  if v_principal.authorization not in ('allowed', 'suspended') then
    raise exception using errcode = '42501', message = v_principal.authorization;
  end if;
  return query
    select f.id, f.status, f.write_outcome, f.reserved_bytes, f.reserved_count,
      f.actual_size_bytes, f.original_name, f.mime_type, f.created_at, f.updated_at,
      f.cancel_requested_at
    from public.platform_config_files f
    where f.platform_id = (p_ctx).platform_id
      and f.platform_account_id = v_principal.platform_account_id
      and f.id = p_file_id and f.resource_kind = 'legacy'
      and f.status <> 'deleted';
  if not found then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
end;
$$;

create or replace function private.file_download_authorize(
  p_ctx private.account_context,
  p_file_id uuid
)
returns table (
  file_id uuid, storage_bucket text, storage_path text, original_name text, mime_type text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_principal record;
  v_file public.platform_config_files;
begin
  if (p_ctx).request_id is null or p_file_id is null then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_principal from private.account_principal(p_ctx);
  if v_principal.authorization <> 'allowed' then
    raise exception using errcode = '42501', message = v_principal.authorization;
  end if;
  select * into v_file
  from public.platform_config_files f
  where f.platform_id = (p_ctx).platform_id
    and f.platform_account_id = v_principal.platform_account_id
    and f.id = p_file_id and f.resource_kind = 'legacy'
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  if v_file.status <> 'active' or v_file.write_outcome <> 'confirmed' then
    raise exception using errcode = 'P0001', message = 'file_not_downloadable';
  end if;
  perform private.audit_append(
    (p_ctx).request_id, 'user', (p_ctx).user_id, (p_ctx).platform_id,
    v_principal.platform_account_id, 'file.download_authorized',
    'platform_config_file', v_file.id, null, null, '{}'::jsonb
  );
  return query select v_file.id, v_file.storage_bucket, v_file.storage_path,
    v_file.original_name, coalesce(v_file.mime_type, 'application/octet-stream');
end;
$$;

create or replace function private.file_download_event(
  p_ctx private.account_context,
  p_file_id uuid,
  p_event text,
  p_error_code text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_principal record;
  v_event text;
begin
  if (p_ctx).request_id is null or p_file_id is null
     or p_event not in ('stream_completed', 'failed')
     or p_error_code is not null and length(p_error_code) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_principal from private.account_principal(p_ctx);
  if v_principal.authorization not in ('allowed', 'suspended') then
    raise exception using errcode = '42501', message = v_principal.authorization;
  end if;
  if not exists (
    select 1 from public.platform_config_files f
    where f.id = p_file_id and f.platform_id = (p_ctx).platform_id
      and f.platform_account_id = v_principal.platform_account_id
      and f.resource_kind = 'legacy'
  ) then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  v_event := case when p_event = 'stream_completed'
    then 'file.download_stream_completed' else 'file.download_failed' end;
  perform private.audit_append(
    (p_ctx).request_id, 'user', (p_ctx).user_id, (p_ctx).platform_id,
    v_principal.platform_account_id, v_event, 'platform_config_file',
    p_file_id, null, null, jsonb_build_object('error_code', p_error_code)
  );
end;
$$;

create or replace function private.admin_file_list(
  p_ctx private.admin_context,
  p_cursor_file_id uuid default null,
  p_limit integer default 20
)
returns table (
  file_id uuid,
  platform_id uuid,
  platform_account_id uuid,
  status text,
  write_outcome text,
  reserved_bytes bigint,
  reserved_count integer,
  actual_size_bytes bigint,
  original_name text,
  mime_type text,
  created_at timestamptz,
  updated_at timestamptz,
  cancel_requested_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_cursor_created_at timestamptz;
begin
  if (p_ctx).admin_user_id is null or (p_ctx).session_id is null
     or p_limit is null or p_limit not between 1 and 100
     or not exists (select 1 from private.system_admin where user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active) then
    raise exception using errcode = case when p_limit is null or p_limit not between 1 and 100 then '22023' else '42501' end,
      message = case when p_limit is null or p_limit not between 1 and 100 then 'invalid_input' else 'admin_required' end;
  end if;
  if p_cursor_file_id is not null then
    select f.created_at into v_cursor_created_at
    from public.platform_config_files f
    where f.id = p_cursor_file_id and f.resource_kind = 'legacy';
    if v_cursor_created_at is null then
      raise exception using errcode = 'P0002', message = 'resource_not_found';
    end if;
  end if;
  return query
    select f.id, f.platform_id, f.platform_account_id, f.status, f.write_outcome,
      f.reserved_bytes, f.reserved_count, f.actual_size_bytes, f.original_name,
      f.mime_type, f.created_at, f.updated_at, f.cancel_requested_at
    from public.platform_config_files f
    where f.resource_kind = 'legacy' and f.status <> 'deleted'
      and (p_cursor_file_id is null or (f.created_at, f.id) < (v_cursor_created_at, p_cursor_file_id))
    order by f.created_at desc, f.id desc
    limit p_limit;
end;
$$;

create or replace function private.admin_file_list_v2(
  p_ctx private.admin_context,
  p_cursor_file_id uuid default null,
  p_limit integer default 20,
  p_query text default null
)
returns table (
  file_id uuid, platform_id uuid, platform_account_id uuid, status text,
  write_outcome text, reserved_bytes bigint, reserved_count integer,
  actual_size_bytes bigint, original_name text, mime_type text,
  created_at timestamptz, updated_at timestamptz, cancel_requested_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_cursor_created_at timestamptz;
  v_query text;
begin
  if (p_ctx).admin_user_id is null or (p_ctx).session_id is null
     or p_limit is null or p_limit not between 1 and 100
     or (p_query is not null and length(btrim(p_query)) > 128)
     or not exists (select 1 from private.system_admin sa where sa.user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active) then
    raise exception using errcode = case when p_limit is null or p_limit not between 1 and 100 or (p_query is not null and length(btrim(p_query)) > 128) then '22023' else '42501' end,
      message = case when p_limit is null or p_limit not between 1 and 100 or (p_query is not null and length(btrim(p_query)) > 128) then 'invalid_input' else 'admin_required' end;
  end if;
  if p_cursor_file_id is not null then
    select f.created_at into v_cursor_created_at from public.platform_config_files f
    where f.id = p_cursor_file_id and f.resource_kind = 'legacy';
    if v_cursor_created_at is null then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  end if;
  v_query := nullif(btrim(p_query), '');
  return query
    select f.id, f.platform_id, f.platform_account_id, f.status, f.write_outcome,
      f.reserved_bytes, f.reserved_count, f.actual_size_bytes, f.original_name,
      f.mime_type, f.created_at, f.updated_at, f.cancel_requested_at
    from public.platform_config_files f
    where f.resource_kind = 'legacy' and f.status <> 'deleted'
      and (p_cursor_file_id is null or (f.created_at, f.id) < (v_cursor_created_at, p_cursor_file_id))
      and (v_query is null or f.id::text ilike '%' || v_query || '%'
        or coalesce(f.original_name, '') ilike '%' || v_query || '%'
        or f.status ilike '%' || v_query || '%'
        or f.write_outcome ilike '%' || v_query || '%'
        or f.mime_type ilike '%' || v_query || '%')
    order by f.created_at desc, f.id desc limit p_limit;
end;
$$;

create or replace function private.admin_file_list_v3(
  p_ctx private.admin_context,
  p_platform_id uuid default null,
  p_cursor_file_id uuid default null,
  p_limit integer default 20,
  p_query text default null
)
returns table (
  file_id uuid, platform_id uuid, platform_account_id uuid, status text,
  write_outcome text, reserved_bytes bigint, reserved_count integer,
  actual_size_bytes bigint, original_name text, mime_type text,
  created_at timestamptz, updated_at timestamptz, cancel_requested_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_cursor_created_at timestamptz;
  v_cursor_platform_id uuid;
  v_query text;
begin
  if (p_ctx).admin_user_id is null or (p_ctx).session_id is null
     or p_limit is null or p_limit not between 1 and 100
     or (p_query is not null and length(btrim(p_query)) > 128)
     or not exists (select 1 from private.system_admin sa where sa.user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active) then
    raise exception using errcode = case when p_limit is null or p_limit not between 1 and 100 or (p_query is not null and length(btrim(p_query)) > 128) then '22023' else '42501' end,
      message = case when p_limit is null or p_limit not between 1 and 100 or (p_query is not null and length(btrim(p_query)) > 128) then 'invalid_input' else 'admin_required' end;
  end if;
  if p_platform_id is not null
     and not exists (select 1 from public.platforms p where p.id = p_platform_id) then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  if p_cursor_file_id is not null then
    select f.created_at, f.platform_id into v_cursor_created_at, v_cursor_platform_id
      from public.platform_config_files f where f.id = p_cursor_file_id and f.resource_kind = 'legacy';
    if v_cursor_created_at is null then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
    if p_platform_id is not null and v_cursor_platform_id <> p_platform_id then
      raise exception using errcode = '22023', message = 'cross_platform_cursor';
    end if;
  end if;
  v_query := nullif(btrim(p_query), '');
  return query
    select f.id, f.platform_id, f.platform_account_id, f.status, f.write_outcome,
      f.reserved_bytes, f.reserved_count, f.actual_size_bytes, f.original_name,
      f.mime_type, f.created_at, f.updated_at, f.cancel_requested_at
    from public.platform_config_files f
    where f.resource_kind = 'legacy' and f.status <> 'deleted'
      and (p_platform_id is null or f.platform_id = p_platform_id)
      and (p_cursor_file_id is null or (f.created_at, f.id) < (v_cursor_created_at, p_cursor_file_id))
      and (v_query is null or f.id::text ilike '%' || v_query || '%'
        or coalesce(f.original_name, '') ilike '%' || v_query || '%'
        or f.status ilike '%' || v_query || '%'
        or f.write_outcome ilike '%' || v_query || '%'
        or f.mime_type ilike '%' || v_query || '%')
    order by f.created_at desc, f.id desc limit p_limit;
end;
$$;

create or replace function private.admin_file_read(
  p_ctx private.admin_context,
  p_file_id uuid
)
returns table (
  file_id uuid, platform_id uuid, platform_account_id uuid, status text,
  write_outcome text, reserved_bytes bigint, reserved_count integer,
  actual_size_bytes bigint, original_name text, mime_type text,
  created_at timestamptz, updated_at timestamptz, cancel_requested_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
begin
  if (p_ctx).admin_user_id is null or (p_ctx).session_id is null or p_file_id is null
     or not exists (select 1 from private.system_admin where user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active) then
    raise exception using errcode = case when p_file_id is null then '22023' else '42501' end,
      message = case when p_file_id is null then 'invalid_input' else 'admin_required' end;
  end if;
  return query select f.id, f.platform_id, f.platform_account_id, f.status, f.write_outcome,
    f.reserved_bytes, f.reserved_count, f.actual_size_bytes, f.original_name, f.mime_type,
    f.created_at, f.updated_at, f.cancel_requested_at
  from public.platform_config_files f
  where f.id = p_file_id and f.resource_kind = 'legacy' and f.status <> 'deleted';
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
end;
$$;

create or replace function private.admin_file_download_authorize(
  p_ctx private.admin_context,
  p_file_id uuid
)
returns table (
  file_id uuid, platform_id uuid, storage_bucket text, storage_path text,
  original_name text, mime_type text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_file public.platform_config_files;
begin
  if (p_ctx).admin_user_id is null or (p_ctx).session_id is null or p_file_id is null
     or not exists (select 1 from private.system_admin where user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active) then
    raise exception using errcode = case when p_file_id is null then '22023' else '42501' end,
      message = case when p_file_id is null then 'invalid_input' else 'admin_required' end;
  end if;
  select * into v_file from public.platform_config_files f
  where f.id = p_file_id and f.resource_kind = 'legacy' for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  if v_file.status <> 'active' or v_file.write_outcome <> 'confirmed' then
    raise exception using errcode = 'P0001', message = 'file_not_downloadable';
  end if;
  perform private.audit_append((p_ctx).request_id, 'admin', (p_ctx).admin_user_id,
    v_file.platform_id, v_file.platform_account_id, 'file.download_authorized',
    'platform_config_file', v_file.id, null, null, '{}'::jsonb);
  return query select v_file.id, v_file.platform_id, v_file.storage_bucket,
    v_file.storage_path, v_file.original_name, coalesce(v_file.mime_type, 'application/octet-stream');
end;
$$;

create or replace function private.admin_file_download_event(
  p_ctx private.admin_context,
  p_file_id uuid,
  p_event text,
  p_error_code text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_file public.platform_config_files;
  v_event text;
begin
  if (p_ctx).admin_user_id is null or (p_ctx).session_id is null or p_file_id is null
     or p_event not in ('stream_completed', 'failed')
     or p_error_code is not null and length(p_error_code) not between 1 and 128
     or not exists (select 1 from private.system_admin where user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active) then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_file from public.platform_config_files f
  where f.id = p_file_id and f.resource_kind = 'legacy';
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  v_event := case when p_event = 'stream_completed'
    then 'file.download_stream_completed' else 'file.download_failed' end;
  perform private.audit_append((p_ctx).request_id, 'admin', (p_ctx).admin_user_id,
    v_file.platform_id, v_file.platform_account_id, v_event, 'platform_config_file', p_file_id,
    null, null, jsonb_build_object('error_code', p_error_code));
end;
$$;

create or replace function private.file_delete_request(
  p_ctx private.account_context,
  p_file_id uuid,
  p_idempotency_key text
)
returns table (
  file_id uuid, status text, write_outcome text, reserved_bytes bigint,
  reserved_count integer, deleted_at timestamptz, cancel_requested_at timestamptz
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
  v_claim private.idempotency_keys%rowtype;
  v_hash bytea;
  v_new_claim boolean := false;
  v_response jsonb;
  v_now timestamptz := clock_timestamp();
begin
  if (p_ctx).user_id is null or (p_ctx).session_id is null
     or (p_ctx).platform_id is null or (p_ctx).platform_key_id is null
     or (p_ctx).request_id is null or p_file_id is null
     or p_idempotency_key is null or length(p_idempotency_key) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select principal.authorization, principal.platform_account_id
    into v_authorization, v_account_id
  from private.account_principal(p_ctx) principal;
  if v_authorization not in ('allowed', 'suspended') then
    raise exception using errcode = '42501', message = v_authorization;
  end if;
  select * into v_account from public.platform_accounts a
  where a.platform_id = (p_ctx).platform_id and a.id = v_account_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  v_hash := extensions.digest(convert_to(p_file_id::text || ':delete', 'utf8'), 'sha256');
  insert into private.idempotency_keys (
    platform_id, platform_account_id, operation, actor_scope, idempotency_key, request_hash
  ) values (
    (p_ctx).platform_id, v_account_id, 'file_delete_request', 'user:' || (p_ctx).user_id::text,
    p_idempotency_key, v_hash
  ) on conflict (platform_id, platform_account_id, operation, actor_scope, idempotency_key)
    do nothing returning true into v_new_claim;
  if not coalesce(v_new_claim, false) then
    select * into v_claim from private.idempotency_keys i
    where i.platform_id = (p_ctx).platform_id and i.platform_account_id = v_account_id
      and i.operation = 'file_delete_request'
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
        nullif(v_claim.response_body->>'deleted_at', '')::timestamptz,
        nullif(v_claim.response_body->>'cancel_requested_at', '')::timestamptz;
      return;
    end if;
    raise exception using errcode = 'P0001', message = 'operation_in_progress';
  end if;
  select * into v_file from public.platform_config_files f
  where f.platform_id = (p_ctx).platform_id
    and f.platform_account_id = v_account_id and f.id = p_file_id
    and f.resource_kind = 'legacy' for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  if v_file.status = 'deleted' then
    null;
  elsif v_file.status in ('pending', 'receiving')
    and v_file.write_outcome = 'not_started'
    and not exists (select 1 from private.file_write_attempts a where a.file_id = v_file.id)
    and (v_file.lease_until is null or v_file.lease_until <= v_now) then
    update public.platform_config_files f
    set status = 'deleted', reserved_bytes = 0, reserved_count = 0,
        deleted_at = v_now, next_attempt_at = v_now
    where f.id = v_file.id returning * into v_file;
    perform private.audit_append(
      (p_ctx).request_id, 'user', (p_ctx).user_id, (p_ctx).platform_id, v_account_id,
      'file.deleted_without_storage', 'platform_config_file', v_file.id, null, null,
      jsonb_build_object('reason', 'no_storage_write_started')
    );
  elsif v_file.status not in ('deleting', 'deleted') then
    update public.platform_config_files f
    set status = 'deleting', cancel_requested_at = coalesce(f.cancel_requested_at, v_now),
        next_attempt_at = v_now
    where f.id = v_file.id returning * into v_file;
    perform private.audit_append(
      (p_ctx).request_id, 'user', (p_ctx).user_id, (p_ctx).platform_id, v_account_id,
      'file.delete_requested', 'platform_config_file', v_file.id, null, null,
      jsonb_build_object('write_outcome', v_file.write_outcome)
    );
  end if;
  v_response := jsonb_build_object(
    'file_id', v_file.id, 'status', v_file.status, 'write_outcome', v_file.write_outcome,
    'reserved_bytes', v_file.reserved_bytes, 'reserved_count', v_file.reserved_count,
    'deleted_at', coalesce(v_file.deleted_at::text, ''),
    'cancel_requested_at', coalesce(v_file.cancel_requested_at::text, '')
  );
  perform private.idempotency_finalize(
    (p_ctx).platform_id, v_account_id, 'file_delete_request', 'user:' || (p_ctx).user_id::text,
    p_idempotency_key, v_hash, 202, v_response
  );
  return query select v_file.id, v_file.status, v_file.write_outcome,
    v_file.reserved_bytes, v_file.reserved_count, v_file.deleted_at,
    v_file.cancel_requested_at;
end;
$$;

create or replace function private.admin_file_delete_request(
  p_ctx private.admin_context,
  p_file_id uuid,
  p_idempotency_key text
)
returns table (
  file_id uuid, platform_id uuid, platform_account_id uuid, status text,
  write_outcome text, reserved_bytes bigint, reserved_count integer,
  actual_size_bytes bigint, original_name text, mime_type text,
  cancel_requested_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_file public.platform_config_files;
  v_account public.platform_accounts;
  v_existing private.admin_idempotency%rowtype;
  v_scope text;
  v_hash bytea;
  v_new boolean := false;
  v_now timestamptz := clock_timestamp();
  v_response jsonb;
begin
  if p_file_id is null or p_idempotency_key is null
     or length(p_idempotency_key) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if (p_ctx).admin_user_id is null or (p_ctx).session_id is null or (p_ctx).request_id is null
     or not exists (select 1 from private.system_admin where user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active) then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
  select * into v_file from public.platform_config_files f
  where f.id = p_file_id and f.resource_kind = 'legacy';
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  select * into v_account from public.platform_accounts a
  where a.platform_id = v_file.platform_id and a.id = v_file.platform_account_id for update;
  select * into v_file from public.platform_config_files f
  where f.id = p_file_id and f.resource_kind = 'legacy' for update;
  v_scope := 'platform:' || v_file.platform_id::text;
  v_hash := extensions.digest(convert_to(p_file_id::text || ':admin-delete', 'utf8'), 'sha256');
  insert into private.admin_idempotency(admin_user_id, platform_id, scope, operation, idempotency_key, request_hash)
  values ((p_ctx).admin_user_id, v_file.platform_id, v_scope, 'admin_file_delete', p_idempotency_key, v_hash)
  on conflict (admin_user_id, scope, operation, idempotency_key)
    do nothing returning true into v_new;
  if not coalesce(v_new, false) then
    select * into v_existing from private.admin_idempotency i
    where i.admin_user_id = (p_ctx).admin_user_id and i.scope = v_scope
      and i.operation = 'admin_file_delete' and i.idempotency_key = p_idempotency_key for update;
    if v_existing.request_hash <> v_hash then raise exception using errcode = '23505', message = 'idempotency_conflict'; end if;
    if v_existing.state = 'completed' then
      return query select (v_existing.response_body->>'file_id')::uuid,
        (v_existing.response_body->>'platform_id')::uuid,
        (v_existing.response_body->>'platform_account_id')::uuid,
        v_existing.response_body->>'status', v_existing.response_body->>'write_outcome',
        (v_existing.response_body->>'reserved_bytes')::bigint,
        (v_existing.response_body->>'reserved_count')::integer,
        nullif(v_existing.response_body->>'actual_size_bytes', '')::bigint,
        v_existing.response_body->>'original_name', v_existing.response_body->>'mime_type',
        nullif(v_existing.response_body->>'cancel_requested_at', '')::timestamptz;
      return;
    end if;
    raise exception using errcode = 'P0001', message = 'operation_in_progress';
  end if;
  if v_file.status = 'deleted' then
    null;
  elsif v_file.status in ('pending', 'receiving') and v_file.write_outcome = 'not_started'
    and not exists (select 1 from private.file_write_attempts a where a.file_id = v_file.id)
    and (v_file.lease_until is null or v_file.lease_until <= v_now) then
    update public.platform_config_files f
    set status = 'deleted', reserved_bytes = 0, reserved_count = 0,
      deleted_at = v_now, next_attempt_at = v_now
    where f.id = v_file.id returning * into v_file;
    perform private.audit_append((p_ctx).request_id, 'admin', (p_ctx).admin_user_id,
      v_file.platform_id, v_file.platform_account_id, 'file.deleted_without_storage',
      'platform_config_file', v_file.id, null, null,
      jsonb_build_object('reason', 'admin_no_storage_write_started'));
  elsif v_file.status <> 'deleting' then
    update public.platform_config_files f
    set status = 'deleting', cancel_requested_at = coalesce(f.cancel_requested_at, v_now),
      delete_requested_at = coalesce(f.delete_requested_at, v_now), next_attempt_at = v_now
    where f.id = v_file.id returning * into v_file;
    perform private.audit_append((p_ctx).request_id, 'admin', (p_ctx).admin_user_id,
      v_file.platform_id, v_file.platform_account_id, 'file.delete_requested',
      'platform_config_file', v_file.id, null, null,
      jsonb_build_object('write_outcome', v_file.write_outcome, 'scope', 'admin'));
  end if;
  v_response := jsonb_build_object(
    'file_id', v_file.id, 'platform_id', v_file.platform_id,
    'platform_account_id', v_file.platform_account_id, 'status', v_file.status,
    'write_outcome', v_file.write_outcome, 'reserved_bytes', v_file.reserved_bytes,
    'reserved_count', v_file.reserved_count, 'actual_size_bytes', coalesce(v_file.actual_size_bytes::text, ''),
    'original_name', v_file.original_name, 'mime_type', coalesce(v_file.mime_type, ''),
    'cancel_requested_at', coalesce(v_file.cancel_requested_at::text, '')
  );
  update private.admin_idempotency i
  set state = 'completed', response_status = 202, response_body = v_response
  where i.admin_user_id = (p_ctx).admin_user_id and i.scope = v_scope
    and i.operation = 'admin_file_delete' and i.idempotency_key = p_idempotency_key;
  return query select v_file.id, v_file.platform_id, v_file.platform_account_id,
    v_file.status, v_file.write_outcome, v_file.reserved_bytes, v_file.reserved_count,
    v_file.actual_size_bytes, v_file.original_name, v_file.mime_type, v_file.cancel_requested_at;
end;
$$;

create or replace function private.config_slot_limit(p_ctx private.account_context)
returns integer
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_entitlement record;
  v_text text;
  v_limit integer;
begin
  select * into v_entitlement from private.entitlement_read(p_ctx);
  if not found or v_entitlement.effective_status <> 'active'
     or v_entitlement.features is null
     or jsonb_typeof(v_entitlement.features->'config_slot_limit') <> 'number' then
    return 0;
  end if;
  v_text := v_entitlement.features->>'config_slot_limit';
  if v_text !~ '^[0-9]+$' or length(v_text) > 4 then return 0; end if;
  v_limit := v_text::integer;
  if v_limit not between 0 and 1000 then return 0; end if;
  return v_limit;
end;
$$;

create or replace function private.config_rate_limit_require(
  p_platform_id uuid,
  p_platform_account_id uuid,
  p_action text,
  p_window_seconds integer,
  p_limit_count integer
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, private
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window timestamptz;
  v_key bytea;
  v_result record;
begin
  if p_platform_id is null or p_platform_account_id is null
     or p_action is null or length(p_action) not between 1 and 64
     or p_window_seconds not between 60 and 86400 or p_limit_count not between 1 and 10000 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  v_window := to_timestamp(floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds);
  v_key := extensions.digest(convert_to(
    p_platform_id::text || ':' || p_platform_account_id::text || ':' || p_action,
    'utf8'), 'sha256');
  select * into v_result from private.rate_limit_consume(
    v_key, v_window, p_window_seconds, p_limit_count);
  if not coalesce(v_result.allowed, false) then
    raise exception using errcode = 'P0001', message = 'rate_limited',
      detail = v_result.retry_at::text;
  end if;
end;
$$;

create or replace function private.config_list(
  p_ctx private.account_context,
  p_cursor_config_id uuid default null,
  p_limit integer default 20
)
returns table (
  config_id uuid, title text, description text, status text, current_version_id uuid,
  row_version bigint, created_at timestamptz, updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_principal record;
  v_cursor_updated_at timestamptz;
begin
  if (p_ctx).request_id is null or p_limit is null or p_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_principal from private.account_principal(p_ctx);
  if v_principal.authorization not in ('allowed', 'suspended') then
    raise exception using errcode = '42501', message = v_principal.authorization;
  end if;
  if p_cursor_config_id is not null then
    select c.updated_at into v_cursor_updated_at from public.platform_configs c
    where c.platform_id = (p_ctx).platform_id
      and c.platform_account_id = v_principal.platform_account_id
      and c.id = p_cursor_config_id and c.status <> 'deleted';
    if v_cursor_updated_at is null then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  end if;
  return query select c.id, c.title, c.description, c.status, c.current_version_id,
    c.row_version, c.created_at, c.updated_at
  from public.platform_configs c
  where c.platform_id = (p_ctx).platform_id
    and c.platform_account_id = v_principal.platform_account_id
    and c.status <> 'deleted'
    and (p_cursor_config_id is null or (c.updated_at, c.id) < (v_cursor_updated_at, p_cursor_config_id))
  order by c.updated_at desc, c.id desc limit p_limit;
end;
$$;

create or replace function private.config_read(
  p_ctx private.account_context,
  p_config_id uuid
)
returns table (
  config_id uuid, title text, description text, status text, current_version_id uuid,
  row_version bigint, created_at timestamptz, updated_at timestamptz
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
  if v_principal.authorization not in ('allowed', 'suspended') then
    raise exception using errcode = '42501', message = v_principal.authorization;
  end if;
  return query select c.id, c.title, c.description, c.status, c.current_version_id,
    c.row_version, c.created_at, c.updated_at
  from public.platform_configs c
  where c.platform_id = (p_ctx).platform_id
    and c.platform_account_id = v_principal.platform_account_id
    and c.id = p_config_id and c.status <> 'deleted';
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
end;
$$;

create or replace function private.config_create(
  p_ctx private.account_context,
  p_title text,
  p_description text default null
)
returns table (
  config_id uuid, title text, description text, status text, current_version_id uuid,
  row_version bigint, created_at timestamptz, updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_principal record;
  v_account public.platform_accounts;
  v_limit integer;
  v_config public.platform_configs;
begin
  if (p_ctx).request_id is null or p_title is null or length(btrim(p_title)) not between 1 and 120
     or p_title ~ '[[:cntrl:]]' or p_description is not null and length(p_description) > 2000 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_principal from private.account_principal(p_ctx);
  if v_principal.authorization <> 'allowed' then
    raise exception using errcode = '42501', message = v_principal.authorization;
  end if;
  select * into v_account from public.platform_accounts a
  where a.platform_id = (p_ctx).platform_id and a.id = v_principal.platform_account_id for update;
  perform private.config_rate_limit_require((p_ctx).platform_id, v_account.id, 'config_create', 3600, 60);
  v_limit := private.config_slot_limit(p_ctx);
  if (select count(*) from public.platform_configs c
      where c.platform_id = (p_ctx).platform_id and c.platform_account_id = v_account.id
        and c.status = 'active') >= v_limit then
    raise exception using errcode = 'P0001', message = 'config_slot_limit_exceeded';
  end if;
  insert into public.platform_configs(platform_id, platform_account_id, title, description)
  values ((p_ctx).platform_id, v_account.id, btrim(p_title), nullif(btrim(p_description), ''))
  returning * into v_config;
  perform private.audit_append((p_ctx).request_id, 'user', (p_ctx).user_id,
    v_config.platform_id, v_config.platform_account_id, 'config.created',
    'platform_config', v_config.id, null, null, '{}'::jsonb);
  return query select v_config.id, v_config.title, v_config.description, v_config.status,
    v_config.current_version_id, v_config.row_version, v_config.created_at, v_config.updated_at;
end;
$$;

create or replace function private.config_patch(
  p_ctx private.account_context,
  p_config_id uuid,
  p_expected_row_version bigint,
  p_title text,
  p_description text
)
returns table (
  config_id uuid, title text, description text, status text, current_version_id uuid,
  row_version bigint, created_at timestamptz, updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_principal record;
  v_config public.platform_configs;
begin
  if (p_ctx).request_id is null or p_config_id is null or p_expected_row_version is null
     or p_expected_row_version < 1 or p_title is null or length(btrim(p_title)) not between 1 and 120
     or p_title ~ '[[:cntrl:]]' or p_description is not null and length(p_description) > 2000 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_principal from private.account_principal(p_ctx);
  if v_principal.authorization <> 'allowed' then
    raise exception using errcode = '42501', message = v_principal.authorization;
  end if;
  update public.platform_configs c
  set title = btrim(p_title), description = nullif(btrim(p_description), ''),
      row_version = c.row_version + 1
  where c.platform_id = (p_ctx).platform_id
    and c.platform_account_id = v_principal.platform_account_id
    and c.id = p_config_id and c.status = 'active'
    and c.row_version = p_expected_row_version
  returning * into v_config;
  if not found then
    if exists (select 1 from public.platform_configs c where c.platform_id = (p_ctx).platform_id
      and c.platform_account_id = v_principal.platform_account_id and c.id = p_config_id and c.status = 'active') then
      raise exception using errcode = '40001', message = 'precondition_failed';
    end if;
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  perform private.audit_append((p_ctx).request_id, 'user', (p_ctx).user_id,
    v_config.platform_id, v_config.platform_account_id, 'config.updated',
    'platform_config', v_config.id, null, null,
    jsonb_build_object('row_version', v_config.row_version));
  return query select v_config.id, v_config.title, v_config.description, v_config.status,
    v_config.current_version_id, v_config.row_version, v_config.created_at, v_config.updated_at;
end;
$$;

create or replace function private.config_version_list(
  p_ctx private.account_context,
  p_config_id uuid
)
returns table (
  version_id uuid, file_id uuid, version_number integer, schema_key text,
  schema_version text, changelog text, file_status text, write_outcome text,
  actual_size_bytes bigint, created_at timestamptz
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
  if v_principal.authorization not in ('allowed', 'suspended') then
    raise exception using errcode = '42501', message = v_principal.authorization;
  end if;
  if not exists (select 1 from public.platform_configs c
    where c.platform_id = (p_ctx).platform_id and c.platform_account_id = v_principal.platform_account_id
      and c.id = p_config_id and c.status <> 'deleted') then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  return query select v.id, v.file_id, v.version_number, v.schema_key, v.schema_version,
    v.changelog, f.status, f.write_outcome, f.actual_size_bytes, v.created_at
  from public.platform_config_versions v
  join public.platform_config_files f on f.id = v.file_id
  where v.platform_id = (p_ctx).platform_id and v.platform_account_id = v_principal.platform_account_id
    and v.config_id = p_config_id and f.resource_kind = 'config_version'
  order by v.version_number desc;
end;
$$;

create or replace function private.config_version_intent_create(
  p_ctx private.account_context,
  p_config_id uuid,
  p_original_name text,
  p_requested_size_bytes bigint,
  p_mime_type text,
  p_schema_key text,
  p_schema_version text,
  p_changelog text,
  p_idempotency_key text
)
returns table (
  version_id uuid, file_id uuid, version_number integer, file_status text,
  write_outcome text, reserved_bytes bigint, intent_expires_at timestamptz,
  storage_path text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_principal record;
  v_account public.platform_accounts;
  v_config public.platform_configs;
  v_policy public.platform_file_policies;
  v_file public.platform_config_files;
  v_version public.platform_config_versions;
  v_claim private.idempotency_keys%rowtype;
  v_new_claim boolean := false;
  v_hash bytea;
  v_response jsonb;
  v_number integer;
  v_now timestamptz := clock_timestamp();
begin
  if (p_ctx).request_id is null or p_config_id is null or p_original_name is null
     or length(p_original_name) not between 1 and 255 or p_original_name ~ '[[:cntrl:]]'
     or p_requested_size_bytes is null or p_requested_size_bytes not between 1 and 1048576
     or p_mime_type is not null and length(p_mime_type) not between 1 and 255
     or p_schema_key is null or length(p_schema_key) not between 1 and 128 or p_schema_key ~ '[[:cntrl:]]'
     or p_schema_version is null or length(p_schema_version) not between 1 and 64 or p_schema_version ~ '[[:cntrl:]]'
     or p_changelog is not null and length(p_changelog) > 2000
     or p_idempotency_key is null or length(p_idempotency_key) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_principal from private.account_principal(p_ctx);
  if v_principal.authorization <> 'allowed' then
    raise exception using errcode = '42501', message = v_principal.authorization;
  end if;
  select * into v_account from public.platform_accounts a
  where a.platform_id = (p_ctx).platform_id and a.id = v_principal.platform_account_id for update;
  select * into v_config from public.platform_configs c
  where c.platform_id = (p_ctx).platform_id and c.platform_account_id = v_account.id
    and c.id = p_config_id and c.status = 'active' for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  v_hash := extensions.digest(convert_to(
    p_config_id::text || ':' || p_original_name || ':' || p_requested_size_bytes::text || ':'
    || coalesce(p_mime_type, '') || ':' || p_schema_key || ':' || p_schema_version || ':' || coalesce(p_changelog, ''),
    'utf8'), 'sha256');
  insert into private.idempotency_keys(platform_id, platform_account_id, operation, actor_scope, idempotency_key, request_hash)
  values ((p_ctx).platform_id, v_account.id, 'config_version_intent_create',
    'user:' || (p_ctx).user_id::text, p_idempotency_key, v_hash)
  on conflict (platform_id, platform_account_id, operation, actor_scope, idempotency_key)
    do nothing returning true into v_new_claim;
  if not coalesce(v_new_claim, false) then
    select * into v_claim from private.idempotency_keys i
    where i.platform_id = (p_ctx).platform_id and i.platform_account_id = v_account.id
      and i.operation = 'config_version_intent_create'
      and i.actor_scope = 'user:' || (p_ctx).user_id::text
      and i.idempotency_key = p_idempotency_key for update;
    if v_claim.request_hash <> v_hash then raise exception using errcode = '23505', message = 'idempotency_conflict'; end if;
    if v_claim.state = 'completed' then
      return query select (v_claim.response_body->>'version_id')::uuid,
        (v_claim.response_body->>'file_id')::uuid,
        (v_claim.response_body->>'version_number')::integer,
        v_claim.response_body->>'file_status', v_claim.response_body->>'write_outcome',
        (v_claim.response_body->>'reserved_bytes')::bigint,
        (v_claim.response_body->>'intent_expires_at')::timestamptz,
        v_claim.response_body->>'storage_path';
      return;
    end if;
    raise exception using errcode = 'P0001', message = 'operation_in_progress';
  end if;
  perform private.config_rate_limit_require((p_ctx).platform_id, v_account.id, 'config_version_create', 3600, 60);
  insert into public.platform_file_policies(platform_id) values ((p_ctx).platform_id)
    on conflict (platform_id) do nothing;
  select * into v_policy from public.platform_file_policies p
    where p.platform_id = (p_ctx).platform_id for update;
  if not v_policy.enabled then raise exception using errcode = '42501', message = 'platform_file_policy_disabled'; end if;
  if p_requested_size_bytes > v_policy.max_file_bytes then
    raise exception using errcode = 'P0001', message = 'file_too_large';
  end if;
  if (select coalesce(sum(f.reserved_bytes), 0) + p_requested_size_bytes
      from public.platform_config_files f where f.platform_id = (p_ctx).platform_id) > v_policy.max_platform_total_bytes then
    raise exception using errcode = 'P0001', message = 'platform_storage_quota_exceeded';
  end if;
  select coalesce(max(v.version_number), 0) + 1 into v_number
    from public.platform_config_versions v where v.config_id = p_config_id;
  v_file.id := gen_random_uuid();
  insert into public.platform_config_files(
    id, platform_id, platform_account_id, original_name, storage_path, mime_type, purpose,
    requested_size_bytes, reserved_bytes, reserved_count, status, intent_expires_at, resource_kind
  ) values (
    v_file.id, (p_ctx).platform_id, v_account.id, p_original_name,
    (p_ctx).platform_id::text || '/' || v_account.id::text || '/' || v_file.id::text,
    p_mime_type, 'config_version', p_requested_size_bytes, p_requested_size_bytes, 1,
    'pending', v_now + interval '10 minutes', 'config_version'
  ) returning * into v_file;
  insert into public.platform_config_versions(
    platform_id, platform_account_id, config_id, file_id, version_number,
    schema_key, schema_version, changelog
  ) values ((p_ctx).platform_id, v_account.id, p_config_id, v_file.id, v_number,
    p_schema_key, p_schema_version, nullif(btrim(p_changelog), ''))
  returning * into v_version;
  perform private.audit_append((p_ctx).request_id, 'user', (p_ctx).user_id,
    (p_ctx).platform_id, v_account.id, 'config.version_intent_created',
    'platform_config_version', v_version.id, null, null,
    jsonb_build_object('config_id', p_config_id, 'version_number', v_number,
      'requested_size_bytes', p_requested_size_bytes));
  v_response := jsonb_build_object('version_id', v_version.id, 'file_id', v_file.id,
    'version_number', v_number, 'file_status', v_file.status, 'write_outcome', v_file.write_outcome,
    'reserved_bytes', v_file.reserved_bytes, 'intent_expires_at', v_file.intent_expires_at,
    'storage_path', v_file.storage_path);
  perform private.idempotency_finalize((p_ctx).platform_id, v_account.id,
    'config_version_intent_create', 'user:' || (p_ctx).user_id::text,
    p_idempotency_key, v_hash, 201, v_response);
  return query select v_version.id, v_file.id, v_number, v_file.status,
    v_file.write_outcome, v_file.reserved_bytes, v_file.intent_expires_at, v_file.storage_path;
end;
$$;

create or replace function private.config_version_activate(
  p_ctx private.account_context,
  p_config_id uuid,
  p_version_id uuid
)
returns table (config_id uuid, current_version_id uuid, row_version bigint)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_principal record;
  v_config public.platform_configs;
  v_version public.platform_config_versions;
  v_current_number integer;
begin
  if (p_ctx).request_id is null or p_config_id is null or p_version_id is null then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_principal from private.account_principal(p_ctx);
  if v_principal.authorization <> 'allowed' then raise exception using errcode = '42501', message = v_principal.authorization; end if;
  select * into v_config from public.platform_configs c
  where c.platform_id = (p_ctx).platform_id and c.platform_account_id = v_principal.platform_account_id
    and c.id = p_config_id and c.status = 'active' for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  select v.* into v_version from public.platform_config_versions v
  join public.platform_config_files f on f.id = v.file_id
  where v.platform_id = (p_ctx).platform_id and v.platform_account_id = v_principal.platform_account_id
    and v.config_id = p_config_id and v.id = p_version_id
    and f.resource_kind = 'config_version' and f.status = 'active' and f.write_outcome = 'confirmed';
  if not found then raise exception using errcode = 'P0001', message = 'version_not_ready'; end if;
  if v_config.current_version_id is not null then
    select v.version_number into v_current_number from public.platform_config_versions v
      where v.id = v_config.current_version_id;
    if v_current_number > v_version.version_number then
      raise exception using errcode = '40001', message = 'stale_version';
    end if;
  end if;
  update public.platform_configs c set current_version_id = v_version.id,
    row_version = c.row_version + 1 where c.id = v_config.id returning * into v_config;
  perform private.audit_append((p_ctx).request_id, 'user', (p_ctx).user_id,
    v_config.platform_id, v_config.platform_account_id, 'config.version_activated',
    'platform_config_version', v_version.id, null, null,
    jsonb_build_object('config_id', v_config.id, 'version_number', v_version.version_number));
  return query select v_config.id, v_config.current_version_id, v_config.row_version;
end;
$$;

create or replace function private.config_gallery_submission_create(
  p_ctx private.account_context,
  p_config_id uuid,
  p_version_id uuid
)
returns table (submission_id uuid, config_id uuid, version_id uuid, status text, submitted_at timestamptz)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_principal record;
  v_config public.platform_configs;
  v_submission public.platform_config_gallery_submissions;
begin
  if (p_ctx).request_id is null or p_config_id is null or p_version_id is null then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_principal from private.account_principal(p_ctx);
  if v_principal.authorization <> 'allowed' then raise exception using errcode = '42501', message = v_principal.authorization; end if;
  select * into v_config from public.platform_configs c
  where c.platform_id = (p_ctx).platform_id and c.platform_account_id = v_principal.platform_account_id
    and c.id = p_config_id and c.status = 'active' for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  if v_config.current_version_id is distinct from p_version_id
     or not exists (select 1 from public.platform_config_versions v
       join public.platform_config_files f on f.id = v.file_id
       where v.id = p_version_id and v.config_id = p_config_id
         and v.platform_id = (p_ctx).platform_id and v.platform_account_id = v_principal.platform_account_id
         and f.resource_kind = 'config_version' and f.status = 'active' and f.write_outcome = 'confirmed') then
    raise exception using errcode = 'P0001', message = 'version_not_ready';
  end if;
  perform private.config_rate_limit_require((p_ctx).platform_id, v_principal.platform_account_id,
    'config_gallery_submission', 86400, 20);
  if exists (select 1 from public.platform_config_gallery_submissions s
    where s.config_id = p_config_id and s.status = 'pending') then
    raise exception using errcode = 'P0001', message = 'submission_pending';
  end if;
  insert into public.platform_config_gallery_submissions(
    platform_id, config_id, version_id, submitted_by_account_id
  ) values ((p_ctx).platform_id, p_config_id, p_version_id, v_principal.platform_account_id)
  returning * into v_submission;
  perform private.audit_append((p_ctx).request_id, 'user', (p_ctx).user_id,
    (p_ctx).platform_id, v_principal.platform_account_id, 'config.gallery_submitted',
    'platform_config_gallery_submission', v_submission.id, null, null,
    jsonb_build_object('config_id', p_config_id, 'version_id', p_version_id));
  return query select v_submission.id, v_submission.config_id, v_submission.version_id,
    v_submission.status, v_submission.submitted_at;
end;
$$;

create or replace function private.config_gallery_like_set(
  p_ctx private.account_context,
  p_config_id uuid,
  p_liked boolean
)
returns table (config_id uuid, liked boolean, like_count bigint)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_principal record;
  v_entry public.platform_config_gallery_entries;
begin
  if (p_ctx).request_id is null or p_config_id is null or p_liked is null then
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
  perform private.config_rate_limit_require(
    (p_ctx).platform_id, v_principal.platform_account_id,
    'config_gallery_like', 3600, 240
  );
  if p_liked then
    insert into public.platform_config_likes(platform_id, config_id, platform_account_id)
    values ((p_ctx).platform_id, p_config_id, v_principal.platform_account_id)
    on conflict on constraint platform_config_likes_pkey do nothing;
  else
    delete from public.platform_config_likes l
    where l.platform_id = (p_ctx).platform_id and l.config_id = p_config_id
      and l.platform_account_id = v_principal.platform_account_id;
  end if;
  return query select p_config_id,
    exists (
      select 1 from public.platform_config_likes l
      where l.platform_id = (p_ctx).platform_id and l.config_id = p_config_id
        and l.platform_account_id = v_principal.platform_account_id
    ),
    (select count(*) from public.platform_config_likes l
      where l.platform_id = (p_ctx).platform_id and l.config_id = p_config_id);
end;
$$;

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
  perform private.config_rate_limit_require(
    (p_ctx).platform_id, v_principal.platform_account_id,
    'config_gallery_delivery', 3600, 600
  );
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

create or replace function private.admin_config_gallery_review(
  p_ctx private.admin_context,
  p_submission_id uuid,
  p_action text,
  p_reason text
)
returns table (submission_id uuid, config_id uuid, version_id uuid, status text, entry_status text)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_submission public.platform_config_gallery_submissions;
  v_config public.platform_configs;
  v_entry public.platform_config_gallery_entries;
  v_now timestamptz := clock_timestamp();
begin
  if (p_ctx).request_id is null or p_submission_id is null
     or p_action not in ('approve', 'reject')
     or p_reason is null or length(btrim(p_reason)) not between 1 and 2000 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if (p_ctx).admin_user_id is null or (p_ctx).session_id is null
     or not exists (select 1 from private.system_admin where user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active) then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
  select * into v_submission from public.platform_config_gallery_submissions s
    where s.id = p_submission_id and s.status = 'pending' for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  select * into v_config from public.platform_configs c
    where c.id = v_submission.config_id and c.platform_id = v_submission.platform_id for update;
  if v_config.status <> 'active'
     or not exists (select 1 from public.platform_accounts a
       where a.platform_id = v_config.platform_id and a.id = v_config.platform_account_id and a.status = 'active') then
    raise exception using errcode = 'P0001', message = 'config_not_publishable';
  end if;
  if p_action = 'approve' then
    if not exists (select 1 from public.platform_config_versions v
      join public.platform_config_files f on f.id = v.file_id
      where v.id = v_submission.version_id and v.config_id = v_submission.config_id
        and f.resource_kind = 'config_version' and f.status = 'active' and f.write_outcome = 'confirmed') then
      raise exception using errcode = 'P0001', message = 'version_not_ready';
    end if;
    update public.platform_config_gallery_submissions s
    set status = 'approved', reviewed_by = (p_ctx).admin_user_id,
      review_reason = btrim(p_reason), reviewed_at = v_now
    where s.id = v_submission.id returning * into v_submission;
    insert into public.platform_config_gallery_entries(
      config_id, platform_id, published_version_id, approved_submission_id,
      status, approved_by, approved_at, governance_reason
    ) values (v_submission.config_id, v_submission.platform_id, v_submission.version_id,
      v_submission.id, 'approved', (p_ctx).admin_user_id, v_now, null)
    on conflict on constraint platform_config_gallery_entries_pkey do update set
      published_version_id = excluded.published_version_id,
      approved_submission_id = excluded.approved_submission_id,
      status = 'approved', approved_by = excluded.approved_by,
      approved_at = excluded.approved_at, governance_reason = null
    returning * into v_entry;
  else
    update public.platform_config_gallery_submissions s
    set status = 'rejected', reviewed_by = (p_ctx).admin_user_id,
      review_reason = btrim(p_reason), reviewed_at = v_now
    where s.id = v_submission.id returning * into v_submission;
    select * into v_entry from public.platform_config_gallery_entries e
      where e.config_id = v_submission.config_id;
  end if;
  perform private.audit_append((p_ctx).request_id, 'admin', (p_ctx).admin_user_id,
    v_submission.platform_id, v_submission.submitted_by_account_id,
    'config.gallery_' || case when p_action = 'approve' then 'approved' else 'rejected' end,
    'platform_config_gallery_submission', v_submission.id, null, null,
    jsonb_build_object('config_id', v_submission.config_id,
      'version_id', v_submission.version_id, 'reason', btrim(p_reason)));
  return query select v_submission.id, v_submission.config_id, v_submission.version_id,
    v_submission.status, v_entry.status;
end;
$$;

alter function private.config_slot_limit(private.account_context) owner to domain_owner;
alter function private.config_rate_limit_require(uuid, uuid, text, integer, integer) owner to domain_owner;
alter function private.config_list(private.account_context, uuid, integer) owner to domain_owner;
alter function private.config_read(private.account_context, uuid) owner to domain_owner;
alter function private.config_create(private.account_context, text, text) owner to domain_owner;
alter function private.config_patch(private.account_context, uuid, bigint, text, text) owner to domain_owner;
alter function private.config_version_list(private.account_context, uuid) owner to domain_owner;
alter function private.config_version_intent_create(private.account_context, uuid, text, bigint, text, text, text, text, text) owner to domain_owner;
alter function private.config_version_activate(private.account_context, uuid, uuid) owner to domain_owner;
alter function private.config_gallery_submission_create(private.account_context, uuid, uuid) owner to domain_owner;
alter function private.config_gallery_like_set(private.account_context, uuid, boolean) owner to domain_owner;
alter function private.config_gallery_usage_record(private.account_context, uuid, text, text) owner to domain_owner;
alter function private.admin_config_gallery_review(private.admin_context, uuid, text, text) owner to domain_owner;

revoke all on function private.config_slot_limit(private.account_context),
  private.config_rate_limit_require(uuid, uuid, text, integer, integer)
from public, anon, authenticated, account_executor, admin_executor, job_executor, recovery_executor;

revoke all on function private.config_list(private.account_context, uuid, integer),
  private.config_read(private.account_context, uuid),
  private.config_create(private.account_context, text, text),
  private.config_patch(private.account_context, uuid, bigint, text, text),
  private.config_version_list(private.account_context, uuid),
  private.config_version_intent_create(private.account_context, uuid, text, bigint, text, text, text, text, text),
  private.config_version_activate(private.account_context, uuid, uuid),
  private.config_gallery_submission_create(private.account_context, uuid, uuid),
  private.config_gallery_like_set(private.account_context, uuid, boolean),
  private.config_gallery_usage_record(private.account_context, uuid, text, text)
from public, anon, authenticated, admin_executor, job_executor, recovery_executor;

revoke all on function private.admin_config_gallery_review(private.admin_context, uuid, text, text)
from public, anon, authenticated, account_executor, job_executor, recovery_executor;

grant execute on function private.config_list(private.account_context, uuid, integer),
  private.config_read(private.account_context, uuid),
  private.config_create(private.account_context, text, text),
  private.config_patch(private.account_context, uuid, bigint, text, text),
  private.config_version_list(private.account_context, uuid),
  private.config_version_intent_create(private.account_context, uuid, text, bigint, text, text, text, text, text),
  private.config_version_activate(private.account_context, uuid, uuid),
  private.config_gallery_submission_create(private.account_context, uuid, uuid),
  private.config_gallery_like_set(private.account_context, uuid, boolean),
  private.config_gallery_usage_record(private.account_context, uuid, text, text)
to account_executor;

grant execute on function private.admin_config_gallery_review(private.admin_context, uuid, text, text)
to admin_executor;

