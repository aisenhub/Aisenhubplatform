-- Align Admin step-up with the risk-based policy: ordinary Admin work uses AAL2,
-- while Platform Key lifecycle and Global Delete require a recent MFA proof for
-- at most 30 minutes. The 60-second signed MFA attestation remains unchanged.

do $$
declare
  v_constraint text;
begin
  select c.conname
  into v_constraint
  from pg_constraint c
  where c.conrelid = 'private.admin_step_up'::regclass
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%expires_at%'
    and pg_get_constraintdef(c.oid) ilike '%verified_at%'
    and (
      pg_get_constraintdef(c.oid) ilike '%00:05:00%'
      or pg_get_constraintdef(c.oid) ilike '%5 min%'
    )
  order by c.oid
  limit 1;

  if v_constraint is null then
    raise exception 'expected five-minute admin_step_up constraint was not found';
  end if;

  execute format(
    'alter table private.admin_step_up drop constraint %I',
    v_constraint
  );
end;
$$;

alter table private.admin_step_up
  add constraint admin_step_up_recent_window_check
  check (expires_at <= verified_at + interval '30 minutes');

create or replace function private.admin_step_up_issue(
  p_ctx private.admin_context,
  p_factor_id uuid,
  p_verified_at timestamptz,
  p_attestation_nonce uuid
)
returns table (proof_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  if (p_ctx).admin_user_id is null
     or (p_ctx).session_id is null
     or p_factor_id is null
     or p_verified_at is null
     or p_attestation_nonce is null
     or p_verified_at <= v_now - interval '90 seconds'
     or p_verified_at > v_now + interval '5 seconds'
     or not exists (
       select 1 from private.system_admin
       where user_id = (p_ctx).admin_user_id
     )
     or not exists (
       select 1 from private.check_user_session(
         (p_ctx).admin_user_id,
         (p_ctx).session_id
       ) where active
     ) then
    raise exception using errcode = '42501', message = 'recent_mfa_required';
  end if;

  return query
  insert into private.admin_step_up (
    user_id, session_id, factor_id, verified_at, expires_at, attestation_nonce
  ) values (
    (p_ctx).admin_user_id,
    (p_ctx).session_id,
    p_factor_id,
    p_verified_at,
    p_verified_at + interval '30 minutes',
    p_attestation_nonce
  )
  on conflict (user_id, session_id, attestation_nonce)
    where attestation_nonce is not null
    do nothing
  returning id, private.admin_step_up.expires_at;

  if not found then
    raise exception using errcode = '42501', message = 'recent_mfa_required';
  end if;
end;
$$;

alter function private.admin_step_up_issue(private.admin_context, uuid, timestamptz, uuid)
  owner to domain_owner;
revoke all on function private.admin_step_up_issue(private.admin_context, uuid, timestamptz, uuid)
  from public, anon, authenticated, account_executor, job_executor, recovery_executor;
grant execute on function private.admin_step_up_issue(private.admin_context, uuid, timestamptz, uuid)
  to admin_executor;

create or replace function private.admin_step_up_valid(
  p_user_id uuid,
  p_session_id uuid,
  p_proof_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private
as $$
  select exists (
    select 1
    from private.admin_step_up proof
    where proof.id = p_proof_id
      and proof.user_id = p_user_id
      and proof.session_id = p_session_id
      and proof.expires_at > now()
      and proof.verified_at <= now()
      and proof.expires_at <= proof.verified_at + interval '30 minutes'
  )
$$;

alter function private.admin_step_up_valid(uuid, uuid, uuid) owner to domain_owner;
revoke all on function private.admin_step_up_valid(uuid, uuid, uuid)
  from public, anon, authenticated, account_executor, job_executor, recovery_executor;
grant execute on function private.admin_step_up_valid(uuid, uuid, uuid)
  to admin_executor;

-- Ordinary file deletion remains destructive and idempotent, but it is not a
-- platform-wide destructive action. AAL2 is enforced by the Account API and
-- the database wrapper still verifies the singleton Admin and active session.
drop function if exists private.admin_file_delete_request(
  private.admin_context,
  uuid,
  uuid,
  text
);

create function private.admin_file_delete_request(
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
  if p_file_id is null
     or p_idempotency_key is null
     or length(p_idempotency_key) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  if (p_ctx).admin_user_id is null
     or (p_ctx).session_id is null
     or (p_ctx).request_id is null
     or not exists (
       select 1 from private.system_admin
       where user_id = (p_ctx).admin_user_id
     )
     or not exists (
       select 1 from private.check_user_session(
         (p_ctx).admin_user_id,
         (p_ctx).session_id
       ) where active
     ) then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;

  select * into v_file
  from public.platform_config_files f
  where f.id = p_file_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;

  select * into v_account
  from public.platform_accounts a
  where a.platform_id = v_file.platform_id
    and a.id = v_file.platform_account_id
  for update;

  select * into v_file
  from public.platform_config_files f
  where f.id = p_file_id
  for update;

  v_scope := 'platform:' || v_file.platform_id::text;
  v_hash := extensions.digest(
    convert_to(p_file_id::text || ':admin-delete', 'utf8'),
    'sha256'
  );

  insert into private.admin_idempotency(
    admin_user_id, platform_id, scope, operation, idempotency_key, request_hash
  )
  values (
    (p_ctx).admin_user_id,
    v_file.platform_id,
    v_scope,
    'admin_file_delete',
    p_idempotency_key,
    v_hash
  )
  on conflict (admin_user_id, scope, operation, idempotency_key)
    do nothing
  returning true into v_new;

  if not coalesce(v_new, false) then
    select * into v_existing
    from private.admin_idempotency i
    where i.admin_user_id = (p_ctx).admin_user_id
      and i.scope = v_scope
      and i.operation = 'admin_file_delete'
      and i.idempotency_key = p_idempotency_key
    for update;

    if v_existing.request_hash <> v_hash then
      raise exception using errcode = '23505', message = 'idempotency_conflict';
    end if;

    if v_existing.state = 'completed' then
      return query
      select
        (v_existing.response_body->>'file_id')::uuid,
        (v_existing.response_body->>'platform_id')::uuid,
        (v_existing.response_body->>'platform_account_id')::uuid,
        v_existing.response_body->>'status',
        v_existing.response_body->>'write_outcome',
        (v_existing.response_body->>'reserved_bytes')::bigint,
        (v_existing.response_body->>'reserved_count')::integer,
        nullif(v_existing.response_body->>'actual_size_bytes', '')::bigint,
        v_existing.response_body->>'original_name',
        v_existing.response_body->>'mime_type',
        nullif(v_existing.response_body->>'cancel_requested_at', '')::timestamptz;
      return;
    end if;

    raise exception using errcode = 'P0001', message = 'operation_in_progress';
  end if;

  if v_file.status = 'deleted' then
    null;
  elsif v_file.status in ('pending', 'receiving')
    and v_file.write_outcome = 'not_started'
    and not exists (
      select 1 from private.file_write_attempts a where a.file_id = v_file.id
    )
    and (v_file.lease_until is null or v_file.lease_until <= v_now) then
    update public.platform_config_files f
    set status = 'deleted',
        reserved_bytes = 0,
        reserved_count = 0,
        deleted_at = v_now,
        next_attempt_at = v_now
    where f.id = v_file.id
    returning * into v_file;

    perform private.audit_append(
      (p_ctx).request_id,
      'admin',
      (p_ctx).admin_user_id,
      v_file.platform_id,
      v_file.platform_account_id,
      'file.deleted_without_storage',
      'platform_config_file',
      v_file.id,
      null,
      null,
      jsonb_build_object('reason', 'admin_no_storage_write_started')
    );
  elsif v_file.status <> 'deleting' then
    update public.platform_config_files f
    set status = 'deleting',
        cancel_requested_at = coalesce(f.cancel_requested_at, v_now),
        delete_requested_at = coalesce(f.delete_requested_at, v_now),
        next_attempt_at = v_now
    where f.id = v_file.id
    returning * into v_file;

    perform private.audit_append(
      (p_ctx).request_id,
      'admin',
      (p_ctx).admin_user_id,
      v_file.platform_id,
      v_file.platform_account_id,
      'file.delete_requested',
      'platform_config_file',
      v_file.id,
      null,
      null,
      jsonb_build_object('write_outcome', v_file.write_outcome, 'scope', 'admin')
    );
  end if;

  v_response := jsonb_build_object(
    'file_id', v_file.id,
    'platform_id', v_file.platform_id,
    'platform_account_id', v_file.platform_account_id,
    'status', v_file.status,
    'write_outcome', v_file.write_outcome,
    'reserved_bytes', v_file.reserved_bytes,
    'reserved_count', v_file.reserved_count,
    'actual_size_bytes', coalesce(v_file.actual_size_bytes::text, ''),
    'original_name', v_file.original_name,
    'mime_type', coalesce(v_file.mime_type, ''),
    'cancel_requested_at', coalesce(v_file.cancel_requested_at::text, '')
  );

  update private.admin_idempotency i
  set state = 'completed', response_status = 202, response_body = v_response
  where i.admin_user_id = (p_ctx).admin_user_id
    and i.scope = v_scope
    and i.operation = 'admin_file_delete'
    and i.idempotency_key = p_idempotency_key;

  return query
  select
    v_file.id,
    v_file.platform_id,
    v_file.platform_account_id,
    v_file.status,
    v_file.write_outcome,
    v_file.reserved_bytes,
    v_file.reserved_count,
    v_file.actual_size_bytes,
    v_file.original_name,
    v_file.mime_type,
    v_file.cancel_requested_at;
end;
$$;

alter function private.admin_file_delete_request(private.admin_context, uuid, text)
  owner to domain_owner;
revoke all on function private.admin_file_delete_request(private.admin_context, uuid, text)
  from public, anon, authenticated, account_executor, job_executor, recovery_executor;
grant execute on function private.admin_file_delete_request(private.admin_context, uuid, text)
  to admin_executor;
