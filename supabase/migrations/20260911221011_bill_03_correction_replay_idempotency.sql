-- BILL-03 forward-fix: an already committed correction must replay before the
-- caller's original event-sequence precondition is evaluated. A retry carries
-- the snapshot sequence from the first request, while the atomic revoke+grant
-- has necessarily advanced the subscription sequence.

create or replace function private.admin_entitlement_correction_apply(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_platform_account_id uuid,
  p_original_grant_id uuid,
  p_expected_event_sequence bigint,
  p_replacement_plan_id uuid,
  p_replacement_duration_value integer,
  p_replacement_duration_unit text,
  p_operation_id uuid,
  p_reason text
)
returns table (
  outcome text,
  original_grant_id uuid,
  replacement_grant_id uuid,
  event_sequence bigint
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_subscription public.subscriptions;
  v_existing public.subscription_grant_corrections;
  v_revoke_operation_id uuid;
  v_grant_operation_id uuid;
  v_replacement record;
  v_current_sequence bigint;
begin
  if p_platform_id is null or p_platform_account_id is null or p_original_grant_id is null
     or p_expected_event_sequence is null or p_expected_event_sequence < 0
     or p_replacement_plan_id is null or p_replacement_duration_value is null
     or p_replacement_duration_value <= 0
     or p_replacement_duration_unit not in ('month', 'year')
     or p_operation_id is null or p_reason is null or length(p_reason) not between 1 and 1024 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if not exists (select 1 from private.system_admin where user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active) then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
  if not (
    (p_replacement_duration_value = 1 and p_replacement_duration_unit = 'month')
    or (p_replacement_duration_value = 1 and p_replacement_duration_unit = 'year')
    or (p_replacement_duration_value = 99 and p_replacement_duration_unit = 'year')
  ) then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  perform 1 from public.platforms p
  where p.id = p_platform_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  perform 1 from public.platform_accounts a
  where a.platform_id = p_platform_id and a.id = p_platform_account_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  select s.* into v_subscription from public.subscriptions s
  where s.platform_id = p_platform_id and s.platform_account_id = p_platform_account_id
  for update;
  v_current_sequence := coalesce(v_subscription.last_event_sequence, 0);

  -- The operation id is the durable idempotency key. Check it after the
  -- account/subscription locks but before the stale snapshot precondition so
  -- retries return the committed result after the event sequence advances.
  select c.* into v_existing from public.subscription_grant_corrections c
  where c.platform_id = p_platform_id and c.operation_id = p_operation_id;
  if found then
    if v_existing.platform_account_id <> p_platform_account_id
       or v_existing.original_grant_id <> p_original_grant_id then
      raise exception using errcode = '23505', message = 'idempotency_conflict';
    end if;
    return query select 'replayed'::text, v_existing.original_grant_id,
      v_existing.replacement_grant_id, v_current_sequence;
    return;
  end if;

  if v_current_sequence <> p_expected_event_sequence then
    raise exception using errcode = '40001', message = 'precondition_failed';
  end if;

  if exists (select 1 from public.subscription_grant_corrections c
             where c.platform_id = p_platform_id and c.original_grant_id = p_original_grant_id) then
    raise exception using errcode = '23505', message = 'correction_exists';
  end if;
  perform 1 from public.subscription_grants g
  where g.platform_id = p_platform_id and g.platform_account_id = p_platform_account_id
    and g.id = p_original_grant_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  if exists (select 1 from public.subscription_events e
             where e.platform_id = p_platform_id and e.platform_account_id = p_platform_account_id
               and e.grant_id = p_original_grant_id and e.event_type = 'revoked') then
    raise exception using errcode = 'P0001', message = 'grant_already_revoked';
  end if;
  if not exists (select 1 from public.plans p
                 where p.platform_id = p_platform_id and p.id = p_replacement_plan_id
                   and p.kind = 'paid' and p.status = 'active') then
    raise exception using errcode = 'P0001', message = 'plan_unavailable';
  end if;

  v_revoke_operation_id := (
    substr(md5(p_operation_id::text || ':correction:revoke'), 1, 8) || '-' ||
    substr(md5(p_operation_id::text || ':correction:revoke'), 9, 4) || '-' ||
    substr(md5(p_operation_id::text || ':correction:revoke'), 13, 4) || '-' ||
    substr(md5(p_operation_id::text || ':correction:revoke'), 17, 4) || '-' ||
    substr(md5(p_operation_id::text || ':correction:revoke'), 21, 12)
  )::uuid;
  v_grant_operation_id := (
    substr(md5(p_operation_id::text || ':correction:grant'), 1, 8) || '-' ||
    substr(md5(p_operation_id::text || ':correction:grant'), 9, 4) || '-' ||
    substr(md5(p_operation_id::text || ':correction:grant'), 13, 4) || '-' ||
    substr(md5(p_operation_id::text || ':correction:grant'), 17, 4) || '-' ||
    substr(md5(p_operation_id::text || ':correction:grant'), 21, 12)
  )::uuid;

  perform private.admin_entitlement_command(
    p_ctx, p_platform_id, p_platform_account_id, 'revoke',
    v_revoke_operation_id, null, null, null, p_original_grant_id,
    'correction: ' || p_reason
  );
  select * into v_replacement from private.entitlement_apply(
    p_platform_id, p_platform_account_id, p_replacement_plan_id, 'admin',
    v_grant_operation_id, p_replacement_duration_value, p_replacement_duration_unit,
    (p_ctx).admin_user_id, 'correction: ' || p_reason, null
  );
  insert into public.subscription_grant_corrections (
    platform_id, platform_account_id, operation_id, original_grant_id,
    replacement_grant_id, expected_event_sequence, reason, created_by
  ) values (
    p_platform_id, p_platform_account_id, p_operation_id, p_original_grant_id,
    v_replacement.grant_id, p_expected_event_sequence, p_reason, (p_ctx).admin_user_id
  );
  select coalesce(s.last_event_sequence, 0) into v_current_sequence
  from public.subscriptions s
  where s.platform_id = p_platform_id and s.platform_account_id = p_platform_account_id;
  return query select 'applied'::text, p_original_grant_id, v_replacement.grant_id, v_current_sequence;
end;
$$;

alter function private.admin_entitlement_correction_apply(private.admin_context, uuid, uuid, uuid, bigint, uuid, integer, text, uuid, text) owner to domain_owner;
