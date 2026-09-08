-- M5-03: persist the operator confirmation that a newly generated Platform Key
-- has been deployed before the previous key may be revoked.

alter table private.platform_api_keys
  add column deployment_confirmed_at timestamptz,
  add column deployment_confirmed_by uuid references auth.users(id) on delete set null;

create or replace function private.admin_platform_key_list_v2(
  p_ctx private.admin_context,
  p_platform_id uuid
)
returns table (
  key_id uuid,
  platform_id uuid,
  name text,
  hmac_key_version integer,
  key_prefix text,
  key_suffix text,
  status text,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid,
  revoked_by uuid,
  creation_operation_id uuid,
  created_at timestamptz,
  deployment_confirmed_at timestamptz,
  deployment_confirmed_by uuid
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
begin
  if not exists (select 1 from private.system_admin where user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active)
     or p_platform_id is null
  then raise exception using errcode = '42501', message = 'admin_required'; end if;
  return query
    select k.id, k.platform_id, k.name, k.hmac_key_version, k.key_prefix, k.key_suffix,
      k.status, k.expires_at, k.revoked_at, k.created_by, k.revoked_by,
      k.creation_operation_id, k.created_at, k.deployment_confirmed_at,
      k.deployment_confirmed_by
    from private.platform_api_keys k
    where k.platform_id = p_platform_id
    order by k.created_at desc, k.id desc;
end;
$$;

create or replace function private.admin_platform_key_confirm_deployment(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_key_id uuid
)
returns table (key_id uuid, status text, deployment_confirmed_at timestamptz)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
begin
  if not exists (select 1 from private.system_admin where user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active)
  then raise exception using errcode = '42501', message = 'admin_required'; end if;
  update private.platform_api_keys as k
  set deployment_confirmed_at = coalesce(k.deployment_confirmed_at, now()),
      deployment_confirmed_by = coalesce(k.deployment_confirmed_by, (p_ctx).admin_user_id)
  where k.id = p_key_id and k.platform_id = p_platform_id and k.status = 'active'
  returning k.id, k.status, k.deployment_confirmed_at
    into key_id, status, deployment_confirmed_at;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  perform private.audit_append((p_ctx).request_id, 'admin', (p_ctx).admin_user_id,
    p_platform_id, null, 'platform.key_deployment_confirmed', 'platform_api_key',
    p_key_id, null, null, '{}'::jsonb);
  return next;
end;
$$;

alter function private.admin_platform_key_list_v2(private.admin_context, uuid) owner to domain_owner;
alter function private.admin_platform_key_confirm_deployment(private.admin_context, uuid, uuid) owner to domain_owner;
grant update (deployment_confirmed_at, deployment_confirmed_by) on private.platform_api_keys to domain_owner;
revoke all on function private.admin_platform_key_list_v2(private.admin_context, uuid),
  private.admin_platform_key_confirm_deployment(private.admin_context, uuid, uuid)
  from public, anon, authenticated, account_executor, job_executor, recovery_executor;
grant execute on function private.admin_platform_key_list_v2(private.admin_context, uuid),
  private.admin_platform_key_confirm_deployment(private.admin_context, uuid, uuid)
  to admin_executor;
