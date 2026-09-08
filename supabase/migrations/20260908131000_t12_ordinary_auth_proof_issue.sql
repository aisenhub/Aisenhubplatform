-- T12-R2: ordinary recent proof is issued only after the central API has
-- verified a fresh Supabase email-OTP sign-in session for the same user.
-- The temporary Auth session is never returned to the browser and is revoked
-- by the BFF after this issuer succeeds.

create or replace function private.auth_session_recent_for_proof(
  p_user_id uuid,
  p_session_id uuid,
  p_now timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private
as $$
  select exists (
    select 1
    from auth.sessions
    where id = p_session_id
      and user_id = p_user_id
      and created_at > p_now - interval '5 minutes'
      and created_at <= p_now
      and (not_after is null or not_after > p_now)
  )
$$;

alter function private.auth_session_recent_for_proof(uuid, uuid, timestamptz)
  owner to postgres;
revoke all on function private.auth_session_recent_for_proof(uuid, uuid, timestamptz)
  from public, anon, authenticated, account_executor, admin_executor,
    job_executor, recovery_executor;
grant execute on function private.auth_session_recent_for_proof(uuid, uuid, timestamptz)
  to domain_owner;

create or replace function private.user_recent_auth_proof_issue(
  p_ctx private.account_context,
  p_auth_session_id uuid,
  p_factor_id text
)
returns table (proof_id uuid, expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  if (p_ctx).user_id is null
     or (p_ctx).session_id is null
     or p_auth_session_id is null
     or p_auth_session_id = (p_ctx).session_id
     or p_factor_id <> 'email_otp'
     or not exists (
       select 1
       from private.check_user_session((p_ctx).user_id, (p_ctx).session_id)
       where active
     )
     or not private.auth_session_recent_for_proof(
       (p_ctx).user_id,
       p_auth_session_id,
       v_now
     ) then
    raise exception using errcode = '42501', message = 'recent_mfa_required';
  end if;

  return query
  insert into private.user_recent_auth_proofs (
    user_id, session_id, factor_id, verified_at, expires_at
  ) values (
    (p_ctx).user_id,
    (p_ctx).session_id,
    p_factor_id,
    v_now,
    v_now + interval '5 minutes'
  )
  returning id, private.user_recent_auth_proofs.expires_at;
end;
$$;

alter function private.user_recent_auth_proof_issue(
  private.account_context, uuid, text
) owner to domain_owner;
revoke all on function private.user_recent_auth_proof_issue(
  private.account_context, uuid, text
) from public, anon, authenticated, admin_executor, job_executor,
  recovery_executor;
grant execute on function private.user_recent_auth_proof_issue(
  private.account_context, uuid, text
) to account_executor;
