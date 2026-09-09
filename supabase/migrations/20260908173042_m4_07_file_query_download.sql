-- M4-07: bounded file state reads and audited private download authorization.

create or replace function private.file_list(
  p_ctx private.account_context,
  p_cursor_file_id uuid default null,
  p_limit integer default 20
)
returns table (
  file_id uuid,
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
  v_principal record;
  v_cursor_created_at timestamptz;
begin
  if (p_ctx).request_id is null or p_limit is null or p_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_principal from private.account_principal(p_ctx);
  if v_principal.authorization not in ('allowed', 'suspended') then
    raise exception using errcode = '42501', message = v_principal.authorization;
  end if;
  if p_cursor_file_id is not null then
    select f.created_at into v_cursor_created_at
    from public.platform_config_files f
    where f.platform_id = (p_ctx).platform_id
      and f.platform_account_id = v_principal.platform_account_id
      and f.id = p_cursor_file_id;
    if v_cursor_created_at is null then
      raise exception using errcode = 'P0002', message = 'resource_not_found';
    end if;
  end if;
  return query
    select f.id, f.status, f.write_outcome, f.reserved_bytes, f.reserved_count,
      f.actual_size_bytes, f.original_name, f.mime_type, f.created_at, f.updated_at,
      f.cancel_requested_at
    from public.platform_config_files f
    where f.platform_id = (p_ctx).platform_id
      and f.platform_account_id = v_principal.platform_account_id
      and f.status <> 'deleted'
      and (p_cursor_file_id is null or (f.created_at, f.id) <
        (v_cursor_created_at, p_cursor_file_id))
    order by f.created_at desc, f.id desc
    limit p_limit;
end;
$$;

create or replace function private.file_read(
  p_ctx private.account_context,
  p_file_id uuid
)
returns table (
  file_id uuid,
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
  v_principal record;
begin
  if (p_ctx).request_id is null or p_file_id is null then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_principal from private.account_principal(p_ctx);
  if v_principal.authorization not in ('allowed', 'suspended') then
    raise exception using errcode = '42501', message = v_principal.authorization;
  end if;
  return query
    select f.id, f.status, f.write_outcome, f.reserved_bytes, f.reserved_count,
      f.actual_size_bytes, f.original_name, f.mime_type, f.created_at, f.updated_at,
      f.cancel_requested_at
    from public.platform_config_files f
    where f.platform_id = (p_ctx).platform_id
      and f.platform_account_id = v_principal.platform_account_id
      and f.id = p_file_id
      and f.status <> 'deleted';
  if not found then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
end;
$$;

create or replace function private.file_download_authorize(
  p_ctx private.account_context,
  p_file_id uuid
)
returns table (
  file_id uuid,
  storage_bucket text,
  storage_path text,
  original_name text,
  mime_type text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_principal record;
  v_file public.platform_config_files;
begin
  if (p_ctx).request_id is null or p_file_id is null then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_principal from private.account_principal(p_ctx);
  if v_principal.authorization <> 'allowed' then
    raise exception using errcode = '42501', message = v_principal.authorization;
  end if;
  select * into v_file
  from public.platform_config_files f
  where f.platform_id = (p_ctx).platform_id
    and f.platform_account_id = v_principal.platform_account_id
    and f.id = p_file_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  if v_file.status <> 'active' or v_file.write_outcome <> 'confirmed' then
    raise exception using errcode = 'P0001', message = 'file_not_downloadable';
  end if;
  perform private.audit_append(
    (p_ctx).request_id, 'user', (p_ctx).user_id, (p_ctx).platform_id,
    v_principal.platform_account_id, 'file.download_authorized',
    'platform_config_file', v_file.id, null, null, '{}'::jsonb
  );
  return query select v_file.id, v_file.storage_bucket, v_file.storage_path,
    v_file.original_name, coalesce(v_file.mime_type, 'application/octet-stream');
end;
$$;

create or replace function private.file_download_event(
  p_ctx private.account_context,
  p_file_id uuid,
  p_event text,
  p_error_code text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_principal record;
  v_event text;
begin
  if (p_ctx).request_id is null or p_file_id is null
     or p_event not in ('stream_completed', 'failed')
     or p_error_code is not null and length(p_error_code) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_principal from private.account_principal(p_ctx);
  if v_principal.authorization not in ('allowed', 'suspended') then
    raise exception using errcode = '42501', message = v_principal.authorization;
  end if;
  if not exists (
    select 1 from public.platform_config_files f
    where f.id = p_file_id and f.platform_id = (p_ctx).platform_id
      and f.platform_account_id = v_principal.platform_account_id
  ) then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  v_event := case when p_event = 'stream_completed'
    then 'file.download_stream_completed' else 'file.download_failed' end;
  perform private.audit_append(
    (p_ctx).request_id, 'user', (p_ctx).user_id, (p_ctx).platform_id,
    v_principal.platform_account_id, v_event, 'platform_config_file',
    p_file_id, null, null, jsonb_build_object('error_code', p_error_code)
  );
end;
$$;

create or replace function private.admin_file_list(
  p_ctx private.admin_context,
  p_cursor_file_id uuid default null,
  p_limit integer default 20
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
begin
  if (p_ctx).admin_user_id is null or (p_ctx).session_id is null
     or p_limit is null or p_limit not between 1 and 100
     or not exists (select 1 from private.system_admin where user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active) then
    raise exception using errcode = case when p_limit is null or p_limit not between 1 and 100 then '22023' else '42501' end,
      message = case when p_limit is null or p_limit not between 1 and 100 then 'invalid_input' else 'admin_required' end;
  end if;
  if p_cursor_file_id is not null then
    select f.created_at into v_cursor_created_at from public.platform_config_files f where f.id = p_cursor_file_id;
    if v_cursor_created_at is null then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  end if;
  return query
    select f.id, f.platform_id, f.platform_account_id, f.status, f.write_outcome,
      f.reserved_bytes, f.reserved_count, f.actual_size_bytes, f.original_name,
      f.mime_type, f.created_at, f.updated_at, f.cancel_requested_at
    from public.platform_config_files f
    where f.status <> 'deleted'
      and (p_cursor_file_id is null or (f.created_at, f.id) < (v_cursor_created_at, p_cursor_file_id))
    order by f.created_at desc, f.id desc
    limit p_limit;
end;
$$;

create or replace function private.admin_file_read(
  p_ctx private.admin_context,
  p_file_id uuid
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
begin
  if (p_ctx).admin_user_id is null or (p_ctx).session_id is null
     or p_file_id is null
     or not exists (select 1 from private.system_admin where user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active) then
    raise exception using errcode = case when p_file_id is null then '22023' else '42501' end,
      message = case when p_file_id is null then 'invalid_input' else 'admin_required' end;
  end if;
  return query select f.id, f.platform_id, f.platform_account_id, f.status, f.write_outcome,
    f.reserved_bytes, f.reserved_count, f.actual_size_bytes, f.original_name, f.mime_type,
    f.created_at, f.updated_at, f.cancel_requested_at
  from public.platform_config_files f where f.id = p_file_id and f.status <> 'deleted';
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
end;
$$;

create or replace function private.admin_file_download_authorize(
  p_ctx private.admin_context,
  p_file_id uuid
)
returns table (
  file_id uuid,
  platform_id uuid,
  storage_bucket text,
  storage_path text,
  original_name text,
  mime_type text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_file public.platform_config_files;
begin
  if (p_ctx).admin_user_id is null or (p_ctx).session_id is null or p_file_id is null
     or not exists (select 1 from private.system_admin where user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active) then
    raise exception using errcode = case when p_file_id is null then '22023' else '42501' end,
      message = case when p_file_id is null then 'invalid_input' else 'admin_required' end;
  end if;
  select * into v_file from public.platform_config_files f where f.id = p_file_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  if v_file.status <> 'active' or v_file.write_outcome <> 'confirmed' then
    raise exception using errcode = 'P0001', message = 'file_not_downloadable';
  end if;
  perform private.audit_append(
    (p_ctx).request_id, 'admin', (p_ctx).admin_user_id, v_file.platform_id,
    v_file.platform_account_id, 'file.download_authorized',
    'platform_config_file', v_file.id, null, null, '{}'::jsonb
  );
  return query select v_file.id, v_file.platform_id, v_file.storage_bucket,
    v_file.storage_path, v_file.original_name, coalesce(v_file.mime_type, 'application/octet-stream');
end;
$$;

create or replace function private.admin_file_download_event(
  p_ctx private.admin_context,
  p_file_id uuid,
  p_event text,
  p_error_code text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_file public.platform_config_files;
  v_event text;
begin
  if (p_ctx).admin_user_id is null or (p_ctx).session_id is null or p_file_id is null
     or p_event not in ('stream_completed', 'failed')
     or p_error_code is not null and length(p_error_code) not between 1 and 128
     or not exists (select 1 from private.system_admin where user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active) then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_file from public.platform_config_files f where f.id = p_file_id;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  v_event := case when p_event = 'stream_completed'
    then 'file.download_stream_completed' else 'file.download_failed' end;
  perform private.audit_append(
    (p_ctx).request_id, 'admin', (p_ctx).admin_user_id, v_file.platform_id,
    v_file.platform_account_id, v_event, 'platform_config_file', p_file_id,
    null, null, jsonb_build_object('error_code', p_error_code)
  );
end;
$$;

alter function private.file_list(private.account_context, uuid, integer) owner to domain_owner;
alter function private.file_read(private.account_context, uuid) owner to domain_owner;
alter function private.file_download_authorize(private.account_context, uuid) owner to domain_owner;
alter function private.file_download_event(private.account_context, uuid, text, text) owner to domain_owner;
alter function private.admin_file_list(private.admin_context, uuid, integer) owner to domain_owner;
alter function private.admin_file_read(private.admin_context, uuid) owner to domain_owner;
alter function private.admin_file_download_authorize(private.admin_context, uuid) owner to domain_owner;
alter function private.admin_file_download_event(private.admin_context, uuid, text, text) owner to domain_owner;

revoke all on function private.file_list(private.account_context, uuid, integer),
  private.file_read(private.account_context, uuid),
  private.file_download_authorize(private.account_context, uuid),
  private.file_download_event(private.account_context, uuid, text, text),
  private.admin_file_list(private.admin_context, uuid, integer),
  private.admin_file_read(private.admin_context, uuid),
  private.admin_file_download_authorize(private.admin_context, uuid),
  private.admin_file_download_event(private.admin_context, uuid, text, text)
from public, anon, authenticated, job_executor, recovery_executor;
revoke all on function private.file_list(private.account_context, uuid, integer),
  private.file_read(private.account_context, uuid),
  private.file_download_authorize(private.account_context, uuid),
  private.file_download_event(private.account_context, uuid, text, text)
from admin_executor;
revoke all on function private.admin_file_list(private.admin_context, uuid, integer),
  private.admin_file_read(private.admin_context, uuid),
  private.admin_file_download_authorize(private.admin_context, uuid),
  private.admin_file_download_event(private.admin_context, uuid, text, text)
from account_executor;

grant execute on function private.file_list(private.account_context, uuid, integer),
  private.file_read(private.account_context, uuid),
  private.file_download_authorize(private.account_context, uuid),
  private.file_download_event(private.account_context, uuid, text, text)
to account_executor;
grant execute on function private.admin_file_list(private.admin_context, uuid, integer),
  private.admin_file_read(private.admin_context, uuid),
  private.admin_file_download_authorize(private.admin_context, uuid),
  private.admin_file_download_event(private.admin_context, uuid, text, text)
to admin_executor;
