-- OPT-008 Phase 01: Feedback account and cleanup domain boundaries.

create or replace function private.feedback_client_context_valid(p_value jsonb)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select p_value is not null
    and jsonb_typeof(p_value) = 'object'
    and not exists (
      select 1 from jsonb_object_keys(p_value) as k(key)
      where k.key not in ('app_version', 'route', 'locale', 'timezone', 'os', 'browser')
    )
    and not exists (
      select 1 from jsonb_each(p_value) as e(key, value)
      where jsonb_typeof(e.value) <> 'string'
        or length(e.value #>> '{}') > case when e.key = 'route' then 512 else 256 end
    )
$$;

create or replace function private.feedback_account_id(
  p_ctx private.account_context,
  p_allow_suspended boolean default false
)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_principal record;
begin
  if (p_ctx).user_id is null or (p_ctx).session_id is null
     or (p_ctx).platform_id is null or (p_ctx).platform_key_id is null
     or (p_ctx).request_id is null then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_principal from private.account_principal(p_ctx);
  if v_principal.authorization <> 'allowed'
     and not (p_allow_suspended and v_principal.authorization = 'suspended') then
    raise exception using errcode = '42501', message = v_principal.authorization;
  end if;
  if v_principal.platform_account_id is null then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  return v_principal.platform_account_id;
end;
$$;

create or replace function private.feedback_create(
  p_ctx private.account_context,
  p_category text,
  p_title text,
  p_body text,
  p_contact_allowed boolean,
  p_client_context jsonb,
  p_idempotency_key text
)
returns table (
  feedback_id uuid, status text, category text, title text,
  row_version bigint, created_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_account_id uuid;
  v_feedback public.platform_feedback;
  v_claim private.idempotency_keys%rowtype;
  v_new_claim boolean := false;
  v_hash bytea;
  v_response jsonb;
begin
  if p_category not in ('bug', 'idea', 'experience', 'other')
     or p_title is null or length(p_title) not between 1 and 160 or p_title ~ '[[:cntrl:]]'
     or p_body is null or length(p_body) not between 1 and 10000
     or p_contact_allowed is null
     or not private.feedback_client_context_valid(coalesce(p_client_context, '{}'::jsonb))
     or p_idempotency_key is null or length(p_idempotency_key) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  v_account_id := private.feedback_account_id(p_ctx, false);
  perform 1 from public.platform_accounts a
    where a.platform_id = (p_ctx).platform_id and a.id = v_account_id for update;

  v_hash := extensions.digest(convert_to(
    p_category || ':' || p_title || ':' || p_body || ':' || p_contact_allowed::text
      || ':' || coalesce(p_client_context, '{}'::jsonb)::text,
    'utf8'), 'sha256');
  insert into private.idempotency_keys (
    platform_id, platform_account_id, operation, actor_scope, idempotency_key, request_hash
  ) values (
    (p_ctx).platform_id, v_account_id, 'feedback_create',
    'user:' || (p_ctx).user_id::text, p_idempotency_key, v_hash
  ) on conflict (platform_id, platform_account_id, operation, actor_scope, idempotency_key)
    do nothing returning true into v_new_claim;
  if not coalesce(v_new_claim, false) then
    select * into v_claim from private.idempotency_keys i
    where i.platform_id = (p_ctx).platform_id and i.platform_account_id = v_account_id
      and i.operation = 'feedback_create'
      and i.actor_scope = 'user:' || (p_ctx).user_id::text
      and i.idempotency_key = p_idempotency_key for update;
    if v_claim.request_hash <> v_hash then
      raise exception using errcode = '23505', message = 'idempotency_conflict';
    end if;
    if v_claim.state = 'completed' then
      return query select
        (v_claim.response_body->>'feedback_id')::uuid,
        v_claim.response_body->>'status',
        v_claim.response_body->>'category',
        p_title,
        (v_claim.response_body->>'row_version')::bigint,
        (v_claim.response_body->>'created_at')::timestamptz;
      return;
    end if;
    raise exception using errcode = 'P0001', message = 'operation_in_progress';
  end if;

  insert into public.platform_feedback (
    platform_id, platform_account_id, user_id, category, title, body,
    contact_allowed, client_context
  ) values (
    (p_ctx).platform_id, v_account_id, (p_ctx).user_id, p_category,
    p_title, p_body, p_contact_allowed, coalesce(p_client_context, '{}'::jsonb)
  ) returning * into v_feedback;
  perform private.audit_append(
    (p_ctx).request_id, 'user', (p_ctx).user_id, (p_ctx).platform_id, v_account_id,
    'feedback.draft_created', 'platform_feedback', v_feedback.id, null, null,
    jsonb_build_object('category', p_category, 'contact_allowed', p_contact_allowed)
  );
  v_response := jsonb_build_object(
    'feedback_id', v_feedback.id, 'status', v_feedback.status,
    'category', v_feedback.category, 'row_version', v_feedback.row_version,
    'created_at', v_feedback.created_at
  );
  perform private.idempotency_finalize(
    (p_ctx).platform_id, v_account_id, 'feedback_create',
    'user:' || (p_ctx).user_id::text, p_idempotency_key, v_hash, 201, v_response
  );
  return query select v_feedback.id, v_feedback.status, v_feedback.category,
    v_feedback.title, v_feedback.row_version, v_feedback.created_at;
end;
$$;

create or replace function private.feedback_list(
  p_ctx private.account_context,
  p_cursor_feedback_id uuid default null,
  p_limit integer default 20
)
returns table (
  feedback_id uuid, category text, title text, status text, flagged boolean,
  contact_allowed boolean, attachment_count integer, row_version bigint,
  submitted_at timestamptz, created_at timestamptz, updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_account_id uuid;
  v_cursor_created_at timestamptz;
begin
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  v_account_id := private.feedback_account_id(p_ctx, false);
  if p_cursor_feedback_id is not null then
    select f.created_at into v_cursor_created_at
    from public.platform_feedback f
    where f.id = p_cursor_feedback_id and f.platform_id = (p_ctx).platform_id
      and f.platform_account_id = v_account_id and f.status not in ('deleting', 'deleted');
    if v_cursor_created_at is null then
      raise exception using errcode = 'P0002', message = 'resource_not_found';
    end if;
  end if;
  return query
    select f.id, f.category, f.title, f.status, f.flagged, f.contact_allowed,
      (select count(*)::integer from public.platform_feedback_attachments a
       where a.feedback_id = f.id and a.status not in ('deleted', 'expired', 'failed')),
      f.row_version, f.submitted_at, f.created_at, f.updated_at
    from public.platform_feedback f
    where f.platform_id = (p_ctx).platform_id and f.platform_account_id = v_account_id
      and f.status not in ('deleting', 'deleted')
      and (p_cursor_feedback_id is null
        or (f.created_at, f.id) < (v_cursor_created_at, p_cursor_feedback_id))
    order by f.created_at desc, f.id desc
    limit p_limit;
end;
$$;

create or replace function private.feedback_read(
  p_ctx private.account_context,
  p_feedback_id uuid
)
returns table (
  feedback_id uuid, category text, title text, body text, status text,
  contact_allowed boolean, client_context jsonb, flagged boolean,
  row_version bigint, submitted_at timestamptz, created_at timestamptz, updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare v_account_id uuid;
begin
  if p_feedback_id is null then raise exception using errcode = '22023', message = 'invalid_input'; end if;
  v_account_id := private.feedback_account_id(p_ctx, false);
  return query select f.id, f.category, f.title, f.body, f.status,
    f.contact_allowed, f.client_context, f.flagged, f.row_version,
    f.submitted_at, f.created_at, f.updated_at
  from public.platform_feedback f
  where f.id = p_feedback_id and f.platform_id = (p_ctx).platform_id
    and f.platform_account_id = v_account_id and f.status not in ('deleting', 'deleted');
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
end;
$$;

create or replace function private.feedback_patch(
  p_ctx private.account_context,
  p_feedback_id uuid,
  p_expected_row_version bigint,
  p_category text,
  p_title text,
  p_body text,
  p_contact_allowed boolean,
  p_client_context jsonb
)
returns table (feedback_id uuid, status text, row_version bigint, updated_at timestamptz)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_account_id uuid;
  v_feedback public.platform_feedback;
begin
  if p_feedback_id is null or p_expected_row_version is null or p_expected_row_version < 1
     or p_category not in ('bug', 'idea', 'experience', 'other')
     or p_title is null or length(p_title) not between 1 and 160 or p_title ~ '[[:cntrl:]]'
     or p_body is null or length(p_body) not between 1 and 10000
     or p_contact_allowed is null
     or not private.feedback_client_context_valid(coalesce(p_client_context, '{}'::jsonb)) then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  v_account_id := private.feedback_account_id(p_ctx, false);
  select * into v_feedback from public.platform_feedback f
  where f.id = p_feedback_id and f.platform_id = (p_ctx).platform_id
    and f.platform_account_id = v_account_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  if v_feedback.status <> 'draft' then raise exception using errcode = 'P0001', message = 'feedback_not_editable'; end if;
  if v_feedback.row_version <> p_expected_row_version then raise exception using errcode = '40001', message = 'precondition_failed'; end if;
  update public.platform_feedback f set
    category = p_category, title = p_title, body = p_body,
    contact_allowed = p_contact_allowed, client_context = coalesce(p_client_context, '{}'::jsonb),
    row_version = f.row_version + 1
  where f.id = v_feedback.id returning * into v_feedback;
  return query select v_feedback.id, v_feedback.status, v_feedback.row_version, v_feedback.updated_at;
end;
$$;

create or replace function private.feedback_attachment_intent_create(
  p_ctx private.account_context,
  p_feedback_id uuid,
  p_original_name text,
  p_requested_size_bytes bigint,
  p_mime_type text,
  p_idempotency_key text
)
returns table (
  attachment_id uuid, feedback_id uuid, status text, write_outcome text,
  requested_size_bytes bigint, intent_expires_at timestamptz, storage_path text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_account_id uuid;
  v_feedback public.platform_feedback;
  v_attachment public.platform_feedback_attachments;
  v_claim private.idempotency_keys%rowtype;
  v_new_claim boolean := false;
  v_hash bytea;
  v_response jsonb;
  v_live_count integer;
  v_live_bytes bigint;
  v_path text;
  v_now timestamptz := clock_timestamp();
begin
  if p_feedback_id is null or p_original_name is null
     or length(p_original_name) not between 1 and 255 or p_original_name ~ '[[:cntrl:]]'
     or p_requested_size_bytes is null or p_requested_size_bytes not between 1 and 4194304
     or p_mime_type not in ('image/jpeg', 'image/png', 'image/webp')
     or p_idempotency_key is null or length(p_idempotency_key) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  v_account_id := private.feedback_account_id(p_ctx, false);
  perform 1 from public.platform_accounts a
    where a.platform_id = (p_ctx).platform_id and a.id = v_account_id for update;
  select * into v_feedback from public.platform_feedback f
  where f.id = p_feedback_id and f.platform_id = (p_ctx).platform_id
    and f.platform_account_id = v_account_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  if v_feedback.status <> 'draft' then raise exception using errcode = 'P0001', message = 'feedback_not_editable'; end if;

  v_hash := extensions.digest(convert_to(
    p_feedback_id::text || ':' || p_original_name || ':' || p_requested_size_bytes::text || ':' || p_mime_type,
    'utf8'), 'sha256');
  insert into private.idempotency_keys (
    platform_id, platform_account_id, operation, actor_scope, idempotency_key, request_hash
  ) values (
    (p_ctx).platform_id, v_account_id, 'feedback_attachment_intent',
    'user:' || (p_ctx).user_id::text, p_idempotency_key, v_hash
  ) on conflict (platform_id, platform_account_id, operation, actor_scope, idempotency_key)
    do nothing returning true into v_new_claim;
  if not coalesce(v_new_claim, false) then
    select * into v_claim from private.idempotency_keys i
    where i.platform_id = (p_ctx).platform_id and i.platform_account_id = v_account_id
      and i.operation = 'feedback_attachment_intent'
      and i.actor_scope = 'user:' || (p_ctx).user_id::text
      and i.idempotency_key = p_idempotency_key for update;
    if v_claim.request_hash <> v_hash then raise exception using errcode = '23505', message = 'idempotency_conflict'; end if;
    if v_claim.state = 'completed' then
      return query select (v_claim.response_body->>'attachment_id')::uuid,
        (v_claim.response_body->>'feedback_id')::uuid, v_claim.response_body->>'status',
        v_claim.response_body->>'write_outcome',
        (v_claim.response_body->>'requested_size_bytes')::bigint,
        (v_claim.response_body->>'intent_expires_at')::timestamptz,
        v_claim.response_body->>'storage_path';
      return;
    end if;
    raise exception using errcode = 'P0001', message = 'operation_in_progress';
  end if;

  select count(*)::integer, coalesce(sum(a.requested_size_bytes), 0)::bigint
    into v_live_count, v_live_bytes
  from public.platform_feedback_attachments a
  where a.feedback_id = v_feedback.id
    and a.status not in ('deleted', 'expired', 'failed');
  if v_live_count >= 5 then raise exception using errcode = 'P0001', message = 'feedback_attachment_limit_exceeded'; end if;
  if v_live_bytes + p_requested_size_bytes > 12582912 then
    raise exception using errcode = 'P0001', message = 'feedback_attachment_bytes_exceeded';
  end if;

  v_attachment.id := gen_random_uuid();
  v_path := (p_ctx).platform_id::text || '/' || v_account_id::text || '/'
    || v_feedback.id::text || '/' || v_attachment.id::text;
  insert into public.platform_feedback_attachments (
    id, feedback_id, platform_id, platform_account_id, original_name,
    storage_path, object_path_hash, mime_type, requested_size_bytes,
    intent_expires_at, next_attempt_at
  ) values (
    v_attachment.id, v_feedback.id, (p_ctx).platform_id, v_account_id,
    p_original_name, v_path,
    encode(extensions.digest(convert_to(v_path, 'utf8'), 'sha256'), 'hex'),
    p_mime_type, p_requested_size_bytes, v_now + interval '10 minutes', v_now
  ) returning * into v_attachment;
  perform private.audit_append(
    (p_ctx).request_id, 'user', (p_ctx).user_id, (p_ctx).platform_id, v_account_id,
    'feedback.attachment_intent_created', 'platform_feedback', v_feedback.id, null, null,
    jsonb_build_object('attachment_id', v_attachment.id,
      'requested_size_bytes', p_requested_size_bytes, 'mime_type', p_mime_type)
  );
  v_response := jsonb_build_object(
    'attachment_id', v_attachment.id, 'feedback_id', v_feedback.id,
    'status', v_attachment.status, 'write_outcome', v_attachment.write_outcome,
    'requested_size_bytes', v_attachment.requested_size_bytes,
    'intent_expires_at', v_attachment.intent_expires_at, 'storage_path', v_attachment.storage_path
  );
  perform private.idempotency_finalize(
    (p_ctx).platform_id, v_account_id, 'feedback_attachment_intent',
    'user:' || (p_ctx).user_id::text, p_idempotency_key, v_hash, 201, v_response
  );
  return query select v_attachment.id, v_feedback.id, v_attachment.status,
    v_attachment.write_outcome, v_attachment.requested_size_bytes,
    v_attachment.intent_expires_at, v_attachment.storage_path;
end;
$$;

create or replace function private.feedback_attachment_list(
  p_ctx private.account_context,
  p_feedback_id uuid
)
returns table (
  attachment_id uuid, status text, write_outcome text, original_name text,
  mime_type text, requested_size_bytes bigint, actual_size_bytes bigint,
  sha256 text, created_at timestamptz, updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare v_account_id uuid;
begin
  v_account_id := private.feedback_account_id(p_ctx, false);
  if not exists (select 1 from public.platform_feedback f
    where f.id = p_feedback_id and f.platform_id = (p_ctx).platform_id
      and f.platform_account_id = v_account_id and f.status not in ('deleting', 'deleted')) then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  return query select a.id, a.status, a.write_outcome, a.original_name,
    a.mime_type, a.requested_size_bytes, a.actual_size_bytes, a.sha256,
    a.created_at, a.updated_at
  from public.platform_feedback_attachments a
  where a.feedback_id = p_feedback_id and a.platform_id = (p_ctx).platform_id
    and a.platform_account_id = v_account_id and a.status <> 'deleted'
  order by a.created_at, a.id;
end;
$$;

create or replace function private.feedback_attachment_receive_claim(
  p_ctx private.account_context,
  p_attachment_id uuid,
  p_lease_owner text,
  p_lease_seconds integer default 15
)
returns table (
  attachment_id uuid, feedback_id uuid, status text, write_outcome text,
  requested_size_bytes bigint, lease_until timestamptz, fencing_token bigint,
  storage_path text, mime_type text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_account_id uuid;
  v_attachment public.platform_feedback_attachments;
  v_feedback public.platform_feedback;
  v_now timestamptz := clock_timestamp();
begin
  if p_attachment_id is null or p_lease_owner is null or length(p_lease_owner) not between 1 and 128
     or p_lease_seconds not between 1 and 15 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  v_account_id := private.feedback_account_id(p_ctx, false);
  select * into v_attachment from public.platform_feedback_attachments a
  where a.id = p_attachment_id and a.platform_id = (p_ctx).platform_id
    and a.platform_account_id = v_account_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  select * into v_feedback from public.platform_feedback f where f.id = v_attachment.feedback_id for update;
  if v_feedback.status <> 'draft' then raise exception using errcode = 'P0001', message = 'feedback_not_editable'; end if;
  if v_attachment.status <> 'pending' then raise exception using errcode = 'P0001', message = 'operation_in_progress'; end if;
  if v_attachment.intent_expires_at <= v_now then raise exception using errcode = 'P0001', message = 'intent_expired'; end if;
  if v_attachment.lease_until is not null and v_attachment.lease_until > v_now then
    raise exception using errcode = 'P0001', message = 'operation_in_progress';
  end if;
  update public.platform_feedback_attachments a set
    status = 'receiving', lease_owner = p_lease_owner,
    lease_until = v_now + make_interval(secs => p_lease_seconds),
    fencing_token = a.fencing_token + 1
  where a.id = v_attachment.id returning * into v_attachment;
  return query select v_attachment.id, v_attachment.feedback_id, v_attachment.status,
    v_attachment.write_outcome, v_attachment.requested_size_bytes,
    v_attachment.lease_until, v_attachment.fencing_token,
    v_attachment.storage_path, v_attachment.mime_type;
end;
$$;

create or replace function private.feedback_attachment_prepare_store(
  p_ctx private.account_context,
  p_attachment_id uuid,
  p_actual_size_bytes bigint,
  p_sha256 text,
  p_idempotency_key text
)
returns table (
  attachment_id uuid, status text, write_outcome text, actual_size_bytes bigint,
  sha256 text, storage_path text, write_attempt_id uuid
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_account_id uuid;
  v_attachment public.platform_feedback_attachments;
  v_attempt private.feedback_attachment_write_attempts;
  v_claim private.idempotency_keys%rowtype;
  v_hash bytea;
  v_new_claim boolean := false;
  v_response jsonb;
begin
  if p_attachment_id is null or p_actual_size_bytes is null or p_actual_size_bytes not between 1 and 4194304
     or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$'
     or p_idempotency_key is null or length(p_idempotency_key) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  v_account_id := private.feedback_account_id(p_ctx, false);
  select * into v_attachment from public.platform_feedback_attachments a
  where a.id = p_attachment_id and a.platform_id = (p_ctx).platform_id
    and a.platform_account_id = v_account_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  if not exists (select 1 from public.platform_feedback f where f.id = v_attachment.feedback_id and f.status = 'draft') then
    raise exception using errcode = 'P0001', message = 'feedback_not_editable';
  end if;
  if v_attachment.status <> 'receiving' or v_attachment.lease_until is null
     or v_attachment.lease_until <= clock_timestamp() then
    raise exception using errcode = 'P0001', message = 'operation_in_progress';
  end if;
  if p_actual_size_bytes > v_attachment.requested_size_bytes then
    raise exception using errcode = '22023', message = 'upload_size_mismatch';
  end if;

  v_hash := extensions.digest(convert_to(
    p_attachment_id::text || ':' || p_actual_size_bytes::text || ':' || p_sha256,
    'utf8'), 'sha256');
  insert into private.idempotency_keys (
    platform_id, platform_account_id, operation, actor_scope, idempotency_key, request_hash
  ) values (
    (p_ctx).platform_id, v_account_id, 'feedback_attachment_prepare_store',
    'user:' || (p_ctx).user_id::text, p_idempotency_key, v_hash
  ) on conflict (platform_id, platform_account_id, operation, actor_scope, idempotency_key)
    do nothing returning true into v_new_claim;
  if not coalesce(v_new_claim, false) then
    select * into v_claim from private.idempotency_keys i
    where i.platform_id = (p_ctx).platform_id and i.platform_account_id = v_account_id
      and i.operation = 'feedback_attachment_prepare_store'
      and i.actor_scope = 'user:' || (p_ctx).user_id::text
      and i.idempotency_key = p_idempotency_key for update;
    if v_claim.request_hash <> v_hash then raise exception using errcode = '23505', message = 'idempotency_conflict'; end if;
    if v_claim.state = 'completed' then
      return query select (v_claim.response_body->>'attachment_id')::uuid,
        v_claim.response_body->>'status', v_claim.response_body->>'write_outcome',
        (v_claim.response_body->>'actual_size_bytes')::bigint,
        v_claim.response_body->>'sha256', v_claim.response_body->>'storage_path',
        (v_claim.response_body->>'write_attempt_id')::uuid;
      return;
    end if;
    raise exception using errcode = 'P0001', message = 'operation_in_progress';
  end if;

  insert into private.feedback_attachment_write_attempts (
    platform_id, attachment_id, fencing_token, actual_size_bytes, sha256
  ) values (
    (p_ctx).platform_id, v_attachment.id, v_attachment.fencing_token,
    p_actual_size_bytes, p_sha256
  ) returning * into v_attempt;
  update public.platform_feedback_attachments a set
    status = 'storing', write_outcome = 'in_flight',
    actual_size_bytes = p_actual_size_bytes, sha256 = p_sha256
  where a.id = v_attachment.id returning * into v_attachment;
  v_response := jsonb_build_object(
    'attachment_id', v_attachment.id, 'status', v_attachment.status,
    'write_outcome', v_attachment.write_outcome, 'actual_size_bytes', p_actual_size_bytes,
    'sha256', p_sha256, 'storage_path', v_attachment.storage_path,
    'write_attempt_id', v_attempt.id
  );
  perform private.idempotency_finalize(
    (p_ctx).platform_id, v_account_id, 'feedback_attachment_prepare_store',
    'user:' || (p_ctx).user_id::text, p_idempotency_key, v_hash, 200, v_response
  );
  return query select v_attachment.id, v_attachment.status, v_attachment.write_outcome,
    v_attachment.actual_size_bytes, v_attachment.sha256, v_attachment.storage_path, v_attempt.id;
end;
$$;

create or replace function private.feedback_attachment_mark_unknown(
  p_ctx private.account_context,
  p_attachment_id uuid,
  p_attempt_id uuid,
  p_error_code text
)
returns table (attachment_id uuid, status text, write_outcome text, write_attempt_id uuid)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_account_id uuid;
  v_attachment public.platform_feedback_attachments;
  v_attempt private.feedback_attachment_write_attempts;
begin
  if p_attachment_id is null or p_attempt_id is null or p_error_code is null
     or length(p_error_code) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  v_account_id := private.feedback_account_id(p_ctx, true);
  select * into v_attachment from public.platform_feedback_attachments a
  where a.id = p_attachment_id and a.platform_id = (p_ctx).platform_id
    and a.platform_account_id = v_account_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  select * into v_attempt from private.feedback_attachment_write_attempts w
  where w.id = p_attempt_id and w.attachment_id = v_attachment.id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  if v_attempt.state = 'unknown' then
    return query select v_attachment.id, v_attachment.status, v_attachment.write_outcome, v_attempt.id;
    return;
  end if;
  if v_attachment.status <> 'storing' or v_attachment.write_outcome <> 'in_flight'
     or v_attempt.state <> 'in_flight' then
    raise exception using errcode = 'P0001', message = 'operation_in_progress';
  end if;
  update private.feedback_attachment_write_attempts set state = 'unknown', error_code = p_error_code
  where id = v_attempt.id returning * into v_attempt;
  update public.platform_feedback_attachments set write_outcome = 'unknown', last_error_code = p_error_code
  where id = v_attachment.id returning * into v_attachment;
  return query select v_attachment.id, v_attachment.status, v_attachment.write_outcome, v_attempt.id;
end;
$$;

create or replace function private.feedback_attachment_finalize(
  p_ctx private.account_context,
  p_attachment_id uuid,
  p_attempt_id uuid,
  p_actual_size_bytes bigint,
  p_sha256 text,
  p_provider_request_id text default null
)
returns table (attachment_id uuid, status text, write_outcome text, uploaded_at timestamptz)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_account_id uuid;
  v_attachment public.platform_feedback_attachments;
  v_attempt private.feedback_attachment_write_attempts;
  v_now timestamptz := clock_timestamp();
begin
  if p_attachment_id is null or p_attempt_id is null
     or p_actual_size_bytes not between 1 and 4194304
     or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$'
     or p_provider_request_id is not null and length(p_provider_request_id) not between 1 and 256 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  v_account_id := private.feedback_account_id(p_ctx, true);
  select * into v_attachment from public.platform_feedback_attachments a
  where a.id = p_attachment_id and a.platform_id = (p_ctx).platform_id
    and a.platform_account_id = v_account_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  select * into v_attempt from private.feedback_attachment_write_attempts w
  where w.id = p_attempt_id and w.attachment_id = v_attachment.id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  if v_attempt.state = 'confirmed' and v_attachment.status = 'active' then
    if v_attempt.actual_size_bytes <> p_actual_size_bytes or v_attempt.sha256 <> p_sha256 then
      raise exception using errcode = 'P0001', message = 'file_content_conflict';
    end if;
    return query select v_attachment.id, v_attachment.status, v_attachment.write_outcome, v_attachment.uploaded_at;
    return;
  end if;
  if v_attachment.status <> 'storing' or v_attachment.write_outcome not in ('in_flight', 'unknown')
     or v_attempt.state not in ('in_flight', 'unknown')
     or v_attempt.actual_size_bytes <> p_actual_size_bytes or v_attempt.sha256 <> p_sha256 then
    raise exception using errcode = 'P0001', message = 'operation_in_progress';
  end if;
  update private.feedback_attachment_write_attempts set
    state = 'confirmed', settled_at = v_now, provider_request_id = p_provider_request_id,
    error_code = null
  where id = v_attempt.id;
  update public.platform_feedback_attachments set
    status = 'active', write_outcome = 'confirmed', uploaded_at = v_now,
    lease_owner = null, lease_until = null, last_error_code = null
  where id = v_attachment.id returning * into v_attachment;
  return query select v_attachment.id, v_attachment.status, v_attachment.write_outcome, v_attachment.uploaded_at;
end;
$$;

create or replace function private.feedback_attachment_cancel(
  p_ctx private.account_context,
  p_attachment_id uuid
)
returns table (attachment_id uuid, status text, write_outcome text, deleted_at timestamptz)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_account_id uuid;
  v_attachment public.platform_feedback_attachments;
  v_feedback public.platform_feedback;
  v_now timestamptz := clock_timestamp();
begin
  v_account_id := private.feedback_account_id(p_ctx, false);
  select * into v_attachment from public.platform_feedback_attachments a
  where a.id = p_attachment_id and a.platform_id = (p_ctx).platform_id
    and a.platform_account_id = v_account_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  select * into v_feedback from public.platform_feedback f where f.id = v_attachment.feedback_id for update;
  if v_feedback.status <> 'draft' then raise exception using errcode = 'P0001', message = 'feedback_not_editable'; end if;
  if v_attachment.status = 'deleted' then
    return query select v_attachment.id, v_attachment.status, v_attachment.write_outcome, v_attachment.deleted_at;
    return;
  end if;
  if v_attachment.status in ('pending', 'receiving') and v_attachment.write_outcome = 'not_started'
     and not exists (select 1 from private.feedback_attachment_write_attempts w where w.attachment_id = v_attachment.id)
     and (v_attachment.lease_until is null or v_attachment.lease_until <= v_now) then
    update public.platform_feedback_attachments set
      status = 'deleted', deleted_at = v_now, storage_path = null,
      original_name = '[deleted]', platform_account_id = null,
      cancel_requested_at = v_now, delete_requested_at = v_now
    where id = v_attachment.id returning * into v_attachment;
  elsif v_attachment.status not in ('deleting', 'deleted') then
    update public.platform_feedback_attachments set
      status = 'deleting', cancel_requested_at = coalesce(cancel_requested_at, v_now),
      delete_requested_at = coalesce(delete_requested_at, v_now),
      next_attempt_at = greatest(v_now, coalesce(lease_until, v_now))
    where id = v_attachment.id returning * into v_attachment;
  end if;
  return query select v_attachment.id, v_attachment.status, v_attachment.write_outcome, v_attachment.deleted_at;
end;
$$;

create or replace function private.feedback_submit(
  p_ctx private.account_context,
  p_feedback_id uuid,
  p_contact_email_snapshot text
)
returns table (feedback_id uuid, status text, row_version bigint, submitted_at timestamptz)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_account_id uuid;
  v_feedback public.platform_feedback;
  v_display_name text;
  v_attachment_count integer;
  v_now timestamptz := clock_timestamp();
begin
  if p_feedback_id is null or p_contact_email_snapshot is not null
     and length(p_contact_email_snapshot) not between 3 and 320 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  v_account_id := private.feedback_account_id(p_ctx, false);
  select * into v_feedback from public.platform_feedback f
  where f.id = p_feedback_id and f.platform_id = (p_ctx).platform_id
    and f.platform_account_id = v_account_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  if v_feedback.status = 'new' then
    return query select v_feedback.id, v_feedback.status, v_feedback.row_version, v_feedback.submitted_at;
    return;
  end if;
  if v_feedback.status <> 'draft' then raise exception using errcode = 'P0001', message = 'feedback_not_editable'; end if;
  if v_feedback.contact_allowed and p_contact_email_snapshot is null then
    raise exception using errcode = '22023', message = 'contact_email_required';
  end if;
  if exists (
    select 1 from public.platform_feedback_attachments a
    where a.feedback_id = v_feedback.id and a.status not in ('active', 'deleted', 'expired', 'failed')
  ) then raise exception using errcode = 'P0001', message = 'feedback_attachment_not_ready'; end if;
  select count(*)::integer into v_attachment_count
  from public.platform_feedback_attachments a
  where a.feedback_id = v_feedback.id and a.status = 'active';
  select nullif(btrim(p.display_name), '') into v_display_name
  from public.platform_profiles p where p.platform_account_id = v_account_id;
  update public.platform_feedback f set
    status = 'new', submitted_at = v_now,
    author_display_name_snapshot = v_display_name,
    contact_email_snapshot = p_contact_email_snapshot,
    row_version = f.row_version + 1
  where f.id = v_feedback.id returning * into v_feedback;
  insert into public.platform_feedback_events (
    platform_id, feedback_id, event_type, actor_user_id, metadata
  ) values (
    v_feedback.platform_id, v_feedback.id, 'submitted', (p_ctx).user_id,
    jsonb_build_object('category', v_feedback.category, 'attachment_count', v_attachment_count)
  );
  perform private.audit_append(
    (p_ctx).request_id, 'user', (p_ctx).user_id, (p_ctx).platform_id, v_account_id,
    'feedback.submitted', 'platform_feedback', v_feedback.id, null, null,
    jsonb_build_object('category', v_feedback.category,
      'attachment_count', v_attachment_count, 'contact_allowed', v_feedback.contact_allowed)
  );
  return query select v_feedback.id, v_feedback.status, v_feedback.row_version, v_feedback.submitted_at;
end;
$$;

create or replace function private.feedback_delete_reconcile(
  p_feedback_id uuid,
  p_now timestamptz default clock_timestamp()
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare v_feedback public.platform_feedback;
begin
  if p_feedback_id is null or p_now is null then raise exception using errcode = '22023', message = 'invalid_input'; end if;
  select * into v_feedback from public.platform_feedback f where f.id = p_feedback_id for update;
  if not found or v_feedback.status <> 'deleting' then return; end if;
  if exists (select 1 from public.platform_feedback_attachments a
    where a.feedback_id = v_feedback.id and a.status <> 'deleted') then return; end if;
  update public.platform_feedback set
    status = 'deleted', deleted_at = coalesce(deleted_at, p_now),
    platform_account_id = null, user_id = null,
    author_display_name_snapshot = null, contact_email_snapshot = null,
    contact_allowed = false, title = null, body = null, client_context = '{}'::jsonb,
    row_version = row_version + 1
  where id = v_feedback.id;
  insert into public.platform_feedback_events(platform_id, feedback_id, event_type, metadata)
  values (v_feedback.platform_id, v_feedback.id, 'deleted', '{}'::jsonb);
end;
$$;

create or replace function private.feedback_privacy_delete(
  p_feedback_id uuid,
  p_reason text,
  p_now timestamptz default clock_timestamp()
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare v_feedback public.platform_feedback;
begin
  if p_feedback_id is null or p_now is null or p_reason is null or length(p_reason) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_feedback from public.platform_feedback f where f.id = p_feedback_id for update;
  if not found or v_feedback.status = 'deleted' then return; end if;
  update public.platform_feedback set
    status = 'deleting', delete_requested_at = coalesce(delete_requested_at, p_now),
    author_display_name_snapshot = null, contact_email_snapshot = null,
    contact_allowed = false, title = null, body = null, client_context = '{}'::jsonb,
    row_version = row_version + 1
  where id = v_feedback.id;
  delete from public.platform_feedback_labels where feedback_id = v_feedback.id;
  update public.platform_feedback_events set note_body = null, metadata = '{}'::jsonb
  where feedback_id = v_feedback.id;
  update public.platform_feedback_attachments set
    status = case when status = 'deleted' then 'deleted' else 'deleting' end,
    cancel_requested_at = coalesce(cancel_requested_at, p_now),
    delete_requested_at = coalesce(delete_requested_at, p_now),
    next_attempt_at = greatest(p_now, coalesce(lease_until, p_now))
  where feedback_id = v_feedback.id and status <> 'deleted';
  insert into public.platform_feedback_events(platform_id, feedback_id, event_type, metadata)
  values (v_feedback.platform_id, v_feedback.id, 'delete_requested',
    jsonb_build_object('reason_code', p_reason));
  perform private.feedback_delete_reconcile(v_feedback.id, p_now);
end;
$$;

create or replace function private.feedback_account_privacy_cleanup(
  p_platform_account_id uuid,
  p_now timestamptz,
  p_reason text
)
returns integer
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_feedback_id uuid;
  v_count integer := 0;
begin
  if p_platform_account_id is null or p_now is null or p_reason is null
     or length(p_reason) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  for v_feedback_id in
    select f.id from public.platform_feedback f
    where f.platform_account_id = p_platform_account_id and f.status <> 'deleted'
    order by f.id for update
  loop
    perform private.feedback_privacy_delete(v_feedback_id, p_reason, p_now);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function private.feedback_delete_reconcile_on_feedback()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
begin
  perform private.feedback_delete_reconcile(new.id, clock_timestamp());
  return new;
end;
$$;

create or replace function private.feedback_delete_reconcile_on_attachment()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
begin
  perform private.feedback_delete_reconcile(new.feedback_id, clock_timestamp());
  return new;
end;
$$;

create trigger platform_feedback_attachment_delete_reconcile
after update of status on public.platform_feedback_attachments
for each row
when (new.status = 'deleted' and old.status is distinct from new.status)
execute function private.feedback_delete_reconcile_on_attachment();

create or replace function private.feedback_attachment_cleanup_candidates(
  p_cursor_attachment_id uuid default null,
  p_limit integer default 20
)
returns table (attachment_id uuid, next_attempt_at timestamptz)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
begin
  if p_limit not between 1 and 100 then raise exception using errcode = '22023', message = 'invalid_input'; end if;
  return query select a.id, a.next_attempt_at
  from public.platform_feedback_attachments a
  where (p_cursor_attachment_id is null or a.id > p_cursor_attachment_id)
    and a.next_attempt_at <= clock_timestamp()
    and (
      a.status = 'deleting'
      or (a.status in ('pending', 'receiving') and a.write_outcome = 'not_started'
        and a.intent_expires_at <= clock_timestamp()
        and (a.lease_until is null or a.lease_until <= clock_timestamp()))
      or (a.status = 'storing' and a.write_outcome in ('in_flight', 'unknown'))
    )
  order by a.id limit p_limit;
end;
$$;

create or replace function private.feedback_attachment_cleanup_claim(
  p_ctx private.job_context,
  p_attachment_id uuid,
  p_lease_seconds integer default 60
)
returns table (
  attachment_id uuid, action text, status text, write_outcome text,
  storage_bucket text, storage_path text, fencing_token bigint,
  retry_count integer, next_attempt_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_claim record;
  v_attachment public.platform_feedback_attachments;
  v_action text;
  v_now timestamptz := clock_timestamp();
begin
  if (p_ctx).job_id is null or (p_ctx).lease_owner is null
     or length((p_ctx).lease_owner) not between 1 and 128
     or (p_ctx).fencing_token is null or (p_ctx).fencing_token < 1
     or (p_ctx).request_id is null or p_attachment_id is null
     or p_lease_seconds not between 1 and 3600 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_claim from private.job_lease_claim(
    'feedback_attachment_cleanup', p_attachment_id, (p_ctx).lease_owner, p_lease_seconds
  );
  if not coalesce(v_claim.claimed, false) then
    return query select p_attachment_id, 'busy'::text, null::text, null::text,
      null::text, null::text, v_claim.fencing_token, null::integer, v_claim.lease_until;
    return;
  end if;
  select * into v_attachment from public.platform_feedback_attachments a
  where a.id = p_attachment_id for update;
  if not found then
    perform private.job_lease_release('feedback_attachment_cleanup', p_attachment_id,
      (p_ctx).lease_owner, v_claim.fencing_token);
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  if exists (select 1 from private.file_backup_barriers b where b.state in ('active', 'running')) then
    v_action := 'backup_barrier';
  elsif v_attachment.status in ('pending', 'receiving')
    and v_attachment.write_outcome = 'not_started'
    and not exists (select 1 from private.feedback_attachment_write_attempts w where w.attachment_id = v_attachment.id)
    and v_attachment.intent_expires_at <= v_now
    and (v_attachment.lease_until is null or v_attachment.lease_until <= v_now) then
    update public.platform_feedback_attachments set
      status = 'expired', original_name = '[expired]', last_error_code = null
    where id = v_attachment.id returning * into v_attachment;
    v_action := 'no_storage';
  elsif v_attachment.status = 'deleting' and v_attachment.write_outcome = 'not_started'
    and not exists (select 1 from private.feedback_attachment_write_attempts w where w.attachment_id = v_attachment.id)
    and v_attachment.lease_until is not null and v_attachment.lease_until > v_now then
    v_action := 'receive_in_progress';
  elsif v_attachment.status = 'deleting' and v_attachment.write_outcome = 'not_started'
    and not exists (select 1 from private.feedback_attachment_write_attempts w where w.attachment_id = v_attachment.id) then
    update public.platform_feedback_attachments set
      status = 'deleted', deleted_at = v_now, storage_path = null,
      original_name = '[deleted]', platform_account_id = null, last_error_code = null
    where id = v_attachment.id returning * into v_attachment;
    v_action := 'no_storage';
  elsif v_attachment.status = 'deleting' and v_attachment.write_outcome = 'confirmed'
    and not exists (select 1 from private.feedback_attachment_write_attempts w
      where w.attachment_id = v_attachment.id and w.state in ('in_flight', 'unknown')) then
    v_action := 'remove';
  elsif v_attachment.status in ('storing', 'deleting')
    and v_attachment.write_outcome in ('in_flight', 'unknown') then
    v_action := 'settlement_required';
  else
    v_action := 'no_storage';
  end if;
  if v_action <> 'remove' then
    perform private.job_lease_release('feedback_attachment_cleanup', p_attachment_id,
      (p_ctx).lease_owner, v_claim.fencing_token);
  end if;
  return query select v_attachment.id, v_action, v_attachment.status,
    v_attachment.write_outcome, v_attachment.storage_bucket, v_attachment.storage_path,
    v_claim.fencing_token, v_attachment.retry_count, v_attachment.next_attempt_at;
end;
$$;

create or replace function private.feedback_attachment_cleanup_finish(
  p_ctx private.job_context,
  p_attachment_id uuid,
  p_fencing_token bigint,
  p_outcome text,
  p_error_code text default null
)
returns table (attachment_id uuid, status text, retry_count integer, next_attempt_at timestamptz)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_attachment public.platform_feedback_attachments;
  v_lease private.job_leases;
  v_retry integer;
  v_next timestamptz;
begin
  if (p_ctx).job_id is null or (p_ctx).lease_owner is null or (p_ctx).request_id is null
     or p_attachment_id is null or p_fencing_token is null or p_fencing_token < 1
     or p_outcome not in ('removed', 'not_found', 'failed', 'unknown')
     or p_outcome in ('failed', 'unknown') and (p_error_code is null or length(p_error_code) not between 1 and 128) then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_lease from private.job_leases l
  where l.job_kind = 'feedback_attachment_cleanup' and l.resource_id = p_attachment_id
    and l.lease_owner = (p_ctx).lease_owner and l.fencing_token = p_fencing_token for update;
  if not found then raise exception using errcode = '40001', message = 'stale_job_fence'; end if;
  select * into v_attachment from public.platform_feedback_attachments a
  where a.id = p_attachment_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  if p_outcome in ('removed', 'not_found') then
    if v_attachment.status <> 'deleting' or v_attachment.write_outcome <> 'confirmed'
       or exists (select 1 from private.feedback_attachment_write_attempts w
         where w.attachment_id = v_attachment.id and w.state in ('in_flight', 'unknown')) then
      raise exception using errcode = 'P0001', message = 'settlement_required';
    end if;
    update public.platform_feedback_attachments set
      status = 'deleted', deleted_at = clock_timestamp(), storage_path = null,
      original_name = '[deleted]', platform_account_id = null, last_error_code = null
    where id = v_attachment.id returning * into v_attachment;
  else
    v_retry := v_attachment.retry_count + 1;
    v_next := clock_timestamp() + make_interval(secs => least(3600, 60 * (2 ^ least(v_retry - 1, 6))));
    update public.platform_feedback_attachments set
      status = 'deleting', retry_count = v_retry, next_attempt_at = v_next,
      last_error_code = p_error_code
    where id = v_attachment.id returning * into v_attachment;
  end if;
  perform private.job_lease_release('feedback_attachment_cleanup', p_attachment_id,
    (p_ctx).lease_owner, p_fencing_token);
  return query select v_attachment.id, v_attachment.status, v_attachment.retry_count, v_attachment.next_attempt_at;
end;
$$;

alter function private.feedback_client_context_valid(jsonb) owner to domain_owner;
alter function private.feedback_account_id(private.account_context, boolean) owner to domain_owner;
alter function private.feedback_create(private.account_context, text, text, text, boolean, jsonb, text) owner to domain_owner;
alter function private.feedback_list(private.account_context, uuid, integer) owner to domain_owner;
alter function private.feedback_read(private.account_context, uuid) owner to domain_owner;
alter function private.feedback_patch(private.account_context, uuid, bigint, text, text, text, boolean, jsonb) owner to domain_owner;
alter function private.feedback_attachment_intent_create(private.account_context, uuid, text, bigint, text, text) owner to domain_owner;
alter function private.feedback_attachment_list(private.account_context, uuid) owner to domain_owner;
alter function private.feedback_attachment_receive_claim(private.account_context, uuid, text, integer) owner to domain_owner;
alter function private.feedback_attachment_prepare_store(private.account_context, uuid, bigint, text, text) owner to domain_owner;
alter function private.feedback_attachment_mark_unknown(private.account_context, uuid, uuid, text) owner to domain_owner;
alter function private.feedback_attachment_finalize(private.account_context, uuid, uuid, bigint, text, text) owner to domain_owner;
alter function private.feedback_attachment_cancel(private.account_context, uuid) owner to domain_owner;
alter function private.feedback_submit(private.account_context, uuid, text) owner to domain_owner;
alter function private.feedback_delete_reconcile(uuid, timestamptz) owner to domain_owner;
alter function private.feedback_privacy_delete(uuid, text, timestamptz) owner to domain_owner;
alter function private.feedback_account_privacy_cleanup(uuid, timestamptz, text) owner to domain_owner;
alter function private.feedback_delete_reconcile_on_feedback() owner to domain_owner;
alter function private.feedback_delete_reconcile_on_attachment() owner to domain_owner;
alter function private.feedback_attachment_cleanup_candidates(uuid, integer) owner to domain_owner;
alter function private.feedback_attachment_cleanup_claim(private.job_context, uuid, integer) owner to domain_owner;
alter function private.feedback_attachment_cleanup_finish(private.job_context, uuid, bigint, text, text) owner to domain_owner;

revoke all on function private.feedback_client_context_valid(jsonb),
  private.feedback_account_id(private.account_context, boolean),
  private.feedback_delete_reconcile(uuid, timestamptz),
  private.feedback_privacy_delete(uuid, text, timestamptz),
  private.feedback_account_privacy_cleanup(uuid, timestamptz, text),
  private.feedback_delete_reconcile_on_feedback(),
  private.feedback_delete_reconcile_on_attachment()
from public, anon, authenticated, account_executor, admin_executor, job_executor, recovery_executor;

revoke all on function private.feedback_create(private.account_context, text, text, text, boolean, jsonb, text),
  private.feedback_list(private.account_context, uuid, integer),
  private.feedback_read(private.account_context, uuid),
  private.feedback_patch(private.account_context, uuid, bigint, text, text, text, boolean, jsonb),
  private.feedback_attachment_intent_create(private.account_context, uuid, text, bigint, text, text),
  private.feedback_attachment_list(private.account_context, uuid),
  private.feedback_attachment_receive_claim(private.account_context, uuid, text, integer),
  private.feedback_attachment_prepare_store(private.account_context, uuid, bigint, text, text),
  private.feedback_attachment_mark_unknown(private.account_context, uuid, uuid, text),
  private.feedback_attachment_finalize(private.account_context, uuid, uuid, bigint, text, text),
  private.feedback_attachment_cancel(private.account_context, uuid),
  private.feedback_submit(private.account_context, uuid, text)
from public, anon, authenticated, admin_executor, job_executor, recovery_executor;

grant execute on function private.feedback_create(private.account_context, text, text, text, boolean, jsonb, text),
  private.feedback_list(private.account_context, uuid, integer),
  private.feedback_read(private.account_context, uuid),
  private.feedback_patch(private.account_context, uuid, bigint, text, text, text, boolean, jsonb),
  private.feedback_attachment_intent_create(private.account_context, uuid, text, bigint, text, text),
  private.feedback_attachment_list(private.account_context, uuid),
  private.feedback_attachment_receive_claim(private.account_context, uuid, text, integer),
  private.feedback_attachment_prepare_store(private.account_context, uuid, bigint, text, text),
  private.feedback_attachment_mark_unknown(private.account_context, uuid, uuid, text),
  private.feedback_attachment_finalize(private.account_context, uuid, uuid, bigint, text, text),
  private.feedback_attachment_cancel(private.account_context, uuid),
  private.feedback_submit(private.account_context, uuid, text)
to account_executor;

revoke all on function private.feedback_attachment_cleanup_candidates(uuid, integer),
  private.feedback_attachment_cleanup_claim(private.job_context, uuid, integer),
  private.feedback_attachment_cleanup_finish(private.job_context, uuid, bigint, text, text)
from public, anon, authenticated, account_executor, admin_executor, recovery_executor;

grant execute on function private.feedback_attachment_cleanup_candidates(uuid, integer),
  private.feedback_attachment_cleanup_claim(private.job_context, uuid, integer),
  private.feedback_attachment_cleanup_finish(private.job_context, uuid, bigint, text, text)
to job_executor;
