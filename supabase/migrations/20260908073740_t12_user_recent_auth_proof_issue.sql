-- T12-R2: only the central Account API may issue an ordinary recent-auth
-- proof, after it has verified a Supabase reauthentication event.

create or replace function private.user_recent_auth_proof_issue(
  p_user_id uuid,
  p_session_id uuid,
  p_factor_id text
)
returns table (proof_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_verified_at timestamptz := clock_timestamp();
begin
  if p_user_id is null or p_session_id is null or p_factor_id is null
     or length(p_factor_id) not between 1 and 128
     or not exists (
       select 1 from private.check_user_session(p_user_id, p_session_id)
       where active
     ) then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;

  delete from private.user_recent_auth_proofs
  where user_id = p_user_id and session_id = p_session_id;

  return query
  insert into private.user_recent_auth_proofs (
    user_id, session_id, factor_id, verified_at, expires_at
  ) values (
    p_user_id, p_session_id, p_factor_id, v_verified_at,
    v_verified_at + interval '5 minutes'
  )
  returning id, private.user_recent_auth_proofs.expires_at;
end;
$$;

alter function private.user_recent_auth_proof_issue(uuid, uuid, text)
  owner to domain_owner;
revoke all on function private.user_recent_auth_proof_issue(uuid, uuid, text)
  from public, anon, authenticated, admin_executor, job_executor,
    recovery_executor;
grant execute on function private.user_recent_auth_proof_issue(uuid, uuid, text)
  to account_executor;
