-- Admin global identity association lookup. Supabase Auth identities are read by the
-- server-side Account API through the Auth Admin API; this function only enriches
-- already-authorized Auth user ids with AisenHub lifecycle and platform-account data.
-- No project database role receives direct access to the protected auth schema.

create or replace function private.admin_identity_accounts(
  p_ctx private.admin_context,
  p_user_ids uuid[],
  p_platform_id uuid default null
)
returns table (
  user_id uuid,
  identity_state text,
  account_count bigint,
  accounts jsonb
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
begin
  if (p_ctx).admin_user_id is null
     or (p_ctx).session_id is null
     or p_user_ids is null
     or cardinality(p_user_ids) > 1000
     or not exists (
       select 1 from private.system_admin sa
       where sa.user_id = (p_ctx).admin_user_id
     )
     or not exists (
       select 1
       from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id)
       where active
     ) then
    raise exception using
      errcode = case
        when p_user_ids is null or cardinality(p_user_ids) > 1000
          then '22023'
        else '42501'
      end,
      message = case
        when p_user_ids is null or cardinality(p_user_ids) > 1000
          then 'invalid_input'
        else 'admin_required'
      end;
  end if;

  return query
  with candidates as (
    select candidate.user_id, candidate.ordinality
    from unnest(p_user_ids) with ordinality as candidate(user_id, ordinality)
  )
  select
    candidate.user_id,
    coalesce(lifecycle.state, 'active')::text,
    (
      select count(*)
      from public.platform_accounts account_count_source
      where account_count_source.user_id = candidate.user_id
    )::bigint,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'platform_id', account.platform_id,
            'platform_code', platform.code,
            'platform_name', platform.name,
            'platform_status', platform.status,
            'platform_account_id', account.id,
            'status', account.status,
            'activated_at', account.activated_at,
            'suspended_at', account.suspended_at,
            'closed_at', account.closed_at,
            'created_at', account.created_at,
            'updated_at', account.updated_at
          )
          order by account.created_at desc, account.id desc
        )
        from public.platform_accounts account
        join public.platforms platform on platform.id = account.platform_id
        where account.user_id = candidate.user_id
      ),
      '[]'::jsonb
    )
  from candidates candidate
  left join private.identity_lifecycle lifecycle on lifecycle.user_id = candidate.user_id
  where p_platform_id is null
     or exists (
       select 1
       from public.platform_accounts scoped_account
       where scoped_account.user_id = candidate.user_id
         and scoped_account.platform_id = p_platform_id
     )
  order by candidate.ordinality;
end;
$$;

alter function private.admin_identity_accounts(private.admin_context, uuid[], uuid)
  owner to domain_owner;

revoke all on function private.admin_identity_accounts(private.admin_context, uuid[], uuid)
  from public, anon, authenticated, account_executor, job_executor,
  recovery_executor, billing_ingress;
grant execute on function private.admin_identity_accounts(private.admin_context, uuid[], uuid)
  to admin_executor;
