-- Prelaunch Phase 03: collapse the Config physical-storage model to one
-- Config-Version-only ledger and retire the generic legacy file product.

do $$
begin
  if exists (
    select 1 from public.platform_config_files f
    where f.resource_kind <> 'config_version'
  ) then
    raise exception using errcode = 'P0001', message = 'prelaunch_legacy_file_rows_present';
  end if;
end;
$$;

drop index if exists public.platform_config_files_platform_resource_status_idx;
alter table public.platform_config_files
  drop constraint if exists platform_config_files_resource_kind_check;
alter table public.platform_config_files
  alter column resource_kind set default 'config_version';
alter table public.platform_config_files
  add constraint platform_config_files_resource_kind_check
  check (resource_kind = 'config_version');

-- Preserve the mature storage state machine under Config-specific names. These
-- primitives stay domain-owner-only; executor access remains on Config wrappers.
alter function private.file_upload_state_by_kind(private.account_context, uuid, text)
  rename to config_storage_upload_state;
alter function private.file_receive_claim_by_kind(private.account_context, uuid, text, text, integer)
  rename to config_storage_receive_claim;
alter function private.file_prepare_store_by_kind(private.account_context, uuid, text, bigint, text, text, text)
  rename to config_storage_prepare_store;
alter function private.file_write_attempt_mark_unknown_by_kind(private.account_context, uuid, text, uuid, text)
  rename to config_storage_write_attempt_mark_unknown;
alter function private.file_write_attempt_finalize_by_kind(private.account_context, uuid, text, uuid, bigint, text, text)
  rename to config_storage_write_attempt_finalize;

create or replace function private.config_version_upload_state(
  p_ctx private.account_context,
  p_config_id uuid,
  p_version_id uuid
)
returns table (
  file_id uuid,
  platform_account_id uuid,
  original_name text,
  mime_type text,
  requested_size_bytes bigint,
  actual_size_bytes bigint,
  sha256 text,
  status text,
  write_outcome text,
  storage_bucket text,
  storage_path text,
  intent_expires_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare v_file_id uuid;
begin
  v_file_id := private.config_version_file_resolve(p_ctx, p_config_id, p_version_id, true);
  return query select * from private.config_storage_upload_state(
    p_ctx, v_file_id, 'config_version'
  );
end;
$$;

create or replace function private.config_version_receive_claim(
  p_ctx private.account_context,
  p_config_id uuid,
  p_version_id uuid,
  p_lease_owner text,
  p_lease_seconds integer default 15
)
returns table (
  file_id uuid,
  platform_account_id uuid,
  status text,
  write_outcome text,
  requested_size_bytes bigint,
  max_file_bytes bigint,
  reserved_bytes bigint,
  reserved_count integer,
  lease_until timestamptz,
  fencing_token bigint,
  storage_path text,
  mime_type text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare v_file_id uuid;
begin
  v_file_id := private.config_version_file_resolve(p_ctx, p_config_id, p_version_id, true);
  return query select * from private.config_storage_receive_claim(
    p_ctx, v_file_id, 'config_version', p_lease_owner, p_lease_seconds
  );
end;
$$;

create or replace function private.config_version_prepare_store(
  p_ctx private.account_context,
  p_config_id uuid,
  p_version_id uuid,
  p_actual_size_bytes bigint,
  p_sha256 text,
  p_idempotency_key text
)
returns table (
  file_id uuid,
  status text,
  write_outcome text,
  reserved_bytes bigint,
  reserved_count integer,
  actual_size_bytes bigint,
  sha256 text,
  storage_path text,
  write_attempt_id uuid
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare v_file_id uuid;
begin
  v_file_id := private.config_version_file_resolve(p_ctx, p_config_id, p_version_id, true);
  return query select * from private.config_storage_prepare_store(
    p_ctx, v_file_id, 'config_version', p_actual_size_bytes, p_sha256,
    p_idempotency_key, 'config_version_prepare_store'
  );
end;
$$;

create or replace function private.config_version_write_attempt_mark_unknown(
  p_ctx private.account_context,
  p_config_id uuid,
  p_version_id uuid,
  p_attempt_id uuid,
  p_error_code text
)
returns table (file_id uuid, status text, write_outcome text, write_attempt_id uuid)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare v_file_id uuid;
begin
  v_file_id := private.config_version_file_resolve(p_ctx, p_config_id, p_version_id, false);
  return query select * from private.config_storage_write_attempt_mark_unknown(
    p_ctx, v_file_id, 'config_version', p_attempt_id, p_error_code
  );
end;
$$;

create or replace function private.config_version_write_attempt_finalize(
  p_ctx private.account_context,
  p_config_id uuid,
  p_version_id uuid,
  p_attempt_id uuid,
  p_actual_size_bytes bigint,
  p_sha256 text,
  p_provider_request_id text
)
returns table (
  file_id uuid,
  status text,
  write_outcome text,
  actual_size_bytes bigint,
  sha256 text,
  reserved_bytes bigint,
  reserved_count integer,
  uploaded_at timestamptz,
  original_name text,
  mime_type text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_file_id uuid;
  v_current_version_id uuid;
  v_current_number integer;
  v_target_number integer;
begin
  v_file_id := private.config_version_file_resolve(p_ctx, p_config_id, p_version_id, false);
  return query select * from private.config_storage_write_attempt_finalize(
    p_ctx, v_file_id, 'config_version', p_attempt_id, p_actual_size_bytes,
    p_sha256, p_provider_request_id
  );
  select c.current_version_id, current_v.version_number, target_v.version_number
    into v_current_version_id, v_current_number, v_target_number
  from public.platform_configs c
  join public.platform_config_versions target_v
    on target_v.config_id = c.id and target_v.id = p_version_id
  left join public.platform_config_versions current_v
    on current_v.config_id = c.id and current_v.id = c.current_version_id
  where c.id = p_config_id and c.status = 'active';
  if found and (
    v_current_version_id is null
    or (v_current_version_id is distinct from p_version_id and v_current_number < v_target_number)
  ) then
    perform 1 from private.config_version_activate(p_ctx, p_config_id, p_version_id);
  end if;
end;
$$;

-- Retired Account generic file-product entry points.
drop function if exists private.file_intent_create(private.account_context, text, bigint, text, text, uuid, text);
drop function if exists private.file_budget_read(private.account_context);
drop function if exists private.file_list(private.account_context, uuid, integer);
drop function if exists private.file_read(private.account_context, uuid);
drop function if exists private.file_download_authorize(private.account_context, uuid);
drop function if exists private.file_download_event(private.account_context, uuid, text, text);
drop function if exists private.file_delete_request(private.account_context, uuid, text);
drop function if exists private.file_upload_state(private.account_context, uuid);
drop function if exists private.file_receive_claim(private.account_context, uuid, text, integer);
drop function if exists private.file_prepare_store(private.account_context, uuid, bigint, text, text);
drop function if exists private.file_write_attempt_mark_unknown(private.account_context, uuid, uuid, text);
drop function if exists private.file_write_attempt_finalize(private.account_context, uuid, uuid, bigint, text, text);

-- Retired Admin generic file-product entry points.
drop function if exists private.admin_file_list(private.admin_context, uuid, integer);
drop function if exists private.admin_file_list_v2(private.admin_context, uuid, integer, text);
drop function if exists private.admin_file_list_v3(private.admin_context, uuid, uuid, integer, text);
drop function if exists private.admin_file_read(private.admin_context, uuid);
drop function if exists private.admin_file_download_authorize(private.admin_context, uuid);
drop function if exists private.admin_file_download_event(private.admin_context, uuid, text, text);
drop function if exists private.admin_file_delete_request(private.admin_context, uuid, text);
drop function if exists private.admin_file_delete_request(private.admin_context, uuid, uuid, text);

drop function if exists private.admin_file_policy_read(private.admin_context, uuid);
drop function if exists private.admin_file_policy_update(private.admin_context, uuid, boolean, bigint, integer, bigint);
drop function if exists private.admin_file_policy_read_v2(private.admin_context, uuid);
drop function if exists private.admin_file_policy_update_v2(private.admin_context, uuid, boolean, bigint, integer, bigint, bigint);

-- Account-level generic file count/byte quotas belonged to the retired product.
alter table public.platform_file_policies
  drop column if exists max_files,
  drop column if exists max_total_bytes;

drop index if exists public.platform_config_files_live_replace_idx;
alter table public.platform_config_files
  drop column if exists replaces_file_id,
  drop column if exists over_quota;

create or replace function private.admin_storage_policy_read(
  p_ctx private.admin_context,
  p_platform_id uuid
)
returns table (
  platform_id uuid,
  enabled boolean,
  max_file_bytes bigint,
  max_platform_total_bytes bigint,
  platform_reserved_bytes bigint,
  platform_actual_bytes bigint,
  platform_available_bytes bigint,
  platform_over_capacity boolean,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare v_policy public.platform_file_policies;
begin
  perform private.billing_admin_assert(p_ctx);
  if p_platform_id is null then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if not exists (select 1 from public.platforms p where p.id = p_platform_id) then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  select * into v_policy from public.platform_file_policies p
  where p.platform_id = p_platform_id;
  return query
    with usage as (
      select coalesce(sum(f.reserved_bytes), 0)::bigint as reserved_bytes,
        coalesce(sum(coalesce(f.actual_size_bytes, 0)), 0)::bigint as actual_bytes
      from public.platform_config_files f
      where f.platform_id = p_platform_id and f.status <> 'deleted'
    ), facts as (
      select coalesce(v_policy.max_platform_total_bytes, 1073741824::bigint) as capacity,
        usage.reserved_bytes, usage.actual_bytes
      from usage
    )
    select p_platform_id,
      coalesce(v_policy.enabled, true),
      coalesce(v_policy.max_file_bytes, 1048576::bigint),
      facts.capacity, facts.reserved_bytes, facts.actual_bytes,
      greatest(facts.capacity - facts.reserved_bytes, 0::bigint),
      facts.reserved_bytes > facts.capacity,
      v_policy.updated_at
    from facts;
end;
$$;

create or replace function private.admin_storage_policy_update(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_enabled boolean,
  p_max_file_bytes bigint,
  p_max_platform_total_bytes bigint
)
returns table (
  platform_id uuid,
  enabled boolean,
  max_file_bytes bigint,
  max_platform_total_bytes bigint,
  platform_reserved_bytes bigint,
  platform_actual_bytes bigint,
  platform_available_bytes bigint,
  platform_over_capacity boolean,
  updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
begin
  perform private.billing_admin_assert(p_ctx);
  if p_platform_id is null or p_enabled is null
     or p_max_file_bytes not between 1 and 1048576
     or p_max_platform_total_bytes not between 1048576 and 1099511627776
     or p_max_file_bytes > p_max_platform_total_bytes then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if not exists (select 1 from public.platforms p where p.id = p_platform_id) then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  insert into public.platform_file_policies(
    platform_id, enabled, max_file_bytes, max_platform_total_bytes
  ) values (
    p_platform_id, p_enabled, p_max_file_bytes, p_max_platform_total_bytes
  ) on conflict on constraint platform_file_policies_pkey do update set
    enabled = excluded.enabled,
    max_file_bytes = excluded.max_file_bytes,
    max_platform_total_bytes = excluded.max_platform_total_bytes;
  perform private.audit_append(
    (p_ctx).request_id, 'admin', (p_ctx).admin_user_id, p_platform_id, null,
    'storage.policy_updated', 'platform_file_policy', p_platform_id, null, null,
    jsonb_build_object(
      'enabled', p_enabled,
      'max_file_bytes', p_max_file_bytes,
      'max_platform_total_bytes', p_max_platform_total_bytes
    )
  );
  return query select * from private.admin_storage_policy_read(p_ctx, p_platform_id);
end;
$$;

-- R-12: stable Admin Config pagination uses immutable creation order.
create or replace function private.admin_config_resource_list(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_cursor_config_id uuid default null,
  p_limit integer default 20,
  p_query text default null,
  p_gallery_status text default null
)
returns table (
  config_id uuid,
  platform_id uuid,
  platform_account_id uuid,
  author_display_name text,
  title text,
  description text,
  config_status text,
  current_version_id uuid,
  current_version_number integer,
  current_schema_key text,
  current_schema_version text,
  current_file_status text,
  current_write_outcome text,
  gallery_status text,
  published_version_id uuid,
  pending_submission_id uuid,
  pending_version_id uuid,
  pending_submitted_at timestamptz,
  like_count bigint,
  download_count bigint,
  apply_delivery_count bigint,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_cursor_created_at timestamptz;
  v_query text := nullif(btrim(p_query), '');
begin
  perform private.billing_admin_assert(p_ctx);
  if p_platform_id is null or p_limit is null or p_limit not between 1 and 100
     or v_query is not null and length(v_query) > 128
     or p_gallery_status is not null
        and p_gallery_status not in ('approved', 'removed', 'blocked', 'none', 'pending') then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if not exists (select 1 from public.platforms p where p.id = p_platform_id) then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  if p_cursor_config_id is not null then
    select c.created_at into v_cursor_created_at
    from public.platform_configs c
    where c.platform_id = p_platform_id and c.id = p_cursor_config_id;
    if v_cursor_created_at is null then
      raise exception using errcode = 'P0002', message = 'resource_not_found';
    end if;
  end if;
  return query
    select c.id, c.platform_id, c.platform_account_id,
      coalesce(pr.display_name, 'Unknown author'::text),
      c.title, c.description, c.status,
      c.current_version_id, cv.version_number, cv.schema_key, cv.schema_version,
      cf.status, cf.write_outcome,
      coalesce(e.status, 'none'::text), e.published_version_id,
      pending.submission_id, pending.version_id, pending.submitted_at,
      (select count(*) from public.platform_config_likes l
        where l.platform_id = c.platform_id and l.config_id = c.id),
      (select count(*) from public.platform_config_usage_events u
        where u.platform_id = c.platform_id and u.config_id = c.id
          and u.event_type = 'download_completed'),
      (select count(*) from public.platform_config_usage_events u
        where u.platform_id = c.platform_id and u.config_id = c.id
          and u.event_type = 'apply_delivery_completed'),
      c.created_at, c.updated_at
    from public.platform_configs c
    left join public.platform_profiles pr
      on pr.platform_account_id = c.platform_account_id
    left join public.platform_config_versions cv
      on cv.platform_id = c.platform_id and cv.config_id = c.id
        and cv.id = c.current_version_id
    left join public.platform_config_files cf on cf.id = cv.file_id
    left join public.platform_config_gallery_entries e
      on e.platform_id = c.platform_id and e.config_id = c.id
    left join lateral (
      select s.id as submission_id, s.version_id, s.submitted_at
      from public.platform_config_gallery_submissions s
      where s.platform_id = c.platform_id and s.config_id = c.id
        and s.status = 'pending'
      order by s.submitted_at desc, s.id desc
      limit 1
    ) pending on true
    where c.platform_id = p_platform_id
      and (v_query is null
        or c.title ilike '%' || v_query || '%'
        or coalesce(c.description, '') ilike '%' || v_query || '%'
        or coalesce(pr.display_name, '') ilike '%' || v_query || '%')
      and (p_gallery_status is null
        or p_gallery_status = 'none' and e.config_id is null
        or p_gallery_status = 'pending' and pending.submission_id is not null
        or p_gallery_status in ('approved', 'removed', 'blocked')
          and e.status = p_gallery_status)
      and (p_cursor_config_id is null
        or (c.created_at, c.id) < (v_cursor_created_at, p_cursor_config_id))
    order by c.created_at desc, c.id desc
    limit p_limit;
end;
$$;

-- Remove the last legacy-kind branch from the surviving storage primitives.
-- The temporary p_resource_kind parameter remains only to avoid changing the
-- historical forward-migration signature before Phase 07 squash.
create or replace function private.config_storage_upload_state(
  p_ctx private.account_context,
  p_file_id uuid,
  p_resource_kind text
)
returns table (
  file_id uuid,
  platform_account_id uuid,
  original_name text,
  mime_type text,
  requested_size_bytes bigint,
  actual_size_bytes bigint,
  sha256 text,
  status text,
  write_outcome text,
  storage_bucket text,
  storage_path text,
  intent_expires_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_principal record;
begin
  if (p_ctx).request_id is null or p_file_id is null
     or p_resource_kind <> 'config_version' then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_principal from private.account_principal(p_ctx);
  if v_principal.authorization <> 'allowed' then
    raise exception using errcode = '42501', message = v_principal.authorization;
  end if;
  return query
    select f.id, f.platform_account_id, f.original_name, f.mime_type,
      f.requested_size_bytes, f.actual_size_bytes, f.sha256, f.status,
      f.write_outcome, f.storage_bucket, f.storage_path, f.intent_expires_at,
      f.created_at, f.updated_at
    from public.platform_config_files f
    where f.platform_id = (p_ctx).platform_id
      and f.platform_account_id = v_principal.platform_account_id
      and f.id = p_file_id and f.resource_kind = 'config_version';
  if not found then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
end;
$$;

alter function private.config_storage_upload_state(private.account_context, uuid, text) owner to domain_owner;
create or replace function private.config_storage_receive_claim(
  p_ctx private.account_context,
  p_file_id uuid,
  p_resource_kind text,
  p_lease_owner text,
  p_lease_seconds integer default 15
)
returns table (
  file_id uuid,
  platform_account_id uuid,
  status text,
  write_outcome text,
  requested_size_bytes bigint,
  max_file_bytes bigint,
  reserved_bytes bigint,
  reserved_count integer,
  lease_until timestamptz,
  fencing_token bigint,
  storage_path text,
  mime_type text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_authorization text;
  v_account_id uuid;
  v_account public.platform_accounts;
  v_file public.platform_config_files;
  v_policy public.platform_file_policies;
  v_now timestamptz := clock_timestamp();
begin
  if (p_ctx).request_id is null or p_file_id is null
     or p_resource_kind <> 'config_version'
     or p_lease_owner is null or length(p_lease_owner) not between 1 and 128
     or p_lease_seconds not between 1 and 15 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select principal.authorization, principal.platform_account_id
    into v_authorization, v_account_id
  from private.account_principal(p_ctx) principal;
  if v_authorization <> 'allowed' then
    raise exception using errcode = '42501', message = v_authorization;
  end if;
  select * into v_account from public.platform_accounts a
  where a.platform_id = (p_ctx).platform_id and a.id = v_account_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  select * into v_policy from public.platform_file_policies p
  where p.platform_id = (p_ctx).platform_id for update;
  select * into v_file from public.platform_config_files f
  where f.platform_id = (p_ctx).platform_id
    and f.platform_account_id = v_account_id and f.id = p_file_id
    and f.resource_kind = 'config_version' for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  if v_file.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'operation_in_progress';
  end if;
  if v_file.intent_expires_at <= v_now then
    raise exception using errcode = 'P0001', message = 'intent_expired';
  end if;
  if v_file.lease_until is not null and v_file.lease_until > v_now then
    raise exception using errcode = 'P0001', message = 'operation_in_progress';
  end if;
  update public.platform_config_files f
  set status = 'receiving', lease_owner = p_lease_owner,
      lease_until = v_now + make_interval(secs => p_lease_seconds),
      fencing_token = f.fencing_token + 1
  where f.id = v_file.id
  returning f.id, f.platform_account_id, f.status, f.write_outcome,
    f.requested_size_bytes, v_policy.max_file_bytes, f.reserved_bytes,
    f.reserved_count, f.lease_until, f.fencing_token, f.storage_path, f.mime_type
  into file_id, platform_account_id, status, write_outcome,
    requested_size_bytes, max_file_bytes, reserved_bytes, reserved_count,
    lease_until, fencing_token, storage_path, mime_type;
  perform private.audit_append(
    (p_ctx).request_id, 'user', (p_ctx).user_id, (p_ctx).platform_id, v_account_id,
    'file.receive_claimed', 'platform_config_file', p_file_id, null, null,
    jsonb_build_object('fencing_token', fencing_token)
  );
  return next;
end;
$$;
alter function private.config_storage_receive_claim(private.account_context, uuid, text, text, integer) owner to domain_owner;
create or replace function private.config_storage_prepare_store(
  p_ctx private.account_context,
  p_file_id uuid,
  p_resource_kind text,
  p_actual_size_bytes bigint,
  p_sha256 text,
  p_idempotency_key text,
  p_operation text
)
returns table (
  file_id uuid,
  status text,
  write_outcome text,
  reserved_bytes bigint,
  reserved_count integer,
  actual_size_bytes bigint,
  sha256 text,
  storage_path text,
  write_attempt_id uuid
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public, extensions
as $$
declare
  v_authorization text;
  v_account_id uuid;
  v_account public.platform_accounts;
  v_file public.platform_config_files;
  v_policy public.platform_file_policies;
  v_attempt private.file_write_attempts;
  v_claim private.idempotency_keys%rowtype;
  v_new_claim boolean := false;
  v_hash bytea;
  v_response jsonb;
begin
  if p_file_id is null or p_resource_kind <> 'config_version'
     or p_actual_size_bytes not between 1 and 1048576
     or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$'
     or p_idempotency_key is null or length(p_idempotency_key) not between 1 and 128
     or p_operation <> 'config_version_prepare_store' then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select principal.authorization, principal.platform_account_id
    into v_authorization, v_account_id
  from private.account_principal(p_ctx) principal;
  if v_authorization <> 'allowed' then
    raise exception using errcode = '42501', message = v_authorization;
  end if;
  select * into v_account from public.platform_accounts a
  where a.platform_id = (p_ctx).platform_id and a.id = v_account_id for update;
  select * into v_file from public.platform_config_files f
  where f.platform_id = (p_ctx).platform_id
    and f.platform_account_id = v_account_id and f.id = p_file_id
    and f.resource_kind = 'config_version' for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  v_hash := extensions.digest(convert_to(
    p_file_id::text || ':' || p_actual_size_bytes::text || ':' || p_sha256,
    'utf8'), 'sha256');
  insert into private.idempotency_keys (
    platform_id, platform_account_id, operation, actor_scope, idempotency_key, request_hash
  ) values (
    (p_ctx).platform_id, v_account_id, 'config_version_prepare_store',
    'user:' || (p_ctx).user_id::text, p_idempotency_key, v_hash
  ) on conflict (platform_id, platform_account_id, operation, actor_scope, idempotency_key)
    do nothing returning true into v_new_claim;
  if not coalesce(v_new_claim, false) then
    select * into v_claim from private.idempotency_keys i
    where i.platform_id = (p_ctx).platform_id and i.platform_account_id = v_account_id
      and i.operation = 'config_version_prepare_store'
      and i.actor_scope = 'user:' || (p_ctx).user_id::text
      and i.idempotency_key = p_idempotency_key for update;
    if v_claim.request_hash <> v_hash then
      raise exception using errcode = '23505', message = 'idempotency_conflict';
    end if;
    if v_claim.state = 'completed' then
      return query select (v_claim.response_body->>'file_id')::uuid,
        v_claim.response_body->>'status', v_claim.response_body->>'write_outcome',
        (v_claim.response_body->>'reserved_bytes')::bigint,
        (v_claim.response_body->>'reserved_count')::integer,
        (v_claim.response_body->>'actual_size_bytes')::bigint,
        v_claim.response_body->>'sha256', v_claim.response_body->>'storage_path',
        (v_claim.response_body->>'write_attempt_id')::uuid;
      return;
    end if;
    raise exception using errcode = 'P0001', message = 'operation_in_progress';
  end if;
  if v_file.status <> 'receiving' or v_file.lease_until is null
     or v_file.lease_until <= clock_timestamp() then
    raise exception using errcode = 'P0001', message = 'operation_in_progress';
  end if;
  if p_actual_size_bytes > v_file.requested_size_bytes then
    raise exception using errcode = '22023', message = 'size_mismatch';
  end if;
  select * into v_policy from public.platform_file_policies p
  where p.platform_id = (p_ctx).platform_id for update;
  if not found or not v_policy.enabled or p_actual_size_bytes > v_policy.max_file_bytes then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  insert into private.file_write_attempts (
    platform_id, platform_account_id, file_id, fencing_token,
    state, actual_size_bytes, sha256
  ) values (
    (p_ctx).platform_id, v_account_id, v_file.id, v_file.fencing_token,
    'in_flight', p_actual_size_bytes, p_sha256
  ) returning * into v_attempt;
  update public.platform_config_files f
  set status = 'storing', write_outcome = 'in_flight',
      actual_size_bytes = p_actual_size_bytes, sha256 = p_sha256,
      reserved_bytes = p_actual_size_bytes, lease_until = null, lease_owner = null
  where f.id = v_file.id;
  perform private.audit_append(
    (p_ctx).request_id, 'user', (p_ctx).user_id, (p_ctx).platform_id, v_account_id,
    'file.store_prepared', 'platform_config_file', v_file.id, null, null,
    jsonb_build_object('actual_size_bytes', p_actual_size_bytes,
      'write_attempt_id', v_attempt.id)
  );
  v_response := jsonb_build_object(
    'file_id', v_file.id, 'status', 'storing', 'write_outcome', 'in_flight',
    'reserved_bytes', p_actual_size_bytes, 'reserved_count', v_file.reserved_count,
    'actual_size_bytes', p_actual_size_bytes, 'sha256', p_sha256,
    'storage_path', v_file.storage_path, 'write_attempt_id', v_attempt.id
  );
  perform private.idempotency_finalize(
    (p_ctx).platform_id, v_account_id, 'config_version_prepare_store',
    'user:' || (p_ctx).user_id::text, p_idempotency_key, v_hash, 200, v_response
  );
  return query select v_file.id, 'storing'::text, 'in_flight'::text,
    p_actual_size_bytes, v_file.reserved_count, p_actual_size_bytes,
    p_sha256, v_file.storage_path, v_attempt.id;
end;
$$;
alter function private.config_storage_prepare_store(private.account_context, uuid, text, bigint, text, text, text) owner to domain_owner;
create or replace function private.config_storage_write_attempt_mark_unknown(
  p_ctx private.account_context,
  p_file_id uuid,
  p_resource_kind text,
  p_attempt_id uuid,
  p_error_code text
)
returns table (file_id uuid, status text, write_outcome text, write_attempt_id uuid)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_authorization text;
  v_account_id uuid;
  v_file public.platform_config_files;
  v_attempt private.file_write_attempts;
begin
  if (p_ctx).request_id is null or p_file_id is null or p_attempt_id is null
     or p_resource_kind <> 'config_version'
     or p_error_code is null or length(p_error_code) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select principal.authorization, principal.platform_account_id
    into v_authorization, v_account_id
  from private.account_principal(p_ctx) principal;
  if v_authorization not in ('allowed', 'suspended') then
    raise exception using errcode = '42501', message = v_authorization;
  end if;
  select * into v_file from public.platform_config_files f
  where f.platform_id = (p_ctx).platform_id
    and f.platform_account_id = v_account_id and f.id = p_file_id
    and f.resource_kind = 'config_version' for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  select * into v_attempt from private.file_write_attempts a
  where a.platform_id = (p_ctx).platform_id and a.platform_account_id = v_account_id
    and a.file_id = p_file_id and a.id = p_attempt_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  if v_attempt.state = 'unknown' then
    return query select v_file.id, v_file.status, v_file.write_outcome, v_attempt.id;
    return;
  end if;
  if v_file.status <> 'storing' or v_attempt.state <> 'in_flight'
     or v_file.write_outcome <> 'in_flight' then
    raise exception using errcode = 'P0001', message = 'operation_in_progress';
  end if;
  update private.file_write_attempts
  set state = 'unknown', error_code = p_error_code
  where id = v_attempt.id;
  update public.platform_config_files set write_outcome = 'unknown'
  where id = v_file.id;
  perform private.audit_append(
    (p_ctx).request_id, 'user', (p_ctx).user_id, (p_ctx).platform_id, v_account_id,
    'file.store_unknown', 'platform_config_file', v_file.id, null, null,
    jsonb_build_object('write_attempt_id', v_attempt.id, 'error_code', p_error_code)
  );
  return query select v_file.id, v_file.status, 'unknown'::text, v_attempt.id;
end;
$$;
alter function private.config_storage_write_attempt_mark_unknown(private.account_context, uuid, text, uuid, text) owner to domain_owner;
create or replace function private.config_storage_write_attempt_finalize(
  p_ctx private.account_context,
  p_file_id uuid,
  p_resource_kind text,
  p_attempt_id uuid,
  p_actual_size_bytes bigint,
  p_sha256 text,
  p_provider_request_id text
)
returns table (
  file_id uuid,
  status text,
  write_outcome text,
  actual_size_bytes bigint,
  sha256 text,
  reserved_bytes bigint,
  reserved_count integer,
  uploaded_at timestamptz,
  original_name text,
  mime_type text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_authorization text;
  v_account_id uuid;
  v_file public.platform_config_files;
  v_attempt private.file_write_attempts;
begin
  if (p_ctx).request_id is null or p_file_id is null or p_attempt_id is null
     or p_resource_kind <> 'config_version'
     or p_actual_size_bytes not between 1 and 1048576
     or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$'
     or p_provider_request_id is not null and length(p_provider_request_id) > 256 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select principal.authorization, principal.platform_account_id
    into v_authorization, v_account_id
  from private.account_principal(p_ctx) principal;
  if v_authorization not in ('allowed', 'suspended') then
    raise exception using errcode = '42501', message = v_authorization;
  end if;
  select * into v_file from public.platform_config_files f
  where f.platform_id = (p_ctx).platform_id
    and f.platform_account_id = v_account_id and f.id = p_file_id
    and f.resource_kind = 'config_version' for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  select * into v_attempt from private.file_write_attempts a
  where a.platform_id = (p_ctx).platform_id and a.platform_account_id = v_account_id
    and a.file_id = p_file_id and a.id = p_attempt_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  if v_file.status = 'active' and v_file.write_outcome = 'confirmed'
     and v_file.actual_size_bytes = p_actual_size_bytes and v_file.sha256 = p_sha256 then
    return query select v_file.id, v_file.status, v_file.write_outcome,
      v_file.actual_size_bytes, v_file.sha256, v_file.reserved_bytes,
      v_file.reserved_count, v_file.uploaded_at, v_file.original_name, v_file.mime_type;
    return;
  end if;
  if v_file.status <> 'storing' or v_file.write_outcome <> 'in_flight'
     or v_attempt.state <> 'in_flight'
     or v_attempt.actual_size_bytes <> p_actual_size_bytes
     or v_attempt.sha256 <> p_sha256 then
    raise exception using errcode = 'P0001', message = 'operation_in_progress';
  end if;
  update private.file_write_attempts
  set state = 'confirmed', settled_at = clock_timestamp(),
      provider_request_id = p_provider_request_id
  where id = v_attempt.id;
  update public.platform_config_files f
  set status = 'active', write_outcome = 'confirmed', uploaded_at = clock_timestamp()
  where f.id = v_file.id
  returning f.id, f.status, f.write_outcome, f.actual_size_bytes, f.sha256,
    f.reserved_bytes, f.reserved_count, f.uploaded_at, f.original_name, f.mime_type
  into file_id, status, write_outcome, actual_size_bytes, sha256,
    reserved_bytes, reserved_count, uploaded_at, original_name, mime_type;
  perform private.audit_append(
    (p_ctx).request_id, 'user', (p_ctx).user_id, (p_ctx).platform_id, v_account_id,
    'file.store_confirmed', 'platform_config_file', v_file.id, null, null,
    jsonb_build_object('write_attempt_id', v_attempt.id,
      'provider_request_id', p_provider_request_id)
  );
  return next;
end;
$$;
alter function private.config_storage_write_attempt_finalize(private.account_context, uuid, text, uuid, bigint, text, text) owner to domain_owner;
alter function private.admin_storage_policy_read(private.admin_context, uuid) owner to domain_owner;
alter function private.admin_storage_policy_update(private.admin_context, uuid, boolean, bigint, bigint) owner to domain_owner;

revoke all on function private.admin_storage_policy_read(private.admin_context, uuid)
from public, anon, authenticated, account_executor, job_executor, recovery_executor;
revoke all on function private.admin_storage_policy_update(private.admin_context, uuid, boolean, bigint, bigint)
from public, anon, authenticated, account_executor, job_executor, recovery_executor;
grant execute on function private.admin_storage_policy_read(private.admin_context, uuid) to admin_executor;
grant execute on function private.admin_storage_policy_update(private.admin_context, uuid, boolean, bigint, bigint) to admin_executor;



