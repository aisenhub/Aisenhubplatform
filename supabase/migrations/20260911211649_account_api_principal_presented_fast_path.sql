-- Reduce one redundant key lookup from authenticated Account API requests.
-- The presented key is still verified by the domain-owned helper before the
-- session and platform-account authorization checks run.

create or replace function private.account_principal_presented(
  p_user_id uuid,
  p_session_id uuid,
  p_platform_key_id uuid,
  p_key_hmac text,
  p_hmac_key_version integer
)
returns table (
  key_id uuid,
  platform_id uuid,
  platform_status text,
  ok boolean,
  reason text,
  user_id uuid,
  platform_account_id uuid,
  account_status text,
  authorization text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_key record;
  v_session record;
  v_account record;
begin
  if p_user_id is null or p_session_id is null
     or p_platform_key_id is null or p_key_hmac is null
     or p_hmac_key_version is null then
    return;
  end if;

  select verified.key_id, verified.platform_id, verified.platform_status
    into v_key
  from private.platform_key_verify_presented(
    p_platform_key_id, p_key_hmac, p_hmac_key_version
  ) verified;
  if not found then
    return;
  end if;

  select * into v_session
  from private.check_user_session(p_user_id, p_session_id);
  if not coalesce(v_session.active, false) then
    return query select v_key.key_id, v_key.platform_id, v_key.platform_status,
      false, v_session.reason, p_user_id, null::uuid, null::text, 'unauthorized'::text;
    return;
  end if;

  select a.id, a.status into v_account
  from public.platform_accounts a
  where a.platform_id = v_key.platform_id
    and a.user_id = p_user_id;

  if not found then
    return query select v_key.key_id, v_key.platform_id, v_key.platform_status,
      true, 'ok', p_user_id, null::uuid, null::text,
      case when v_key.platform_status = 'active' then 'not_activated' else 'platform_disabled' end;
    return;
  end if;

  return query select v_key.key_id, v_key.platform_id, v_key.platform_status,
    true, 'ok', p_user_id, v_account.id, v_account.status,
    case
      when v_key.platform_status <> 'active' then 'platform_disabled'
      when v_account.status = 'active' then 'allowed'
      when v_account.status = 'suspended' then 'suspended'
      else 'closed'
    end;
end;
$$;

alter function private.account_principal_presented(uuid, uuid, uuid, text, integer)
  owner to domain_owner;

revoke all on function private.account_principal_presented(uuid, uuid, uuid, text, integer)
  from public, anon, authenticated, admin_executor, job_executor, recovery_executor;

grant execute on function private.account_principal_presented(uuid, uuid, uuid, text, integer)
  to account_executor;
