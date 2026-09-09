-- M3-R1: use explicit UTC calendar arithmetic for month/year grants.
-- PostgreSQL's raw interval addition can roll 31 January into March. The
-- contract requires clamping to the target month's last day instead.

create or replace function private.entitlement_calendar_end(
  p_start timestamptz,
  p_duration_value integer,
  p_duration_unit text
)
returns timestamptz
language plpgsql
immutable
strict
security invoker
set search_path = pg_catalog
as $$
declare
  v_start_utc timestamp;
  v_target_month timestamp;
  v_day integer;
  v_last_day integer;
begin
  if p_duration_value <= 0 or p_duration_unit not in ('day', 'month', 'year') then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if p_duration_unit = 'day' then
    return p_start + make_interval(days => p_duration_value);
  end if;

  v_start_utc := p_start at time zone 'UTC';
  v_target_month := date_trunc('month', v_start_utc) + case
    when p_duration_unit = 'month' then make_interval(months => p_duration_value)
    else make_interval(years => p_duration_value)
  end;
  v_day := extract(day from v_start_utc)::integer;
  v_last_day := extract(
    day from (v_target_month + interval '1 month - 1 day')
  )::integer;
  return (
    v_target_month
    + make_interval(days => least(v_day, v_last_day) - 1)
    + (v_start_utc - date_trunc('day', v_start_utc))
  ) at time zone 'UTC';
end;
$$;

alter function private.entitlement_calendar_end(timestamptz, integer, text)
  owner to domain_owner;
revoke all on function private.entitlement_calendar_end(timestamptz, integer, text)
  from public, anon, authenticated, account_executor, admin_executor,
    job_executor, recovery_executor;

create or replace function private.entitlement_apply(
  p_platform_id uuid,
  p_platform_account_id uuid,
  p_plan_id uuid,
  p_source text,
  p_operation_id uuid,
  p_duration_value integer,
  p_duration_unit text,
  p_actor_user_id uuid,
  p_reason text,
  p_redemption_code_id uuid default null
)
returns table (grant_id uuid, plan_id uuid, starts_at timestamptz, ends_at timestamptz, event_sequence bigint)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_account public.platform_accounts;
  v_plan public.plans;
  v_existing public.subscription_grants;
  v_now timestamptz := clock_timestamp();
  v_start timestamptz;
  v_end timestamptz;
  v_sequence bigint;
begin
  if p_source not in ('admin', 'redemption_code') or p_operation_id is null
     or p_plan_id is null or p_reason is null or length(p_reason) not between 1 and 1024
     or (p_source = 'redemption_code' and (p_duration_value is null or p_duration_unit is null or p_redemption_code_id is null))
     or (p_duration_value is not null and (p_duration_value <= 0 or p_duration_unit not in ('day', 'month', 'year'))) then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_existing from public.subscription_grants g
  where g.platform_id = p_platform_id and g.source = p_source and g.operation_id = p_operation_id;
  if found then
    return query select v_existing.id, v_existing.plan_id, v_existing.starts_at, v_existing.ends_at,
      (select e.sequence from public.subscription_events e where e.grant_id = v_existing.id and e.event_type = 'granted');
    return;
  end if;

  select * into v_account from public.platform_accounts a
  where a.platform_id = p_platform_id and a.id = p_platform_account_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  if v_account.status <> 'active' then raise exception using errcode = '42501', message = 'account_not_active'; end if;
  select * into v_plan from public.plans p where p.platform_id = p_platform_id and p.id = p_plan_id;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  if v_plan.status <> 'active' or v_plan.kind <> 'paid' then raise exception using errcode = 'P0001', message = 'plan_unavailable'; end if;

  if exists (
    select 1 from public.subscription_grants g
    where g.platform_id = p_platform_id and g.platform_account_id = p_platform_account_id
      and g.plan_id <> p_plan_id and (g.ends_at is null or g.ends_at > v_now)
      and not exists (select 1 from public.subscription_events r where r.grant_id = g.id and r.event_type = 'revoked')
  ) then raise exception using errcode = 'P0001', message = 'plan_conflict'; end if;
  if exists (
    select 1 from public.subscription_grants g
    where g.platform_id = p_platform_id and g.platform_account_id = p_platform_account_id
      and g.plan_id = p_plan_id and g.ends_at is null
      and not exists (select 1 from public.subscription_events r where r.grant_id = g.id and r.event_type = 'revoked')
  ) then raise exception using errcode = 'P0001', message = 'entitlement_perpetual'; end if;
  if p_source = 'admin' and p_duration_value is null and exists (
    select 1 from public.subscription_grants g
    where g.platform_id = p_platform_id and g.platform_account_id = p_platform_account_id
      and (g.ends_at is null or g.ends_at > v_now)
      and not exists (select 1 from public.subscription_events r where r.grant_id = g.id and r.event_type = 'revoked')
  ) then raise exception using errcode = 'P0001', message = 'plan_conflict'; end if;

  select greatest(v_now, coalesce(max(g.ends_at), v_now)) into v_start
  from public.subscription_grants g
  where g.platform_id = p_platform_id and g.platform_account_id = p_platform_account_id
    and g.plan_id = p_plan_id and g.ends_at is not null and g.ends_at > v_now
    and not exists (select 1 from public.subscription_events r where r.grant_id = g.id and r.event_type = 'revoked');
  if p_duration_value is null then v_end := null;
  else v_end := private.entitlement_calendar_end(v_start, p_duration_value, p_duration_unit);
  end if;

  insert into public.subscription_grants (
    platform_id, platform_account_id, plan_id, source, operation_id,
    redemption_code_id, starts_at, ends_at, created_by, reason
  ) values (
    p_platform_id, p_platform_account_id, p_plan_id, p_source, p_operation_id,
    p_redemption_code_id, v_start, v_end, p_actor_user_id, p_reason
  ) returning id into grant_id;

  select coalesce(max(e.sequence), 0) + 1 into v_sequence
  from public.subscription_events e
  where e.platform_id = p_platform_id and e.platform_account_id = p_platform_account_id;
  insert into public.subscription_events (
    platform_id, platform_account_id, sequence, event_type, grant_id,
    operation_id, actor_user_id, reason
  ) values (
    p_platform_id, p_platform_account_id, v_sequence, 'granted', grant_id,
    p_operation_id, p_actor_user_id, p_reason
  );
  perform private.entitlement_recompute(p_platform_id, p_platform_account_id);
  perform private.audit_append(p_operation_id, case when p_source = 'admin' then 'admin' else 'user' end,
    p_actor_user_id, p_platform_id, p_platform_account_id, 'entitlement.granted',
    'subscription_grant', grant_id, null, null,
    jsonb_build_object('plan_id', p_plan_id, 'source', p_source));
  return query select grant_id, p_plan_id, v_start, v_end, v_sequence;
end;
$$;

alter function private.entitlement_apply(uuid, uuid, uuid, text, uuid, integer, text, uuid, text, uuid)
  owner to domain_owner;
