-- M4-06: atomically switch a validated replacement into the active slot.

drop function if exists private.file_write_attempt_finalize(
  private.account_context, uuid, uuid, bigint, text, text
);

create function private.file_write_attempt_finalize(
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
  v_replace_outcome text;
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
    and f.platform_account_id = v_account_id and f.id = p_file_id;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  perform 1
  from public.platform_accounts a
  where a.platform_id = (p_ctx).platform_id and a.id = v_account_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;

  if v_replace_id is null then
    select * into v_file from public.platform_config_files f
    where f.platform_id = (p_ctx).platform_id
      and f.platform_account_id = v_account_id and f.id = p_file_id for update;
  elsif v_replace_id < p_file_id then
    select * into v_replace from public.platform_config_files f
    where f.platform_id = (p_ctx).platform_id
      and f.platform_account_id = v_account_id and f.id = v_replace_id for update;
    select * into v_file from public.platform_config_files f
    where f.platform_id = (p_ctx).platform_id
      and f.platform_account_id = v_account_id and f.id = p_file_id for update;
  else
    select * into v_file from public.platform_config_files f
    where f.platform_id = (p_ctx).platform_id
      and f.platform_account_id = v_account_id and f.id = p_file_id for update;
    select * into v_replace from public.platform_config_files f
    where f.platform_id = (p_ctx).platform_id
      and f.platform_account_id = v_account_id and f.id = v_replace_id for update;
  end if;
  if not found and v_file.id is null then
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

  if v_replace_id is not null and (v_replace.status <> 'active' or v_replace.write_outcome <> 'confirmed') then
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
      jsonb_build_object('replaces_file_id', v_replace_id, 'target_status', v_replace.status)
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
    set status = 'deleting', cancel_requested_at = coalesce(f.cancel_requested_at, clock_timestamp()),
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
      'replace_outcome', replace_outcome)
  );
  return next;
end;
$$;

alter function private.file_write_attempt_finalize(private.account_context, uuid, uuid, bigint, text, text) owner to domain_owner;
revoke all on function private.file_write_attempt_finalize(private.account_context, uuid, uuid, bigint, text, text)
  from public, anon, authenticated, admin_executor, job_executor, recovery_executor;
grant execute on function private.file_write_attempt_finalize(private.account_context, uuid, uuid, bigint, text, text)
  to account_executor;
