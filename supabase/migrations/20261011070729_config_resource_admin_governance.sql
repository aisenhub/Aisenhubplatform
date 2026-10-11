-- OPT-007 Phase 03: Admin Config governance, platform capacity, Plan slot validation,
-- and authoritative pending-review overview projection.

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
  v_cursor_updated_at timestamptz;
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
    select c.updated_at into v_cursor_updated_at
    from public.platform_configs c
    where c.platform_id = p_platform_id and c.id = p_cursor_config_id;
    if v_cursor_updated_at is null then
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
        or (c.updated_at, c.id) < (v_cursor_updated_at, p_cursor_config_id))
    order by c.updated_at desc, c.id desc
    limit p_limit;
end;
$$;

create or replace function private.admin_config_resource_read(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_config_id uuid
)
returns table (
  config_id uuid,
  platform_id uuid,
  platform_account_id uuid,
  author_display_name text,
  title text,
  description text,
  config_status text,
  row_version bigint,
  current_version_id uuid,
  current_version_number integer,
  current_schema_key text,
  current_schema_version text,
  current_file_id uuid,
  current_file_status text,
  current_write_outcome text,
  gallery_status text,
  published_version_id uuid,
  version_count bigint,
  like_count bigint,
  download_count bigint,
  apply_delivery_count bigint,
  latest_submission_status text,
  latest_review_reason text,
  latest_reviewed_at timestamptz,
  delete_requested_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
begin
  perform private.billing_admin_assert(p_ctx);
  if p_platform_id is null or p_config_id is null then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  return query
    select c.id, c.platform_id, c.platform_account_id,
      coalesce(pr.display_name, 'Unknown author'::text),
      c.title, c.description, c.status, c.row_version,
      c.current_version_id, cv.version_number, cv.schema_key, cv.schema_version,
      cv.file_id, cf.status, cf.write_outcome,
      coalesce(e.status, 'none'::text), e.published_version_id,
      (select count(*) from public.platform_config_versions v
        where v.platform_id = c.platform_id and v.config_id = c.id),
      (select count(*) from public.platform_config_likes l
        where l.platform_id = c.platform_id and l.config_id = c.id),
      (select count(*) from public.platform_config_usage_events u
        where u.platform_id = c.platform_id and u.config_id = c.id
          and u.event_type = 'download_completed'),
      (select count(*) from public.platform_config_usage_events u
        where u.platform_id = c.platform_id and u.config_id = c.id
          and u.event_type = 'apply_delivery_completed'),
      latest.status, latest.review_reason, latest.reviewed_at,
      c.delete_requested_at, c.created_at, c.updated_at
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
      select s.status, s.review_reason, s.reviewed_at
      from public.platform_config_gallery_submissions s
      where s.platform_id = c.platform_id and s.config_id = c.id
      order by s.submitted_at desc, s.id desc
      limit 1
    ) latest on true
    where c.platform_id = p_platform_id and c.id = p_config_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
end;
$$;

create or replace function private.admin_config_review_list(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_cursor_submission_id uuid default null,
  p_limit integer default 20
)
returns table (
  submission_id uuid,
  config_id uuid,
  version_id uuid,
  title text,
  author_display_name text,
  schema_key text,
  schema_version text,
  changelog text,
  version_number integer,
  submitted_at timestamptz,
  current_gallery_status text,
  current_published_version_id uuid
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_cursor_submitted_at timestamptz;
begin
  perform private.billing_admin_assert(p_ctx);
  if p_platform_id is null or p_limit is null or p_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if not exists (select 1 from public.platforms p where p.id = p_platform_id) then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  if p_cursor_submission_id is not null then
    select s.submitted_at into v_cursor_submitted_at
    from public.platform_config_gallery_submissions s
    where s.platform_id = p_platform_id and s.id = p_cursor_submission_id
      and s.status = 'pending';
    if v_cursor_submitted_at is null then
      raise exception using errcode = 'P0002', message = 'resource_not_found';
    end if;
  end if;
  return query
    select s.id, s.config_id, s.version_id, c.title,
      coalesce(pr.display_name, 'Unknown author'::text),
      v.schema_key, v.schema_version, v.changelog, v.version_number,
      s.submitted_at, coalesce(e.status, 'none'::text), e.published_version_id
    from public.platform_config_gallery_submissions s
    join public.platform_configs c
      on c.platform_id = s.platform_id and c.id = s.config_id
    join public.platform_config_versions v
      on v.platform_id = s.platform_id and v.config_id = s.config_id
        and v.id = s.version_id
    left join public.platform_profiles pr
      on pr.platform_account_id = c.platform_account_id
    left join public.platform_config_gallery_entries e
      on e.platform_id = s.platform_id and e.config_id = s.config_id
    where s.platform_id = p_platform_id and s.status = 'pending'
      and (p_cursor_submission_id is null
        or (s.submitted_at, s.id) < (v_cursor_submitted_at, p_cursor_submission_id))
    order by s.submitted_at desc, s.id desc
    limit p_limit;
end;
$$;

create or replace function private.admin_config_gallery_review_v2(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_submission_id uuid,
  p_action text,
  p_reason text
)
returns table (
  submission_id uuid,
  config_id uuid,
  version_id uuid,
  status text,
  entry_status text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
begin
  perform private.billing_admin_assert(p_ctx);
  if p_platform_id is null or p_submission_id is null then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if not exists (
    select 1 from public.platform_config_gallery_submissions s
    where s.platform_id = p_platform_id and s.id = p_submission_id
  ) then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  return query
    select * from private.admin_config_gallery_review(
      p_ctx, p_submission_id, p_action, p_reason
    );
end;
$$;

create or replace function private.admin_config_gallery_govern(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_config_id uuid,
  p_action text,
  p_reason text
)
returns table (
  config_id uuid,
  gallery_status text,
  published_version_id uuid,
  governance_reason text,
  updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_entry public.platform_config_gallery_entries;
  v_status text;
begin
  perform private.billing_admin_assert(p_ctx);
  if p_platform_id is null or p_config_id is null
     or p_action not in ('remove', 'restore', 'block')
     or p_reason is null or length(btrim(p_reason)) not between 1 and 2000 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_entry
  from public.platform_config_gallery_entries e
  where e.platform_id = p_platform_id and e.config_id = p_config_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  if p_action = 'restore' then
    if not exists (
      select 1
      from public.platform_configs c
      join public.platform_accounts a
        on a.platform_id = c.platform_id and a.id = c.platform_account_id
      join public.platform_config_versions v
        on v.platform_id = c.platform_id and v.config_id = c.id
          and v.id = v_entry.published_version_id
      join public.platform_config_files f on f.id = v.file_id
      where c.platform_id = p_platform_id and c.id = p_config_id
        and c.status = 'active' and a.status = 'active'
        and f.resource_kind = 'config_version' and f.status = 'active'
        and f.write_outcome = 'confirmed'
    ) then
      raise exception using errcode = 'P0001', message = 'config_not_publishable';
    end if;
    v_status := 'approved';
  elsif p_action = 'block' then
    v_status := 'blocked';
  else
    v_status := 'removed';
  end if;
  update public.platform_config_gallery_entries e
  set status = v_status,
      governance_reason = case when v_status = 'approved' then null else btrim(p_reason) end
  where e.platform_id = p_platform_id and e.config_id = p_config_id
  returning * into v_entry;
  perform private.audit_append(
    (p_ctx).request_id, 'admin', (p_ctx).admin_user_id, p_platform_id, null,
    'config.gallery_' || p_action, 'platform_config_gallery_entry', p_config_id,
    null, null, jsonb_build_object('reason', btrim(p_reason), 'status', v_status)
  );
  return query select v_entry.config_id, v_entry.status,
    v_entry.published_version_id, v_entry.governance_reason, v_entry.updated_at;
end;
$$;

create or replace function private.admin_config_usage_summary(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_config_id uuid
)
returns table (
  config_id uuid,
  like_count bigint,
  download_count bigint,
  apply_delivery_count bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
begin
  perform private.billing_admin_assert(p_ctx);
  if p_platform_id is null or p_config_id is null then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if not exists (
    select 1 from public.platform_configs c
    where c.platform_id = p_platform_id and c.id = p_config_id
  ) then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  return query select p_config_id,
    (select count(*) from public.platform_config_likes l
      where l.platform_id = p_platform_id and l.config_id = p_config_id),
    (select count(*) from public.platform_config_usage_events u
      where u.platform_id = p_platform_id and u.config_id = p_config_id
        and u.event_type = 'download_completed'),
    (select count(*) from public.platform_config_usage_events u
      where u.platform_id = p_platform_id and u.config_id = p_config_id
        and u.event_type = 'apply_delivery_completed');
end;
$$;

create or replace function private.admin_file_policy_read_v2(
  p_ctx private.admin_context,
  p_platform_id uuid
)
returns table (
  platform_id uuid,
  enabled boolean,
  max_file_bytes bigint,
  max_files integer,
  max_total_bytes bigint,
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
declare
  v_policy public.platform_file_policies;
begin
  perform private.billing_admin_assert(p_ctx);
  if p_platform_id is null then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if not exists (select 1 from public.platforms p where p.id = p_platform_id) then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  select * into v_policy
  from public.platform_file_policies p where p.platform_id = p_platform_id;
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
      coalesce(v_policy.max_files, 10),
      coalesce(v_policy.max_total_bytes, 10485760::bigint),
      facts.capacity, facts.reserved_bytes, facts.actual_bytes,
      greatest(facts.capacity - facts.reserved_bytes, 0::bigint),
      facts.reserved_bytes > facts.capacity,
      v_policy.updated_at
    from facts;
end;
$$;

create or replace function private.admin_file_policy_update_v2(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_enabled boolean,
  p_max_file_bytes bigint,
  p_max_files integer,
  p_max_total_bytes bigint,
  p_max_platform_total_bytes bigint
)
returns table (
  platform_id uuid,
  enabled boolean,
  max_file_bytes bigint,
  max_files integer,
  max_total_bytes bigint,
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
     or p_max_files <= 0 or p_max_total_bytes <= 0
     or p_max_platform_total_bytes not between 1048576 and 1099511627776
     or p_max_file_bytes > p_max_total_bytes
     or p_max_file_bytes > p_max_platform_total_bytes then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if not exists (select 1 from public.platforms p where p.id = p_platform_id) then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  insert into public.platform_file_policies(
    platform_id, enabled, max_file_bytes, max_files, max_total_bytes,
    max_platform_total_bytes
  ) values (
    p_platform_id, p_enabled, p_max_file_bytes, p_max_files, p_max_total_bytes,
    p_max_platform_total_bytes
  ) on conflict on constraint platform_file_policies_pkey do update set
    enabled = excluded.enabled,
    max_file_bytes = excluded.max_file_bytes,
    max_files = excluded.max_files,
    max_total_bytes = excluded.max_total_bytes,
    max_platform_total_bytes = excluded.max_platform_total_bytes;
  perform private.audit_append(
    (p_ctx).request_id, 'admin', (p_ctx).admin_user_id, p_platform_id, null,
    'file.policy_updated', 'platform_file_policy', p_platform_id, null, null,
    jsonb_build_object(
      'enabled', p_enabled,
      'max_file_bytes', p_max_file_bytes,
      'max_files', p_max_files,
      'max_total_bytes', p_max_total_bytes,
      'max_platform_total_bytes', p_max_platform_total_bytes
    )
  );
  return query select * from private.admin_file_policy_read_v2(p_ctx, p_platform_id);
end;
$$;

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
  v_slot_text text;
  v_slot_limit integer;
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
  if p_features ? 'config_slot_limit' then
    if jsonb_typeof(p_features->'config_slot_limit') <> 'number' then
      raise exception using errcode = '22023', message = 'invalid_input';
    end if;
    v_slot_text := p_features->>'config_slot_limit';
    if v_slot_text !~ '^[0-9]+$' or length(v_slot_text) > 4 then
      raise exception using errcode = '22023', message = 'invalid_input';
    end if;
    v_slot_limit := v_slot_text::integer;
    if v_slot_limit not between 0 and 1000 then
      raise exception using errcode = '22023', message = 'invalid_input';
    end if;
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
    insert into public.plans(platform_id, code, name, description, kind, features, status)
    values (p_platform_id, p_code, p_name, p_description, p_kind, p_features, p_status)
    returning * into v_plan;
    v_is_update := false;
  else
    select * into v_plan from public.plans
    where platform_id = p_platform_id and id = p_plan_id for update;
    if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
    if v_existing_default and p_kind <> 'free' then
      raise exception using errcode = 'P0001', message = 'default_plan_must_be_free';
    end if;
    update public.plans p
    set code = p_code, name = p_name, description = p_description, kind = p_kind,
        features = p_features, status = p_status
    where p.id = p_plan_id and p.platform_id = p_platform_id
    returning * into v_plan;
    v_is_update := true;
  end if;
  if p_make_default then
    if v_plan.kind <> 'free' or v_plan.status <> 'active' then
      raise exception using errcode = 'P0001', message = 'default_plan_must_be_active_free';
    end if;
    update public.platforms
    set default_plan_id = v_plan.id, default_plan_kind = 'free'
    where id = p_platform_id;
  elsif p_clear_default then
    if not v_existing_default then
      raise exception using errcode = 'P0001', message = 'plan_is_not_default';
    end if;
    update public.platforms
    set default_plan_id = null, default_plan_kind = 'free'
    where id = p_platform_id;
  elsif v_existing_default and v_plan.status = 'archived' then
    raise exception using errcode = 'P0001', message = 'default_plan_required';
  end if;
  perform private.audit_append(
    (p_ctx).request_id, 'admin', (p_ctx).admin_user_id, p_platform_id, null,
    case when v_is_update then 'plan.updated' else 'plan.created' end,
    'plan', v_plan.id, null, null,
    jsonb_build_object(
      'code', v_plan.code, 'kind', v_plan.kind, 'status', v_plan.status,
      'config_slot_limit', v_plan.features->'config_slot_limit',
      'is_default', coalesce(v_plan.id = (
        select default_plan_id from public.platforms where id = p_platform_id
      ), false)
    )
  );
  return query select v_plan.id, v_plan.code, v_plan.kind, v_plan.status,
    coalesce(v_plan.id = (
      select default_plan_id from public.platforms where id = p_platform_id
    ), false);
end;
$$;

drop function private.admin_platform_overview(private.admin_context, uuid, integer);

create function private.admin_platform_overview(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_days integer default 30
)
returns table (
  platform_id uuid,
  period_days integer,
  period_start timestamptz,
  period_end timestamptz,
  previous_start timestamptz,
  total_accounts bigint,
  active_accounts bigint,
  suspended_accounts bigint,
  closed_accounts bigint,
  new_accounts bigint,
  previous_new_accounts bigint,
  period_closed_accounts bigint,
  previous_closed_accounts bigint,
  net_accounts bigint,
  previous_net_accounts bigint,
  active_paid_accounts bigint,
  orders bigint,
  previous_orders bigint,
  granted_orders bigint,
  previous_granted_orders bigint,
  attention_orders bigint,
  previous_attention_orders bigint,
  pending_config_reviews bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_now timestamptz := now();
  v_period interval;
  v_period_start timestamptz;
  v_previous_start timestamptz;
begin
  perform private.billing_admin_assert(p_ctx);
  if p_platform_id is null or p_days is null or p_days not in (7, 30, 90) then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if not exists (select 1 from public.platforms p where p.id = p_platform_id) then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  v_period := make_interval(days => p_days);
  v_period_start := v_now - v_period;
  v_previous_start := v_period_start - v_period;
  return query
  with account_metrics as (
    select count(*)::bigint as total_accounts,
      count(*) filter (where a.status = 'active')::bigint as active_accounts,
      count(*) filter (where a.status = 'suspended')::bigint as suspended_accounts,
      count(*) filter (where a.status = 'closed')::bigint as closed_accounts,
      count(*) filter (where a.created_at >= v_period_start and a.created_at < v_now)::bigint as new_accounts,
      count(*) filter (where a.created_at >= v_previous_start and a.created_at < v_period_start)::bigint as previous_new_accounts,
      count(*) filter (where a.closed_at >= v_period_start and a.closed_at < v_now)::bigint as period_closed_accounts,
      count(*) filter (where a.closed_at >= v_previous_start and a.closed_at < v_period_start)::bigint as previous_closed_accounts
    from public.platform_accounts a where a.platform_id = p_platform_id
  ), paid_metrics as (
    select count(distinct s.platform_account_id)::bigint as active_paid_accounts
    from public.subscriptions s
    join public.plans p on p.platform_id = s.platform_id and p.id = s.plan_id
    where s.platform_id = p_platform_id and s.status = 'active' and p.kind = 'paid'
      and s.started_at <= v_now
      and (s.current_period_end is null or s.current_period_end > v_now)
  ), order_metrics as (
    select
      count(*) filter (where o.created_at >= v_period_start and o.created_at < v_now)::bigint as orders,
      count(*) filter (where o.created_at >= v_previous_start and o.created_at < v_period_start)::bigint as previous_orders,
      count(*) filter (where o.created_at >= v_period_start and o.created_at < v_now and o.entitlement_status = 'granted')::bigint as granted_orders,
      count(*) filter (where o.created_at >= v_previous_start and o.created_at < v_period_start and o.entitlement_status = 'granted')::bigint as previous_granted_orders,
      count(*) filter (
        where o.created_at >= v_period_start and o.created_at < v_now and (
          o.linkage_status = 'ambiguous' or o.entitlement_status = 'blocked'
          or (o.provider_paid_at is not null and o.verification_status <> 'verified' and o.resolution_status = 'open')
          or exists (
            select 1 from public.billing_processing_jobs j
            where j.billing_order_id = o.id and j.state in ('retryable', 'manual_review')
          )
        )
      )::bigint as attention_orders,
      count(*) filter (
        where o.created_at >= v_previous_start and o.created_at < v_period_start and (
          o.linkage_status = 'ambiguous' or o.entitlement_status = 'blocked'
          or (o.provider_paid_at is not null and o.verification_status <> 'verified' and o.resolution_status = 'open')
          or exists (
            select 1 from public.billing_processing_jobs j
            where j.billing_order_id = o.id and j.state in ('retryable', 'manual_review')
          )
        )
      )::bigint as previous_attention_orders
    from public.billing_orders o
    where o.platform_id = p_platform_id
      and o.created_at >= v_previous_start and o.created_at < v_now
  ), review_metrics as (
    select count(*)::bigint as pending_config_reviews
    from public.platform_config_gallery_submissions s
    where s.platform_id = p_platform_id and s.status = 'pending'
  )
  select p_platform_id, p_days, v_period_start, v_now, v_previous_start,
    a.total_accounts, a.active_accounts, a.suspended_accounts, a.closed_accounts,
    a.new_accounts, a.previous_new_accounts,
    a.period_closed_accounts, a.previous_closed_accounts,
    a.new_accounts - a.period_closed_accounts,
    a.previous_new_accounts - a.previous_closed_accounts,
    paid.active_paid_accounts,
    o.orders, o.previous_orders, o.granted_orders, o.previous_granted_orders,
    o.attention_orders, o.previous_attention_orders, r.pending_config_reviews
  from account_metrics a
  cross join paid_metrics paid
  cross join order_metrics o
  cross join review_metrics r;
end;
$$;

alter function private.admin_config_resource_list(private.admin_context, uuid, uuid, integer, text, text) owner to domain_owner;
alter function private.admin_config_resource_read(private.admin_context, uuid, uuid) owner to domain_owner;
alter function private.admin_config_review_list(private.admin_context, uuid, uuid, integer) owner to domain_owner;
alter function private.admin_config_gallery_review_v2(private.admin_context, uuid, uuid, text, text) owner to domain_owner;
alter function private.admin_config_gallery_govern(private.admin_context, uuid, uuid, text, text) owner to domain_owner;
alter function private.admin_config_usage_summary(private.admin_context, uuid, uuid) owner to domain_owner;
alter function private.admin_file_policy_read_v2(private.admin_context, uuid) owner to domain_owner;
alter function private.admin_file_policy_update_v2(private.admin_context, uuid, boolean, bigint, integer, bigint, bigint) owner to domain_owner;
alter function private.admin_plan_upsert(private.admin_context, uuid, uuid, text, text, text, text, jsonb, text, boolean, boolean) owner to domain_owner;
alter function private.admin_platform_overview(private.admin_context, uuid, integer) owner to domain_owner;

revoke all on function private.admin_config_resource_list(private.admin_context, uuid, uuid, integer, text, text),
  private.admin_config_resource_read(private.admin_context, uuid, uuid),
  private.admin_config_review_list(private.admin_context, uuid, uuid, integer),
  private.admin_config_gallery_review_v2(private.admin_context, uuid, uuid, text, text),
  private.admin_config_gallery_govern(private.admin_context, uuid, uuid, text, text),
  private.admin_config_usage_summary(private.admin_context, uuid, uuid),
  private.admin_file_policy_read_v2(private.admin_context, uuid),
  private.admin_file_policy_update_v2(private.admin_context, uuid, boolean, bigint, integer, bigint, bigint),
  private.admin_plan_upsert(private.admin_context, uuid, uuid, text, text, text, text, jsonb, text, boolean, boolean),
  private.admin_platform_overview(private.admin_context, uuid, integer)
from public, anon, authenticated, account_executor, job_executor, recovery_executor;

grant execute on function private.admin_config_resource_list(private.admin_context, uuid, uuid, integer, text, text),
  private.admin_config_resource_read(private.admin_context, uuid, uuid),
  private.admin_config_review_list(private.admin_context, uuid, uuid, integer),
  private.admin_config_gallery_review_v2(private.admin_context, uuid, uuid, text, text),
  private.admin_config_gallery_govern(private.admin_context, uuid, uuid, text, text),
  private.admin_config_usage_summary(private.admin_context, uuid, uuid),
  private.admin_file_policy_read_v2(private.admin_context, uuid),
  private.admin_file_policy_update_v2(private.admin_context, uuid, boolean, bigint, integer, bigint, bigint),
  private.admin_plan_upsert(private.admin_context, uuid, uuid, text, text, text, text, jsonb, text, boolean, boolean),
  private.admin_platform_overview(private.admin_context, uuid, integer)
to admin_executor;
