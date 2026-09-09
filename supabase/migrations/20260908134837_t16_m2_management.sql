-- T16-R1: complete the M2 account and minimum platform-management vertical.
-- HTTP roles call these narrow wrappers; they never receive base-table DML.

grant select, insert, update on public.platforms, public.platform_auth_origins to domain_owner;
grant insert on private.platform_api_keys to domain_owner;

create or replace function private.admin_platform_list(
  p_ctx private.admin_context,
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
begin
  if not exists (select 1 from private.system_admin where user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active)
  then raise exception using errcode = '42501', message = 'admin_required'; end if;
  return query
    select p.id, p.code, p.name, p.status, p.allow_activation,
      p.default_locale, p.default_plan_id, p.created_at, p.updated_at
    from public.platforms p
    order by p.created_at desc, p.id desc
    limit greatest(1, least(coalesce(p_limit, 20), 100));
end;
$$;

create or replace function private.admin_platform_get(
  p_ctx private.admin_context,
  p_platform_id uuid
)
returns table (
  platform_id uuid,
  code text,
  name text,
  status text,
  allow_activation boolean,
  default_locale text,
  default_plan_id uuid,
  config jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
begin
  if not exists (select 1 from private.system_admin where user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active)
  then raise exception using errcode = '42501', message = 'admin_required'; end if;
  return query
    select p.id, p.code, p.name, p.status, p.allow_activation,
      p.default_locale, p.default_plan_id, p.config, p.created_at, p.updated_at
    from public.platforms p where p.id = p_platform_id;
end;
$$;

create or replace function private.admin_platform_create(
  p_ctx private.admin_context,
  p_code text,
  p_name text,
  p_status text,
  p_allow_activation boolean,
  p_default_locale text,
  p_config jsonb
)
returns table (
  platform_id uuid,
  code text,
  name text,
  status text,
  allow_activation boolean,
  default_locale text,
  default_plan_id uuid,
  config jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_platform public.platforms;
begin
  if not exists (select 1 from private.system_admin where user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active)
     or p_code is null or length(btrim(p_code)) not between 1 and 128
     or p_name is null or length(btrim(p_name)) not between 1 and 255
     or p_status not in ('active', 'disabled')
     or p_config is null or jsonb_typeof(p_config) <> 'object'
  then raise exception using errcode = '22023', message = 'invalid_input'; end if;
  insert into public.platforms (code, name, status, allow_activation, default_locale, config)
  values (btrim(p_code), btrim(p_name), p_status, coalesce(p_allow_activation, true), p_default_locale, p_config)
  returning * into v_platform;
  perform private.audit_append((p_ctx).request_id, 'admin', (p_ctx).admin_user_id,
    v_platform.id, null, 'platform.created', 'platform', v_platform.id, null, null, '{}'::jsonb);
  return query select v_platform.id, v_platform.code, v_platform.name, v_platform.status,
    v_platform.allow_activation, v_platform.default_locale, v_platform.default_plan_id,
    v_platform.config, v_platform.created_at, v_platform.updated_at;
end;
$$;

create or replace function private.admin_origin_list(
  p_ctx private.admin_context,
  p_platform_id uuid
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
begin
  if not exists (select 1 from private.system_admin where user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active)
  then raise exception using errcode = '42501', message = 'admin_required'; end if;
  return query
    select o.id, o.platform_id, o.environment, o.origin, o.oauth_callback_url,
      o.password_reset_url, o.email_confirmation_url, o.status, o.created_at, o.updated_at
    from public.platform_auth_origins o
    where o.platform_id = p_platform_id
    order by o.environment, o.origin;
end;
$$;

create or replace function private.admin_origin_create(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_environment text,
  p_origin text,
  p_oauth_callback_url text,
  p_password_reset_url text,
  p_email_confirmation_url text
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
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_origin public.platform_auth_origins;
begin
  if not exists (select 1 from private.system_admin where user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active)
     or not exists (select 1 from public.platforms where id = p_platform_id)
     or p_environment not in ('local', 'preview', 'staging', 'production')
     or p_origin is null or length(btrim(p_origin)) not between 1 and 512
     or p_origin ~ '[[:space:]]'
     or p_oauth_callback_url is null or length(btrim(p_oauth_callback_url)) not between 1 and 1024
     or p_password_reset_url is null or length(btrim(p_password_reset_url)) not between 1 and 1024
     or p_email_confirmation_url is null or length(btrim(p_email_confirmation_url)) not between 1 and 1024
  then raise exception using errcode = '22023', message = 'invalid_input'; end if;
  insert into public.platform_auth_origins (
    platform_id, environment, origin, oauth_callback_url,
    password_reset_url, email_confirmation_url
  ) values (
    p_platform_id, p_environment, btrim(p_origin), btrim(p_oauth_callback_url),
    btrim(p_password_reset_url), btrim(p_email_confirmation_url)
  ) returning * into v_origin;
  perform private.audit_append((p_ctx).request_id, 'admin', (p_ctx).admin_user_id,
    p_platform_id, null, 'platform.origin_created', 'platform_auth_origin', v_origin.id, null, null, '{}'::jsonb);
  return query select v_origin.id, v_origin.platform_id, v_origin.environment, v_origin.origin,
    v_origin.oauth_callback_url, v_origin.password_reset_url, v_origin.email_confirmation_url,
    v_origin.status, v_origin.created_at, v_origin.updated_at;
end;
$$;

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
  if not exists (select 1 from private.system_admin where user_id = (p_ctx).admin_user_id)
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

create or replace function private.admin_account_get(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_account_id uuid
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
  if not exists (select 1 from private.system_admin where user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active)
  then raise exception using errcode = '42501', message = 'admin_required'; end if;
  return query
    select a.id, a.user_id, a.status, a.activated_at, a.suspended_at,
      a.closed_at, a.created_at, a.updated_at
    from public.platform_accounts a
    where a.platform_id = p_platform_id and a.id = p_account_id;
end;
$$;

create or replace function private.admin_account_patch(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_account_id uuid,
  p_status text
)
returns table (platform_account_id uuid, user_id uuid, status text)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
begin
  if not exists (select 1 from private.system_admin where user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active)
     or p_status not in ('active', 'suspended', 'closed')
  then raise exception using errcode = '22023', message = 'invalid_input'; end if;
  update public.platform_accounts
  set status = p_status,
      suspended_at = case when p_status = 'suspended' then coalesce(suspended_at, now()) else null end,
      closed_at = case when p_status = 'closed' then coalesce(closed_at, now()) else closed_at end
  where id = p_account_id and platform_id = p_platform_id;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  perform private.audit_append((p_ctx).request_id, 'admin', (p_ctx).admin_user_id,
    p_platform_id, p_account_id, 'account.patched', 'platform_account', p_account_id, null, null, '{}'::jsonb);
  return query select a.id, a.user_id, a.status from public.platform_accounts a where a.id = p_account_id;
end;
$$;

create or replace function private.admin_platform_key_list(
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
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
begin
  if not exists (select 1 from private.system_admin where user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active)
  then raise exception using errcode = '42501', message = 'admin_required'; end if;
  return query
    select k.id, k.platform_id, k.name, k.hmac_key_version, k.key_prefix, k.key_suffix,
      k.status, k.expires_at, k.revoked_at, k.created_by, k.revoked_by,
      k.creation_operation_id, k.created_at
    from private.platform_api_keys k
    where k.platform_id = p_platform_id
    order by k.created_at desc, k.id desc;
end;
$$;

create or replace function private.admin_platform_key_create(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_key_id uuid,
  p_name text,
  p_key_hmac text,
  p_hmac_key_version integer,
  p_key_prefix text,
  p_key_suffix text,
  p_creation_operation_id uuid,
  p_expires_at timestamptz
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
  creation_operation_id uuid,
  created_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_key private.platform_api_keys;
begin
  if not exists (select 1 from private.system_admin where user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active)
     or not exists (select 1 from public.platforms where id = p_platform_id)
     or p_key_id is null or p_name is null or length(btrim(p_name)) not between 1 and 128
     or p_key_hmac is null or p_key_hmac !~ '^[0-9a-f]{64}$'
     or p_hmac_key_version is null or p_hmac_key_version < 1
     or p_key_prefix is null or p_key_suffix is null
     or p_creation_operation_id is null
  then raise exception using errcode = '22023', message = 'invalid_input'; end if;
  insert into private.platform_api_keys (
    id, platform_id, name, key_hmac, hmac_key_version, key_prefix, key_suffix,
    created_by, creation_operation_id, expires_at
  ) values (
    p_key_id, p_platform_id, btrim(p_name), lower(p_key_hmac), p_hmac_key_version,
    p_key_prefix, p_key_suffix, (p_ctx).admin_user_id, p_creation_operation_id, p_expires_at
  ) returning * into v_key;
  perform private.audit_append((p_ctx).request_id, 'admin', (p_ctx).admin_user_id,
    p_platform_id, null, 'platform.key_created', 'platform_api_key', v_key.id, null, null, '{}'::jsonb);
  return query select v_key.id, v_key.platform_id, v_key.name, v_key.hmac_key_version,
    v_key.key_prefix, v_key.key_suffix, v_key.status, v_key.expires_at,
    v_key.creation_operation_id, v_key.created_at;
end;
$$;

alter function private.admin_platform_list(private.admin_context, integer) owner to domain_owner;
alter function private.admin_platform_get(private.admin_context, uuid) owner to domain_owner;
alter function private.admin_platform_create(private.admin_context, text, text, text, boolean, text, jsonb) owner to domain_owner;
alter function private.admin_origin_list(private.admin_context, uuid) owner to domain_owner;
alter function private.admin_origin_create(private.admin_context, uuid, text, text, text, text, text) owner to domain_owner;
alter function private.admin_account_list(private.admin_context, uuid, integer) owner to domain_owner;
alter function private.admin_account_get(private.admin_context, uuid, uuid) owner to domain_owner;
alter function private.admin_account_patch(private.admin_context, uuid, uuid, text) owner to domain_owner;
alter function private.admin_platform_key_list(private.admin_context, uuid) owner to domain_owner;
alter function private.admin_platform_key_create(private.admin_context, uuid, uuid, text, text, integer, text, text, uuid, timestamptz) owner to domain_owner;

revoke all on function private.admin_platform_list(private.admin_context, integer),
  private.admin_platform_get(private.admin_context, uuid),
  private.admin_platform_create(private.admin_context, text, text, text, boolean, text, jsonb),
  private.admin_origin_list(private.admin_context, uuid),
  private.admin_origin_create(private.admin_context, uuid, text, text, text, text, text),
  private.admin_account_list(private.admin_context, uuid, integer),
  private.admin_account_get(private.admin_context, uuid, uuid),
  private.admin_account_patch(private.admin_context, uuid, uuid, text),
  private.admin_platform_key_list(private.admin_context, uuid),
  private.admin_platform_key_create(private.admin_context, uuid, uuid, text, text, integer, text, text, uuid, timestamptz)
from public, anon, authenticated, account_executor, job_executor, recovery_executor;
grant execute on function private.admin_platform_list(private.admin_context, integer),
  private.admin_platform_get(private.admin_context, uuid),
  private.admin_platform_create(private.admin_context, text, text, text, boolean, text, jsonb),
  private.admin_origin_list(private.admin_context, uuid),
  private.admin_origin_create(private.admin_context, uuid, text, text, text, text, text),
  private.admin_account_list(private.admin_context, uuid, integer),
  private.admin_account_get(private.admin_context, uuid, uuid),
  private.admin_account_patch(private.admin_context, uuid, uuid, text),
  private.admin_platform_key_list(private.admin_context, uuid),
  private.admin_platform_key_create(private.admin_context, uuid, uuid, text, text, integer, text, text, uuid, timestamptz)
to admin_executor;
