-- OPT-003 Phase 02 browser coverage exposed a latent runtime ambiguity in the
-- original Global Delete start function. Its RETURNS TABLE output variable
-- `request_id` collided with `ON CONFLICT (request_id)` in PL/pgSQL.
-- Keep the existing mutation contract and state machine; only bind the upsert
-- to the table's named unique constraint so the conflict target is unambiguous.

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
  on conflict on constraint deletion_jobs_request_id_key
    do update set user_id = excluded.user_id
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

alter function private.admin_deletion_job_start(private.admin_context, uuid, uuid, text)
  owner to domain_owner;
revoke all on function private.admin_deletion_job_start(private.admin_context, uuid, uuid, text)
  from public, anon, authenticated, account_executor, job_executor,
    recovery_executor, billing_ingress;
grant execute on function private.admin_deletion_job_start(private.admin_context, uuid, uuid, text)
  to admin_executor;
