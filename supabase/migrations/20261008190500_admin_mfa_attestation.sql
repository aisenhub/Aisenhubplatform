-- Bind recent Admin MFA proof issuance to a short-lived server-signed
-- attestation created only after the Admin BFF completes Supabase MFA.

drop function if exists private.admin_step_up_issue(private.admin_context, uuid);

alter table private.admin_step_up
  add column if not exists attestation_nonce uuid;

create unique index if not exists admin_step_up_attestation_nonce_idx
  on private.admin_step_up (user_id, session_id, attestation_nonce)
  where attestation_nonce is not null;

create or replace function private.admin_step_up_issue(
  p_ctx private.admin_context,
  p_factor_id uuid,
  p_verified_at timestamptz,
  p_attestation_nonce uuid
)
returns table (proof_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  if (p_ctx).admin_user_id is null
     or (p_ctx).session_id is null
     or p_factor_id is null
     or p_verified_at is null
     or p_attestation_nonce is null
     or p_verified_at <= v_now - interval '90 seconds'
     or p_verified_at > v_now + interval '5 seconds'
     or not exists (
       select 1 from private.system_admin
       where user_id = (p_ctx).admin_user_id
     )
     or not exists (
       select 1 from private.check_user_session(
         (p_ctx).admin_user_id,
         (p_ctx).session_id
       ) where active
     ) then
    raise exception using errcode = '42501', message = 'recent_mfa_required';
  end if;

  return query
  insert into private.admin_step_up (
    user_id, session_id, factor_id, verified_at, expires_at, attestation_nonce
  ) values (
    (p_ctx).admin_user_id,
    (p_ctx).session_id,
    p_factor_id,
    p_verified_at,
    p_verified_at + interval '5 minutes',
    p_attestation_nonce
  )
  on conflict (user_id, session_id, attestation_nonce)
    where attestation_nonce is not null
    do nothing
  returning id, private.admin_step_up.expires_at;

  if not found then
    raise exception using errcode = '42501', message = 'recent_mfa_required';
  end if;
end;
$$;

alter function private.admin_step_up_issue(private.admin_context, uuid, timestamptz, uuid)
  owner to domain_owner;
revoke all on function private.admin_step_up_issue(private.admin_context, uuid, timestamptz, uuid)
  from public, anon, authenticated, account_executor, job_executor, recovery_executor;
grant execute on function private.admin_step_up_issue(private.admin_context, uuid, timestamptz, uuid)
  to admin_executor;
