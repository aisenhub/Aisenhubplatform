-- T14: account lifecycle and pending-admin identity deletion gates.
-- Recent proof rows are server-side evidence only; no client flag or JWT iat is accepted.

create table private.user_recent_auth_proofs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  factor_id text not null check (length(factor_id) between 1 and 128),
  verified_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (expires_at > verified_at),
  check (expires_at <= verified_at + interval '5 minutes')
);

alter table private.user_recent_auth_proofs enable row level security;
alter table private.user_recent_auth_proofs force row level security;
create policy user_recent_auth_proofs_domain_owner on private.user_recent_auth_proofs
  for all to domain_owner using (true) with check (true);
alter table private.user_recent_auth_proofs owner to domain_owner;
revoke all on table private.user_recent_auth_proofs from public, anon, authenticated,
  account_executor, admin_executor, job_executor, recovery_executor;
grant usage on schema private to domain_owner;

create or replace function private.account_activate(
  p_ctx private.account_context
)
returns table (platform_account_id uuid, account_status text)
language plpgsql
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_platform public.platforms;
  v_account public.platform_accounts;
  v_session record;
begin
  select * into v_session from private.check_user_session((p_ctx).user_id, (p_ctx).session_id);
  if not coalesce(v_session.active, false) then raise exception using errcode = '42501', message = 'unauthorized'; end if;
  if private.identity_is_blocked((p_ctx).user_id) then raise exception using errcode = '42501', message = 'global_delete_pending'; end if;

  select * into v_platform from public.platforms where id = (p_ctx).platform_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  if v_platform.status <> 'active' then raise exception using errcode = '42501', message = 'platform_disabled'; end if;
  if not v_platform.allow_activation then raise exception using errcode = 'P0001', message = 'activation_disabled'; end if;

  insert into public.platform_accounts (platform_id, user_id, status)
  values ((p_ctx).platform_id, (p_ctx).user_id, 'active')
  on conflict (platform_id, user_id) do nothing;
  select * into v_account from public.platform_accounts
  where platform_id = (p_ctx).platform_id and user_id = (p_ctx).user_id for update;
  if v_account.status <> 'active' then raise exception using errcode = 'P0001', message = 'account_not_activatable'; end if;

  insert into public.platform_profiles (platform_account_id) values (v_account.id) on conflict do nothing;
  insert into public.platform_preferences (platform_account_id) values (v_account.id) on conflict do nothing;
  perform private.audit_append((p_ctx).request_id, 'user', (p_ctx).user_id, (p_ctx).platform_id,
    v_account.id, 'account.activated', 'platform_account', v_account.id, null, null, '{}'::jsonb);
  return query select v_account.id, v_account.status;
end;
$$;

create or replace function private.account_close(
  p_ctx private.account_context,
  p_recent_proof_id uuid
)
returns table (platform_account_id uuid, account_status text)
language plpgsql
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_account public.platform_accounts;
  v_session record;
begin
  select * into v_session from private.check_user_session((p_ctx).user_id, (p_ctx).session_id);
  if not coalesce(v_session.active, false) then raise exception using errcode = '42501', message = 'unauthorized'; end if;
  select * into v_account from public.platform_accounts
  where platform_id = (p_ctx).platform_id and user_id = (p_ctx).user_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  if v_account.status = 'closed' then return query select v_account.id, v_account.status; return; end if;
  if p_recent_proof_id is null or not exists (
    select 1 from private.user_recent_auth_proofs proof
    where proof.id = p_recent_proof_id and proof.user_id = (p_ctx).user_id
      and proof.session_id = (p_ctx).session_id and proof.expires_at > now()
      and proof.verified_at <= now() and proof.expires_at <= proof.verified_at + interval '5 minutes'
  ) then raise exception using errcode = '42501', message = 'recent_mfa_required'; end if;
  update public.platform_accounts set status = 'closed', closed_at = coalesce(closed_at, now()) where id = v_account.id;
  perform private.audit_append((p_ctx).request_id, 'user', (p_ctx).user_id, (p_ctx).platform_id,
    v_account.id, 'account.closed', 'platform_account', v_account.id, null, null, '{}'::jsonb);
  return query select v_account.id, 'closed'::text;
end;
$$;

create or replace function private.identity_delete_request(
  p_ctx private.account_context,
  p_recent_proof_id uuid
)
returns table (request_id uuid, state text)
language plpgsql
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_existing private.deletion_requests;
  v_session record;
begin
  select * into v_session from private.check_user_session((p_ctx).user_id, (p_ctx).session_id);
  if not coalesce(v_session.active, false) then raise exception using errcode = '42501', message = 'unauthorized'; end if;
  if p_recent_proof_id is null or not exists (
    select 1 from private.user_recent_auth_proofs proof
    where proof.id = p_recent_proof_id and proof.user_id = (p_ctx).user_id
      and proof.session_id = (p_ctx).session_id and proof.expires_at > now()
      and proof.verified_at <= now() and proof.expires_at <= proof.verified_at + interval '5 minutes'
  ) then raise exception using errcode = '42501', message = 'recent_mfa_required'; end if;
  select * into v_existing from private.deletion_requests as dr where dr.user_id = (p_ctx).user_id and dr.state = 'pending_admin' for update;
  if found then return query select v_existing.id, v_existing.state; return; end if;
  insert into private.deletion_requests (user_id, request_session_id) values ((p_ctx).user_id, (p_ctx).session_id)
  returning private.deletion_requests.id, private.deletion_requests.state into request_id, state;
  perform private.audit_append((p_ctx).request_id, 'user', (p_ctx).user_id, null, null,
    'identity.delete_requested', 'deletion_request', request_id, null, null, '{}'::jsonb);
  return next;
end;
$$;

create or replace function private.admin_account_transition(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_account_id uuid,
  p_action text
)
returns table (platform_account_id uuid, account_status text)
language plpgsql
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_account public.platform_accounts;
begin
  if not exists (select 1 from private.system_admin where user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active)
  then raise exception using errcode = '42501', message = 'admin_required'; end if;
  select * into v_account from public.platform_accounts where id = p_account_id and platform_id = p_platform_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  if p_action = 'suspend' and v_account.status = 'active' then update public.platform_accounts set status = 'suspended', suspended_at = now() where id = v_account.id;
  elsif p_action = 'restore' and v_account.status = 'suspended' then update public.platform_accounts set status = 'active', suspended_at = null where id = v_account.id;
  elsif p_action = 'close' and v_account.status <> 'closed' then update public.platform_accounts set status = 'closed', closed_at = coalesce(closed_at, now()) where id = v_account.id;
  elsif p_action not in ('suspend', 'restore', 'close') then raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_account from public.platform_accounts where id = p_account_id;
  perform private.audit_append((p_ctx).request_id, 'admin', (p_ctx).admin_user_id, p_platform_id,
    v_account.id, 'account.' || p_action, 'platform_account', v_account.id, null, null, '{}'::jsonb);
  return query select v_account.id, v_account.status;
end;
$$;

alter function private.account_activate(private.account_context) owner to domain_owner;
alter function private.account_close(private.account_context, uuid) owner to domain_owner;
alter function private.identity_delete_request(private.account_context, uuid) owner to domain_owner;
alter function private.admin_account_transition(private.admin_context, uuid, uuid, text) owner to domain_owner;

create policy platform_profiles_domain_owner on public.platform_profiles
  for all to domain_owner using (true) with check (true);
create policy platform_preferences_domain_owner on public.platform_preferences
  for all to domain_owner using (true) with check (true);
grant select, insert, update on public.platform_accounts, public.platform_profiles, public.platform_preferences to domain_owner;
grant execute on function private.account_activate(private.account_context) to account_executor;
grant execute on function private.account_close(private.account_context, uuid) to account_executor;
grant execute on function private.identity_delete_request(private.account_context, uuid) to account_executor;
grant execute on function private.admin_account_transition(private.admin_context, uuid, uuid, text) to admin_executor;
