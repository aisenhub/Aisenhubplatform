-- Prelaunch Phase 04: canonical governance transitions and real Admin
-- idempotency for destructive Feedback operations.

alter table public.platform_account_governance_events
  add column if not exists before_status text,
  add column if not exists after_status text,
  add column if not exists operation_id uuid;

alter table public.platform_account_governance_events
  drop constraint if exists platform_account_governance_events_before_status_check;
alter table public.platform_account_governance_events
  add constraint platform_account_governance_events_before_status_check
  check (before_status is null or before_status in ('active', 'suspended'));
alter table public.platform_account_governance_events
  drop constraint if exists platform_account_governance_events_after_status_check;
alter table public.platform_account_governance_events
  add constraint platform_account_governance_events_after_status_check
  check (after_status is null or after_status in ('active', 'suspended', 'closed'));

create index if not exists platform_account_governance_events_operation_idx
  on public.platform_account_governance_events(operation_id)
  where operation_id is not null;

create or replace function private.admin_account_transition(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_platform_account_id uuid,
  p_action text,
  p_reason text
)
returns table (platform_account_id uuid, status text, governance_event_id uuid)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_account public.platform_accounts;
  v_event public.platform_account_governance_events;
  v_reason text := btrim(p_reason);
  v_before_status text;
begin
  perform private.billing_admin_assert(p_ctx);
  if p_platform_id is null or p_platform_account_id is null
     or p_action not in ('suspend', 'restore', 'close')
     or p_reason is null or length(v_reason) not between 1 and 2000
     or (p_ctx).request_id is null then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  select * into v_account
  from public.platform_accounts a
  where a.platform_id = p_platform_id and a.id = p_platform_account_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;

  v_before_status := v_account.status;
  if p_action = 'suspend' then
    if v_before_status <> 'active' then
      raise exception using errcode = 'P0001', message = 'invalid_account_transition';
    end if;
    update public.platform_accounts a
    set status = 'suspended', suspended_at = clock_timestamp()
    where a.id = v_account.id
    returning * into v_account;
  elsif p_action = 'restore' then
    if v_before_status <> 'suspended' then
      raise exception using errcode = 'P0001', message = 'invalid_account_transition';
    end if;
    update public.platform_accounts a
    set status = 'active', suspended_at = null
    where a.id = v_account.id
    returning * into v_account;
  else
    if v_before_status not in ('active', 'suspended') then
      raise exception using errcode = 'P0001', message = 'invalid_account_transition';
    end if;
    update public.platform_accounts a
    set status = 'closed', closed_at = coalesce(closed_at, clock_timestamp())
    where a.id = v_account.id
    returning * into v_account;
  end if;

  insert into public.platform_account_governance_events(
    platform_id, platform_account_id, action, reason, actor_admin_user_id,
    before_status, after_status, operation_id
  ) values (
    p_platform_id, p_platform_account_id, p_action, v_reason, (p_ctx).admin_user_id,
    v_before_status, v_account.status, (p_ctx).request_id
  ) returning * into v_event;

  perform private.audit_append(
    (p_ctx).request_id, 'admin', (p_ctx).admin_user_id, p_platform_id,
    p_platform_account_id, 'account.' || p_action, 'platform_account',
    p_platform_account_id, null, null,
    jsonb_build_object(
      'governance_event_id', v_event.id,
      'action', p_action,
      'before_status', v_before_status,
      'after_status', v_account.status
    )
  );
  return query select v_account.id, v_account.status, v_event.id;
end;
$$;

drop function if exists private.admin_account_transition(private.admin_context, uuid, uuid, text);
drop function if exists private.admin_account_transition_v2(private.admin_context, uuid, uuid, text, text);

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
  v_ids uuid[];
  v_reason text := btrim(p_reason);
  v_scope text;
  v_hash bytea;
  v_existing private.admin_idempotency%rowtype;
  v_new boolean := false;
  v_items jsonb := '[]'::jsonb;
begin
  perform private.billing_admin_assert(p_ctx);
  if p_platform_id is null or p_feedback_ids is null
     or cardinality(p_feedback_ids) not between 1 and 100
     or p_reason is null or length(v_reason) not between 1 and 128
     or p_operation_id is null then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  select array_agg(x order by x), count(*)::integer
    into v_ids, v_count
  from (select distinct unnest(p_feedback_ids) as x) ids;
  if v_count <> cardinality(p_feedback_ids) then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  v_scope := 'platform:' || p_platform_id::text;
  v_hash := extensions.digest(convert_to(
    p_platform_id::text || ':' || array_to_string(v_ids, ',') || ':' || v_reason,
    'utf8'
  ), 'sha256');

  insert into private.admin_idempotency(
    admin_user_id, platform_id, scope, operation, idempotency_key, request_hash
  ) values (
    (p_ctx).admin_user_id, p_platform_id, v_scope, 'feedback_batch_delete',
    p_operation_id::text, v_hash
  ) on conflict (admin_user_id, scope, operation, idempotency_key)
    do nothing returning true into v_new;

  if not coalesce(v_new, false) then
    select * into v_existing
    from private.admin_idempotency i
    where i.admin_user_id = (p_ctx).admin_user_id
      and i.scope = v_scope
      and i.operation = 'feedback_batch_delete'
      and i.idempotency_key = p_operation_id::text
    for update;
    if v_existing.request_hash <> v_hash then
      raise exception using errcode = '23505', message = 'idempotency_conflict';
    end if;
    if v_existing.state = 'completed' then
      return query
      select (item->>'feedback_id')::uuid, item->>'status'
      from jsonb_array_elements(v_existing.response_body->'items') item;
      return;
    end if;
    raise exception using errcode = 'P0001', message = 'operation_in_progress';
  end if;

  if exists (
    select 1
    from unnest(v_ids) requested(id)
    left join public.platform_feedback f
      on f.platform_id = p_platform_id and f.id = requested.id
    where f.id is null or f.status in ('draft', 'deleted')
  ) then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  if exists (
    select 1
    from unnest(v_ids) requested(id)
    join public.platform_feedback f
      on f.platform_id = p_platform_id and f.id = requested.id
    where f.status = 'deleting'
  ) then
    raise exception using errcode = 'P0001', message = 'operation_in_progress';
  end if;

  foreach v_feedback_id in array v_ids loop
    perform private.feedback_privacy_delete(
      v_feedback_id, left('admin:' || v_reason, 128), clock_timestamp()
    );
    select f.status into v_status
    from public.platform_feedback f
    where f.platform_id = p_platform_id and f.id = v_feedback_id;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'feedback_id', v_feedback_id,
      'status', v_status
    ));
  end loop;

  perform private.audit_append(
    (p_ctx).request_id, 'admin', (p_ctx).admin_user_id, p_platform_id, null,
    'feedback.batch_delete_requested', 'platform', p_platform_id, null, null,
    jsonb_build_object('operation_id', p_operation_id, 'feedback_count', v_count)
  );

  update private.admin_idempotency i
  set state = 'completed', response_status = 202,
      response_body = jsonb_build_object('operation_id', p_operation_id, 'items', v_items)
  where i.admin_user_id = (p_ctx).admin_user_id
    and i.scope = v_scope
    and i.operation = 'feedback_batch_delete'
    and i.idempotency_key = p_operation_id::text;

  return query
  select (item->>'feedback_id')::uuid, item->>'status'
  from jsonb_array_elements(v_items) item;
end;
$$;

alter function private.admin_account_transition(private.admin_context, uuid, uuid, text, text)
  owner to domain_owner;
alter function private.admin_feedback_batch_delete(private.admin_context, uuid, uuid[], text, uuid)
  owner to domain_owner;

revoke all on function private.admin_account_transition(private.admin_context, uuid, uuid, text, text)
from public, anon, authenticated, account_executor, job_executor, recovery_executor;
grant execute on function private.admin_account_transition(private.admin_context, uuid, uuid, text, text)
to admin_executor;

revoke all on function private.admin_feedback_batch_delete(private.admin_context, uuid, uuid[], text, uuid)
from public, anon, authenticated, account_executor, job_executor, recovery_executor;
grant execute on function private.admin_feedback_batch_delete(private.admin_context, uuid, uuid[], text, uuid)
to admin_executor;
