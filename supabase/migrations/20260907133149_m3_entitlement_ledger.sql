-- M3: immutable entitlement ledger, ordered events and the subscription projection.
-- Redemption storage is created here so the later redeem wrapper can use the
-- same composite tenant constraints; no executor role receives direct table DML.

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null,
  platform_account_id uuid not null,
  plan_id uuid,
  status text not null default 'active' check (status in ('active', 'suspended')),
  started_at timestamptz,
  current_period_end timestamptz,
  next_transition_at timestamptz,
  last_event_sequence bigint not null default 0 check (last_event_sequence >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform_account_id),
  unique (platform_id, platform_account_id, id),
  foreign key (platform_id, platform_account_id)
    references public.platform_accounts(platform_id, id) on delete restrict,
  foreign key (platform_id, plan_id)
    references public.plans(platform_id, id) on delete restrict,
  check ((plan_id is null and started_at is null and current_period_end is null)
    or (plan_id is not null and started_at is not null)),
  check (current_period_end is null or current_period_end > started_at)
);

create table public.subscription_grants (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null,
  platform_account_id uuid not null,
  plan_id uuid not null,
  source text not null check (source in ('redemption_code', 'admin')),
  operation_id uuid not null,
  redemption_code_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  reason text not null check (length(reason) between 1 and 1024),
  created_at timestamptz not null default now(),
  unique (platform_id, source, operation_id),
  unique (platform_id, platform_account_id, id),
  unique (platform_id, platform_account_id, redemption_code_id, id),
  unique (redemption_code_id),
  foreign key (platform_id, platform_account_id)
    references public.platform_accounts(platform_id, id) on delete restrict,
  foreign key (platform_id, plan_id)
    references public.plans(platform_id, id) on delete restrict,
  check (ends_at is null or ends_at > starts_at),
  check (source = 'admin' or ends_at is not null),
  check ((source = 'redemption_code' and redemption_code_id is not null
      and operation_id = redemption_code_id)
    or (source = 'admin' and redemption_code_id is null))
);

create table public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null,
  platform_account_id uuid not null,
  subscription_id uuid,
  sequence bigint not null check (sequence > 0),
  event_type text not null check (event_type in ('granted', 'revoked', 'paused', 'resumed')),
  grant_id uuid,
  operation_id uuid not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  reason text not null check (length(reason) between 1 and 1024),
  created_at timestamptz not null default now(),
  unique (platform_id, platform_account_id, sequence),
  unique (platform_id, platform_account_id, operation_id, event_type),
  foreign key (platform_id, platform_account_id)
    references public.platform_accounts(platform_id, id) on delete restrict,
  foreign key (platform_id, platform_account_id, subscription_id)
    references public.subscriptions(platform_id, platform_account_id, id) on delete restrict,
  foreign key (platform_id, platform_account_id, grant_id)
    references public.subscription_grants(platform_id, platform_account_id, id) on delete restrict,
  check ((event_type in ('granted', 'revoked') and grant_id is not null)
    or (event_type in ('paused', 'resumed') and grant_id is null))
);

create unique index subscription_one_granted_event_per_grant
  on public.subscription_events(grant_id) where event_type = 'granted';
create unique index subscription_one_reversal_per_grant
  on public.subscription_events(grant_id) where event_type = 'revoked';

create table public.redemption_code_batches (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null,
  plan_id uuid not null,
  name text not null check (length(name) between 1 and 256),
  quantity integer not null check (quantity between 1 and 1000),
  duration_value integer not null check (duration_value > 0),
  duration_unit text not null check (duration_unit in ('day', 'month', 'year')),
  expires_at timestamptz not null,
  status text not null default 'pending_delivery'
    check (status in ('pending_delivery', 'active', 'disabled')),
  delivery_deadline timestamptz not null,
  delivered_at timestamptz,
  delivery_session_id uuid,
  delivery_receipt_hmac text,
  delivery_confirmed_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  creation_operation_id uuid not null,
  created_at timestamptz not null default now(),
  unique (platform_id, plan_id, id),
  unique (platform_id, creation_operation_id),
  foreign key (platform_id) references public.platforms(id) on delete restrict,
  foreign key (platform_id, plan_id) references public.plans(platform_id, id) on delete restrict,
  check (expires_at > created_at),
  check (delivery_deadline > created_at),
  check ((status = 'active' and delivered_at is not null and delivery_receipt_hmac is not null)
    or status <> 'active')
);

create table public.redemption_codes (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null,
  batch_id uuid not null,
  plan_id uuid not null,
  code_hmac text not null check (length(code_hmac) = 64 and code_hmac ~ '^[0-9a-f]{64}$'),
  hmac_key_version smallint not null check (hmac_key_version > 0),
  code_prefix text,
  code_suffix text,
  status text not null default 'unused' check (status in ('unused', 'redeemed', 'disabled')),
  redeemed_by_platform_account_id uuid,
  redeemed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (hmac_key_version, code_hmac),
  unique (platform_id, id),
  unique (platform_id, redeemed_by_platform_account_id, plan_id, id),
  foreign key (platform_id, plan_id, batch_id)
    references public.redemption_code_batches(platform_id, plan_id, id) on delete restrict,
  foreign key (platform_id, redeemed_by_platform_account_id)
    references public.platform_accounts(platform_id, id) on delete restrict,
  check ((status = 'redeemed' and redeemed_by_platform_account_id is not null
      and redeemed_at is not null)
    or (status <> 'redeemed' and redeemed_by_platform_account_id is null and redeemed_at is null))
);

alter table public.subscription_grants add constraint grant_redeemed_code_fk
  foreign key (platform_id, platform_account_id, plan_id, redemption_code_id)
  references public.redemption_codes
    (platform_id, redeemed_by_platform_account_id, plan_id, id)
  on delete restrict deferrable initially deferred;

create table public.redemption_events (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null,
  platform_account_id uuid not null,
  redemption_code_id uuid,
  grant_id uuid,
  result text not null check (result in ('success', 'rejected')),
  error_code text,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (platform_id, platform_account_id)
    references public.platform_accounts(platform_id, id) on delete restrict,
  foreign key (platform_id, redemption_code_id)
    references public.redemption_codes(platform_id, id) on delete restrict,
  foreign key (platform_id, platform_account_id, grant_id)
    references public.subscription_grants(platform_id, platform_account_id, id) on delete restrict,
  foreign key (platform_id, platform_account_id, redemption_code_id, grant_id)
    references public.subscription_grants
      (platform_id, platform_account_id, redemption_code_id, id) on delete restrict,
  check ((result = 'success' and redemption_code_id is not null and grant_id is not null and error_code is null)
    or (result = 'rejected' and grant_id is null and error_code is not null))
);

create unique index redemption_one_success_per_code
  on public.redemption_events(redemption_code_id) where result = 'success';

create index subscription_events_account_sequence_idx
  on public.subscription_events(platform_id, platform_account_id, sequence);
create index entitlement_grants_account_idx
  on public.subscription_grants(platform_id, platform_account_id, starts_at, ends_at);
create index redemption_codes_lookup_idx
  on public.redemption_codes(hmac_key_version, code_hmac, status);

create trigger subscriptions_set_updated_at
before update on public.subscriptions
for each row execute function private.set_updated_at();

alter table public.subscriptions enable row level security;
alter table public.subscription_grants enable row level security;
alter table public.subscription_events enable row level security;
alter table public.redemption_code_batches enable row level security;
alter table public.redemption_codes enable row level security;
alter table public.redemption_events enable row level security;

alter table public.subscriptions force row level security;
alter table public.subscription_grants force row level security;
alter table public.subscription_events force row level security;
alter table public.redemption_code_batches force row level security;
alter table public.redemption_codes force row level security;
alter table public.redemption_events force row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'subscriptions', 'subscription_grants', 'subscription_events',
    'redemption_code_batches', 'redemption_codes', 'redemption_events'
  ] loop
    execute format('create policy %I on public.%I for all to domain_owner using (true) with check (true)', table_name || '_domain_owner', table_name);
    execute format('grant select, insert, update on public.%I to domain_owner', table_name);
  end loop;
end;
$$;

grant select on public.platforms, public.platform_accounts, public.plans to domain_owner;

create or replace function private.entitlement_recompute(
  p_platform_id uuid,
  p_platform_account_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_status text := 'active';
  v_pause text;
  v_plan_id uuid;
  v_started_at timestamptz;
  v_period_end timestamptz;
  v_next_transition timestamptz;
  v_last_sequence bigint;
begin
  if not exists (
    select 1 from public.platform_accounts a
    where a.platform_id = p_platform_id and a.id = p_platform_account_id
  ) then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;

  select e.event_type into v_pause
  from public.subscription_events e
  where e.platform_id = p_platform_id and e.platform_account_id = p_platform_account_id
    and e.event_type in ('paused', 'resumed')
  order by e.sequence desc limit 1;
  if v_pause = 'paused' then v_status := 'suspended'; end if;

  select g.plan_id, g.starts_at, g.ends_at
    into v_plan_id, v_started_at, v_period_end
  from public.subscription_grants g
  where g.platform_id = p_platform_id and g.platform_account_id = p_platform_account_id
    and g.starts_at <= v_now
    and (g.ends_at is null or g.ends_at > v_now)
    and not exists (
      select 1 from public.subscription_events r
      where r.platform_id = g.platform_id and r.platform_account_id = g.platform_account_id
        and r.grant_id = g.id and r.event_type = 'revoked'
    )
  order by g.starts_at desc, g.created_at desc limit 1;

  if v_plan_id is not null and v_period_end is not null then
    select max(g.ends_at) into v_period_end
    from public.subscription_grants g
    where g.platform_id = p_platform_id and g.platform_account_id = p_platform_account_id
      and g.plan_id = v_plan_id and g.ends_at is not null and g.ends_at > v_now
      and not exists (
        select 1 from public.subscription_events r
        where r.platform_id = g.platform_id and r.platform_account_id = g.platform_account_id
          and r.grant_id = g.id and r.event_type = 'revoked'
      );
  end if;

  select min(g.starts_at) into v_next_transition
  from public.subscription_grants g
  where g.platform_id = p_platform_id and g.platform_account_id = p_platform_account_id
    and g.starts_at > v_now
    and not exists (
      select 1 from public.subscription_events r
      where r.platform_id = g.platform_id and r.platform_account_id = g.platform_account_id
        and r.grant_id = g.id and r.event_type = 'revoked'
    );
  if v_period_end is not null and (v_next_transition is null or v_period_end < v_next_transition) then
    v_next_transition := v_period_end;
  end if;

  select coalesce(max(e.sequence), 0) into v_last_sequence
  from public.subscription_events e
  where e.platform_id = p_platform_id and e.platform_account_id = p_platform_account_id;

  insert into public.subscriptions (
    platform_id, platform_account_id, plan_id, status, started_at,
    current_period_end, next_transition_at, last_event_sequence
  ) values (
    p_platform_id, p_platform_account_id, v_plan_id, v_status, v_started_at,
    v_period_end, v_next_transition, v_last_sequence
  ) on conflict (platform_account_id) do update set
    plan_id = excluded.plan_id,
    status = excluded.status,
    started_at = excluded.started_at,
    current_period_end = excluded.current_period_end,
    next_transition_at = excluded.next_transition_at,
    last_event_sequence = excluded.last_event_sequence;
end;
$$;

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
  elsif p_duration_unit = 'day' then v_end := v_start + make_interval(days => p_duration_value);
  elsif p_duration_unit = 'month' then v_end := v_start + make_interval(months => p_duration_value);
  else v_end := v_start + make_interval(years => p_duration_value);
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

create or replace function private.entitlement_read(
  p_ctx private.account_context
)
returns table (
  effective_status text,
  entitlement_kind text,
  plan_id uuid,
  code text,
  name text,
  description text,
  features jsonb,
  started_at timestamptz,
  current_period_end timestamptz,
  next_transition_at timestamptz,
  evaluated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_authorization text;
  v_account_id uuid;
  v_sub public.subscriptions;
  v_plan public.plans;
  v_default public.plans;
  v_now timestamptz := clock_timestamp();
begin
  select principal.authorization, principal.platform_account_id into v_authorization, v_account_id
  from private.account_principal(p_ctx) principal;
  if v_authorization <> 'allowed' then raise exception using errcode = '42501', message = v_authorization; end if;
  perform private.entitlement_recompute((p_ctx).platform_id, v_account_id);
  select * into v_sub from public.subscriptions s where s.platform_account_id = v_account_id;
  if v_sub.status = 'suspended' then
    return query select 'suspended'::text, 'none'::text, null::uuid, null::text, null::text, null::text,
      '{}'::jsonb, null::timestamptz, null::timestamptz, v_sub.next_transition_at, v_now;
    return;
  end if;
  if v_sub.plan_id is not null then
    select * into v_plan from public.plans p where p.platform_id = (p_ctx).platform_id and p.id = v_sub.plan_id;
    return query select 'active'::text, case when v_sub.current_period_end is null then 'perpetual' else 'term' end,
      v_plan.id, v_plan.code, v_plan.name, v_plan.description, v_plan.features,
      v_sub.started_at, v_sub.current_period_end, v_sub.next_transition_at, v_now;
    return;
  end if;
  select p.* into v_default from public.platforms platform
  join public.plans p on p.platform_id = platform.id and p.id = platform.default_plan_id
  where platform.id = (p_ctx).platform_id and p.status = 'active' and p.kind = 'free';
  if found then
    return query select 'active'::text, 'free'::text, v_default.id, v_default.code, v_default.name,
      v_default.description, v_default.features, null::timestamptz, null::timestamptz,
      v_sub.next_transition_at, v_now;
  else
    return query select 'none'::text, 'none'::text, null::uuid, null::text, null::text, null::text,
      '{}'::jsonb, null::timestamptz, null::timestamptz, v_sub.next_transition_at, v_now;
  end if;
end;
$$;

create or replace function private.admin_entitlement_command(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_platform_account_id uuid,
  p_action text,
  p_operation_id uuid,
  p_plan_id uuid default null,
  p_duration_value integer default null,
  p_duration_unit text default null,
  p_grant_id uuid default null,
  p_reason text default null
)
returns table (outcome text, grant_id uuid, account_status text)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_account public.platform_accounts;
  v_grant public.subscription_grants;
  v_sequence bigint;
  v_existing public.subscription_events;
  v_new_grant record;
begin
  if p_operation_id is null or p_reason is null or length(p_reason) not between 1 and 1024
     or p_action not in ('grant', 'revoke', 'pause', 'resume') then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if not exists (select 1 from private.system_admin where user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active) then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
  select * into v_account from public.platform_accounts a
  where a.platform_id = p_platform_id and a.id = p_platform_account_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  select * into v_existing from public.subscription_events e
  where e.platform_id = p_platform_id and e.platform_account_id = p_platform_account_id
    and e.operation_id = p_operation_id and e.event_type = case when p_action = 'grant' then 'granted' when p_action = 'revoke' then 'revoked' else p_action || 'd' end;
  if found then return query select 'replayed'::text, v_existing.grant_id, v_account.status; return; end if;

  if p_action = 'grant' then
    select * into v_new_grant from private.entitlement_apply(
      p_platform_id, p_platform_account_id, p_plan_id, 'admin', p_operation_id,
      p_duration_value, p_duration_unit, (p_ctx).admin_user_id, p_reason, null);
    return query select 'applied'::text, v_new_grant.grant_id, v_account.status;
    return;
  end if;
  if p_action = 'revoke' then
    select * into v_grant from public.subscription_grants g
    where g.platform_id = p_platform_id and g.platform_account_id = p_platform_account_id and g.id = p_grant_id;
    if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
    select coalesce(max(e.sequence), 0) + 1 into v_sequence from public.subscription_events e
    where e.platform_id = p_platform_id and e.platform_account_id = p_platform_account_id;
    insert into public.subscription_events(platform_id, platform_account_id, sequence, event_type, grant_id, operation_id, actor_user_id, reason)
      values(p_platform_id, p_platform_account_id, v_sequence, 'revoked', p_grant_id, p_operation_id, (p_ctx).admin_user_id, p_reason);
    perform private.entitlement_recompute(p_platform_id, p_platform_account_id);
    perform private.audit_append(p_operation_id, 'admin', (p_ctx).admin_user_id, p_platform_id, p_platform_account_id,
      'entitlement.revoked', 'subscription_grant', p_grant_id, null, null, '{}'::jsonb);
    return query select 'applied'::text, p_grant_id, v_account.status;
    return;
  end if;
  select coalesce(max(e.sequence), 0) + 1 into v_sequence from public.subscription_events e
  where e.platform_id = p_platform_id and e.platform_account_id = p_platform_account_id;
  insert into public.subscription_events(platform_id, platform_account_id, sequence, event_type, operation_id, actor_user_id, reason)
    values(p_platform_id, p_platform_account_id, v_sequence, p_action || 'd', p_operation_id, (p_ctx).admin_user_id, p_reason);
  perform private.entitlement_recompute(p_platform_id, p_platform_account_id);
  perform private.audit_append(p_operation_id, 'admin', (p_ctx).admin_user_id, p_platform_id, p_platform_account_id,
    'entitlement.' || p_action, 'platform_account', p_platform_account_id, null, null, '{}'::jsonb);
  return query select 'applied'::text, null::uuid, v_account.status;
end;
$$;

alter function private.entitlement_recompute(uuid, uuid) owner to domain_owner;
alter function private.entitlement_apply(uuid, uuid, uuid, text, uuid, integer, text, uuid, text, uuid) owner to domain_owner;
alter function private.entitlement_read(private.account_context) owner to domain_owner;
alter function private.admin_entitlement_command(private.admin_context, uuid, uuid, text, uuid, uuid, integer, text, uuid, text) owner to domain_owner;

revoke all on function private.entitlement_recompute(uuid, uuid) from public, anon, authenticated, account_executor, admin_executor, job_executor, recovery_executor;
revoke all on function private.entitlement_apply(uuid, uuid, uuid, text, uuid, integer, text, uuid, text, uuid) from public, anon, authenticated, account_executor, admin_executor, job_executor, recovery_executor;
revoke all on function private.entitlement_read(private.account_context) from public, anon, authenticated, admin_executor, job_executor, recovery_executor;
revoke all on function private.admin_entitlement_command(private.admin_context, uuid, uuid, text, uuid, uuid, integer, text, uuid, text) from public, anon, authenticated, account_executor, job_executor, recovery_executor;
grant execute on function private.entitlement_read(private.account_context) to account_executor;
grant execute on function private.admin_entitlement_command(private.admin_context, uuid, uuid, text, uuid, uuid, integer, text, uuid, text) to admin_executor;
