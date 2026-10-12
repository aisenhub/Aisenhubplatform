-- OPT-008 Phase 03: Admin Feedback projections, governance commands,
-- server-side export rows, attachment authorization, and Overview aggregation.

create index platform_feedback_admin_sort_idx
  on public.platform_feedback(platform_id, (coalesce(submitted_at, created_at)) desc, id desc)
  where status not in ('draft', 'deleted');

create index platform_feedback_contact_email_idx
  on public.platform_feedback(platform_id, lower(contact_email_snapshot))
  where contact_email_snapshot is not null and status not in ('draft', 'deleted');

create or replace function private.admin_feedback_list(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_cursor_feedback_id uuid default null,
  p_limit integer default 20,
  p_query text default null,
  p_status text default null,
  p_category text default null,
  p_label text default null,
  p_user text default null,
  p_email text default null,
  p_has_attachments boolean default null,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  feedback_id uuid,
  platform_account_id uuid,
  user_id uuid,
  author_display_name text,
  contact_allowed boolean,
  category text,
  title text,
  body_summary text,
  status text,
  flagged boolean,
  labels text[],
  attachment_count integer,
  row_version bigint,
  submitted_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_cursor_at timestamptz;
  v_query text := nullif(btrim(p_query), '');
  v_label text := nullif(lower(btrim(p_label)), '');
  v_user text := nullif(btrim(p_user), '');
  v_email text := nullif(lower(btrim(p_email)), '');
begin
  perform private.billing_admin_assert(p_ctx);
  if p_platform_id is null or p_limit is null or p_limit not between 1 and 100
     or v_query is not null and length(v_query) > 256
     or p_status is not null and p_status not in ('new','reviewing','planned','resolved','closed','deleting')
     or p_category is not null and p_category not in ('bug','idea','experience','other')
     or v_label is not null and length(v_label) > 32
     or v_user is not null and length(v_user) > 320
     or v_email is not null and length(v_email) > 320
     or p_from is not null and p_to is not null and p_from > p_to then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if not exists (select 1 from public.platforms p where p.id = p_platform_id) then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  if p_cursor_feedback_id is not null then
    select coalesce(f.submitted_at, f.created_at) into v_cursor_at
    from public.platform_feedback f
    where f.platform_id = p_platform_id and f.id = p_cursor_feedback_id
      and f.status not in ('draft','deleted');
    if v_cursor_at is null then
      raise exception using errcode = 'P0002', message = 'resource_not_found';
    end if;
  end if;

  return query
  select f.id, f.platform_account_id, f.user_id,
    coalesce(f.author_display_name_snapshot, 'Unknown user'::text),
    f.contact_allowed, f.category, f.title,
    case when f.body is null then null else left(regexp_replace(f.body, E'[\\n\\r\\t]+', ' ', 'g'), 240) end,
    f.status, f.flagged,
    coalesce((select array_agg(l.label order by l.label)
      from public.platform_feedback_labels l where l.feedback_id = f.id), '{}'::text[]),
    (select count(*)::integer from public.platform_feedback_attachments a
      where a.feedback_id = f.id and a.status not in ('deleted','expired','failed')),
    f.row_version, f.submitted_at, f.resolved_at, f.created_at, f.updated_at
  from public.platform_feedback f
  where f.platform_id = p_platform_id
    and f.status not in ('draft','deleted')
    and (p_status is null or f.status = p_status)
    and (p_category is null or f.category = p_category)
    and (v_label is null or exists (
      select 1 from public.platform_feedback_labels l
      where l.feedback_id = f.id and lower(l.label) = v_label
    ))
    and (v_user is null
      or f.user_id::text ilike '%' || v_user || '%'
      or f.platform_account_id::text ilike '%' || v_user || '%'
      or coalesce(f.author_display_name_snapshot, '') ilike '%' || v_user || '%')
    and (v_email is null or lower(coalesce(f.contact_email_snapshot, '')) ilike '%' || v_email || '%')
    and (p_has_attachments is null or p_has_attachments = exists (
      select 1 from public.platform_feedback_attachments a
      where a.feedback_id = f.id and a.status not in ('deleted','expired','failed')
    ))
    and (p_from is null or coalesce(f.submitted_at, f.created_at) >= p_from)
    and (p_to is null or coalesce(f.submitted_at, f.created_at) <= p_to)
    and (v_query is null
      or coalesce(f.title, '') ilike '%' || v_query || '%'
      or coalesce(f.body, '') ilike '%' || v_query || '%'
      or coalesce(f.author_display_name_snapshot, '') ilike '%' || v_query || '%'
      or coalesce(f.contact_email_snapshot, '') ilike '%' || v_query || '%')
    and (p_cursor_feedback_id is null
      or (coalesce(f.submitted_at, f.created_at), f.id) < (v_cursor_at, p_cursor_feedback_id))
  order by coalesce(f.submitted_at, f.created_at) desc, f.id desc
  limit p_limit;
end;
$$;

create or replace function private.admin_feedback_read(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_feedback_id uuid
)
returns table (
  feedback_id uuid,
  platform_id uuid,
  platform_account_id uuid,
  user_id uuid,
  author_display_name text,
  contact_allowed boolean,
  contact_email text,
  category text,
  title text,
  body text,
  status text,
  flagged boolean,
  client_context jsonb,
  labels text[],
  attachments jsonb,
  timeline jsonb,
  row_version bigint,
  submitted_at timestamptz,
  resolved_at timestamptz,
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
  if p_platform_id is null or p_feedback_id is null then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  return query
  select f.id, f.platform_id, f.platform_account_id, f.user_id,
    coalesce(f.author_display_name_snapshot, 'Unknown user'::text),
    f.contact_allowed, f.contact_email_snapshot, f.category, f.title, f.body,
    f.status, f.flagged, f.client_context,
    coalesce((select array_agg(l.label order by l.label)
      from public.platform_feedback_labels l where l.feedback_id = f.id), '{}'::text[]),
    coalesce((select jsonb_agg(jsonb_build_object(
        'attachment_id', a.id,
        'original_name', a.original_name,
        'mime_type', a.mime_type,
        'actual_size_bytes', a.actual_size_bytes,
        'status', a.status,
        'write_outcome', a.write_outcome,
        'created_at', a.created_at,
        'content_path', case when a.status = 'active' and a.write_outcome = 'confirmed'
          then '/admin/api/v1/platforms/' || f.platform_id::text || '/feedback/' || f.id::text
            || '/attachments/' || a.id::text || '/content'
          else null end
      ) order by a.created_at, a.id)
      from public.platform_feedback_attachments a
      where a.feedback_id = f.id and a.status <> 'deleted'), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
        'event_id', e.id,
        'event_type', e.event_type,
        'actor_user_id', e.actor_user_id,
        'note_body', e.note_body,
        'metadata', e.metadata,
        'created_at', e.created_at
      ) order by e.created_at, e.id)
      from public.platform_feedback_events e where e.feedback_id = f.id), '[]'::jsonb),
    f.row_version, f.submitted_at, f.resolved_at, f.delete_requested_at,
    f.created_at, f.updated_at
  from public.platform_feedback f
  where f.platform_id = p_platform_id and f.id = p_feedback_id
    and f.status not in ('draft','deleted');
  if not found then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
end;
$$;

create or replace function private.admin_feedback_attachment_download_authorize(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_feedback_id uuid,
  p_attachment_id uuid
)
returns table (
  attachment_id uuid,
  storage_bucket text,
  storage_path text,
  original_name text,
  mime_type text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
begin
  perform private.billing_admin_assert(p_ctx);
  return query
  select a.id, a.storage_bucket, a.storage_path, a.original_name, a.mime_type
  from public.platform_feedback f
  join public.platform_feedback_attachments a
    on a.platform_id = f.platform_id and a.feedback_id = f.id
  where f.platform_id = p_platform_id and f.id = p_feedback_id
    and f.status in ('new','reviewing','planned','resolved','closed')
    and a.id = p_attachment_id and a.status = 'active'
    and a.write_outcome = 'confirmed' and a.storage_path is not null;
  if not found then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
end;
$$;

create or replace function private.admin_feedback_status_update(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_feedback_id uuid,
  p_expected_row_version bigint,
  p_status text,
  p_reason text
)
returns table (feedback_id uuid, status text, row_version bigint, resolved_at timestamptz, updated_at timestamptz)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_feedback public.platform_feedback;
  v_previous text;
  v_now timestamptz := clock_timestamp();
begin
  perform private.billing_admin_assert(p_ctx);
  if p_platform_id is null or p_feedback_id is null or p_expected_row_version is null
     or p_expected_row_version < 1 or p_status not in ('new','reviewing','planned','resolved','closed')
     or p_reason is null or length(btrim(p_reason)) not between 1 and 2000 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_feedback from public.platform_feedback f
  where f.platform_id = p_platform_id and f.id = p_feedback_id for update;
  if not found or v_feedback.status in ('draft','deleting','deleted') then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  if v_feedback.row_version <> p_expected_row_version then
    raise exception using errcode = '40001', message = 'precondition_failed';
  end if;
  v_previous := v_feedback.status;
  if v_previous = p_status then
    raise exception using errcode = 'P0001', message = 'feedback_status_unchanged';
  end if;
  if not (
    (v_previous = 'new' and p_status in ('reviewing','planned','resolved','closed'))
    or (v_previous = 'reviewing' and p_status in ('new','planned','resolved','closed'))
    or (v_previous = 'planned' and p_status in ('reviewing','resolved','closed'))
    or (v_previous = 'resolved' and p_status in ('reviewing','closed'))
    or (v_previous = 'closed' and p_status = 'reviewing')
  ) then
    raise exception using errcode = 'P0001', message = 'invalid_feedback_transition';
  end if;
  update public.platform_feedback f set
    status = p_status,
    resolved_at = case
      when p_status = 'resolved' then coalesce(f.resolved_at, v_now)
      when p_status = 'closed' then f.resolved_at
      else null
    end,
    row_version = f.row_version + 1
  where f.id = v_feedback.id returning * into v_feedback;
  insert into public.platform_feedback_events(
    platform_id, feedback_id, event_type, actor_user_id, metadata
  ) values (
    p_platform_id, p_feedback_id, 'status_changed', (p_ctx).admin_user_id,
    jsonb_build_object('from', v_previous, 'to', p_status, 'reason', btrim(p_reason))
  );
  perform private.audit_append(
    (p_ctx).request_id, 'admin', (p_ctx).admin_user_id, p_platform_id, v_feedback.platform_account_id,
    'feedback.status_changed', 'platform_feedback', p_feedback_id, null, null,
    jsonb_build_object('from', v_previous, 'to', p_status)
  );
  return query select v_feedback.id, v_feedback.status, v_feedback.row_version,
    v_feedback.resolved_at, v_feedback.updated_at;
end;
$$;

create or replace function private.admin_feedback_labels_replace(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_feedback_id uuid,
  p_expected_row_version bigint,
  p_labels text[]
)
returns table (feedback_id uuid, labels text[], row_version bigint, updated_at timestamptz)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_feedback public.platform_feedback;
  v_labels text[];
begin
  perform private.billing_admin_assert(p_ctx);
  if p_platform_id is null or p_feedback_id is null or p_expected_row_version is null
     or p_expected_row_version < 1 or p_labels is null or cardinality(p_labels) > 10 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select coalesce(array_agg(label order by label), '{}'::text[]) into v_labels
  from (
    select distinct lower(btrim(value)) as label from unnest(p_labels) as t(value)
  ) normalized
  where label <> '';
  if exists (select 1 from unnest(v_labels) x where length(x) > 32 or x ~ '[[:cntrl:]]') then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_feedback from public.platform_feedback f
  where f.platform_id = p_platform_id and f.id = p_feedback_id for update;
  if not found or v_feedback.status in ('draft','deleting','deleted') then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  if v_feedback.row_version <> p_expected_row_version then
    raise exception using errcode = '40001', message = 'precondition_failed';
  end if;
  delete from public.platform_feedback_labels l where l.feedback_id = p_feedback_id;
  insert into public.platform_feedback_labels(platform_id, feedback_id, label)
  select p_platform_id, p_feedback_id, label from unnest(v_labels) label;
  update public.platform_feedback f set row_version = f.row_version + 1
  where f.id = p_feedback_id returning * into v_feedback;
  insert into public.platform_feedback_events(platform_id, feedback_id, event_type, actor_user_id, metadata)
  values (p_platform_id, p_feedback_id, 'labels_changed', (p_ctx).admin_user_id,
    jsonb_build_object('labels', to_jsonb(v_labels)));
  perform private.audit_append(
    (p_ctx).request_id, 'admin', (p_ctx).admin_user_id, p_platform_id, v_feedback.platform_account_id,
    'feedback.labels_changed', 'platform_feedback', p_feedback_id, null, null,
    jsonb_build_object('label_count', cardinality(v_labels))
  );
  return query select p_feedback_id, v_labels, v_feedback.row_version, v_feedback.updated_at;
end;
$$;

create or replace function private.admin_feedback_flag_update(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_feedback_id uuid,
  p_expected_row_version bigint,
  p_flagged boolean,
  p_reason text
)
returns table (feedback_id uuid, flagged boolean, row_version bigint, updated_at timestamptz)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare v_feedback public.platform_feedback;
begin
  perform private.billing_admin_assert(p_ctx);
  if p_platform_id is null or p_feedback_id is null or p_expected_row_version is null
     or p_expected_row_version < 1 or p_flagged is null
     or p_reason is null or length(btrim(p_reason)) not between 1 and 2000 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_feedback from public.platform_feedback f
  where f.platform_id = p_platform_id and f.id = p_feedback_id for update;
  if not found or v_feedback.status in ('draft','deleting','deleted') then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  if v_feedback.row_version <> p_expected_row_version then
    raise exception using errcode = '40001', message = 'precondition_failed';
  end if;
  update public.platform_feedback f set flagged = p_flagged, row_version = f.row_version + 1
  where f.id = p_feedback_id returning * into v_feedback;
  insert into public.platform_feedback_events(platform_id, feedback_id, event_type, actor_user_id, metadata)
  values (p_platform_id, p_feedback_id, 'flag_changed', (p_ctx).admin_user_id,
    jsonb_build_object('flagged', p_flagged, 'reason', btrim(p_reason)));
  perform private.audit_append(
    (p_ctx).request_id, 'admin', (p_ctx).admin_user_id, p_platform_id, v_feedback.platform_account_id,
    'feedback.flag_changed', 'platform_feedback', p_feedback_id, null, null,
    jsonb_build_object('flagged', p_flagged)
  );
  return query select v_feedback.id, v_feedback.flagged, v_feedback.row_version, v_feedback.updated_at;
end;
$$;

create or replace function private.admin_feedback_note_add(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_feedback_id uuid,
  p_note text
)
returns table (event_id uuid, feedback_id uuid, created_at timestamptz)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_feedback public.platform_feedback;
  v_event public.platform_feedback_events;
begin
  perform private.billing_admin_assert(p_ctx);
  if p_platform_id is null or p_feedback_id is null
     or p_note is null or length(btrim(p_note)) not between 1 and 5000 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_feedback from public.platform_feedback f
  where f.platform_id = p_platform_id and f.id = p_feedback_id;
  if not found or v_feedback.status in ('draft','deleting','deleted') then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  insert into public.platform_feedback_events(
    platform_id, feedback_id, event_type, actor_user_id, note_body, metadata
  ) values (
    p_platform_id, p_feedback_id, 'note_added', (p_ctx).admin_user_id, btrim(p_note), '{}'::jsonb
  ) returning * into v_event;
  perform private.audit_append(
    (p_ctx).request_id, 'admin', (p_ctx).admin_user_id, p_platform_id, v_feedback.platform_account_id,
    'feedback.note_added', 'platform_feedback', p_feedback_id, null, null, '{}'::jsonb
  );
  return query select v_event.id, p_feedback_id, v_event.created_at;
end;
$$;

create or replace function private.admin_feedback_batch_delete(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_feedback_ids uuid[],
  p_reason text,
  p_operation_id uuid
)
returns table (feedback_id uuid, status text)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_feedback_id uuid;
  v_status text;
  v_count integer;
begin
  perform private.billing_admin_assert(p_ctx);
  if p_platform_id is null or p_feedback_ids is null or cardinality(p_feedback_ids) not between 1 and 100
     or p_reason is null or length(btrim(p_reason)) not between 1 and 128
     or p_operation_id is null then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select count(*)::integer into v_count from (select distinct x from unnest(p_feedback_ids) x) ids;
  if v_count <> cardinality(p_feedback_ids) then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if exists (
    select 1 from unnest(p_feedback_ids) requested(id)
    left join public.platform_feedback f on f.platform_id = p_platform_id and f.id = requested.id
    where f.id is null or f.status in ('draft','deleted')
  ) then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  foreach v_feedback_id in array p_feedback_ids loop
    perform private.feedback_privacy_delete(v_feedback_id, left('admin:' || btrim(p_reason), 128), clock_timestamp());
    select f.status into v_status from public.platform_feedback f
    where f.platform_id = p_platform_id and f.id = v_feedback_id;
    feedback_id := v_feedback_id;
    status := v_status;
    return next;
  end loop;
  perform private.audit_append(
    (p_ctx).request_id, 'admin', (p_ctx).admin_user_id, p_platform_id, null,
    'feedback.batch_delete_requested', 'platform', p_platform_id, null, null,
    jsonb_build_object('operation_id', p_operation_id, 'feedback_count', v_count)
  );
end;
$$;

create or replace function private.admin_feedback_export_rows(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_feedback_ids uuid[] default null,
  p_query text default null,
  p_status text default null,
  p_category text default null,
  p_label text default null,
  p_user text default null,
  p_email text default null,
  p_has_attachments boolean default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit integer default 5001
)
returns table (
  feedback_id uuid,
  submitted_at timestamptz,
  author_display_name text,
  user_id uuid,
  platform_account_id uuid,
  contact_allowed boolean,
  contact_email text,
  category text,
  status text,
  flagged boolean,
  labels text[],
  attachment_count integer,
  title text,
  body text,
  resolved_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_query text := nullif(btrim(p_query), '');
  v_label text := nullif(lower(btrim(p_label)), '');
  v_user text := nullif(btrim(p_user), '');
  v_email text := nullif(lower(btrim(p_email)), '');
begin
  perform private.billing_admin_assert(p_ctx);
  if p_platform_id is null or p_limit not between 1 and 5001
     or p_feedback_ids is not null and cardinality(p_feedback_ids) > 100
     or p_status is not null and p_status not in ('new','reviewing','planned','resolved','closed','deleting')
     or p_category is not null and p_category not in ('bug','idea','experience','other')
     or p_from is not null and p_to is not null and p_from > p_to then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  return query
  select f.id, f.submitted_at,
    coalesce(f.author_display_name_snapshot, 'Unknown user'::text), f.user_id,
    f.platform_account_id, f.contact_allowed, f.contact_email_snapshot,
    f.category, f.status, f.flagged,
    coalesce((select array_agg(l.label order by l.label)
      from public.platform_feedback_labels l where l.feedback_id = f.id), '{}'::text[]),
    (select count(*)::integer from public.platform_feedback_attachments a
      where a.feedback_id = f.id and a.status not in ('deleted','expired','failed')),
    f.title, f.body, f.resolved_at
  from public.platform_feedback f
  where f.platform_id = p_platform_id and f.status not in ('draft','deleted')
    and (p_feedback_ids is null or f.id = any(p_feedback_ids))
    and (p_status is null or f.status = p_status)
    and (p_category is null or f.category = p_category)
    and (v_label is null or exists (select 1 from public.platform_feedback_labels l
      where l.feedback_id = f.id and lower(l.label) = v_label))
    and (v_user is null
      or f.user_id::text ilike '%' || v_user || '%'
      or f.platform_account_id::text ilike '%' || v_user || '%'
      or coalesce(f.author_display_name_snapshot, '') ilike '%' || v_user || '%')
    and (v_email is null or lower(coalesce(f.contact_email_snapshot, '')) ilike '%' || v_email || '%')
    and (p_has_attachments is null or p_has_attachments = exists (
      select 1 from public.platform_feedback_attachments a
      where a.feedback_id = f.id and a.status not in ('deleted','expired','failed')))
    and (p_from is null or coalesce(f.submitted_at, f.created_at) >= p_from)
    and (p_to is null or coalesce(f.submitted_at, f.created_at) <= p_to)
    and (v_query is null
      or coalesce(f.title, '') ilike '%' || v_query || '%'
      or coalesce(f.body, '') ilike '%' || v_query || '%'
      or coalesce(f.author_display_name_snapshot, '') ilike '%' || v_query || '%'
      or coalesce(f.contact_email_snapshot, '') ilike '%' || v_query || '%')
  order by coalesce(f.submitted_at, f.created_at) desc, f.id desc
  limit p_limit;
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
  pending_config_reviews bigint,
  pending_feedback bigint
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
      and s.started_at <= v_now and (s.current_period_end is null or s.current_period_end > v_now)
  ), order_metrics as (
    select
      count(*) filter (where o.created_at >= v_period_start and o.created_at < v_now)::bigint as orders,
      count(*) filter (where o.created_at >= v_previous_start and o.created_at < v_period_start)::bigint as previous_orders,
      count(*) filter (where o.created_at >= v_period_start and o.created_at < v_now and o.entitlement_status = 'granted')::bigint as granted_orders,
      count(*) filter (where o.created_at >= v_previous_start and o.created_at < v_period_start and o.entitlement_status = 'granted')::bigint as previous_granted_orders,
      count(*) filter (where o.created_at >= v_period_start and o.created_at < v_now and (
        o.linkage_status = 'ambiguous' or o.entitlement_status = 'blocked'
        or (o.provider_paid_at is not null and o.verification_status <> 'verified' and o.resolution_status = 'open')
        or exists (select 1 from public.billing_processing_jobs j where j.billing_order_id = o.id and j.state in ('retryable','manual_review'))
      ))::bigint as attention_orders,
      count(*) filter (where o.created_at >= v_previous_start and o.created_at < v_period_start and (
        o.linkage_status = 'ambiguous' or o.entitlement_status = 'blocked'
        or (o.provider_paid_at is not null and o.verification_status <> 'verified' and o.resolution_status = 'open')
        or exists (select 1 from public.billing_processing_jobs j where j.billing_order_id = o.id and j.state in ('retryable','manual_review'))
      ))::bigint as previous_attention_orders
    from public.billing_orders o
    where o.platform_id = p_platform_id and o.created_at >= v_previous_start and o.created_at < v_now
  ), review_metrics as (
    select count(*)::bigint as pending_config_reviews
    from public.platform_config_gallery_submissions s
    where s.platform_id = p_platform_id and s.status = 'pending'
  ), feedback_metrics as (
    select count(*)::bigint as pending_feedback
    from public.platform_feedback f
    where f.platform_id = p_platform_id and f.status in ('new','reviewing')
  )
  select p_platform_id, p_days, v_period_start, v_now, v_previous_start,
    a.total_accounts, a.active_accounts, a.suspended_accounts, a.closed_accounts,
    a.new_accounts, a.previous_new_accounts,
    a.period_closed_accounts, a.previous_closed_accounts,
    a.new_accounts - a.period_closed_accounts,
    a.previous_new_accounts - a.previous_closed_accounts,
    paid.active_paid_accounts,
    o.orders, o.previous_orders, o.granted_orders, o.previous_granted_orders,
    o.attention_orders, o.previous_attention_orders, r.pending_config_reviews, f.pending_feedback
  from account_metrics a cross join paid_metrics paid cross join order_metrics o
  cross join review_metrics r cross join feedback_metrics f;
end;
$$;

alter function private.admin_feedback_list(private.admin_context, uuid, uuid, integer, text, text, text, text, text, text, boolean, timestamptz, timestamptz) owner to domain_owner;
alter function private.admin_feedback_read(private.admin_context, uuid, uuid) owner to domain_owner;
alter function private.admin_feedback_attachment_download_authorize(private.admin_context, uuid, uuid, uuid) owner to domain_owner;
alter function private.admin_feedback_status_update(private.admin_context, uuid, uuid, bigint, text, text) owner to domain_owner;
alter function private.admin_feedback_labels_replace(private.admin_context, uuid, uuid, bigint, text[]) owner to domain_owner;
alter function private.admin_feedback_flag_update(private.admin_context, uuid, uuid, bigint, boolean, text) owner to domain_owner;
alter function private.admin_feedback_note_add(private.admin_context, uuid, uuid, text) owner to domain_owner;
alter function private.admin_feedback_batch_delete(private.admin_context, uuid, uuid[], text, uuid) owner to domain_owner;
alter function private.admin_feedback_export_rows(private.admin_context, uuid, uuid[], text, text, text, text, text, text, boolean, timestamptz, timestamptz, integer) owner to domain_owner;
alter function private.admin_platform_overview(private.admin_context, uuid, integer) owner to domain_owner;

revoke all on function private.admin_feedback_list(private.admin_context, uuid, uuid, integer, text, text, text, text, text, text, boolean, timestamptz, timestamptz),
  private.admin_feedback_read(private.admin_context, uuid, uuid),
  private.admin_feedback_attachment_download_authorize(private.admin_context, uuid, uuid, uuid),
  private.admin_feedback_status_update(private.admin_context, uuid, uuid, bigint, text, text),
  private.admin_feedback_labels_replace(private.admin_context, uuid, uuid, bigint, text[]),
  private.admin_feedback_flag_update(private.admin_context, uuid, uuid, bigint, boolean, text),
  private.admin_feedback_note_add(private.admin_context, uuid, uuid, text),
  private.admin_feedback_batch_delete(private.admin_context, uuid, uuid[], text, uuid),
  private.admin_feedback_export_rows(private.admin_context, uuid, uuid[], text, text, text, text, text, text, boolean, timestamptz, timestamptz, integer),
  private.admin_platform_overview(private.admin_context, uuid, integer)
from public, anon, authenticated, account_executor, job_executor, recovery_executor;

grant execute on function private.admin_feedback_list(private.admin_context, uuid, uuid, integer, text, text, text, text, text, text, boolean, timestamptz, timestamptz),
  private.admin_feedback_read(private.admin_context, uuid, uuid),
  private.admin_feedback_attachment_download_authorize(private.admin_context, uuid, uuid, uuid),
  private.admin_feedback_status_update(private.admin_context, uuid, uuid, bigint, text, text),
  private.admin_feedback_labels_replace(private.admin_context, uuid, uuid, bigint, text[]),
  private.admin_feedback_flag_update(private.admin_context, uuid, uuid, bigint, boolean, text),
  private.admin_feedback_note_add(private.admin_context, uuid, uuid, text),
  private.admin_feedback_batch_delete(private.admin_context, uuid, uuid[], text, uuid),
  private.admin_feedback_export_rows(private.admin_context, uuid, uuid[], text, text, text, text, text, text, boolean, timestamptz, timestamptz, integer),
  private.admin_platform_overview(private.admin_context, uuid, integer)
to admin_executor;
