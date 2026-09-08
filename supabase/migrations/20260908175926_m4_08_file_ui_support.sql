-- M4-08: read-only budget/policy wrappers for the file management surfaces.

create or replace function private.file_budget_read(
  p_ctx private.account_context
)
returns table (
  platform_id uuid,
  enabled boolean,
  max_file_bytes bigint,
  max_files integer,
  max_total_bytes bigint,
  reserved_bytes bigint,
  reserved_count integer,
  available_bytes bigint,
  available_count integer,
  over_quota boolean,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_principal record;
  v_policy public.platform_file_policies;
  v_reserved_bytes bigint;
  v_reserved_count integer;
begin
  if (p_ctx).request_id is null then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_principal from private.account_principal(p_ctx);
  if v_principal.authorization not in ('allowed', 'suspended') then
    raise exception using errcode = '42501', message = v_principal.authorization;
  end if;
  select * into v_policy from public.platform_file_policies p
  where p.platform_id = (p_ctx).platform_id;
  select coalesce(sum(f.reserved_bytes), 0)::bigint,
    coalesce(sum(f.reserved_count), 0)::integer
    into v_reserved_bytes, v_reserved_count
  from public.platform_config_files f
  where f.platform_id = (p_ctx).platform_id
    and f.platform_account_id = v_principal.platform_account_id;
  return query select
    (p_ctx).platform_id,
    coalesce(v_policy.enabled, true),
    coalesce(v_policy.max_file_bytes, 1048576::bigint),
    coalesce(v_policy.max_files, 10),
    coalesce(v_policy.max_total_bytes, 10485760::bigint),
    v_reserved_bytes,
    v_reserved_count,
    greatest(0::bigint, coalesce(v_policy.max_total_bytes, 10485760::bigint) - v_reserved_bytes),
    greatest(0, coalesce(v_policy.max_files, 10) - v_reserved_count),
    v_reserved_bytes > coalesce(v_policy.max_total_bytes, 10485760::bigint)
      or v_reserved_count > coalesce(v_policy.max_files, 10),
    v_policy.updated_at;
end;
$$;

create or replace function private.admin_file_policy_read(
  p_ctx private.admin_context,
  p_platform_id uuid
)
returns table (
  platform_id uuid,
  enabled boolean,
  max_file_bytes bigint,
  max_files integer,
  max_total_bytes bigint,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_policy public.platform_file_policies;
begin
  if (p_ctx).admin_user_id is null or (p_ctx).session_id is null
     or p_platform_id is null
     or not exists (select 1 from private.system_admin where user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active) then
    raise exception using errcode = case when p_platform_id is null then '22023' else '42501' end,
      message = case when p_platform_id is null then 'invalid_input' else 'admin_required' end;
  end if;
  if not exists (select 1 from public.platforms where id = p_platform_id) then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  select * into v_policy from public.platform_file_policies p where p.platform_id = p_platform_id;
  return query select p_platform_id, coalesce(v_policy.enabled, true),
    coalesce(v_policy.max_file_bytes, 1048576::bigint),
    coalesce(v_policy.max_files, 10),
    coalesce(v_policy.max_total_bytes, 10485760::bigint),
    v_policy.updated_at;
end;
$$;

alter function private.file_budget_read(private.account_context) owner to domain_owner;
alter function private.admin_file_policy_read(private.admin_context, uuid) owner to domain_owner;

revoke all on function private.file_budget_read(private.account_context),
  private.admin_file_policy_read(private.admin_context, uuid)
from public, anon, authenticated, admin_executor, job_executor, recovery_executor;
grant execute on function private.file_budget_read(private.account_context) to account_executor;
grant execute on function private.admin_file_policy_read(private.admin_context, uuid) to admin_executor;
