-- T16-R1 follow-up: qualify user_id in the PL/pgSQL admin guard because the
-- return table exposes a variable with the same name.
create or replace function private.admin_account_list(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_limit integer default 20
)
returns table (
  platform_account_id uuid,
  user_id uuid,
  status text,
  activated_at timestamptz,
  suspended_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
begin
  if not exists (select 1 from private.system_admin s where s.user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active)
  then raise exception using errcode = '42501', message = 'admin_required'; end if;
  return query
    select a.id, a.user_id, a.status, a.activated_at, a.suspended_at,
      a.closed_at, a.created_at, a.updated_at
    from public.platform_accounts a
    where a.platform_id = p_platform_id
    order by a.created_at desc, a.id desc
    limit greatest(1, least(coalesce(p_limit, 20), 100));
end;
$$;

alter function private.admin_account_list(private.admin_context, uuid, integer) owner to domain_owner;
revoke all on function private.admin_account_list(private.admin_context, uuid, integer)
  from public, anon, authenticated, account_executor, job_executor, recovery_executor;
grant execute on function private.admin_account_list(private.admin_context, uuid, integer)
  to admin_executor;
