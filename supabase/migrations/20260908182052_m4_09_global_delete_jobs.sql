-- M4-09: Admin approval and resumable Global Delete checkpoints.
-- Auth and Storage provider side effects remain outside the transaction. A
-- worker must report their outcome before the corresponding checkpoint moves.

create or replace function private.admin_deletion_job_start(
  p_ctx private.admin_context,
  p_request_id uuid,
  p_recent_proof_id uuid,
  p_idempotency_key text
)
returns table (job_id uuid, request_id uuid, state text, checkpoint text)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_request private.deletion_requests;
  v_job private.deletion_jobs;
  v_existing private.admin_idempotency%rowtype;
  v_hash bytea;
  v_new boolean := false;
  v_now timestamptz := clock_timestamp();
  v_response jsonb;
begin
  if (p_ctx).admin_user_id is null or (p_ctx).session_id is null
     or (p_ctx).request_id is null or p_request_id is null
     or p_recent_proof_id is null
     or p_idempotency_key is null or length(p_idempotency_key) not between 1 and 128
     or not exists (select 1 from private.system_admin where user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active)
     or not exists (
       select 1 from private.admin_step_up proof
       where proof.id = p_recent_proof_id and proof.user_id = (p_ctx).admin_user_id
         and proof.session_id = (p_ctx).session_id and proof.expires_at > v_now
         and proof.verified_at <= v_now
     ) then
    raise exception using errcode = case when p_idempotency_key is null or length(p_idempotency_key) not between 1 and 128 then '22023' else '42501' end,
      message = case when p_idempotency_key is null or length(p_idempotency_key) not between 1 and 128 then 'invalid_input' else 'recent_mfa_required' end;
  end if;

  v_hash := extensions.digest(convert_to(p_request_id::text || ':global-delete', 'utf8'), 'sha256');
  insert into private.admin_idempotency(
    admin_user_id, scope, operation, idempotency_key, request_hash
  ) values (
    (p_ctx).admin_user_id, 'global', 'deletion_job_start', p_idempotency_key, v_hash
  ) on conflict (admin_user_id, scope, operation, idempotency_key)
    do nothing returning true into v_new;
  if not coalesce(v_new, false) then
    select * into v_existing from private.admin_idempotency i
    where i.admin_user_id = (p_ctx).admin_user_id and i.scope = 'global'
      and i.operation = 'deletion_job_start' and i.idempotency_key = p_idempotency_key
    for update;
    if v_existing.request_hash <> v_hash then
      raise exception using errcode = '23505', message = 'idempotency_conflict';
    end if;
    if v_existing.state = 'completed' then
      return query select (v_existing.response_body->>'job_id')::uuid,
        (v_existing.response_body->>'request_id')::uuid,
        v_existing.response_body->>'state', v_existing.response_body->>'checkpoint';
      return;
    end if;
    raise exception using errcode = 'P0001', message = 'operation_in_progress';
  end if;

  select * into v_request from private.deletion_requests r
  where r.id = p_request_id for update;
  if not found or v_request.user_id is null then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  if v_request.state = 'pending_admin' then
    update private.deletion_requests r
    set state = 'approved', approved_at = v_now, approved_by = (p_ctx).admin_user_id
    where r.id = p_request_id
    returning * into v_request;
  elsif v_request.state <> 'approved' then
    raise exception using errcode = 'P0001', message = 'deletion_request_not_approvable';
  end if;

  insert into private.identity_lifecycle(user_id, state)
  values (v_request.user_id, 'deleting')
  on conflict (user_id) do update set state = 'deleting', updated_at = v_now;
  insert into private.deletion_jobs(request_id, user_id, state, checkpoint, next_attempt_at)
  values (v_request.id, v_request.user_id, 'pending', 'created', v_now)
  on conflict (request_id) do update set user_id = excluded.user_id
  returning * into v_job;
  perform private.audit_append(
    (p_ctx).request_id, 'admin', (p_ctx).admin_user_id, null, null,
    'identity.delete_approved', 'deletion_job', v_job.id, null, null,
    jsonb_build_object('request_id', v_request.id, 'checkpoint', v_job.checkpoint)
  );
  v_response := jsonb_build_object(
    'job_id', v_job.id, 'request_id', v_job.request_id,
    'state', v_job.state, 'checkpoint', v_job.checkpoint
  );
  update private.admin_idempotency i
  set state = 'completed', response_status = 202, response_body = v_response
  where i.admin_user_id = (p_ctx).admin_user_id and i.scope = 'global'
    and i.operation = 'deletion_job_start' and i.idempotency_key = p_idempotency_key;
  return query select v_job.id, v_job.request_id, v_job.state, v_job.checkpoint;
end;
$$;

create or replace function private.admin_deletion_job_list(
  p_ctx private.admin_context,
  p_limit integer default 20
)
returns table (
  job_id uuid, request_id uuid, user_id uuid, state text, checkpoint text,
  fence bigint, retry_count integer, next_attempt_at timestamptz,
  last_error_code text, created_at timestamptz, completed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
begin
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if not exists (select 1 from private.system_admin where user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active) then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
  return query
    select j.id, j.request_id, j.user_id, j.state, j.checkpoint, j.fence,
      j.retry_count, j.next_attempt_at, j.last_error_code, j.created_at, j.completed_at
    from private.deletion_jobs j
    order by j.created_at desc, j.id desc
    limit p_limit;
end;
$$;

create or replace function private.admin_deletion_job_read(
  p_ctx private.admin_context,
  p_job_id uuid
)
returns table (
  job_id uuid, request_id uuid, user_id uuid, state text, checkpoint text,
  fence bigint, retry_count integer, next_attempt_at timestamptz,
  last_error_code text, created_at timestamptz, completed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
begin
  if p_job_id is null then raise exception using errcode = '22023', message = 'invalid_input'; end if;
  if not exists (select 1 from private.system_admin where user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active) then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
  return query
    select j.id, j.request_id, j.user_id, j.state, j.checkpoint, j.fence,
      j.retry_count, j.next_attempt_at, j.last_error_code, j.created_at, j.completed_at
    from private.deletion_jobs j where j.id = p_job_id;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
end;
$$;

create or replace function private.admin_deletion_job_retry(
  p_ctx private.admin_context,
  p_job_id uuid,
  p_recent_proof_id uuid,
  p_idempotency_key text
)
returns table (job_id uuid, state text, checkpoint text, retry_count integer, next_attempt_at timestamptz)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_job private.deletion_jobs;
  v_proof private.admin_step_up;
  v_hash bytea;
  v_existing private.admin_idempotency%rowtype;
  v_new boolean := false;
  v_now timestamptz := clock_timestamp();
  v_response jsonb;
begin
  if p_job_id is null or p_recent_proof_id is null
     or p_idempotency_key is null or length(p_idempotency_key) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if not exists (select 1 from private.system_admin where user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active) then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
  select * into v_proof from private.admin_step_up p where p.id = p_recent_proof_id
    and p.user_id = (p_ctx).admin_user_id and p.session_id = (p_ctx).session_id
    and p.expires_at > v_now for update;
  if not found then raise exception using errcode = '42501', message = 'recent_mfa_required'; end if;
  v_hash := extensions.digest(convert_to(p_job_id::text || ':retry', 'utf8'), 'sha256');
  insert into private.admin_idempotency(admin_user_id, scope, operation, idempotency_key, request_hash)
  values ((p_ctx).admin_user_id, 'global', 'deletion_job_retry', p_idempotency_key, v_hash)
  on conflict (admin_user_id, scope, operation, idempotency_key)
    do nothing returning true into v_new;
  if not coalesce(v_new, false) then
    select * into v_existing from private.admin_idempotency i
    where i.admin_user_id = (p_ctx).admin_user_id and i.scope = 'global'
      and i.operation = 'deletion_job_retry' and i.idempotency_key = p_idempotency_key for update;
    if v_existing.request_hash <> v_hash then raise exception using errcode = '23505', message = 'idempotency_conflict'; end if;
    if v_existing.state = 'completed' then
      return query select (v_existing.response_body->>'job_id')::uuid,
        v_existing.response_body->>'state', v_existing.response_body->>'checkpoint',
        (v_existing.response_body->>'retry_count')::integer,
        (v_existing.response_body->>'next_attempt_at')::timestamptz;
      return;
    end if;
    raise exception using errcode = 'P0001', message = 'operation_in_progress';
  end if;
  select * into v_job from private.deletion_jobs j where j.id = p_job_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  if v_job.state not in ('blocked', 'retry') then raise exception using errcode = 'P0001', message = 'deletion_job_not_retryable'; end if;
  update private.deletion_jobs j
  set state = 'retry', retry_count = j.retry_count + 1,
      next_attempt_at = v_now, last_error_code = null, fence = j.fence + 1
  where j.id = v_job.id
  returning * into v_job;
  perform private.audit_append(
    (p_ctx).request_id, 'admin', (p_ctx).admin_user_id, null, null,
    'identity.delete_retry_requested', 'deletion_job', v_job.id, null, null,
    jsonb_build_object('checkpoint', v_job.checkpoint, 'retry_count', v_job.retry_count)
  );
  v_response := jsonb_build_object(
    'job_id', v_job.id, 'state', v_job.state, 'checkpoint', v_job.checkpoint,
    'retry_count', v_job.retry_count, 'next_attempt_at', v_job.next_attempt_at
  );
  update private.admin_idempotency i
  set state = 'completed', response_status = 202, response_body = v_response
  where i.admin_user_id = (p_ctx).admin_user_id and i.scope = 'global'
    and i.operation = 'deletion_job_retry' and i.idempotency_key = p_idempotency_key;
  return query select v_job.id, v_job.state, v_job.checkpoint, v_job.retry_count, v_job.next_attempt_at;
end;
$$;

create or replace function private.deletion_job_claim(
  p_ctx private.job_context,
  p_job_id uuid,
  p_lease_seconds integer default 60
)
returns table (
  job_id uuid, user_id uuid, checkpoint text, fence bigint,
  lease_fence bigint, lease_until timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_job private.deletion_jobs;
  v_claim record;
begin
  if (p_ctx).job_id is null or (p_ctx).lease_owner is null
     or (p_ctx).fencing_token is null or (p_ctx).request_id is null
     or p_job_id is null or p_lease_seconds not between 1 and 3600 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_claim from private.job_lease_claim('global_delete', p_job_id, (p_ctx).lease_owner, p_lease_seconds);
  if not coalesce(v_claim.claimed, false) then return; end if;
  select * into v_job from private.deletion_jobs j where j.id = p_job_id for update;
  if not found then
    perform private.job_lease_release('global_delete', p_job_id, (p_ctx).lease_owner, v_claim.fencing_token);
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  if v_job.state not in ('pending', 'retry') or v_job.next_attempt_at > clock_timestamp() then
    perform private.job_lease_release('global_delete', p_job_id, (p_ctx).lease_owner, v_claim.fencing_token);
    return query select v_job.id, v_job.user_id, v_job.checkpoint, v_job.fence,
      v_claim.fencing_token, v_claim.lease_until;
    return;
  end if;
  update private.deletion_jobs j set state = 'running', fence = j.fence + 1 where j.id = v_job.id returning * into v_job;
  return query select v_job.id, v_job.user_id, v_job.checkpoint, v_job.fence,
    v_claim.fencing_token, v_claim.lease_until;
end;
$$;

create or replace function private.deletion_job_step(
  p_ctx private.job_context,
  p_job_id uuid,
  p_lease_fence bigint,
  p_step text,
  p_outcome text,
  p_error_code text default null
)
returns table (job_id uuid, state text, checkpoint text, retry_count integer, next_attempt_at timestamptz)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_job private.deletion_jobs;
  v_lease private.job_leases;
  v_next text;
  v_now timestamptz := clock_timestamp();
begin
  if (p_ctx).job_id is null or (p_ctx).lease_owner is null
     or (p_ctx).fencing_token is null or (p_ctx).request_id is null
     or p_job_id is null or p_lease_fence is null or p_lease_fence < 1
     or p_step not in ('sessions_revoked', 'accounts_closed', 'files_blocked', 'personal_data_cleared', 'history_anonymized', 'auth_deleted')
     or p_outcome not in ('completed', 'retry', 'blocked')
     or p_outcome in ('retry', 'blocked') and (p_error_code is null or length(p_error_code) not between 1 and 128) then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_lease from private.job_leases l
  where l.job_kind = 'global_delete' and l.resource_id = p_job_id
    and l.lease_owner = (p_ctx).lease_owner and l.fencing_token = p_lease_fence for update;
  if not found then raise exception using errcode = '40001', message = 'stale_job_fence'; end if;
  select * into v_job from private.deletion_jobs j where j.id = p_job_id for update;
  if not found or v_job.state <> 'running' or v_job.fence <> p_ctx.fencing_token then
    raise exception using errcode = '40001', message = 'stale_job_fence';
  end if;
  v_next := case v_job.checkpoint
    when 'created' then 'sessions_revoked'
    when 'sessions_revoked' then 'accounts_closed'
    when 'accounts_closed' then 'files_blocked'
    when 'files_blocked' then 'personal_data_cleared'
    when 'personal_data_cleared' then 'history_anonymized'
    when 'history_anonymized' then 'auth_deleted'
    else null end;
  if p_step <> v_next then raise exception using errcode = 'P0001', message = 'invalid_delete_checkpoint'; end if;
  if p_outcome = 'completed' then
    if p_step = 'accounts_closed' then
      update public.platform_accounts set status = 'closed', closed_at = coalesce(closed_at, v_now)
      where user_id = v_job.user_id and status <> 'closed';
    elsif p_step = 'files_blocked' then
      update public.platform_config_files f
      set status = case when f.status = 'deleted' then 'deleted' else 'deleting' end,
          cancel_requested_at = coalesce(f.cancel_requested_at, v_now),
          delete_requested_at = coalesce(f.delete_requested_at, v_now),
          next_attempt_at = v_now
      from public.platform_accounts a
      where a.id = f.platform_account_id and a.user_id = v_job.user_id
        and f.status <> 'deleted';
    elsif p_step = 'personal_data_cleared' then
      update public.platform_profiles profile set display_name = null, avatar_url = null,
        bio = null, locale = null, timezone = null, metadata = '{}'::jsonb
      from public.platform_accounts a
      where a.id = profile.platform_account_id and a.user_id = v_job.user_id;
      update public.platform_preferences prefs set preferences = '{}'::jsonb
      from public.platform_accounts a
      where a.id = prefs.platform_account_id and a.user_id = v_job.user_id;
    elsif p_step = 'history_anonymized' then
      update public.audit_logs set actor_user_id = null, ip = null, user_agent = null, metadata = '{}'::jsonb
      where actor_user_id = v_job.user_id;
    elsif p_step = 'auth_deleted' then
      update public.platform_accounts set user_id = null, anonymized_at = coalesce(anonymized_at, v_now),
        status = 'closed', closed_at = coalesce(closed_at, v_now)
      where user_id = v_job.user_id;
      delete from private.identity_lifecycle where user_id = v_job.user_id;
    end if;
    update private.deletion_jobs j set checkpoint = p_step,
      state = case when p_step = 'auth_deleted' then 'completed' else 'retry' end,
      next_attempt_at = case when p_step = 'auth_deleted' then j.next_attempt_at else v_now end,
      completed_at = case when p_step = 'auth_deleted' then v_now else null end,
      last_error_code = null where j.id = v_job.id returning * into v_job;
  else
    update private.deletion_jobs j set state = p_outcome, retry_count = j.retry_count + 1,
      next_attempt_at = v_now + make_interval(secs => least(3600, 60 * (2 ^ least(j.retry_count, 6)))),
      last_error_code = p_error_code where j.id = v_job.id returning * into v_job;
  end if;
  perform private.job_lease_release('global_delete', p_job_id, (p_ctx).lease_owner, p_lease_fence);
  return query select v_job.id, v_job.state, v_job.checkpoint, v_job.retry_count, v_job.next_attempt_at;
end;
$$;

create or replace function private.admin_file_delete_request(
  p_ctx private.admin_context,
  p_file_id uuid,
  p_recent_proof_id uuid,
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
  if (p_ctx).admin_user_id is null or (p_ctx).session_id is null
     or (p_ctx).request_id is null or p_file_id is null or p_recent_proof_id is null
     or p_idempotency_key is null or length(p_idempotency_key) not between 1 and 128
     or not exists (select 1 from private.system_admin where user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active)
     or not exists (
       select 1 from private.admin_step_up proof
       where proof.id = p_recent_proof_id and proof.user_id = (p_ctx).admin_user_id
         and proof.session_id = (p_ctx).session_id and proof.expires_at > v_now
     ) then
    raise exception using errcode = case when p_idempotency_key is null or length(p_idempotency_key) not between 1 and 128 then '22023' else '42501' end,
      message = case when p_idempotency_key is null or length(p_idempotency_key) not between 1 and 128 then 'invalid_input' else 'recent_mfa_required' end;
  end if;
  select * into v_file from public.platform_config_files f where f.id = p_file_id;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  select * into v_account from public.platform_accounts a
  where a.platform_id = v_file.platform_id and a.id = v_file.platform_account_id for update;
  select * into v_file from public.platform_config_files f where f.id = p_file_id for update;
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

alter function private.admin_deletion_job_start(private.admin_context, uuid, uuid, text) owner to domain_owner;
alter function private.admin_deletion_job_list(private.admin_context, integer) owner to domain_owner;
alter function private.admin_deletion_job_read(private.admin_context, uuid) owner to domain_owner;
alter function private.admin_deletion_job_retry(private.admin_context, uuid, uuid, text) owner to domain_owner;
alter function private.deletion_job_claim(private.job_context, uuid, integer) owner to domain_owner;
alter function private.deletion_job_step(private.job_context, uuid, bigint, text, text, text) owner to domain_owner;
alter function private.admin_file_delete_request(private.admin_context, uuid, uuid, text) owner to domain_owner;

revoke all on function private.admin_deletion_job_start(private.admin_context, uuid, uuid, text),
  private.admin_deletion_job_list(private.admin_context, integer),
  private.admin_deletion_job_read(private.admin_context, uuid),
  private.admin_deletion_job_retry(private.admin_context, uuid, uuid, text),
  private.deletion_job_claim(private.job_context, uuid, integer),
  private.deletion_job_step(private.job_context, uuid, bigint, text, text, text)
  , private.admin_file_delete_request(private.admin_context, uuid, uuid, text)
  from public, anon, authenticated, account_executor, recovery_executor;
grant execute on function private.admin_deletion_job_start(private.admin_context, uuid, uuid, text),
  private.admin_deletion_job_list(private.admin_context, integer),
  private.admin_deletion_job_read(private.admin_context, uuid),
  private.admin_deletion_job_retry(private.admin_context, uuid, uuid, text)
  to admin_executor;
grant execute on function private.deletion_job_claim(private.job_context, uuid, integer),
  private.deletion_job_step(private.job_context, uuid, bigint, text, text, text)
  to job_executor;
grant execute on function private.admin_file_delete_request(private.admin_context, uuid, uuid, text)
  to admin_executor;
