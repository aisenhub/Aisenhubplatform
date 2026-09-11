-- BILL-02: fixed subscription product catalog and platform-scoped admin config.
-- Provider mapping and real checkout remain intentionally unavailable in this phase.

create table public.subscription_products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code in ('free', 'monthly', 'yearly', 'lifetime')),
  name text not null check (length(name) between 1 and 128),
  description text check (description is null or length(description) <= 1024),
  term_kind text not null check (term_kind in ('free', 'finite')),
  duration_value integer,
  duration_unit text check (duration_unit in ('month', 'year')),
  price_amount numeric(12, 2) not null check (price_amount >= 0),
  currency text not null default 'CNY' check (currency = 'CNY'),
  price_version integer not null default 1 check (price_version > 0),
  recommended boolean not null default false,
  status text not null default 'active' check (status in ('active', 'archived')),
  sort_order smallint not null check (sort_order > 0),
  row_version bigint not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (code = 'free' and term_kind = 'free' and duration_value is null
      and duration_unit is null and price_amount = 0)
    or (code = 'monthly' and term_kind = 'finite' and duration_value = 1
      and duration_unit = 'month' and price_amount > 0)
    or (code = 'yearly' and term_kind = 'finite' and duration_value = 1
      and duration_unit = 'year' and price_amount > 0)
    or (code = 'lifetime' and term_kind = 'finite' and duration_value = 99
      and duration_unit = 'year' and price_amount > 0)
  ),
  check ((term_kind = 'free' and duration_value is null and duration_unit is null)
    or (term_kind = 'finite' and duration_value > 0 and duration_unit is not null))
);

insert into public.subscription_products (
  code, name, description, term_kind, duration_value, duration_unit,
  price_amount, currency, price_version, recommended, status, sort_order
) values
  ('free', 'Free', '基础免费方案', 'free', null, null, 0.00, 'CNY', 1, false, 'active', 10),
  ('monthly', 'Monthly', '按月订阅', 'finite', 1, 'month', 19.90, 'CNY', 1, false, 'active', 20),
  ('yearly', 'Yearly', '按年订阅', 'finite', 1, 'year', 199.00, 'CNY', 1, true, 'active', 30),
  ('lifetime', 'Lifetime', '一次性购买，权益期限为 99 年', 'finite', 99, 'year', 999.00, 'CNY', 1, false, 'active', 40);

create table public.platform_subscription_config (
  platform_id uuid primary key
    references public.platforms(id) on delete restrict,
  paid_plan_id uuid,
  paid_plan_kind text not null default 'paid' check (paid_plan_kind = 'paid'),
  monthly_enabled boolean not null default false,
  yearly_enabled boolean not null default false,
  lifetime_enabled boolean not null default false,
  subscription_copy_override text
    check (subscription_copy_override is null or length(subscription_copy_override) <= 1024),
  row_version bigint not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform_id, paid_plan_id, paid_plan_kind),
  foreign key (platform_id, paid_plan_id, paid_plan_kind)
    references public.plans(platform_id, id, kind) on delete restrict,
  check ((paid_plan_id is null and paid_plan_kind = 'paid') or paid_plan_id is not null)
);

create index platform_subscription_config_paid_plan_idx
  on public.platform_subscription_config(platform_id, paid_plan_id)
  where paid_plan_id is not null;

alter table public.subscription_products enable row level security;
alter table public.subscription_products force row level security;
alter table public.platform_subscription_config enable row level security;
alter table public.platform_subscription_config force row level security;

revoke all on public.subscription_products, public.platform_subscription_config
  from public, anon, authenticated, account_executor, admin_executor, job_executor, recovery_executor;
create policy subscription_products_domain_owner on public.subscription_products
  for all to domain_owner using (true) with check (true);
create policy platform_subscription_config_domain_owner on public.platform_subscription_config
  for all to domain_owner using (true) with check (true);
grant select, insert, update on public.subscription_products to domain_owner;
grant select, insert, update on public.platform_subscription_config to domain_owner;

create trigger subscription_products_set_updated_at
before update on public.subscription_products
for each row execute function private.set_updated_at();
create trigger platform_subscription_config_set_updated_at
before update on public.platform_subscription_config
for each row execute function private.set_updated_at();

create or replace function private.subscription_product_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, private
as $$
begin
  if new.code <> old.code
     or new.term_kind <> old.term_kind
     or new.duration_value is distinct from old.duration_value
     or new.duration_unit is distinct from old.duration_unit then
    raise exception using errcode = 'P0001', message = 'subscription_product_immutable';
  end if;
  if new.price_amount is distinct from old.price_amount
     and new.price_version <= old.price_version then
    raise exception using errcode = 'P0001', message = 'price_version_required';
  end if;
  new.row_version := old.row_version + 1;
  return new;
end;
$$;

create trigger subscription_products_guard
before update on public.subscription_products
for each row execute function private.subscription_product_guard();

create or replace function private.platform_subscription_config_init()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private, public
as $$
begin
  insert into public.platform_subscription_config(platform_id)
  values (new.id)
  on conflict (platform_id) do nothing;
  return new;
end;
$$;

alter function private.platform_subscription_config_init() owner to domain_owner;
revoke all on function private.platform_subscription_config_init()
  from public, anon, authenticated, account_executor, admin_executor, job_executor, recovery_executor;

create trigger platforms_subscription_config_init
after insert on public.platforms
for each row execute function private.platform_subscription_config_init();

insert into public.platform_subscription_config(platform_id)
select p.id from public.platforms p
on conflict (platform_id) do nothing;

create or replace function private.platform_subscription_config_backfill(
  p_platform_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_paid_plan_id uuid;
  v_paid_count bigint;
begin
  select count(*) into v_paid_count
  from public.plans p
  where p.platform_id = p_platform_id and p.kind = 'paid' and p.status = 'active';
  if v_paid_count = 1 then
    select p.id into v_paid_plan_id
    from public.plans p
    where p.platform_id = p_platform_id and p.kind = 'paid' and p.status = 'active';
    update public.platform_subscription_config c
    set paid_plan_id = v_paid_plan_id,
        row_version = c.row_version + 1
    where c.platform_id = p_platform_id and c.paid_plan_id is null;
  end if;
end;
$$;

create or replace function private.platform_subscription_config_backfill_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private, public
as $$
begin
  perform private.platform_subscription_config_backfill(new.platform_id);
  return new;
end;
$$;

alter function private.platform_subscription_config_backfill(uuid) owner to domain_owner;
alter function private.platform_subscription_config_backfill_trigger() owner to domain_owner;
revoke all on function private.platform_subscription_config_backfill(uuid)
  from public, anon, authenticated, account_executor, admin_executor, job_executor, recovery_executor;
revoke all on function private.platform_subscription_config_backfill_trigger()
  from public, anon, authenticated, account_executor, admin_executor, job_executor, recovery_executor;

create trigger plans_subscription_config_backfill
after insert or update of kind, status on public.plans
for each row execute function private.platform_subscription_config_backfill_trigger();

select private.platform_subscription_config_backfill(p.id)
from public.platforms p;

create or replace function private.subscription_plan_switch_preflight(
  p_platform_id uuid,
  p_target_paid_plan_id uuid
)
returns table (blocked_reason text, blocking_count bigint)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_count bigint;
begin
  select count(*) into v_count
  from public.subscription_grants g
  where g.platform_id = p_platform_id
    and (p_target_paid_plan_id is null or g.plan_id <> p_target_paid_plan_id)
    and (g.starts_at > now()
      or (g.starts_at <= now() and (g.ends_at is null or g.ends_at > now())))
    and not exists (
      select 1 from public.subscription_events e
      where e.platform_id = g.platform_id and e.platform_account_id = g.platform_account_id
        and e.grant_id = g.id and e.event_type = 'revoked'
    );
  if v_count > 0 then
    return query select 'active_or_future_grant'::text, v_count;
    return;
  end if;

  select count(*) into v_count
  from public.redemption_code_batches b
  where b.platform_id = p_platform_id
    and (p_target_paid_plan_id is null or b.plan_id <> p_target_paid_plan_id)
    and b.status = 'active'
    and b.expires_at > now()
    and exists (
      select 1 from public.redemption_codes c
      where c.platform_id = b.platform_id and c.batch_id = b.id and c.status = 'unused'
    );
  if v_count > 0 then
    return query select 'redeemable_old_plan_batch'::text, v_count;
    return;
  end if;

  return query select null::text, 0::bigint;
end;
$$;

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
  if not found then
    raise exception using errcode = '28000', message = 'platform_key_invalid';
  end if;
  select * into v_config from public.platform_subscription_config c
  where c.platform_id = p_platform_id;
  select p.* into v_paid_plan from public.plans p
  where p.platform_id = p_platform_id and p.id = v_config.paid_plan_id and p.kind = 'paid';

  return query
    select product.code, product.name, product.description, product.price_amount,
      product.currency, product.term_kind, product.duration_value, product.duration_unit,
      product.price_version, product.recommended,
      case
        when v_platform.status <> 'active' then false
        when product.code = 'free' then exists (
          select 1 from public.plans fp
          where fp.platform_id = p_platform_id and fp.id = v_platform.default_plan_id
            and fp.kind = 'free' and fp.status = 'active'
        )
        when v_paid_plan.id is null or v_paid_plan.status <> 'active' then false
        when product.code = 'monthly' then v_config.monthly_enabled
        when product.code = 'yearly' then v_config.yearly_enabled
        when product.code = 'lifetime' then v_config.lifetime_enabled
        else false
      end,
      false,
      case
        when v_platform.status <> 'active' then 'platform_disabled'
        when product.code = 'free' and not exists (
          select 1 from public.plans fp
          where fp.platform_id = p_platform_id and fp.id = v_platform.default_plan_id
            and fp.kind = 'free' and fp.status = 'active'
        ) then 'free_plan_not_configured'
        when product.code <> 'free' and v_paid_plan.id is null then 'paid_plan_not_configured'
        when product.code <> 'free' and v_paid_plan.status <> 'active' then 'paid_plan_unavailable'
        when product.code = 'monthly' and not v_config.monthly_enabled then 'product_disabled'
        when product.code = 'yearly' and not v_config.yearly_enabled then 'product_disabled'
        when product.code = 'lifetime' and not v_config.lifetime_enabled then 'product_disabled'
        when product.code <> 'free' then 'provider_mapping_unavailable'
        else 'free_plan_source'
      end
    from public.subscription_products product
    where product.status = 'active'
    order by product.sort_order;
end;
$$;

create or replace function private.admin_subscription_config_read(
  p_ctx private.admin_context,
  p_platform_id uuid
)
returns table (
  platform_id uuid,
  paid_plan_id uuid,
  paid_plan_code text,
  paid_plan_name text,
  paid_plan_status text,
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
      c.monthly_enabled, c.yearly_enabled, c.lifetime_enabled,
      c.subscription_copy_override, c.row_version, preflight.blocked_reason,
      preflight.blocking_count
    from public.platform_subscription_config c
    left join public.plans p on p.platform_id = c.platform_id and p.id = c.paid_plan_id
    cross join lateral private.subscription_plan_switch_preflight(c.platform_id, c.paid_plan_id) preflight
    where c.platform_id = p_platform_id;
end;
$$;

create or replace function private.admin_subscription_config_patch(
  p_ctx private.admin_context,
  p_platform_id uuid,
  p_expected_version bigint,
  p_paid_plan_id uuid,
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
     or p_monthly_enabled is null or p_yearly_enabled is null or p_lifetime_enabled is null
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
    if not found or v_plan.kind <> 'paid' or v_plan.status <> 'active' then
      raise exception using errcode = 'P0001', message = 'plan_unavailable';
    end if;
  end if;
  if v_config.paid_plan_id is distinct from p_paid_plan_id then
    select * into v_preflight
    from private.subscription_plan_switch_preflight(p_platform_id, p_paid_plan_id);
    if v_preflight.blocked_reason is not null then
      raise exception using errcode = 'P0001', message = 'subscription_plan_switch_blocked';
    end if;
  end if;

  update public.platform_subscription_config c
  set paid_plan_id = p_paid_plan_id,
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
      'paid_plan_id', p_paid_plan_id,
      'monthly_enabled', p_monthly_enabled,
      'yearly_enabled', p_yearly_enabled,
      'lifetime_enabled', p_lifetime_enabled,
      'reason', p_reason
    )
  );

  return query
    select * from private.admin_subscription_config_read(p_ctx, p_platform_id);
end;
$$;

create or replace function private.prevent_enabled_subscription_plan_archive()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private, public
as $$
begin
  if old.kind = 'paid' and new.status = 'archived' and exists (
    select 1 from public.platform_subscription_config c
    where c.platform_id = old.platform_id and c.paid_plan_id = old.id
      and (c.monthly_enabled or c.yearly_enabled or c.lifetime_enabled)
  ) then
    raise exception using errcode = 'P0001', message = 'subscription_plan_in_use';
  end if;
  return new;
end;
$$;

alter function private.subscription_product_guard() owner to domain_owner;
alter function private.subscription_plan_switch_preflight(uuid, uuid) owner to domain_owner;
alter function private.subscription_products_list(uuid, uuid) owner to domain_owner;
alter function private.admin_subscription_config_read(private.admin_context, uuid) owner to domain_owner;
alter function private.admin_subscription_config_patch(private.admin_context, uuid, bigint, uuid, boolean, boolean, boolean, text, text)
  owner to domain_owner;
alter function private.prevent_enabled_subscription_plan_archive() owner to domain_owner;

revoke all on function private.subscription_product_guard()
  from public, anon, authenticated, account_executor, admin_executor, job_executor, recovery_executor;
revoke all on function private.subscription_plan_switch_preflight(uuid, uuid)
  from public, anon, authenticated, account_executor, admin_executor, job_executor, recovery_executor;
revoke all on function private.subscription_products_list(uuid, uuid)
  from public, anon, authenticated, admin_executor, job_executor, recovery_executor;
revoke all on function private.admin_subscription_config_read(private.admin_context, uuid)
  from public, anon, authenticated, account_executor, job_executor, recovery_executor;
revoke all on function private.admin_subscription_config_patch(private.admin_context, uuid, bigint, uuid, boolean, boolean, boolean, text, text)
  from public, anon, authenticated, account_executor, job_executor, recovery_executor;
grant execute on function private.subscription_products_list(uuid, uuid) to account_executor;
grant execute on function private.admin_subscription_config_read(private.admin_context, uuid) to admin_executor;
grant execute on function private.admin_subscription_config_patch(private.admin_context, uuid, bigint, uuid, boolean, boolean, boolean, text, text)
  to admin_executor;

create trigger plans_prevent_enabled_subscription_archive
before update of status on public.plans
for each row execute function private.prevent_enabled_subscription_plan_archive();
