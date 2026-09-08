-- M4-05: deletion requests, expiry, cleanup leases and reconciliation.

alter table public.platform_config_files
  add column cancel_requested_at timestamptz,
  add column retry_count integer not null default 0 check (retry_count >= 0),
  add column next_attempt_at timestamptz not null default now(),
  add column last_error_code text check (last_error_code is null or length(last_error_code) between 1 and 128),
  add column over_quota boolean not null default false;

create index platform_config_files_cleanup_idx
  on public.platform_config_files(status, next_attempt_at, updated_at, id)
  where status in ('pending', 'receiving', 'storing', 'active', 'deleting');

create or replace function private.file_cleanup_candidates(
  p_cursor_file_id uuid default null,
  p_limit integer default 20
)
returns table (file_id uuid, next_attempt_at timestamptz)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
begin
  if p_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  return query
    select f.id, f.next_attempt_at
    from public.platform_config_files f
    where (p_cursor_file_id is null or f.id > p_cursor_file_id)
      and f.next_attempt_at <= clock_timestamp()
      and (
        (f.status in ('pending', 'receiving') and f.write_outcome = 'not_started'
          and (f.lease_until is null or f.lease_until <= clock_timestamp())
          and (f.status = 'receiving' or f.intent_expires_at <= clock_timestamp()))
        or (f.status in ('storing', 'deleting') and f.write_outcome in ('in_flight', 'unknown'))
        or (f.status = 'deleting' and f.write_outcome = 'confirmed')
      )
    order by f.id
    limit p_limit;
end;
$$;

create or replace function private.file_delete_request(
  p_ctx private.account_context,
  p_file_id uuid,
  p_idempotency_key text
)
returns table (
  file_id uuid,
  status text,
  write_outcome text,
  reserved_bytes bigint,
  reserved_count integer,
  deleted_at timestamptz,
  cancel_requested_at timestamptz
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
    and f.platform_account_id = v_account_id and f.id = p_file_id for update;
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
    where f.id = v_file.id
    returning * into v_file;
    perform private.audit_append(
      (p_ctx).request_id, 'user', (p_ctx).user_id, (p_ctx).platform_id, v_account_id,
      'file.deleted_without_storage', 'platform_config_file', v_file.id, null, null,
      jsonb_build_object('reason', 'no_storage_write_started')
    );
  elsif v_file.status not in ('deleting', 'deleted') then
    update public.platform_config_files f
    set status = 'deleting', cancel_requested_at = coalesce(f.cancel_requested_at, v_now),
        next_attempt_at = v_now
    where f.id = v_file.id
    returning * into v_file;
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

create or replace function private.file_cleanup_claim(
  p_ctx private.job_context,
  p_file_id uuid,
  p_lease_seconds integer default 60
)
returns table (
  file_id uuid,
  action text,
  status text,
  write_outcome text,
  platform_id uuid,
  platform_account_id uuid,
  storage_bucket text,
  storage_path text,
  write_attempt_id uuid,
  fencing_token bigint,
  retry_count integer,
  next_attempt_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_claim record;
  v_file public.platform_config_files;
  v_now timestamptz := clock_timestamp();
  v_action text;
  v_attempt_id uuid;
begin
  if (p_ctx).job_id is null or (p_ctx).lease_owner is null
     or length((p_ctx).lease_owner) not between 1 and 128
     or (p_ctx).fencing_token is null or (p_ctx).fencing_token < 1
     or (p_ctx).request_id is null or p_file_id is null
     or p_lease_seconds not between 1 and 3600 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_claim from private.job_lease_claim(
    'file_cleanup', p_file_id, (p_ctx).lease_owner, p_lease_seconds
  );
  if not coalesce(v_claim.claimed, false) then
    return query select p_file_id, 'busy'::text, null::text, null::text,
      null::uuid, null::uuid, null::text, null::text, null::uuid,
      v_claim.fencing_token, null::integer, v_claim.lease_until;
    return;
  end if;
  select * into v_file from public.platform_config_files f
  where f.id = p_file_id for update;
  if not found then
    perform private.job_lease_release('file_cleanup', p_file_id, (p_ctx).lease_owner, v_claim.fencing_token);
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  perform 1 from public.platform_accounts a
  where a.platform_id = v_file.platform_id and a.id = v_file.platform_account_id for update;
  if exists (select 1 from private.file_backup_barriers b where b.state in ('active', 'running')) then
    v_action := 'backup_barrier';
  elsif v_file.status in ('pending', 'receiving')
    and v_file.write_outcome = 'not_started'
    and not exists (select 1 from private.file_write_attempts a where a.file_id = v_file.id)
    and (v_file.lease_until is null or v_file.lease_until <= v_now)
    and (v_file.status = 'receiving' or v_file.intent_expires_at <= v_now) then
    update public.platform_config_files f
    set status = 'expired', reserved_bytes = 0, reserved_count = 0,
        next_attempt_at = v_now
    where f.id = v_file.id
    returning * into v_file;
    perform private.audit_append(
      (p_ctx).request_id, 'job', null, v_file.platform_id, v_file.platform_account_id,
      'file.intent_expired', 'platform_config_file', v_file.id, null, null,
      jsonb_build_object('reason', 'no_storage_write_started')
    );
    v_action := 'no_storage';
  elsif v_file.status in ('active', 'deleting') and v_file.write_outcome = 'confirmed' then
    select a.id into v_attempt_id from private.file_write_attempts a
    where a.file_id = v_file.id and a.state in ('in_flight', 'unknown') limit 1;
    if v_attempt_id is null then v_action := 'remove';
    else v_action := 'settlement_required';
    end if;
  elsif v_file.status in ('storing', 'deleting')
    and v_file.write_outcome in ('in_flight', 'unknown') then
    v_action := 'settlement_required';
  else
    v_action := 'no_storage';
  end if;
  if v_action = 'settlement_required' and v_file.updated_at <= v_now - interval '5 minutes' then
    perform private.audit_append(
      (p_ctx).request_id, 'job', null, v_file.platform_id, v_file.platform_account_id,
      'file.unknown_write_alert', 'platform_config_file', v_file.id, null, null,
      jsonb_build_object('write_outcome', v_file.write_outcome)
    );
  end if;
  if v_action <> 'remove' then
    perform private.job_lease_release('file_cleanup', p_file_id, (p_ctx).lease_owner, v_claim.fencing_token);
  end if;
  return query select v_file.id, v_action, v_file.status, v_file.write_outcome,
    v_file.platform_id, v_file.platform_account_id, v_file.storage_bucket,
    v_file.storage_path, v_attempt_id, v_claim.fencing_token,
    v_file.retry_count, v_file.next_attempt_at;
end;
$$;

create or replace function private.file_cleanup_finish(
  p_ctx private.job_context,
  p_file_id uuid,
  p_fencing_token bigint,
  p_outcome text,
  p_error_code text default null
)
returns table (file_id uuid, status text, write_outcome text, reserved_bytes bigint, retry_count integer, next_attempt_at timestamptz)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_file public.platform_config_files;
  v_lease private.job_leases;
  v_account public.platform_accounts;
  v_retry integer;
  v_next timestamptz;
begin
  if (p_ctx).job_id is null or (p_ctx).lease_owner is null
     or (p_ctx).request_id is null or p_file_id is null
     or p_fencing_token is null or p_fencing_token < 1
     or p_outcome not in ('removed', 'not_found', 'failed', 'unknown')
     or p_outcome in ('failed', 'unknown') and (p_error_code is null or length(p_error_code) not between 1 and 128) then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_lease from private.job_leases l
  where l.job_kind = 'file_cleanup' and l.resource_id = p_file_id
    and l.lease_owner = (p_ctx).lease_owner and l.fencing_token = p_fencing_token for update;
  if not found then raise exception using errcode = '40001', message = 'stale_job_fence'; end if;
  select * into v_file from public.platform_config_files f where f.id = p_file_id;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  select * into v_account from public.platform_accounts a
  where a.platform_id = v_file.platform_id and a.id = v_file.platform_account_id for update;
  select * into v_file from public.platform_config_files f where f.id = p_file_id for update;
  if p_outcome in ('removed', 'not_found') then
    if v_file.status not in ('active', 'deleting') or v_file.write_outcome <> 'confirmed' then
      raise exception using errcode = 'P0001', message = 'settlement_required';
    end if;
    update public.platform_config_files f
    set status = 'deleted', reserved_bytes = 0, reserved_count = 0,
        deleted_at = clock_timestamp(), next_attempt_at = clock_timestamp()
    where f.id = v_file.id
    returning * into v_file;
    perform private.audit_append(
      (p_ctx).request_id, 'job', null, v_file.platform_id, v_file.platform_account_id,
      'file.deleted_confirmed', 'platform_config_file', v_file.id, null, null,
      jsonb_build_object('outcome', p_outcome)
    );
  else
    v_retry := v_file.retry_count + 1;
    v_next := clock_timestamp() + make_interval(secs => least(3600, 60 * (2 ^ least(v_retry - 1, 6))));
    update public.platform_config_files f
    set status = case when f.status = 'active' then 'deleting' else f.status end,
        retry_count = v_retry, next_attempt_at = v_next, last_error_code = p_error_code
    where f.id = v_file.id
    returning * into v_file;
    perform private.audit_append(
      (p_ctx).request_id, 'job', null, v_file.platform_id, v_file.platform_account_id,
      case when v_retry >= 10 then 'file.cleanup_manual_required' else 'file.cleanup_retry' end,
      'platform_config_file', v_file.id, null, null,
      jsonb_build_object('retry_count', v_retry, 'error_code', p_error_code)
    );
  end if;
  perform private.job_lease_release('file_cleanup', p_file_id, (p_ctx).lease_owner, p_fencing_token);
  return query select v_file.id, v_file.status, v_file.write_outcome,
    v_file.reserved_bytes, v_file.retry_count, v_file.next_attempt_at;
end;
$$;

create or replace function private.file_reconcile_step(
  p_ctx private.job_context,
  p_cursor_file_id uuid default null,
  p_limit integer default 20
)
returns table (file_id uuid, issue_code text, status text, write_outcome text, reserved_bytes bigint)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_file public.platform_config_files;
  v_issue text;
begin
  if (p_ctx).job_id is null or (p_ctx).lease_owner is null
     or (p_ctx).fencing_token is null or (p_ctx).fencing_token < 1
    or (p_ctx).request_id is null or p_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  for v_file in
    select f.* from public.platform_config_files f
    where (p_cursor_file_id is null or f.id > p_cursor_file_id)
      and ((f.write_outcome in ('in_flight', 'unknown') and f.updated_at <= clock_timestamp() - interval '5 minutes')
       or (f.status = 'deleting' and f.updated_at <= clock_timestamp() - interval '15 minutes')
       or (f.reserved_bytes = 0 and f.status in ('pending', 'receiving', 'storing', 'active', 'deleting')))
    order by f.id
    limit p_limit
  loop
    v_issue := case
      when v_file.write_outcome in ('in_flight', 'unknown') then 'unknown_write'
      when v_file.status = 'deleting' then 'delete_backlog'
      else 'budget_invariant' end;
    perform private.audit_append(
      (p_ctx).request_id, 'job', null, v_file.platform_id, v_file.platform_account_id,
      'file.reconcile_alert', 'platform_config_file', v_file.id, null, null,
      jsonb_build_object('issue_code', v_issue, 'reserved_bytes', v_file.reserved_bytes)
    );
    file_id := v_file.id; issue_code := v_issue; status := v_file.status;
    write_outcome := v_file.write_outcome; reserved_bytes := v_file.reserved_bytes;
    return next;
  end loop;
end;
$$;

alter function private.file_delete_request(private.account_context, uuid, text) owner to domain_owner;
alter function private.file_cleanup_candidates(uuid, integer) owner to domain_owner;
alter function private.file_cleanup_claim(private.job_context, uuid, integer) owner to domain_owner;
alter function private.file_cleanup_finish(private.job_context, uuid, bigint, text, text) owner to domain_owner;
alter function private.file_reconcile_step(private.job_context, uuid, integer) owner to domain_owner;

revoke all on function private.file_delete_request(private.account_context, uuid, text)
  from public, anon, authenticated, admin_executor, job_executor, recovery_executor;
revoke all on function private.file_cleanup_candidates(uuid, integer)
  from public, anon, authenticated, account_executor, admin_executor, recovery_executor;
revoke all on function private.file_cleanup_claim(private.job_context, uuid, integer)
  from public, anon, authenticated, account_executor, admin_executor, recovery_executor;
revoke all on function private.file_cleanup_finish(private.job_context, uuid, bigint, text, text)
  from public, anon, authenticated, account_executor, admin_executor, recovery_executor;
revoke all on function private.file_reconcile_step(private.job_context, uuid, integer)
  from public, anon, authenticated, account_executor, admin_executor, recovery_executor;

grant execute on function private.file_delete_request(private.account_context, uuid, text) to account_executor;
grant execute on function private.file_cleanup_candidates(uuid, integer) to job_executor;
grant execute on function private.file_cleanup_claim(private.job_context, uuid, integer) to job_executor;
grant execute on function private.file_cleanup_finish(private.job_context, uuid, bigint, text, text) to job_executor;
grant execute on function private.file_reconcile_step(private.job_context, uuid, integer) to job_executor;
