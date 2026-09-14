-- TASK-0401/TASK-0706 D3 forward-fix:
-- pause only stops new paid purchases; existing finite grants remain readable
-- until their recorded ends_at.  Plan archival is terminal and preserves all
-- historical order/snapshot/grant foreign keys.  Personal-data cleanup is
-- blocked until an explicit legal/financial retention policy is configured.

alter table public.platform_subscription_config
  add column purchases_paused boolean not null default false;

comment on column public.platform_subscription_config.purchases_paused is
  'Stops new paid checkout creation while preserving existing finite entitlements.';

create table private.account_retention_policy (
  singleton_id boolean primary key default true check (singleton_id),
  personal_data_retention_days integer not null
    check (personal_data_retention_days between 1 and 36500),
  policy_source text not null check (length(policy_source) between 1 and 128),
  policy_reference text not null check (length(policy_reference) between 1 and 512),
  updated_at timestamptz not null default now()
);

alter table private.account_retention_policy enable row level security;
alter table private.account_retention_policy force row level security;
revoke all on private.account_retention_policy
  from public, anon, authenticated, account_executor, admin_executor,
  job_executor, recovery_executor;
create policy account_retention_policy_domain_owner
  on private.account_retention_policy
  for all to domain_owner using (true) with check (true);
grant select, insert, update on private.account_retention_policy to domain_owner;

comment on table private.account_retention_policy is
  'Explicit legal/financial policy. No row means personal-data anonymization is fail-closed.';

create or replace function private.account_retention_cutoff(
  p_requested_cutoff timestamptz default null
)
returns table (cutoff_at timestamptz, retention_days integer)
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $$
declare
  v_days integer;
  v_policy_cutoff timestamptz;
begin
  select policy.personal_data_retention_days
    into v_days
  from private.account_retention_policy policy
  where policy.singleton_id;
  if v_days is null then
    raise exception using errcode = 'P0001', message = 'retention_policy_not_configured';
  end if;
  v_policy_cutoff := clock_timestamp() - make_interval(days => v_days);
  return query
    select least(coalesce(p_requested_cutoff, v_policy_cutoff), v_policy_cutoff), v_days;
end;
$$;

create or replace function private.account_retention_candidates(
  p_cutoff timestamptz default null,
  p_cursor_account_id uuid default null,
  p_limit integer default 20
)
returns table (platform_account_id uuid, closed_at timestamptz)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_cutoff timestamptz;
begin
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select policy.cutoff_at into v_cutoff
  from private.account_retention_cutoff(p_cutoff) policy;
  return query
    select a.id, a.closed_at
    from public.platform_accounts a
    where a.status = 'closed' and a.user_id is not null
      and a.closed_at is not null
      and a.closed_at <= v_cutoff
      and (p_cursor_account_id is null or a.id > p_cursor_account_id)
    order by a.id
    limit p_limit;
end;
$$;

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
  select policy.cutoff_at, policy.retention_days
    into v_cutoff, v_retention_days
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

  -- Preserve the accounting/settlement/order/grant rows. Only personal fields
  -- and actor-identifying audit fields are minimized here.
  update public.platform_profiles p
  set display_name = null, avatar_url = null, bio = null, locale = null,
    timezone = null, metadata = '{}'::jsonb
  where p.platform_account_id = v_account.id;
  update public.platform_preferences p
  set preferences = '{}'::jsonb
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
  where a.id = v_account.id
  returning * into v_account;
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

alter function private.account_retention_cutoff(timestamptz) owner to domain_owner;
alter function private.account_retention_candidates(timestamptz, uuid, integer) owner to domain_owner;
alter function private.account_retention_cleanup(private.job_context, uuid, timestamptz, integer) owner to domain_owner;
revoke all on function private.account_retention_cutoff(timestamptz)
  from public, anon, authenticated, account_executor, admin_executor, job_executor, recovery_executor;
revoke all on function private.account_retention_candidates(timestamptz, uuid, integer),
  private.account_retention_cleanup(private.job_context, uuid, timestamptz, integer)
  from public, anon, authenticated, account_executor, admin_executor, recovery_executor;
grant execute on function private.account_retention_candidates(timestamptz, uuid, integer),
  private.account_retention_cleanup(private.job_context, uuid, timestamptz, integer)
  to job_executor;

-- An archived Plan is a historical contract. It may be archived while still
-- mapped; the checkout/read contracts below fail closed on its status.
drop trigger if exists plans_prevent_enabled_subscription_archive on public.plans;
drop function if exists private.prevent_enabled_subscription_plan_archive();

create or replace function private.prevent_archived_plan_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
begin
  if old.status = 'archived' then
    raise exception using errcode = 'P0001', message = 'plan_archived_immutable';
  end if;
  return new;
end;
$$;

alter function private.prevent_archived_plan_update() owner to domain_owner;
revoke all on function private.prevent_archived_plan_update()
  from public, anon, authenticated, account_executor, admin_executor,
  job_executor, recovery_executor;
create trigger plans_archived_immutable
before update on public.plans
for each row execute function private.prevent_archived_plan_update();

-- The old read/patch signatures remain for older callers. New callers use v2
-- so the pause state is explicit without silently changing an existing row
-- function return type.
create or replace function private.admin_subscription_config_read_v2(
  p_ctx private.admin_context,
  p_platform_id uuid
)
returns table (
  platform_id uuid,
  paid_plan_id uuid,
  paid_plan_code text,
  paid_plan_name text,
  paid_plan_status text,
  purchases_paused boolean,
  monthly_enabled boolean,
  yearly_enabled boolean,
  lifetime_enabled boolean,
  subscription_copy_override text,
  row_version bigint,
  preflight_blocked_reason text,
  preflight_blocking_count bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
begin
  if (p_ctx).admin_user_id is null or (p_ctx).session_id is null
     or not exists (select 1 from private.system_admin where user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active) then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
  if not exists (select 1 from public.platforms where id = p_platform_id) then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  return query
    select c.platform_id, c.paid_plan_id, p.code, p.name, p.status,
      c.purchases_paused, c.monthly_enabled, c.yearly_enabled, c.lifetime_enabled,
      c.subscription_copy_override, c.row_version, preflight.blocked_reason,
      preflight.blocking_count
    from public.platform_subscription_config c
    left join public.plans p on p.platform_id = c.platform_id and p.id = c.paid_plan_id
    cross join lateral private.subscription_plan_switch_preflight(c.platform_id, c.paid_plan_id) preflight
    where c.platform_id = p_platform_id;
end;
$$;

create or replace function private.admin_subscription_config_patch_v2(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_expected_version bigint,
  p_paid_plan_id uuid,
  p_purchases_paused boolean,
  p_monthly_enabled boolean,
  p_yearly_enabled boolean,
  p_lifetime_enabled boolean,
  p_subscription_copy_override text,
  p_reason text
)
returns table (
  platform_id uuid,
  paid_plan_id uuid,
  paid_plan_code text,
  paid_plan_name text,
  paid_plan_status text,
  purchases_paused boolean,
  monthly_enabled boolean,
  yearly_enabled boolean,
  lifetime_enabled boolean,
  subscription_copy_override text,
  row_version bigint,
  preflight_blocked_reason text,
  preflight_blocking_count bigint
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_platform public.platforms;
  v_config public.platform_subscription_config;
  v_plan public.plans;
  v_preflight record;
begin
  if (p_ctx).admin_user_id is null or (p_ctx).session_id is null or (p_ctx).request_id is null
     or p_platform_id is null or p_expected_version is null or p_expected_version < 1
     or p_purchases_paused is null or p_monthly_enabled is null
     or p_yearly_enabled is null or p_lifetime_enabled is null
     or p_subscription_copy_override is not null and length(p_subscription_copy_override) > 1024
     or p_reason is null or length(p_reason) not between 1 and 1024 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if not exists (select 1 from private.system_admin where user_id = (p_ctx).admin_user_id)
     or not exists (select 1 from private.check_user_session((p_ctx).admin_user_id, (p_ctx).session_id) where active) then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
  select * into v_platform from public.platforms where id = p_platform_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  select * into v_config from public.platform_subscription_config c
  where c.platform_id = p_platform_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  if v_config.row_version <> p_expected_version then
    raise exception using errcode = '40001', message = 'precondition_failed';
  end if;
  if p_paid_plan_id is not null then
    select * into v_plan from public.plans p
    where p.platform_id = p_platform_id and p.id = p_paid_plan_id for update;
    if not found or v_plan.kind <> 'paid'
       or (v_plan.status <> 'active' and p_paid_plan_id is distinct from v_config.paid_plan_id) then
      raise exception using errcode = 'P0001', message = 'plan_unavailable';
    end if;
  end if;
  if v_config.paid_plan_id is distinct from p_paid_plan_id then
    select * into v_preflight from private.subscription_plan_switch_preflight(p_platform_id, p_paid_plan_id);
    if v_preflight.blocked_reason is not null then
      raise exception using errcode = 'P0001', message = 'subscription_plan_switch_blocked';
    end if;
  end if;
  update public.platform_subscription_config c
  set paid_plan_id = p_paid_plan_id,
      purchases_paused = p_purchases_paused,
      monthly_enabled = p_monthly_enabled,
      yearly_enabled = p_yearly_enabled,
      lifetime_enabled = p_lifetime_enabled,
      subscription_copy_override = p_subscription_copy_override,
      row_version = c.row_version + 1
  where c.platform_id = p_platform_id and c.row_version = p_expected_version;
  if not found then raise exception using errcode = '40001', message = 'precondition_failed'; end if;
  perform private.audit_append(
    (p_ctx).request_id, 'admin', (p_ctx).admin_user_id, p_platform_id, null,
    'subscription.config_updated', 'platform_subscription_config', p_platform_id,
    null, null, jsonb_build_object(
      'paid_plan_id', p_paid_plan_id, 'purchases_paused', p_purchases_paused,
      'monthly_enabled', p_monthly_enabled, 'yearly_enabled', p_yearly_enabled,
      'lifetime_enabled', p_lifetime_enabled, 'reason', p_reason
    )
  );
  return query select * from private.admin_subscription_config_read_v2(p_ctx, p_platform_id);
end;
$$;

alter function private.admin_subscription_config_read_v2(private.admin_context, uuid) owner to domain_owner;
alter function private.admin_subscription_config_patch_v2(private.admin_context, uuid, bigint, uuid, boolean, boolean, boolean, boolean, text, text)
  owner to domain_owner;
revoke all on function private.admin_subscription_config_read_v2(private.admin_context, uuid),
  private.admin_subscription_config_patch_v2(private.admin_context, uuid, bigint, uuid, boolean, boolean, boolean, boolean, text, text)
  from public, anon, authenticated, account_executor, job_executor, recovery_executor;
grant execute on function private.admin_subscription_config_read_v2(private.admin_context, uuid),
  private.admin_subscription_config_patch_v2(private.admin_context, uuid, bigint, uuid, boolean, boolean, boolean, boolean, text, text)
  to admin_executor;

create or replace function private.billing_checkout_lifecycle_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_platform_status text;
  v_purchases_paused boolean;
  v_plan_status text;
begin
  select p.status into v_platform_status
  from public.platforms p where p.id = new.platform_id for share;
  if v_platform_status is null or v_platform_status <> 'active' then
    raise exception using errcode = '42501', message = 'platform_disabled';
  end if;
  select c.purchases_paused into v_purchases_paused
  from public.platform_subscription_config c
  where c.platform_id = new.platform_id for share;
  if coalesce(v_purchases_paused, false) then
    raise exception using errcode = 'P0001', message = 'purchases_paused';
  end if;
  select p.status into v_plan_status
  from public.plans p
  where p.platform_id = new.platform_id and p.id = new.entitlement_plan_id
  for share;
  if v_plan_status is null or v_plan_status <> 'active' then
    raise exception using errcode = 'P0001', message = 'plan_unavailable';
  end if;
  return new;
end;
$$;

alter function private.billing_checkout_lifecycle_guard() owner to domain_owner;
revoke all on function private.billing_checkout_lifecycle_guard()
  from public, anon, authenticated, account_executor, admin_executor,
  job_executor, recovery_executor;
create trigger billing_checkout_intents_lifecycle_guard
before insert on public.billing_checkout_intents
for each row execute function private.billing_checkout_lifecycle_guard();

create or replace function private.subscription_products_list(
  p_platform_id uuid,
  p_platform_key_id uuid
)
returns table (
  product_code text,
  product_name text,
  product_description text,
  price_amount numeric,
  currency text,
  term_kind text,
  duration_value integer,
  duration_unit text,
  price_version integer,
  recommended boolean,
  enabled boolean,
  purchasable boolean,
  reason text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_platform public.platforms;
  v_config public.platform_subscription_config;
  v_paid_plan public.plans;
begin
  select p.* into v_platform
  from public.platforms p
  join private.platform_api_keys k on k.platform_id = p.id
  where p.id = p_platform_id and k.id = p_platform_key_id
    and k.status = 'active' and (k.expires_at is null or k.expires_at > now());
  if not found then raise exception using errcode = '28000', message = 'platform_key_invalid'; end if;
  select * into v_config from public.platform_subscription_config c where c.platform_id = p_platform_id;
  select p.* into v_paid_plan from public.plans p
  where p.platform_id = p_platform_id and p.id = v_config.paid_plan_id and p.kind = 'paid';
  return query
    select product.code, product.name, product.description, product.price_amount,
      product.currency, product.term_kind, product.duration_value, product.duration_unit,
      product.price_version, product.recommended,
      case
        when v_platform.status <> 'active' then false
        when product.code = 'free' then exists (
          select 1 from public.plans fp where fp.platform_id = p_platform_id
            and fp.id = v_platform.default_plan_id and fp.kind = 'free' and fp.status = 'active')
        when v_paid_plan.id is null or v_paid_plan.status <> 'active' then false
        when product.code = 'monthly' then v_config.monthly_enabled
        when product.code = 'yearly' then v_config.yearly_enabled
        when product.code = 'lifetime' then v_config.lifetime_enabled
        else false
      end,
      case
        when v_platform.status <> 'active' then false
        when product.code = 'free' then false
        when v_config.purchases_paused then false
        when v_paid_plan.id is null or v_paid_plan.status <> 'active' then false
        when product.code = 'monthly' and not v_config.monthly_enabled then false
        when product.code = 'yearly' and not v_config.yearly_enabled then false
        when product.code = 'lifetime' and not v_config.lifetime_enabled then false
        else exists (
          select 1 from public.billing_provider_accounts pa
          join public.billing_provider_products pp on pp.provider_account_id = pa.id
          where pa.status = 'active' and pp.subscription_product_id = product.id
            and pp.published and pp.enabled and pp.validation_status = 'verified'
            and pp.price_version = product.price_version
            and pp.expected_show_amount = product.price_amount
            and pp.currency = product.currency)
      end,
      case
        when v_platform.status <> 'active' then 'platform_disabled'
        when product.code <> 'free' and v_config.purchases_paused then 'purchases_paused'
        when product.code = 'free' and not exists (
          select 1 from public.plans fp where fp.platform_id = p_platform_id
            and fp.id = v_platform.default_plan_id and fp.kind = 'free' and fp.status = 'active') then 'free_plan_not_configured'
        when product.code <> 'free' and v_paid_plan.id is null then 'paid_plan_not_configured'
        when product.code <> 'free' and v_paid_plan.status <> 'active' then 'paid_plan_unavailable'
        when product.code = 'monthly' and not v_config.monthly_enabled then 'product_disabled'
        when product.code = 'yearly' and not v_config.yearly_enabled then 'product_disabled'
        when product.code = 'lifetime' and not v_config.lifetime_enabled then 'product_disabled'
        when product.code <> 'free' and not exists (
          select 1 from public.billing_provider_accounts pa
          join public.billing_provider_products pp on pp.provider_account_id = pa.id
          where pa.status = 'active' and pp.subscription_product_id = product.id
            and pp.published and pp.enabled and pp.validation_status = 'verified'
            and pp.price_version = product.price_version
            and pp.expected_show_amount = product.price_amount
            and pp.currency = product.currency) then 'provider_mapping_unavailable'
        else 'ready'
      end
    from public.subscription_products product
    where product.status = 'active'
    order by product.sort_order;
end;
$$;

alter function private.subscription_products_list(uuid, uuid) owner to domain_owner;
revoke all on function private.subscription_products_list(uuid, uuid)
  from public, anon, authenticated, admin_executor, job_executor, recovery_executor;
grant execute on function private.subscription_products_list(uuid, uuid) to account_executor;
