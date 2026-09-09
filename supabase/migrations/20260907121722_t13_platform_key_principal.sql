-- T13: verified Platform Key context, Principal resolution and Admin platform guards.
-- Callers provide only a versioned HMAC digest; raw keys never enter SQL or audit rows.

create or replace function private.platform_key_verify(
  p_key_hmac text,
  p_hmac_key_version integer
)
returns table (
  key_id uuid,
  platform_id uuid,
  platform_status text,
  reason text
)
language sql
stable
security definer
set search_path = pg_catalog, private, public
as $$
  select k.id, k.platform_id, p.status, 'active'::text
  from private.platform_api_keys k
  join public.platforms p on p.id = k.platform_id
  where k.key_hmac = lower(p_key_hmac)
    and k.hmac_key_version = p_hmac_key_version
    and k.status = 'active'
    and (k.expires_at is null or k.expires_at > now())
$$;

create or replace function private.account_principal(
  p_ctx private.account_context
)
returns table (
  ok boolean,
  reason text,
  user_id uuid,
  platform_id uuid,
  platform_status text,
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
  v_session record;
  v_platform record;
  v_account record;
begin
  if (p_ctx).user_id is null or (p_ctx).session_id is null
     or (p_ctx).platform_id is null or (p_ctx).platform_key_id is null then
    return query select false, 'invalid_input', null::uuid, null::uuid, null::text,
      null::uuid, null::text, 'unauthorized';
    return;
  end if;

  select * into v_session
  from private.check_user_session((p_ctx).user_id, (p_ctx).session_id);
  if not coalesce(v_session.active, false) then
    return query select false, v_session.reason, (p_ctx).user_id, (p_ctx).platform_id,
      null::text, null::uuid, null::text, 'unauthorized';
    return;
  end if;

  select p.id, p.status into v_platform
  from public.platforms p
  where p.id = (p_ctx).platform_id
    and exists (
      select 1 from private.platform_api_keys k
      where k.id = (p_ctx).platform_key_id
        and k.platform_id = p.id
        and k.status = 'active'
        and (k.expires_at is null or k.expires_at > now())
    );
  if not found then
    return query select false, 'platform_key_invalid', (p_ctx).user_id, (p_ctx).platform_id,
      null::text, null::uuid, null::text, 'unauthorized';
    return;
  end if;

  select a.id, a.status into v_account
  from public.platform_accounts a
  where a.platform_id = (p_ctx).platform_id
    and a.user_id = (p_ctx).user_id;

  if not found then
    return query select true, 'ok', (p_ctx).user_id, (p_ctx).platform_id, v_platform.status,
      null::uuid, 'not_activated', case when v_platform.status = 'active' then 'not_activated' else 'platform_disabled' end;
    return;
  end if;

  return query select true, 'ok', (p_ctx).user_id, (p_ctx).platform_id, v_platform.status,
    v_account.id, v_account.status,
    case
      when v_platform.status <> 'active' then 'platform_disabled'
      when v_account.status = 'active' then 'allowed'
      when v_account.status = 'suspended' then 'suspended'
      else 'closed'
    end;
end;
$$;

create or replace function private.admin_platform_update(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_status text,
  p_allow_activation boolean
)
returns table (platform_id uuid, status text, allow_activation boolean)
language plpgsql
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_platform public.platforms;
begin
  if (p_ctx).admin_user_id is null or (p_ctx).session_id is null
     or p_platform_id is null or p_status not in ('active', 'disabled') then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if not exists (select 1 from private.system_admin where user_id = (p_ctx).admin_user_id)
     or not exists (
       select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id)
       where active
     ) then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;

  select * into v_platform from public.platforms where id = p_platform_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  update public.platforms
  set status = p_status, allow_activation = p_allow_activation
  where id = p_platform_id
  returning public.platforms.id, public.platforms.status, public.platforms.allow_activation
    into platform_id, status, allow_activation;
  perform private.audit_append((p_ctx).request_id, 'admin', (p_ctx).admin_user_id,
    p_platform_id, null, 'platform.updated', 'platform', p_platform_id, null, null,
    jsonb_build_object('status', p_status, 'allow_activation', p_allow_activation));
  return next;
end;
$$;

create or replace function private.admin_platform_key_revoke(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_key_id uuid
)
returns table (key_id uuid, status text, revoked_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, private, public
as $$
begin
  if not exists (select 1 from private.system_admin where user_id = (p_ctx).admin_user_id)
     or not exists (
       select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id)
       where active
     ) then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
  update private.platform_api_keys as k
  set status = 'revoked', revoked_at = coalesce(k.revoked_at, now()), revoked_by = (p_ctx).admin_user_id
  where k.id = p_key_id and k.platform_id = p_platform_id and k.status = 'active'
  returning k.id, k.status, k.revoked_at into key_id, status, revoked_at;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  perform private.audit_append((p_ctx).request_id, 'admin', (p_ctx).admin_user_id,
    p_platform_id, null, 'platform.key_revoked', 'platform_api_key', p_key_id, null, null, '{}'::jsonb);
  return next;
end;
$$;

create policy platforms_domain_owner on public.platforms
  for all to domain_owner using (true) with check (true);
create policy platform_accounts_domain_owner on public.platform_accounts
  for all to domain_owner using (true) with check (true);
grant select on public.platforms, public.platform_accounts to domain_owner;
grant update (status, allow_activation, updated_at) on public.platforms to domain_owner;
grant select on private.platform_api_keys to domain_owner;

alter function private.platform_key_verify(text, integer) owner to domain_owner;
alter function private.account_principal(private.account_context) owner to domain_owner;
alter function private.admin_platform_update(private.admin_context, uuid, text, boolean) owner to domain_owner;
alter function private.admin_platform_key_revoke(private.admin_context, uuid, uuid) owner to domain_owner;

revoke all on function private.platform_key_verify(text, integer) from public, anon, authenticated,
  account_executor, admin_executor, job_executor, recovery_executor;
revoke all on function private.account_principal(private.account_context) from public, anon, authenticated,
  account_executor, admin_executor, job_executor, recovery_executor;
revoke all on function private.admin_platform_update(private.admin_context, uuid, text, boolean) from public, anon, authenticated,
  account_executor, admin_executor, job_executor, recovery_executor;
revoke all on function private.admin_platform_key_revoke(private.admin_context, uuid, uuid) from public, anon, authenticated,
  account_executor, admin_executor, job_executor, recovery_executor;
grant execute on function private.platform_key_verify(text, integer) to account_executor, admin_executor;
grant execute on function private.account_principal(private.account_context) to account_executor;
grant execute on function private.admin_platform_update(private.admin_context, uuid, text, boolean) to admin_executor;
grant execute on function private.admin_platform_key_revoke(private.admin_context, uuid, uuid) to admin_executor;
