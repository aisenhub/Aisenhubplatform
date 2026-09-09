-- M4-04: bounded Account upload and server-only Storage settlement.

insert into storage.buckets (id, name, public, file_size_limit)
values ('platform-config-files', 'platform-config-files', false, 1048576)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit;

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
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_principal record;
begin
  if (p_ctx).user_id is null or (p_ctx).session_id is null
     or (p_ctx).platform_id is null or (p_ctx).platform_key_id is null
     or (p_ctx).request_id is null or p_file_id is null then
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
      and f.id = p_file_id;
end;
$$;

drop function private.file_receive_claim(private.account_context, uuid, text, integer);

create function private.file_receive_claim(
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
  if (p_ctx).user_id is null or (p_ctx).session_id is null
     or (p_ctx).platform_id is null or (p_ctx).platform_key_id is null
     or (p_ctx).request_id is null or p_file_id is null
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
  returning f.id, f.platform_account_id, f.status, f.write_outcome,
    f.requested_size_bytes, v_policy.max_file_bytes, f.reserved_bytes,
    f.reserved_count, f.lease_until, f.fencing_token, f.storage_path,
    f.mime_type
    into file_id, platform_account_id, status, write_outcome,
      requested_size_bytes, max_file_bytes, reserved_bytes, reserved_count,
      lease_until, fencing_token, storage_path, mime_type;
  perform private.audit_append(
    (p_ctx).request_id, 'user', (p_ctx).user_id, (p_ctx).platform_id, v_account_id,
    'file.receive_claimed', 'platform_config_file', p_file_id, null, null,
    jsonb_build_object('fencing_token', fencing_token)
  );
  return next;
end;
$$;

create or replace function private.file_write_attempt_mark_unknown(
  p_ctx private.account_context,
  p_file_id uuid,
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
    and f.platform_account_id = v_account_id and f.id = p_file_id for update;
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
  update public.platform_config_files
  set write_outcome = 'unknown'
  where id = v_file.id;
  perform private.audit_append(
    (p_ctx).request_id, 'user', (p_ctx).user_id, (p_ctx).platform_id, v_account_id,
    'file.store_unknown', 'platform_config_file', v_file.id, null, null,
    jsonb_build_object('write_attempt_id', v_attempt.id, 'error_code', p_error_code)
  );
  return query select v_file.id, v_file.status, 'unknown'::text, v_attempt.id;
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
    and f.platform_account_id = v_account_id and f.id = p_file_id for update;
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
      'provider_request_id', p_provider_request_id)
  );
  return next;
end;
$$;

alter function private.file_upload_state(private.account_context, uuid) owner to domain_owner;
alter function private.file_receive_claim(private.account_context, uuid, text, integer) owner to domain_owner;
alter function private.file_write_attempt_mark_unknown(private.account_context, uuid, uuid, text) owner to domain_owner;
alter function private.file_write_attempt_finalize(private.account_context, uuid, uuid, bigint, text, text) owner to domain_owner;

revoke all on function private.file_upload_state(private.account_context, uuid)
  from public, anon, authenticated, admin_executor, job_executor, recovery_executor;
revoke all on function private.file_receive_claim(private.account_context, uuid, text, integer)
  from public, anon, authenticated, admin_executor, job_executor, recovery_executor;
revoke all on function private.file_write_attempt_mark_unknown(private.account_context, uuid, uuid, text)
  from public, anon, authenticated, admin_executor, job_executor, recovery_executor;
revoke all on function private.file_write_attempt_finalize(private.account_context, uuid, uuid, bigint, text, text)
  from public, anon, authenticated, admin_executor, job_executor, recovery_executor;

grant execute on function private.file_upload_state(private.account_context, uuid) to account_executor;
grant execute on function private.file_receive_claim(private.account_context, uuid, text, integer) to account_executor;
grant execute on function private.file_write_attempt_mark_unknown(private.account_context, uuid, uuid, text) to account_executor;
grant execute on function private.file_write_attempt_finalize(private.account_context, uuid, uuid, bigint, text, text) to account_executor;
