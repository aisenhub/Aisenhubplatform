-- M3: admin-owned Plan lifecycle and platform default-plan management.

create or replace function private.admin_plan_upsert(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_plan_id uuid,
  p_code text,
  p_name text,
  p_description text,
  p_kind text,
  p_features jsonb,
  p_status text,
  p_make_default boolean,
  p_clear_default boolean
)
returns table (plan_id uuid, code text, kind text, status text, is_default boolean)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_plan public.plans;
  v_platform public.platforms;
  v_existing_default boolean := false;
  v_is_update boolean := false;
begin
  if (p_ctx).admin_user_id is null or (p_ctx).session_id is null or (p_ctx).request_id is null
     or p_platform_id is null or p_code is null or length(p_code) not between 1 and 64
     or p_code !~ '^[a-z0-9][a-z0-9._-]*$'
     or p_name is null or length(p_name) not between 1 and 256
     or p_description is not null and length(p_description) > 4096
     or p_kind not in ('free', 'paid')
     or p_features is null or jsonb_typeof(p_features) <> 'object'
     or p_status not in ('active', 'archived')
     or (p_make_default and p_clear_default) then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if not exists (select 1 from private.system_admin where user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active) then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;

  select * into v_platform from public.platforms where id = p_platform_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  v_existing_default := v_platform.default_plan_id = p_plan_id;

  if p_plan_id is null then
    if p_status <> 'active' then
      raise exception using errcode = 'P0001', message = 'plan_must_start_active';
    end if;
    insert into public.plans (platform_id, code, name, description, kind, features, status)
      values (p_platform_id, p_code, p_name, p_description, p_kind, p_features, p_status)
      returning * into v_plan;
    v_is_update := false;
  else
    select * into v_plan from public.plans where platform_id = p_platform_id and id = p_plan_id for update;
    if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
    if v_existing_default and p_kind <> 'free' then
      raise exception using errcode = 'P0001', message = 'default_plan_must_be_free';
    end if;
    update public.plans p
       set code = p_code,
           name = p_name,
           description = p_description,
           kind = p_kind,
           features = p_features,
           status = p_status
     where p.id = p_plan_id and p.platform_id = p_platform_id
     returning * into v_plan;
    v_is_update := true;
  end if;

  if p_make_default then
    if v_plan.kind <> 'free' or v_plan.status <> 'active' then
      raise exception using errcode = 'P0001', message = 'default_plan_must_be_active_free';
    end if;
    update public.platforms
       set default_plan_id = v_plan.id,
           default_plan_kind = 'free'
     where id = p_platform_id;
  elsif p_clear_default then
    if not v_existing_default then
      raise exception using errcode = 'P0001', message = 'plan_is_not_default';
    end if;
    update public.platforms
       set default_plan_id = null,
           default_plan_kind = 'free'
     where id = p_platform_id;
  elsif v_existing_default and v_plan.status = 'archived' then
    raise exception using errcode = 'P0001', message = 'default_plan_required';
  end if;

  perform private.audit_append(
    (p_ctx).request_id, 'admin', (p_ctx).admin_user_id, p_platform_id, null,
    case when v_is_update then 'plan.updated' else 'plan.created' end,
    'plan', v_plan.id, null, null,
    jsonb_build_object('code', v_plan.code, 'kind', v_plan.kind, 'status', v_plan.status,
      'is_default', coalesce(v_plan.id = (select default_plan_id from public.platforms where id = p_platform_id), false))
  );

  return query
    select v_plan.id, v_plan.code, v_plan.kind, v_plan.status,
      coalesce(v_plan.id = (select default_plan_id from public.platforms where id = p_platform_id), false);
end;
$$;

alter function private.admin_plan_upsert(private.admin_context, uuid, uuid, text, text, text, text, jsonb, text, boolean, boolean)
  owner to domain_owner;

revoke all on function private.admin_plan_upsert(private.admin_context, uuid, uuid, text, text, text, text, jsonb, text, boolean, boolean)
  from public, anon, authenticated, account_executor, job_executor, recovery_executor;
grant execute on function private.admin_plan_upsert(private.admin_context, uuid, uuid, text, text, text, text, jsonb, text, boolean, boolean)
  to admin_executor;

grant insert, update on public.plans to domain_owner;
grant update (default_plan_id, default_plan_kind) on public.platforms to domain_owner;
