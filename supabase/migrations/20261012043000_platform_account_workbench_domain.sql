-- OPT-009 Phase 01: Platform Account workbench domain, authoritative read models,
-- governance reason persistence, and support-data privacy lifecycle integration.

create table public.platform_account_admin_tags (
  platform_id uuid not null,
  platform_account_id uuid not null,
  tag text not null check (length(tag) between 1 and 32 and tag !~ '[[:cntrl:]]'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (platform_id, platform_account_id, tag),
  foreign key (platform_id, platform_account_id)
    references public.platform_accounts(platform_id, id) on delete restrict
);

create table public.platform_account_admin_notes (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null,
  platform_account_id uuid not null,
  body text not null check (length(body) between 1 and 2000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  redacted_at timestamptz,
  foreign key (platform_id, platform_account_id)
    references public.platform_accounts(platform_id, id) on delete restrict
);

create table public.platform_account_governance_events (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null,
  platform_account_id uuid not null,
  action text not null check (action in ('suspend', 'restore', 'close')),
  reason text not null check (length(reason) between 1 and 2000),
  actor_admin_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (platform_id, platform_account_id)
    references public.platform_accounts(platform_id, id) on delete restrict
);

create index platform_account_admin_tags_account_idx
  on public.platform_account_admin_tags(platform_id, platform_account_id, tag);
create index platform_account_admin_tags_filter_idx
  on public.platform_account_admin_tags(platform_id, tag, platform_account_id);
create index platform_account_admin_notes_account_idx
  on public.platform_account_admin_notes(platform_id, platform_account_id, created_at desc, id desc);
create index platform_account_governance_events_account_idx
  on public.platform_account_governance_events(platform_id, platform_account_id, created_at desc, id desc);
create index platform_accounts_admin_sort_idx
  on public.platform_accounts(platform_id, created_at desc, id desc);

alter table public.platform_account_admin_tags enable row level security;
alter table public.platform_account_admin_tags force row level security;
alter table public.platform_account_admin_notes enable row level security;
alter table public.platform_account_admin_notes force row level security;
alter table public.platform_account_governance_events enable row level security;
alter table public.platform_account_governance_events force row level security;

create policy platform_account_admin_tags_domain_owner
  on public.platform_account_admin_tags for all to domain_owner using (true) with check (true);
create policy platform_account_admin_notes_domain_owner
  on public.platform_account_admin_notes for all to domain_owner using (true) with check (true);
create policy platform_account_governance_events_domain_owner
  on public.platform_account_governance_events for all to domain_owner using (true) with check (true);

revoke all on public.platform_account_admin_tags,
  public.platform_account_admin_notes,
  public.platform_account_governance_events
from public, anon, authenticated, account_executor, admin_executor, job_executor, recovery_executor;
grant select, insert, update, delete on public.platform_account_admin_tags,
  public.platform_account_admin_notes,
  public.platform_account_governance_events
to domain_owner;

create or replace function private.admin_account_list_v3(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_cursor_account_id uuid default null,
  p_limit integer default 20,
  p_query text default null,
  p_status text default null,
  p_plan_id uuid default null,
  p_subscription_status text default null,
  p_tag text default null,
  p_joined_from timestamptz default null,
  p_joined_to timestamptz default null
)
returns table (
  platform_account_id uuid,
  user_id uuid,
  account_status text,
  display_name text,
  avatar_url text,
  plan_id uuid,
  plan_code text,
  plan_name text,
  plan_kind text,
  subscription_status text,
  current_period_end timestamptz,
  tags text[],
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
declare
  v_query text := nullif(btrim(p_query), '');
  v_tag text := nullif(lower(btrim(p_tag)), '');
  v_cursor_created_at timestamptz;
begin
  perform private.billing_admin_assert(p_ctx);
  if p_platform_id is null or p_limit is null or p_limit not between 1 and 100
     or v_query is not null and length(v_query) > 128
     or p_status is not null and p_status not in ('active', 'suspended', 'closed')
     or p_subscription_status is not null and p_subscription_status not in ('active', 'suspended', 'none')
     or v_tag is not null and (length(v_tag) > 32 or v_tag ~ '[[:cntrl:]]')
     or p_joined_from is not null and p_joined_to is not null and p_joined_from > p_joined_to then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if not exists (select 1 from public.platforms p where p.id = p_platform_id) then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  if p_cursor_account_id is not null then
    select a.created_at into v_cursor_created_at
    from public.platform_accounts a
    where a.platform_id = p_platform_id and a.id = p_cursor_account_id;
    if v_cursor_created_at is null then
      raise exception using errcode = 'P0002', message = 'resource_not_found';
    end if;
  end if;

  return query
  select a.id, a.user_id, a.status, pr.display_name, pr.avatar_url,
    pl.id, pl.code, pl.name, pl.kind, coalesce(s.status, 'none'::text),
    s.current_period_end,
    coalesce((
      select array_agg(t.tag order by t.tag)
      from public.platform_account_admin_tags t
      where t.platform_id = a.platform_id and t.platform_account_id = a.id
    ), '{}'::text[]),
    a.activated_at, a.suspended_at, a.closed_at, a.created_at, a.updated_at
  from public.platform_accounts a
  left join public.platform_profiles pr on pr.platform_account_id = a.id
  left join public.subscriptions s
    on s.platform_id = a.platform_id and s.platform_account_id = a.id
  left join public.plans pl
    on pl.platform_id = a.platform_id and pl.id = s.plan_id
  where a.platform_id = p_platform_id
    and (v_query is null
      or a.id::text ilike '%' || v_query || '%'
      or coalesce(a.user_id::text, '') ilike '%' || v_query || '%'
      or coalesce(pr.display_name, '') ilike '%' || v_query || '%'
      or coalesce(pl.name, '') ilike '%' || v_query || '%'
      or coalesce(pl.code, '') ilike '%' || v_query || '%')
    and (p_status is null or a.status = p_status)
    and (p_plan_id is null or s.plan_id = p_plan_id)
    and (p_subscription_status is null
      or p_subscription_status = 'none' and s.id is null
      or p_subscription_status in ('active', 'suspended') and s.status = p_subscription_status)
    and (v_tag is null or exists (
      select 1 from public.platform_account_admin_tags t
      where t.platform_id = a.platform_id and t.platform_account_id = a.id and t.tag = v_tag
    ))
    and (p_joined_from is null or a.created_at >= p_joined_from)
    and (p_joined_to is null or a.created_at <= p_joined_to)
    and (p_cursor_account_id is null or (a.created_at, a.id) < (v_cursor_created_at, p_cursor_account_id))
  order by a.created_at desc, a.id desc
  limit p_limit;
end;
$$;

create or replace function private.admin_account_workbench_read(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_platform_account_id uuid
)
returns table (
  platform_account_id uuid,
  user_id uuid,
  account_status text,
  activated_at timestamptz,
  suspended_at timestamptz,
  closed_at timestamptz,
  anonymized_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  display_name text,
  avatar_url text,
  bio text,
  locale text,
  timezone text,
  plan_id uuid,
  plan_code text,
  plan_name text,
  plan_kind text,
  subscription_status text,
  subscription_started_at timestamptz,
  current_period_end timestamptz,
  next_transition_at timestamptz,
  billing_order_count bigint,
  billing_attention_count bigint,
  billing_latest jsonb,
  config_active_count bigint,
  config_published_count bigint,
  config_pending_review_count bigint,
  config_latest_updated_at timestamptz,
  feedback_count bigint,
  feedback_open_count bigint,
  feedback_latest_submitted_at timestamptz,
  tags text[],
  notes jsonb,
  governance_events jsonb
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
begin
  perform private.billing_admin_assert(p_ctx);
  if p_platform_id is null or p_platform_account_id is null then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if not exists (
    select 1 from public.platform_accounts a
    where a.platform_id = p_platform_id and a.id = p_platform_account_id
  ) then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;

  return query
  select a.id, a.user_id, a.status, a.activated_at, a.suspended_at, a.closed_at,
    a.anonymized_at, a.created_at, a.updated_at,
    pr.display_name, pr.avatar_url, pr.bio, pr.locale, pr.timezone,
    pl.id, pl.code, pl.name, pl.kind, coalesce(s.status, 'none'::text),
    s.started_at, s.current_period_end, s.next_transition_at,
    (select count(*) from public.billing_orders bo
      where bo.platform_id = a.platform_id and bo.platform_account_id = a.id),
    (select count(*) from public.billing_orders bo
      left join public.billing_settlements bs on bs.billing_order_id = bo.id
      where bo.platform_id = a.platform_id and bo.platform_account_id = a.id
        and bo.resolution_status = 'open'
        and (bo.verification_status <> 'verified'
          or bo.entitlement_status in ('not_started', 'blocked')
          or bo.linkage_status <> 'linked'
          or bs.state in ('retryable', 'blocked', 'review_required'))),
    coalesce((select jsonb_build_object(
        'order_id', bo.id,
        'provider_status', bo.provider_status,
        'verification_status', bo.verification_status,
        'entitlement_status', bo.entitlement_status,
        'linkage_status', bo.linkage_status,
        'resolution_status', bo.resolution_status,
        'settlement_state', bs.state,
        'updated_at', bo.updated_at
      )
      from public.billing_orders bo
      left join public.billing_settlements bs on bs.billing_order_id = bo.id
      where bo.platform_id = a.platform_id and bo.platform_account_id = a.id
      order by bo.updated_at desc, bo.id desc limit 1), '{}'::jsonb),
    (select count(*) from public.platform_configs c
      where c.platform_id = a.platform_id and c.platform_account_id = a.id and c.status = 'active'),
    (select count(*) from public.platform_configs c
      join public.platform_config_gallery_entries ge
        on ge.platform_id = c.platform_id and ge.config_id = c.id and ge.status = 'approved'
      where c.platform_id = a.platform_id and c.platform_account_id = a.id),
    (select count(*) from public.platform_config_gallery_submissions gs
      where gs.platform_id = a.platform_id and gs.submitted_by_account_id = a.id and gs.status = 'pending'),
    (select max(c.updated_at) from public.platform_configs c
      where c.platform_id = a.platform_id and c.platform_account_id = a.id and c.status <> 'deleted'),
    (select count(*) from public.platform_feedback f
      where f.platform_id = a.platform_id and f.platform_account_id = a.id and f.status not in ('draft', 'deleted')),
    (select count(*) from public.platform_feedback f
      where f.platform_id = a.platform_id and f.platform_account_id = a.id and f.status in ('new', 'reviewing')),
    (select max(f.submitted_at) from public.platform_feedback f
      where f.platform_id = a.platform_id and f.platform_account_id = a.id and f.status not in ('draft', 'deleted')),
    coalesce((select array_agg(t.tag order by t.tag)
      from public.platform_account_admin_tags t
      where t.platform_id = a.platform_id and t.platform_account_id = a.id), '{}'::text[]),
    coalesce((select jsonb_agg(jsonb_build_object(
        'id', n.id, 'body', n.body, 'created_by', n.created_by,
        'created_at', n.created_at, 'redacted_at', n.redacted_at
      ) order by n.created_at desc, n.id desc)
      from (select * from public.platform_account_admin_notes nx
        where nx.platform_id = a.platform_id and nx.platform_account_id = a.id
        order by nx.created_at desc, nx.id desc limit 20) n), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
        'id', g.id, 'action', g.action, 'reason', g.reason,
        'actor_admin_user_id', g.actor_admin_user_id, 'created_at', g.created_at
      ) order by g.created_at desc, g.id desc)
      from (select * from public.platform_account_governance_events gx
        where gx.platform_id = a.platform_id and gx.platform_account_id = a.id
        order by gx.created_at desc, gx.id desc limit 50) g), '[]'::jsonb)
  from public.platform_accounts a
  left join public.platform_profiles pr on pr.platform_account_id = a.id
  left join public.subscriptions s
    on s.platform_id = a.platform_id and s.platform_account_id = a.id
  left join public.plans pl on pl.platform_id = a.platform_id and pl.id = s.plan_id
  where a.platform_id = p_platform_id and a.id = p_platform_account_id;
end;
$$;

create or replace function private.admin_account_tags_replace(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_platform_account_id uuid,
  p_tags text[]
)
returns table (platform_account_id uuid, tags text[])
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare v_tags text[];
begin
  perform private.billing_admin_assert(p_ctx);
  if p_platform_id is null or p_platform_account_id is null or p_tags is null then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if not exists (select 1 from public.platform_accounts a
    where a.platform_id = p_platform_id and a.id = p_platform_account_id) then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  select coalesce(array_agg(tag order by tag), '{}'::text[]) into v_tags
  from (select distinct lower(btrim(raw_tag)) as tag from unnest(p_tags) raw_tag) normalized;
  if cardinality(v_tags) > 20 or exists (
    select 1 from unnest(v_tags) tag where length(tag) not between 1 and 32 or tag ~ '[[:cntrl:]]'
  ) then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  delete from public.platform_account_admin_tags t
  where t.platform_id = p_platform_id and t.platform_account_id = p_platform_account_id;
  insert into public.platform_account_admin_tags(platform_id, platform_account_id, tag, created_by)
  select p_platform_id, p_platform_account_id, tag, (p_ctx).admin_user_id from unnest(v_tags) tag;
  perform private.audit_append(
    (p_ctx).request_id, 'admin', (p_ctx).admin_user_id, p_platform_id, p_platform_account_id,
    'account.tags_replaced', 'platform_account', p_platform_account_id, null, null,
    jsonb_build_object('tag_count', cardinality(v_tags))
  );
  return query select p_platform_account_id, v_tags;
end;
$$;

create or replace function private.admin_account_note_add(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_platform_account_id uuid,
  p_body text
)
returns table (note_id uuid, platform_account_id uuid, created_at timestamptz)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare v_note public.platform_account_admin_notes;
begin
  perform private.billing_admin_assert(p_ctx);
  if p_platform_id is null or p_platform_account_id is null or p_body is null
     or length(btrim(p_body)) not between 1 and 2000 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if not exists (select 1 from public.platform_accounts a
    where a.platform_id = p_platform_id and a.id = p_platform_account_id) then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  insert into public.platform_account_admin_notes(platform_id, platform_account_id, body, created_by)
  values (p_platform_id, p_platform_account_id, btrim(p_body), (p_ctx).admin_user_id)
  returning * into v_note;
  perform private.audit_append(
    (p_ctx).request_id, 'admin', (p_ctx).admin_user_id, p_platform_id, p_platform_account_id,
    'account.note_added', 'platform_account', p_platform_account_id, null, null,
    jsonb_build_object('note_id', v_note.id)
  );
  return query select v_note.id, v_note.platform_account_id, v_note.created_at;
end;
$$;

create or replace function private.admin_account_transition_v2(
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
begin
  perform private.billing_admin_assert(p_ctx);
  if p_platform_id is null or p_platform_account_id is null
     or p_action not in ('suspend', 'restore', 'close')
     or p_reason is null or length(v_reason) not between 1 and 2000 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_account from public.platform_accounts a
  where a.platform_id = p_platform_id and a.id = p_platform_account_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  if p_action = 'suspend' and v_account.status = 'active' then
    update public.platform_accounts a set status = 'suspended', suspended_at = clock_timestamp()
    where a.id = v_account.id returning * into v_account;
  elsif p_action = 'restore' and v_account.status = 'suspended' then
    update public.platform_accounts a set status = 'active', suspended_at = null
    where a.id = v_account.id returning * into v_account;
  elsif p_action = 'close' and v_account.status <> 'closed' then
    update public.platform_accounts a set status = 'closed', closed_at = coalesce(closed_at, clock_timestamp())
    where a.id = v_account.id returning * into v_account;
  end if;
  insert into public.platform_account_governance_events(
    platform_id, platform_account_id, action, reason, actor_admin_user_id
  ) values (
    p_platform_id, p_platform_account_id, p_action, v_reason, (p_ctx).admin_user_id
  ) returning * into v_event;
  perform private.audit_append(
    (p_ctx).request_id, 'admin', (p_ctx).admin_user_id, p_platform_id, p_platform_account_id,
    'account.' || p_action, 'platform_account', p_platform_account_id, null, null,
    jsonb_build_object('governance_event_id', v_event.id, 'action', p_action)
  );
  return query select v_account.id, v_account.status, v_event.id;
end;
$$;

create or replace function private.account_admin_support_privacy_cleanup(
  p_platform_account_id uuid,
  p_now timestamptz default clock_timestamp()
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
begin
  if p_platform_account_id is null or p_now is null then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  delete from public.platform_account_admin_tags t
  where t.platform_account_id = p_platform_account_id;
  update public.platform_account_admin_notes n
  set body = '[redacted]', redacted_at = coalesce(n.redacted_at, p_now)
  where n.platform_account_id = p_platform_account_id and n.redacted_at is null;
  update public.platform_account_governance_events g
  set reason = '[redacted]'
  where g.platform_account_id = p_platform_account_id and g.reason <> '[redacted]';
end;
$$;

-- Extend the latest lifecycle entrypoints without adding a checkpoint. Support PII is
-- minimized alongside Config/Feedback in Global Delete and before account anonymization
-- in retention. Ordinary Admin close intentionally preserves support history.
create or replace function private.account_retention_cleanup(
  p_ctx private.job_context,
  p_platform_account_id uuid,
  p_cutoff timestamptz default null,
  p_lease_seconds integer default 60
)
returns table (
  platform_account_id uuid, action text, status text,
  anonymized_at timestamptz, fencing_token bigint
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_account public.platform_accounts;
  v_claim record;
  v_now timestamptz := clock_timestamp();
  v_cutoff timestamptz;
  v_retention_days integer;
begin
  if (p_ctx).job_id is null or (p_ctx).lease_owner is null
     or (p_ctx).fencing_token is null or (p_ctx).fencing_token < 1
     or (p_ctx).request_id is null or p_platform_account_id is null
     or p_lease_seconds not between 1 and 3600 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select policy.cutoff_at, policy.retention_days into v_cutoff, v_retention_days
  from private.account_retention_cutoff(p_cutoff) policy;
  select * into v_claim from private.job_lease_claim(
    'account_retention', p_platform_account_id, (p_ctx).lease_owner, p_lease_seconds
  );
  if not coalesce(v_claim.claimed, false) then
    return query select p_platform_account_id, 'busy'::text, null::text,
      null::timestamptz, v_claim.fencing_token;
    return;
  end if;
  select * into v_account from public.platform_accounts a
  where a.id = p_platform_account_id for update;
  if not found then
    perform private.job_lease_release('account_retention', p_platform_account_id,
      (p_ctx).lease_owner, v_claim.fencing_token);
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  if v_account.status <> 'closed' or v_account.user_id is null
     or v_account.closed_at is null or v_account.closed_at > v_cutoff then
    perform private.job_lease_release('account_retention', p_platform_account_id,
      (p_ctx).lease_owner, v_claim.fencing_token);
    return query select v_account.id, 'skipped'::text, v_account.status,
      v_account.anonymized_at, v_claim.fencing_token;
    return;
  end if;

  perform private.config_account_privacy_cleanup(v_account.id, v_now, 'account_retention_cleanup');
  perform private.feedback_account_privacy_cleanup(v_account.id, v_now, 'account_retention_cleanup');
  perform private.account_admin_support_privacy_cleanup(v_account.id, v_now);
  update public.platform_profiles p
  set display_name = null, avatar_url = null, bio = null, locale = null,
    timezone = null, metadata = '{}'::jsonb
  where p.platform_account_id = v_account.id;
  update public.platform_preferences p set preferences = '{}'::jsonb
  where p.platform_account_id = v_account.id;
  update public.platform_config_files f
  set status = case when f.status = 'deleted' then 'deleted' else 'deleting' end,
    cancel_requested_at = coalesce(f.cancel_requested_at, v_now),
    delete_requested_at = coalesce(f.delete_requested_at, v_now), next_attempt_at = v_now
  where f.platform_account_id = v_account.id and f.status <> 'deleted';
  update public.audit_logs l
  set actor_user_id = null, ip = null, user_agent = null, metadata = '{}'::jsonb
  where l.platform_account_id = v_account.id;
  update public.platform_accounts a
  set user_id = null, anonymized_at = coalesce(a.anonymized_at, v_now),
    status = 'closed', closed_at = coalesce(a.closed_at, v_now)
  where a.id = v_account.id returning * into v_account;
  perform private.audit_append(
    (p_ctx).request_id, 'job', null, v_account.platform_id, v_account.id,
    'account.retention_cleaned', 'platform_account', v_account.id, null, null,
    jsonb_build_object('closed_at', v_account.closed_at,
      'personal_data_retention_days', v_retention_days)
  );
  perform private.job_lease_release('account_retention', p_platform_account_id,
    (p_ctx).lease_owner, v_claim.fencing_token);
  return query select v_account.id, 'cleaned'::text, v_account.status,
    v_account.anonymized_at, v_claim.fencing_token;
end;
$$;

create or replace function private.deletion_job_step(
  p_ctx private.job_context,
  p_job_id uuid,
  p_lease_fence bigint,
  p_step text,
  p_outcome text,
  p_error_code text default null
)
returns table (job_id uuid, state text, checkpoint text, retry_count integer, next_attempt_at timestamptz)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_job private.deletion_jobs;
  v_lease private.job_leases;
  v_next text;
  v_now timestamptz := clock_timestamp();
begin
  if (p_ctx).job_id is null or (p_ctx).lease_owner is null
     or (p_ctx).fencing_token is null or (p_ctx).request_id is null
     or p_job_id is null or p_lease_fence is null or p_lease_fence < 1
     or p_step not in ('sessions_revoked', 'accounts_closed', 'files_blocked', 'personal_data_cleared', 'history_anonymized', 'auth_deleted')
     or p_outcome not in ('completed', 'retry', 'blocked')
     or p_outcome in ('retry', 'blocked') and (p_error_code is null or length(p_error_code) not between 1 and 128) then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into v_lease from private.job_leases l
  where l.job_kind = 'global_delete' and l.resource_id = p_job_id
    and l.lease_owner = (p_ctx).lease_owner and l.fencing_token = p_lease_fence for update;
  if not found then raise exception using errcode = '40001', message = 'stale_job_fence'; end if;
  select * into v_job from private.deletion_jobs j where j.id = p_job_id for update;
  if not found or v_job.state <> 'running' or v_job.fence <> (p_ctx).fencing_token then
    raise exception using errcode = '40001', message = 'stale_job_fence';
  end if;
  v_next := case v_job.checkpoint
    when 'created' then 'sessions_revoked'
    when 'sessions_revoked' then 'accounts_closed'
    when 'accounts_closed' then 'files_blocked'
    when 'files_blocked' then 'personal_data_cleared'
    when 'personal_data_cleared' then 'history_anonymized'
    when 'history_anonymized' then 'auth_deleted'
    else null end;
  if p_step <> v_next then raise exception using errcode = 'P0001', message = 'invalid_delete_checkpoint'; end if;
  if p_outcome = 'completed' then
    if p_step = 'accounts_closed' then
      update public.platform_accounts set status = 'closed', closed_at = coalesce(closed_at, v_now)
      where user_id = v_job.user_id and status <> 'closed';
    elsif p_step = 'files_blocked' then
      perform private.config_account_privacy_cleanup(a.id, v_now, 'global_delete')
      from public.platform_accounts a where a.user_id = v_job.user_id;
      perform private.feedback_account_privacy_cleanup(a.id, v_now, 'global_delete')
      from public.platform_accounts a where a.user_id = v_job.user_id;
      perform private.account_admin_support_privacy_cleanup(a.id, v_now)
      from public.platform_accounts a where a.user_id = v_job.user_id;
      update public.platform_config_files f
      set status = case when f.status = 'deleted' then 'deleted' else 'deleting' end,
          cancel_requested_at = coalesce(f.cancel_requested_at, v_now),
          delete_requested_at = coalesce(f.delete_requested_at, v_now), next_attempt_at = v_now
      from public.platform_accounts a
      where a.id = f.platform_account_id and a.user_id = v_job.user_id and f.status <> 'deleted';
    elsif p_step = 'personal_data_cleared' then
      update public.platform_profiles profile set display_name = null, avatar_url = null,
        bio = null, locale = null, timezone = null, metadata = '{}'::jsonb
      from public.platform_accounts a
      where a.id = profile.platform_account_id and a.user_id = v_job.user_id;
      update public.platform_preferences prefs set preferences = '{}'::jsonb
      from public.platform_accounts a
      where a.id = prefs.platform_account_id and a.user_id = v_job.user_id;
    elsif p_step = 'history_anonymized' then
      update public.audit_logs set actor_user_id = null, ip = null, user_agent = null, metadata = '{}'::jsonb
      where actor_user_id = v_job.user_id;
    elsif p_step = 'auth_deleted' then
      update public.platform_accounts set user_id = null, anonymized_at = coalesce(anonymized_at, v_now),
        status = 'closed', closed_at = coalesce(closed_at, v_now)
      where user_id = v_job.user_id;
      delete from private.identity_lifecycle where user_id = v_job.user_id;
    end if;
    update private.deletion_jobs j set checkpoint = p_step,
      state = case when p_step = 'auth_deleted' then 'completed' else 'retry' end,
      next_attempt_at = case when p_step = 'auth_deleted' then j.next_attempt_at else v_now end,
      completed_at = case when p_step = 'auth_deleted' then v_now else null end,
      last_error_code = null where j.id = v_job.id returning * into v_job;
  else
    update private.deletion_jobs j set state = p_outcome, retry_count = j.retry_count + 1,
      next_attempt_at = v_now + make_interval(secs => least(3600, 60 * (2 ^ least(j.retry_count, 6)))),
      last_error_code = p_error_code where j.id = v_job.id returning * into v_job;
  end if;
  perform private.job_lease_release('global_delete', p_job_id, (p_ctx).lease_owner, p_lease_fence);
  return query select v_job.id, v_job.state, v_job.checkpoint, v_job.retry_count, v_job.next_attempt_at;
end;
$$;

alter function private.admin_account_list_v3(private.admin_context, uuid, uuid, integer, text, text, uuid, text, text, timestamptz, timestamptz) owner to domain_owner;
alter function private.admin_account_workbench_read(private.admin_context, uuid, uuid) owner to domain_owner;
alter function private.admin_account_tags_replace(private.admin_context, uuid, uuid, text[]) owner to domain_owner;
alter function private.admin_account_note_add(private.admin_context, uuid, uuid, text) owner to domain_owner;
alter function private.admin_account_transition_v2(private.admin_context, uuid, uuid, text, text) owner to domain_owner;
alter function private.account_admin_support_privacy_cleanup(uuid, timestamptz) owner to domain_owner;
alter function private.account_retention_cleanup(private.job_context, uuid, timestamptz, integer) owner to domain_owner;
alter function private.deletion_job_step(private.job_context, uuid, bigint, text, text, text) owner to domain_owner;

revoke all on function private.admin_account_list_v3(private.admin_context, uuid, uuid, integer, text, text, uuid, text, text, timestamptz, timestamptz),
  private.admin_account_workbench_read(private.admin_context, uuid, uuid),
  private.admin_account_tags_replace(private.admin_context, uuid, uuid, text[]),
  private.admin_account_note_add(private.admin_context, uuid, uuid, text),
  private.admin_account_transition_v2(private.admin_context, uuid, uuid, text, text),
  private.account_admin_support_privacy_cleanup(uuid, timestamptz),
  private.account_retention_cleanup(private.job_context, uuid, timestamptz, integer),
  private.deletion_job_step(private.job_context, uuid, bigint, text, text, text)
from public, anon, authenticated, account_executor, admin_executor, job_executor, recovery_executor;

grant execute on function private.admin_account_list_v3(private.admin_context, uuid, uuid, integer, text, text, uuid, text, text, timestamptz, timestamptz),
  private.admin_account_workbench_read(private.admin_context, uuid, uuid),
  private.admin_account_tags_replace(private.admin_context, uuid, uuid, text[]),
  private.admin_account_note_add(private.admin_context, uuid, uuid, text),
  private.admin_account_transition_v2(private.admin_context, uuid, uuid, text, text)
to admin_executor;

grant execute on function private.account_retention_cleanup(private.job_context, uuid, timestamptz, integer),
  private.deletion_job_step(private.job_context, uuid, bigint, text, text, text)
to job_executor;
