-- OPT-008 Phase 04: connect Feedback privacy deletion to the existing
-- account retention and Global Delete lifecycle. No new checkpoint is added.

create or replace function private.feedback_privacy_delete(
  p_feedback_id uuid,
  p_reason text,
  p_now timestamptz default clock_timestamp()
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare v_feedback public.platform_feedback;
begin
  if p_feedback_id is null or p_now is null or p_reason is null or length(p_reason) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_feedback from public.platform_feedback f where f.id = p_feedback_id for update;
  if not found or v_feedback.status = 'deleted' then return; end if;
  update public.platform_feedback set
    status = 'deleting', delete_requested_at = coalesce(delete_requested_at, p_now),
    author_display_name_snapshot = null, contact_email_snapshot = null,
    contact_allowed = false, title = null, body = null, client_context = '{}'::jsonb,
    row_version = row_version + 1
  where id = v_feedback.id;
  delete from public.platform_feedback_labels where feedback_id = v_feedback.id;
  update public.platform_feedback_events set note_body = null, metadata = '{}'::jsonb
  where feedback_id = v_feedback.id;
  update public.platform_feedback_attachments set
    status = case when status = 'deleted' then 'deleted' else 'deleting' end,
    original_name = case when status = 'deleted' then original_name else '[deleting]' end,
    cancel_requested_at = coalesce(cancel_requested_at, p_now),
    delete_requested_at = coalesce(delete_requested_at, p_now),
    next_attempt_at = greatest(p_now, coalesce(lease_until, p_now))
  where feedback_id = v_feedback.id and status <> 'deleted';
  insert into public.platform_feedback_events(platform_id, feedback_id, event_type, metadata)
  values (v_feedback.platform_id, v_feedback.id, 'delete_requested',
    jsonb_build_object('reason_code', p_reason));
  perform private.feedback_delete_reconcile(v_feedback.id, p_now);
end;
$$;

create or replace function private.account_retention_cleanup(
  p_ctx private.job_context,
  p_platform_account_id uuid,
  p_cutoff timestamptz default null,
  p_lease_seconds integer default 60
)
returns table (
  platform_account_id uuid, action text, status text,
  anonymized_at timestamptz, fencing_token bigint
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_account public.platform_accounts;
  v_claim record;
  v_now timestamptz := clock_timestamp();
  v_cutoff timestamptz;
  v_retention_days integer;
begin
  if (p_ctx).job_id is null or (p_ctx).lease_owner is null
     or (p_ctx).fencing_token is null or (p_ctx).fencing_token < 1
     or (p_ctx).request_id is null or p_platform_account_id is null
     or p_lease_seconds not between 1 and 3600 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select policy.cutoff_at, policy.retention_days
    into v_cutoff, v_retention_days
  from private.account_retention_cutoff(p_cutoff) policy;
  select * into v_claim from private.job_lease_claim(
    'account_retention', p_platform_account_id, (p_ctx).lease_owner, p_lease_seconds
  );
  if not coalesce(v_claim.claimed, false) then
    return query select p_platform_account_id, 'busy'::text, null::text,
      null::timestamptz, v_claim.fencing_token;
    return;
  end if;
  select * into v_account from public.platform_accounts a
  where a.id = p_platform_account_id for update;
  if not found then
    perform private.job_lease_release('account_retention', p_platform_account_id,
      (p_ctx).lease_owner, v_claim.fencing_token);
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  if v_account.status <> 'closed' or v_account.user_id is null
     or v_account.closed_at is null or v_account.closed_at > v_cutoff then
    perform private.job_lease_release('account_retention', p_platform_account_id,
      (p_ctx).lease_owner, v_claim.fencing_token);
    return query select v_account.id, 'skipped'::text, v_account.status,
      v_account.anonymized_at, v_claim.fencing_token;
    return;
  end if;

  perform private.config_account_privacy_cleanup(
    v_account.id, v_now, 'account_retention_cleanup'
  );
  perform private.feedback_account_privacy_cleanup(
    v_account.id, v_now, 'account_retention_cleanup'
  );
  update public.platform_profiles p
  set display_name = null, avatar_url = null, bio = null, locale = null,
    timezone = null, metadata = '{}'::jsonb
  where p.platform_account_id = v_account.id;
  update public.platform_preferences p
  set preferences = '{}'::jsonb
  where p.platform_account_id = v_account.id;
  update public.platform_config_files f
  set status = case when f.status = 'deleted' then 'deleted' else 'deleting' end,
    cancel_requested_at = coalesce(f.cancel_requested_at, v_now),
    delete_requested_at = coalesce(f.delete_requested_at, v_now), next_attempt_at = v_now
  where f.platform_account_id = v_account.id and f.status <> 'deleted';
  update public.audit_logs l
  set actor_user_id = null, ip = null, user_agent = null, metadata = '{}'::jsonb
  where l.platform_account_id = v_account.id;
  update public.platform_accounts a
  set user_id = null, anonymized_at = coalesce(a.anonymized_at, v_now),
    status = 'closed', closed_at = coalesce(a.closed_at, v_now)
  where a.id = v_account.id
  returning * into v_account;
  perform private.audit_append(
    (p_ctx).request_id, 'job', null, v_account.platform_id, v_account.id,
    'account.retention_cleaned', 'platform_account', v_account.id, null, null,
    jsonb_build_object('closed_at', v_account.closed_at,
      'personal_data_retention_days', v_retention_days)
  );
  perform private.job_lease_release('account_retention', p_platform_account_id,
    (p_ctx).lease_owner, v_claim.fencing_token);
  return query select v_account.id, 'cleaned'::text, v_account.status,
    v_account.anonymized_at, v_claim.fencing_token;
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
  if not found or v_job.state <> 'running' or v_job.fence <> (p_ctx).fencing_token then
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
      perform private.config_account_privacy_cleanup(a.id, v_now, 'global_delete')
      from public.platform_accounts a
      where a.user_id = v_job.user_id;
      perform private.feedback_account_privacy_cleanup(a.id, v_now, 'global_delete')
      from public.platform_accounts a
      where a.user_id = v_job.user_id;
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

alter function private.account_retention_cleanup(private.job_context, uuid, timestamptz, integer) owner to domain_owner;
alter function private.deletion_job_step(private.job_context, uuid, bigint, text, text, text) owner to domain_owner;
alter function private.feedback_privacy_delete(uuid, text, timestamptz) owner to domain_owner;

revoke all on function private.feedback_privacy_delete(uuid, text, timestamptz),
  private.account_retention_cleanup(private.job_context, uuid, timestamptz, integer),
  private.deletion_job_step(private.job_context, uuid, bigint, text, text, text)
from public, anon, authenticated, account_executor, admin_executor, job_executor, recovery_executor;

grant execute on function private.account_retention_cleanup(private.job_context, uuid, timestamptz, integer),
  private.deletion_job_step(private.job_context, uuid, bigint, text, text, text)
to job_executor;
