-- M4-09: closed-account retention cleanup. This keeps the account tombstone
-- and global identity while removing account-scoped personal data. File rows
-- are handed to the existing Storage cleanup worker; unknown writes retain
-- their reservation until that worker receives a trusted provider outcome.

create or replace function private.account_retention_candidates(
  p_cutoff timestamptz default null,
  p_cursor_account_id uuid default null,
  p_limit integer default 20
)
returns table (platform_account_id uuid, closed_at timestamptz)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
begin
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  return query
    select a.id, a.closed_at
    from public.platform_accounts a
    where a.status = 'closed' and a.user_id is not null
      and a.closed_at is not null
      and a.closed_at <= coalesce(p_cutoff, clock_timestamp() - interval '30 days')
      and (p_cursor_account_id is null or a.id > p_cursor_account_id)
    order by a.id
    limit p_limit;
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
begin
  if (p_ctx).job_id is null or (p_ctx).lease_owner is null
     or (p_ctx).fencing_token is null or (p_ctx).fencing_token < 1
     or (p_ctx).request_id is null or p_platform_account_id is null
     or p_lease_seconds not between 1 and 3600 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
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
     or v_account.closed_at is null
     or v_account.closed_at > coalesce(p_cutoff, v_now - interval '30 days') then
    perform private.job_lease_release('account_retention', p_platform_account_id,
      (p_ctx).lease_owner, v_claim.fencing_token);
    return query select v_account.id, 'skipped'::text, v_account.status,
      v_account.anonymized_at, v_claim.fencing_token;
    return;
  end if;

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
    jsonb_build_object('closed_at', v_account.closed_at, 'retention_days', 30)
  );
  perform private.job_lease_release('account_retention', p_platform_account_id,
    (p_ctx).lease_owner, v_claim.fencing_token);
  return query select v_account.id, 'cleaned'::text, v_account.status,
    v_account.anonymized_at, v_claim.fencing_token;
end;
$$;

alter function private.account_retention_candidates(timestamptz, uuid, integer) owner to domain_owner;
alter function private.account_retention_cleanup(private.job_context, uuid, timestamptz, integer) owner to domain_owner;
revoke all on function private.account_retention_candidates(timestamptz, uuid, integer),
  private.account_retention_cleanup(private.job_context, uuid, timestamptz, integer)
  from public, anon, authenticated, account_executor, admin_executor, recovery_executor;
grant execute on function private.account_retention_candidates(timestamptz, uuid, integer),
  private.account_retention_cleanup(private.job_context, uuid, timestamptz, integer)
  to job_executor;
