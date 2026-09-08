-- T04: only the central Admin HTTP adapter may issue a recent-MFA proof after
-- it has verified an active AAL2 Supabase session. The executor cannot write
-- the storage table directly.
create or replace function private.admin_step_up_issue(
  p_ctx private.admin_context,
  p_factor_id uuid
)
returns table (proof_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_verified_at timestamptz := clock_timestamp();
begin
  if (p_ctx).admin_user_id is null or (p_ctx).session_id is null or p_factor_id is null
     or not exists (select 1 from private.system_admin where user_id = (p_ctx).admin_user_id)
     or not exists (
       select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id)
       where active
     )
     or not exists (
       select 1
       from auth.mfa_factors
       where id = p_factor_id
         and user_id = (p_ctx).admin_user_id
         and status = 'verified'
     ) then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;

  return query
  insert into private.admin_step_up (user_id, session_id, factor_id, verified_at, expires_at)
  values ((p_ctx).admin_user_id, (p_ctx).session_id, p_factor_id, v_verified_at, v_verified_at + interval '5 minutes')
  returning id, private.admin_step_up.expires_at;
end;
$$;

alter function private.admin_step_up_issue(private.admin_context, uuid) owner to domain_owner;
revoke all on function private.admin_step_up_issue(private.admin_context, uuid)
  from public, anon, authenticated, account_executor, job_executor, recovery_executor;
grant execute on function private.admin_step_up_issue(private.admin_context, uuid)
  to admin_executor;
