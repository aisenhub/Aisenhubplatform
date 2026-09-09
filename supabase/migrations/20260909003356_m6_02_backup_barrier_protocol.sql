-- M6-02: give the backup worker a fenced, durable barrier lifecycle.
-- The external backup target and tombstone store remain injected by the worker;
-- this migration only owns the database-side contract and failure semantics.

create or replace function private.file_backup_barrier_begin(
  p_ctx private.job_context,
  p_scope text,
  p_recovery_set_id text,
  p_deadline_at timestamptz,
  p_manifest_version text default null
)
returns table (
  barrier_id uuid,
  scope text,
  recovery_set_id text,
  state text,
  fencing_token bigint,
  started_at timestamptz,
  deadline_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_lease private.job_leases;
  v_barrier private.file_backup_barriers;
begin
  if (p_ctx).job_id is null
     or (p_ctx).lease_owner is null
     or length((p_ctx).lease_owner) not between 1 and 128
     or (p_ctx).fencing_token is null
     or (p_ctx).fencing_token < 1
     or (p_ctx).request_id is null
     or p_scope not in ('platform', 'global', 'file')
     or p_recovery_set_id is null
     or length(p_recovery_set_id) not between 1 and 256
     or p_deadline_at is null
     or p_deadline_at <= v_now
     or p_deadline_at > v_now + interval '2 hours'
     or (p_manifest_version is not null and length(p_manifest_version) not between 1 and 128) then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  select * into v_lease
  from private.job_leases l
  where l.job_kind = 'backup_manifest'
    and l.resource_id = (p_ctx).job_id
    and l.lease_owner = (p_ctx).lease_owner
    and l.fencing_token = (p_ctx).fencing_token
    and l.lease_until > v_now
  for update;
  if not found then
    raise exception using errcode = '40001', message = 'stale_job_fence';
  end if;

  select * into v_barrier
  from private.file_backup_barriers b
  where b.scope = p_scope and b.recovery_set_id = p_recovery_set_id
  for update;
  if found then
    raise exception using errcode = '23505', message =
      case when v_barrier.state in ('active', 'running')
        then 'backup_in_progress' else 'recovery_set_already_recorded' end;
  end if;

  insert into private.file_backup_barriers (
    scope, recovery_set_id, state, lease_owner, fencing_token,
    started_at, deadline_at, manifest_version
  ) values (
    p_scope, p_recovery_set_id, 'running', (p_ctx).lease_owner,
    (p_ctx).fencing_token, v_now, p_deadline_at, p_manifest_version
  )
  returning * into v_barrier;

  return query
    select v_barrier.id, v_barrier.scope, v_barrier.recovery_set_id,
      v_barrier.state, v_barrier.fencing_token, v_barrier.started_at,
      v_barrier.deadline_at;
end;
$$;

create or replace function private.file_backup_barrier_finish(
  p_ctx private.job_context,
  p_barrier_id uuid,
  p_fencing_token bigint,
  p_result text,
  p_manifest_version text default null,
  p_error_code text default null
)
returns table (
  barrier_id uuid,
  scope text,
  recovery_set_id text,
  state text,
  fencing_token bigint,
  finished_at timestamptz,
  manifest_version text,
  last_error_code text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_lease private.job_leases;
  v_barrier private.file_backup_barriers;
  v_state text := p_result;
  v_error text := p_error_code;
begin
  if (p_ctx).job_id is null
     or (p_ctx).lease_owner is null
     or length((p_ctx).lease_owner) not between 1 and 128
     or (p_ctx).fencing_token is null
     or (p_ctx).fencing_token < 1
     or (p_ctx).request_id is null
     or p_barrier_id is null
     or p_fencing_token is null
     or p_fencing_token < 1
     or p_fencing_token <> (p_ctx).fencing_token
     or p_result not in ('complete', 'failed') then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  if p_result = 'complete' then
    if p_manifest_version is null or length(p_manifest_version) not between 1 and 128 then
      raise exception using errcode = '22023', message = 'manifest_required';
    end if;
    if p_error_code is not null then
      raise exception using errcode = '22023', message = 'invalid_input';
    end if;
  elsif p_error_code is null or length(p_error_code) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'error_code_required';
  end if;

  select * into v_lease
  from private.job_leases l
  where l.job_kind = 'backup_manifest'
    and l.resource_id = (p_ctx).job_id
    and l.lease_owner = (p_ctx).lease_owner
    and l.fencing_token = (p_ctx).fencing_token
    and l.lease_until > v_now
  for update;
  if not found then
    raise exception using errcode = '40001', message = 'stale_job_fence';
  end if;

  select * into v_barrier
  from private.file_backup_barriers b
  where b.id = p_barrier_id
    and b.state = 'running'
    and b.lease_owner = (p_ctx).lease_owner
    and b.fencing_token = p_fencing_token
  for update;
  if not found then
    raise exception using errcode = '40001', message = 'stale_job_fence';
  end if;

  if v_now > v_barrier.deadline_at then
    v_state := 'failed';
    v_error := 'deadline_exceeded';
    p_manifest_version := null;
  end if;

  update private.file_backup_barriers b
  set state = v_state,
      finished_at = v_now,
      manifest_version = case when v_state = 'complete' then p_manifest_version else null end,
      last_error_code = case when v_state = 'failed' then v_error else null end
  where b.id = v_barrier.id
  returning * into v_barrier;

  perform private.job_lease_release(
    'backup_manifest', (p_ctx).job_id, (p_ctx).lease_owner, p_fencing_token
  );

  return query
    select v_barrier.id, v_barrier.scope, v_barrier.recovery_set_id,
      v_barrier.state, v_barrier.fencing_token, v_barrier.finished_at,
      v_barrier.manifest_version, v_barrier.last_error_code;
end;
$$;

alter function private.file_backup_barrier_begin(
  private.job_context, text, text, timestamptz, text
) owner to domain_owner;
alter function private.file_backup_barrier_finish(
  private.job_context, uuid, bigint, text, text, text
) owner to domain_owner;

revoke all on function private.file_backup_barrier_begin(
  private.job_context, text, text, timestamptz, text
) from public, anon, authenticated, account_executor, admin_executor, recovery_executor;
revoke all on function private.file_backup_barrier_finish(
  private.job_context, uuid, bigint, text, text, text
) from public, anon, authenticated, account_executor, admin_executor, recovery_executor;
grant execute on function private.file_backup_barrier_begin(
  private.job_context, text, text, timestamptz, text
) to job_executor;
grant execute on function private.file_backup_barrier_finish(
  private.job_context, uuid, bigint, text, text, text
) to job_executor;
