-- Return the minimum authoritative security state before Admin's AAL2 gate.
create or replace function private.admin_security_status(
  p_ctx private.admin_context,
  p_current_aal text
)
returns table (
  current_aal text,
  recent_mfa_expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $$
begin
  if p_current_aal is null or p_current_aal not in ('aal1', 'aal2') then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  if not exists (
    select 1
    from private.system_admin admin
    where admin.user_id = (p_ctx).admin_user_id
  ) then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;

  if not exists (
    select 1
    from private.check_user_session(
      (p_ctx).admin_user_id,
      (p_ctx).session_id
    )
    where active
  ) then
    raise exception using errcode = '42501', message = 'session_not_active';
  end if;

  return query
    select p_current_aal, max(proof.expires_at)
    from private.admin_step_up proof
    where proof.user_id = (p_ctx).admin_user_id
      and proof.session_id = (p_ctx).session_id
      and proof.verified_at <= now()
      and proof.expires_at > now();
end;
$$;

alter function private.admin_security_status(private.admin_context, text)
  owner to domain_owner;
revoke all on function private.admin_security_status(private.admin_context, text)
  from public, anon, authenticated, account_executor, job_executor, recovery_executor;
grant execute on function private.admin_security_status(private.admin_context, text)
  to admin_executor;
