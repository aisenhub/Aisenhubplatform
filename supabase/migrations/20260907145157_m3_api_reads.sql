-- M3-03: privileged read wrappers and presented-key verification for the
-- central Account/Admin HTTP adapter. Executor roles do not receive table DML.

create or replace function private.platform_key_verify_presented(
  p_key_id uuid,
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
  where k.id = p_key_id
    and k.key_hmac = lower(p_key_hmac)
    and k.hmac_key_version = p_hmac_key_version
    and k.status = 'active'
    and (k.expires_at is null or k.expires_at > now())
$$;

create or replace function private.admin_plan_list(
  p_ctx private.admin_context,
  p_platform_id uuid
)
returns table (
  plan_id uuid,
  code text,
  name text,
  description text,
  kind text,
  features jsonb,
  status text,
  is_default boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
begin
  if (p_ctx).admin_user_id is null or (p_ctx).session_id is null
     or not exists (select 1 from private.system_admin where user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active) then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
  if not exists (select 1 from public.platforms where id = p_platform_id) then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  return query
    select p.id, p.code, p.name, p.description, p.kind, p.features, p.status,
      p.id = platform.default_plan_id, p.created_at, p.updated_at
    from public.plans p
    join public.platforms platform on platform.id = p.platform_id
    where p.platform_id = p_platform_id
    order by p.kind, p.code;
end;
$$;

create or replace function private.admin_batch_list(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_limit integer default 20
)
returns table (
  batch_id uuid,
  plan_id uuid,
  plan_code text,
  name text,
  quantity integer,
  status text,
  expires_at timestamptz,
  delivery_deadline timestamptz,
  delivered_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
begin
  if (p_ctx).admin_user_id is null or (p_ctx).session_id is null
     or p_limit is null or p_limit not between 1 and 100
     or not exists (select 1 from private.system_admin where user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active) then
    raise exception using errcode = case when p_limit is null or p_limit not between 1 and 100 then '22023' else '42501' end,
      message = case when p_limit is null or p_limit not between 1 and 100 then 'invalid_input' else 'admin_required' end;
  end if;
  if not exists (select 1 from public.platforms where id = p_platform_id) then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  return query
    select b.id, b.plan_id, p.code, b.name, b.quantity, b.status,
      b.expires_at, b.delivery_deadline, b.delivered_at, b.created_at
    from public.redemption_code_batches b
    join public.plans p on p.platform_id = b.platform_id and p.id = b.plan_id
    where b.platform_id = p_platform_id
    order by b.created_at desc, b.id desc
    limit p_limit;
end;
$$;

create or replace function private.admin_subscription_read(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_platform_account_id uuid
)
returns table (
  platform_account_id uuid,
  subscription_id uuid,
  status text,
  plan_id uuid,
  plan_code text,
  plan_name text,
  features jsonb,
  started_at timestamptz,
  current_period_end timestamptz,
  next_transition_at timestamptz,
  last_event_sequence bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
begin
  if (p_ctx).admin_user_id is null or (p_ctx).session_id is null
     or not exists (select 1 from private.system_admin where user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active) then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
  return query
    select s.platform_account_id, s.id, s.status, s.plan_id, p.code, p.name, p.features,
      s.started_at, s.current_period_end, s.next_transition_at, s.last_event_sequence
    from public.subscriptions s
    left join public.plans p on p.platform_id = s.platform_id and p.id = s.plan_id
    where s.platform_id = p_platform_id and s.platform_account_id = p_platform_account_id;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
end;
$$;

create or replace function private.admin_step_up_valid(
  p_user_id uuid,
  p_session_id uuid,
  p_proof_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private
as $$
  select exists (
    select 1
    from private.admin_step_up proof
    where proof.id = p_proof_id
      and proof.user_id = p_user_id
      and proof.session_id = p_session_id
      and proof.expires_at > now()
      and proof.verified_at <= now()
      and proof.expires_at <= proof.verified_at + interval '5 minutes'
  )
$$;

alter function private.platform_key_verify_presented(uuid, text, integer) owner to domain_owner;
alter function private.admin_plan_list(private.admin_context, uuid) owner to domain_owner;
alter function private.admin_batch_list(private.admin_context, uuid, integer) owner to domain_owner;
alter function private.admin_subscription_read(private.admin_context, uuid, uuid) owner to domain_owner;
alter function private.admin_step_up_valid(uuid, uuid, uuid) owner to domain_owner;

revoke all on function private.platform_key_verify_presented(uuid, text, integer)
  from public, anon, authenticated, job_executor, recovery_executor;
revoke all on function private.admin_plan_list(private.admin_context, uuid)
  from public, anon, authenticated, account_executor, job_executor, recovery_executor;
revoke all on function private.admin_batch_list(private.admin_context, uuid, integer)
  from public, anon, authenticated, account_executor, job_executor, recovery_executor;
revoke all on function private.admin_subscription_read(private.admin_context, uuid, uuid)
  from public, anon, authenticated, account_executor, job_executor, recovery_executor;
revoke all on function private.admin_step_up_valid(uuid, uuid, uuid)
  from public, anon, authenticated, account_executor, job_executor, recovery_executor;

grant execute on function private.platform_key_verify_presented(uuid, text, integer)
  to account_executor, admin_executor;
grant execute on function private.admin_plan_list(private.admin_context, uuid)
  to admin_executor;
grant execute on function private.admin_batch_list(private.admin_context, uuid, integer)
  to admin_executor;
grant execute on function private.admin_subscription_read(private.admin_context, uuid, uuid)
  to admin_executor;
grant execute on function private.admin_step_up_valid(uuid, uuid, uuid)
  to admin_executor;
