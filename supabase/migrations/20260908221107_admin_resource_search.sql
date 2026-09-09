-- M5-03: keep resource filtering inside the authorized Admin SQL boundary.
-- Existing list wrapper signatures remain unchanged for older consumers.

create or replace function private.admin_platform_list_v2(
  p_ctx private.admin_context,
  p_query text default null,
  p_limit integer default 20
)
returns table (
  platform_id uuid,
  code text,
  name text,
  status text,
  allow_activation boolean,
  default_locale text,
  default_plan_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_query text;
begin
  if p_limit is null or p_limit not between 1 and 100
     or (p_query is not null and length(btrim(p_query)) > 128)
     or not exists (select 1 from private.system_admin sa where sa.user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active)
  then raise exception using errcode = case when p_limit is null or p_limit not between 1 and 100 or (p_query is not null and length(btrim(p_query)) > 128) then '22023' else '42501' end,
    message = case when p_limit is null or p_limit not between 1 and 100 or (p_query is not null and length(btrim(p_query)) > 128) then 'invalid_input' else 'admin_required' end; end if;
  v_query := nullif(btrim(p_query), '');
  return query
    select p.id, p.code, p.name, p.status, p.allow_activation,
      p.default_locale, p.default_plan_id, p.created_at, p.updated_at
    from public.platforms p
    where v_query is null or p.id::text ilike '%' || v_query || '%'
      or p.code ilike '%' || v_query || '%'
      or p.name ilike '%' || v_query || '%'
      or p.status ilike '%' || v_query || '%'
    order by p.created_at desc, p.id desc
    limit greatest(1, least(coalesce(p_limit, 20), 100));
end;
$$;

create or replace function private.admin_origin_list_v2(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_query text default null
)
returns table (
  origin_id uuid,
  platform_id uuid,
  environment text,
  origin text,
  oauth_callback_url text,
  password_reset_url text,
  email_confirmation_url text,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_query text;
begin
  if p_platform_id is null or (p_query is not null and length(btrim(p_query)) > 128)
     or not exists (select 1 from private.system_admin sa where sa.user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active)
  then raise exception using errcode = case when p_platform_id is null or (p_query is not null and length(btrim(p_query)) > 128) then '22023' else '42501' end,
    message = case when p_platform_id is null or (p_query is not null and length(btrim(p_query)) > 128) then 'invalid_input' else 'admin_required' end; end if;
  v_query := nullif(btrim(p_query), '');
  return query
    select o.id, o.platform_id, o.environment, o.origin, o.oauth_callback_url,
      o.password_reset_url, o.email_confirmation_url, o.status, o.created_at, o.updated_at
    from public.platform_auth_origins o
    where o.platform_id = p_platform_id
      and (v_query is null or o.id::text ilike '%' || v_query || '%'
        or o.environment ilike '%' || v_query || '%'
        or o.origin ilike '%' || v_query || '%'
        or o.status ilike '%' || v_query || '%')
    order by o.environment, o.origin;
end;
$$;

create or replace function private.admin_account_list_v2(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_query text default null,
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
declare
  v_query text;
begin
  if p_platform_id is null or p_limit is null or p_limit not between 1 and 100
     or (p_query is not null and length(btrim(p_query)) > 128)
     or not exists (select 1 from private.system_admin sa where sa.user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active)
  then raise exception using errcode = case when p_platform_id is null or p_limit is null or p_limit not between 1 and 100 or (p_query is not null and length(btrim(p_query)) > 128) then '22023' else '42501' end,
    message = case when p_platform_id is null or p_limit is null or p_limit not between 1 and 100 or (p_query is not null and length(btrim(p_query)) > 128) then 'invalid_input' else 'admin_required' end; end if;
  v_query := nullif(btrim(p_query), '');
  return query
    select a.id, a.user_id, a.status, a.activated_at, a.suspended_at,
      a.closed_at, a.created_at, a.updated_at
    from public.platform_accounts a
    where a.platform_id = p_platform_id
      and (v_query is null or a.id::text ilike '%' || v_query || '%'
        or a.user_id::text ilike '%' || v_query || '%'
        or a.status ilike '%' || v_query || '%')
    order by a.created_at desc, a.id desc
    limit greatest(1, least(coalesce(p_limit, 20), 100));
end;
$$;

create or replace function private.admin_platform_key_list_v3(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_query text default null
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
declare
  v_query text;
begin
  if p_platform_id is null or (p_query is not null and length(btrim(p_query)) > 128)
     or not exists (select 1 from private.system_admin sa where sa.user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active)
  then raise exception using errcode = case when p_platform_id is null or (p_query is not null and length(btrim(p_query)) > 128) then '22023' else '42501' end,
    message = case when p_platform_id is null or (p_query is not null and length(btrim(p_query)) > 128) then 'invalid_input' else 'admin_required' end; end if;
  v_query := nullif(btrim(p_query), '');
  return query
    select k.id, k.platform_id, k.name, k.hmac_key_version, k.key_prefix, k.key_suffix,
      k.status, k.expires_at, k.revoked_at, k.created_by, k.revoked_by,
      k.creation_operation_id, k.created_at, k.deployment_confirmed_at,
      k.deployment_confirmed_by
    from private.platform_api_keys k
    where k.platform_id = p_platform_id
      and (v_query is null or k.id::text ilike '%' || v_query || '%'
        or k.name ilike '%' || v_query || '%'
        or k.status ilike '%' || v_query || '%'
        or k.key_prefix ilike '%' || v_query || '%'
        or k.key_suffix ilike '%' || v_query || '%')
    order by k.created_at desc, k.id desc;
end;
$$;

create or replace function private.admin_file_list_v2(
  p_ctx private.admin_context,
  p_cursor_file_id uuid default null,
  p_limit integer default 20,
  p_query text default null
)
returns table (
  file_id uuid,
  platform_id uuid,
  platform_account_id uuid,
  status text,
  write_outcome text,
  reserved_bytes bigint,
  reserved_count integer,
  actual_size_bytes bigint,
  original_name text,
  mime_type text,
  created_at timestamptz,
  updated_at timestamptz,
  cancel_requested_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_cursor_created_at timestamptz;
  v_query text;
begin
  if (p_ctx).admin_user_id is null or (p_ctx).session_id is null
     or p_limit is null or p_limit not between 1 and 100
     or (p_query is not null and length(btrim(p_query)) > 128)
     or not exists (select 1 from private.system_admin sa where sa.user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active) then
    raise exception using errcode = case when p_limit is null or p_limit not between 1 and 100 or (p_query is not null and length(btrim(p_query)) > 128) then '22023' else '42501' end,
      message = case when p_limit is null or p_limit not between 1 and 100 or (p_query is not null and length(btrim(p_query)) > 128) then 'invalid_input' else 'admin_required' end;
  end if;
  if p_cursor_file_id is not null then
    select f.created_at into v_cursor_created_at from public.platform_config_files f where f.id = p_cursor_file_id;
    if v_cursor_created_at is null then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  end if;
  v_query := nullif(btrim(p_query), '');
  return query
    select f.id, f.platform_id, f.platform_account_id, f.status, f.write_outcome,
      f.reserved_bytes, f.reserved_count, f.actual_size_bytes, f.original_name,
      f.mime_type, f.created_at, f.updated_at, f.cancel_requested_at
    from public.platform_config_files f
    where f.status <> 'deleted'
      and (p_cursor_file_id is null or (f.created_at, f.id) < (v_cursor_created_at, p_cursor_file_id))
      and (v_query is null or f.id::text ilike '%' || v_query || '%'
        or coalesce(f.original_name, '') ilike '%' || v_query || '%'
        or f.status ilike '%' || v_query || '%'
        or f.write_outcome ilike '%' || v_query || '%'
        or f.mime_type ilike '%' || v_query || '%')
    order by f.created_at desc, f.id desc
    limit p_limit;
end;
$$;

alter function private.admin_platform_list_v2(private.admin_context, text, integer) owner to domain_owner;
alter function private.admin_origin_list_v2(private.admin_context, uuid, text) owner to domain_owner;
alter function private.admin_account_list_v2(private.admin_context, uuid, text, integer) owner to domain_owner;
alter function private.admin_platform_key_list_v3(private.admin_context, uuid, text) owner to domain_owner;
alter function private.admin_file_list_v2(private.admin_context, uuid, integer, text) owner to domain_owner;

revoke all on function private.admin_platform_list_v2(private.admin_context, text, integer),
  private.admin_origin_list_v2(private.admin_context, uuid, text),
  private.admin_account_list_v2(private.admin_context, uuid, text, integer),
  private.admin_platform_key_list_v3(private.admin_context, uuid, text),
  private.admin_file_list_v2(private.admin_context, uuid, integer, text)
  from public, anon, authenticated, account_executor, job_executor, recovery_executor;
grant execute on function private.admin_platform_list_v2(private.admin_context, text, integer),
  private.admin_origin_list_v2(private.admin_context, uuid, text),
  private.admin_account_list_v2(private.admin_context, uuid, text, integer),
  private.admin_platform_key_list_v3(private.admin_context, uuid, text),
  private.admin_file_list_v2(private.admin_context, uuid, integer, text)
  to admin_executor;
