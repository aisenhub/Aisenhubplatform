-- BILL-04: persistent Checkout/Order/Inbox/Job foundations.
-- No real Provider mapping is installed by this migration. Checkout creation
-- therefore remains closed until a verified mapping and versioned secret exist.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'billing_ingress') then
    create role billing_ingress noinherit nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  end if;
end;
$$;

grant usage on schema private to billing_ingress;

create table public.billing_provider_accounts (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('afdian')),
  name text not null check (length(name) between 1 and 128),
  status text not null default 'disabled' check (status in ('active', 'disabled')),
  external_creator_id text,
  secret_reference text not null check (length(secret_reference) between 1 and 256),
  webhook_public_key_version integer check (webhook_public_key_version is null or webhook_public_key_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index billing_provider_accounts_one_active_idx
  on public.billing_provider_accounts(provider) where status = 'active';

create table public.billing_provider_products (
  id uuid primary key default gen_random_uuid(),
  provider_account_id uuid not null references public.billing_provider_accounts(id) on delete restrict,
  subscription_product_id uuid not null references public.subscription_products(id) on delete restrict,
  external_plan_id text not null check (length(external_plan_id) between 1 and 128),
  product_type text not null check (length(product_type) between 1 and 128),
  external_sku_ids text[] not null default '{}'::text[],
  sku_count integer not null default 0 check (sku_count >= 0 and sku_count = cardinality(external_sku_ids)),
  purchase_months integer check (purchase_months is null or purchase_months > 0),
  expected_show_amount numeric(12, 2) not null check (expected_show_amount >= 0),
  expected_total_amount numeric(12, 2) not null check (expected_total_amount >= 0),
  currency text not null default 'CNY' check (currency = 'CNY'),
  price_version integer not null check (price_version > 0),
  mapping_version integer not null check (mapping_version > 0),
  validation_status text not null default 'unverified'
    check (validation_status in ('unverified', 'verified', 'rejected')),
  published boolean not null default false,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_account_id, id),
  unique (provider_account_id, subscription_product_id, mapping_version),
  check (not published or validation_status = 'verified')
);

create unique index billing_provider_products_current_idx
  on public.billing_provider_products(provider_account_id, subscription_product_id)
  where published and enabled;

create table public.billing_checkout_intents (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null,
  platform_account_id uuid not null,
  subscription_product_id uuid not null references public.subscription_products(id) on delete restrict,
  entitlement_plan_id uuid not null,
  provider_account_id uuid,
  provider_product_id uuid,
  product_code text not null check (product_code in ('monthly', 'yearly', 'lifetime')),
  term_kind_snapshot text not null check (term_kind_snapshot = 'finite'),
  duration_value_snapshot integer not null check (duration_value_snapshot > 0),
  duration_unit_snapshot text not null check (duration_unit_snapshot in ('month', 'year')),
  price_amount numeric(12, 2) not null check (price_amount > 0),
  currency text not null default 'CNY' check (currency = 'CNY'),
  price_version integer not null check (price_version > 0),
  mapping_version integer,
  status text not null default 'pending'
    check (status in ('pending', 'expired', 'paid', 'verified', 'granted', 'review_required', 'resolved')),
  token_key_version smallint check (token_key_version is null or token_key_version > 0),
  token_digest bytea check (token_digest is null or octet_length(token_digest) = 32),
  idempotency_key_hash bytea not null check (octet_length(idempotency_key_hash) = 32),
  request_hash bytea not null check (octet_length(request_hash) = 32),
  expires_at timestamptz not null,
  paid_at timestamptz,
  granted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform_id, platform_account_id, id),
  unique (platform_id, platform_account_id, idempotency_key_hash),
  unique (token_key_version, token_digest),
  foreign key (platform_id, platform_account_id)
    references public.platform_accounts(platform_id, id) on delete restrict,
  foreign key (platform_id, entitlement_plan_id)
    references public.plans(platform_id, id) on delete restrict,
  foreign key (provider_account_id, provider_product_id)
    references public.billing_provider_products(provider_account_id, id) on delete restrict,
  check ((provider_account_id is null and provider_product_id is null) or (provider_account_id is not null and provider_product_id is not null)),
  check ((status in ('paid', 'verified', 'granted', 'review_required', 'resolved') and paid_at is not null) or status in ('pending', 'expired')),
  check ((status = 'granted' and granted_at is not null) or status <> 'granted')
);

create index billing_checkout_intents_account_idx
  on public.billing_checkout_intents(platform_id, platform_account_id, created_at desc, id desc);
create index billing_checkout_intents_status_idx
  on public.billing_checkout_intents(status, expires_at);

create table public.billing_orders (
  id uuid primary key default gen_random_uuid(),
  provider_account_id uuid not null references public.billing_provider_accounts(id) on delete restrict,
  provider_order_no text not null check (length(provider_order_no) between 1 and 256),
  checkout_intent_id uuid,
  platform_id uuid,
  platform_account_id uuid,
  subscription_product_id uuid references public.subscription_products(id) on delete restrict,
  provider_user_id text,
  provider_user_private_id text,
  external_plan_id text,
  external_sku_ids text[] not null default '{}'::text[],
  product_type text,
  quantity integer check (quantity is null or quantity > 0),
  purchase_months integer check (purchase_months is null or purchase_months > 0),
  total_amount numeric(12, 2) check (total_amount is null or total_amount >= 0),
  show_amount numeric(12, 2) check (show_amount is null or show_amount >= 0),
  discount_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(discount_metadata) = 'object'),
  currency text check (currency is null or currency = 'CNY'),
  provider_status text not null default 'unknown',
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'verified', 'rejected')),
  entitlement_status text not null default 'not_started'
    check (entitlement_status in ('not_started', 'blocked', 'granted', 'rejected')),
  linkage_status text not null default 'unlinked'
    check (linkage_status in ('unlinked', 'linked', 'ambiguous')),
  resolution_status text not null default 'open'
    check (resolution_status in ('open', 'resolved')),
  verification_method text,
  mapping_version integer,
  provider_created_at timestamptz,
  provider_paid_at timestamptz,
  last_observed_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  resolution_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_account_id, provider_order_no),
  unique (platform_id, platform_account_id, id),
  foreign key (platform_id, platform_account_id, checkout_intent_id)
    references public.billing_checkout_intents(platform_id, platform_account_id, id) on delete restrict,
  check ((checkout_intent_id is null and linkage_status = 'unlinked') or (checkout_intent_id is not null and platform_id is not null and platform_account_id is not null and linkage_status = 'linked')),
  check ((resolution_status = 'resolved' and resolved_at is not null and resolution_reason is not null) or resolution_status = 'open')
);

create index billing_orders_checkout_idx
  on public.billing_orders(platform_id, platform_account_id, checkout_intent_id);
create index billing_orders_processing_idx
  on public.billing_orders(verification_status, entitlement_status, updated_at);

create table public.billing_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider_account_id uuid not null references public.billing_provider_accounts(id) on delete restrict,
  provider_event_key text not null check (length(provider_event_key) between 1 and 256),
  payload_hash bytea not null check (octet_length(payload_hash) = 32),
  signature_status text not null check (signature_status in ('verified', 'unverified', 'invalid', 'missing')),
  processing_status text not null default 'received'
    check (processing_status in ('received', 'queued', 'processing', 'processed', 'retryable', 'manual_review')),
  provider_order_no text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error_code text,
  unique (provider_account_id, provider_event_key)
);

create index billing_webhook_events_order_idx
  on public.billing_webhook_events(provider_account_id, provider_order_no, received_at desc);

create table public.billing_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  job_kind text not null check (job_kind in ('webhook_order_discovery', 'order_verification', 'settlement', 'reconciliation')),
  webhook_event_id uuid references public.billing_webhook_events(id) on delete restrict,
  billing_order_id uuid references public.billing_orders(id) on delete restrict,
  state text not null default 'pending'
    check (state in ('pending', 'processing', 'retryable', 'completed', 'manual_review')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  lease_owner text,
  lease_until timestamptz,
  fence bigint not null default 0 check (fence >= 0),
  error_class text,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_kind, webhook_event_id),
  check (webhook_event_id is not null or billing_order_id is not null),
  check ((state = 'processing' and lease_owner is not null and lease_until is not null) or state <> 'processing')
);

create index billing_processing_jobs_claim_idx
  on public.billing_processing_jobs(state, next_attempt_at, lease_until, created_at);

create table public.billing_settlements (
  id uuid primary key default gen_random_uuid(),
  billing_order_id uuid not null references public.billing_orders(id) on delete restrict,
  checkout_intent_id uuid,
  platform_id uuid not null,
  platform_account_id uuid not null,
  settlement_kind text not null default 'automatic' check (settlement_kind in ('automatic', 'manual', 'correction')),
  state text not null default 'retryable'
    check (state in ('retryable', 'blocked', 'review_required', 'finalized')),
  operation_id uuid not null,
  grant_id uuid,
  decision_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (billing_order_id),
  unique (platform_id, operation_id),
  foreign key (platform_id, platform_account_id, billing_order_id)
    references public.billing_orders(platform_id, platform_account_id, id) on delete restrict,
  foreign key (platform_id, platform_account_id, checkout_intent_id)
    references public.billing_checkout_intents(platform_id, platform_account_id, id) on delete restrict,
  foreign key (platform_id, platform_account_id, grant_id)
    references public.subscription_grants(platform_id, platform_account_id, id) on delete restrict
);

create unique index billing_settlements_one_auto_checkout_idx
  on public.billing_settlements(checkout_intent_id)
  where settlement_kind = 'automatic';

alter table public.subscription_grants
  add column billing_order_id uuid;

alter table public.subscription_grants
  drop constraint if exists subscription_grants_source_check,
  drop constraint if exists subscription_grants_check1,
  drop constraint if exists subscription_grants_check2;

alter table public.subscription_grants
  add constraint subscription_grants_source_check_v2
    check (source in ('redemption_code', 'admin', 'billing_order')),
  add constraint subscription_grants_billing_duration_check
    check (source not in ('redemption_code', 'billing_order') or ends_at is not null),
  add constraint subscription_grants_source_identity_check_v2
    check (
      (source = 'redemption_code' and redemption_code_id is not null and billing_order_id is null and operation_id = redemption_code_id)
      or (source = 'admin' and redemption_code_id is null and billing_order_id is null)
      or (source = 'billing_order' and redemption_code_id is null and billing_order_id is not null and operation_id = billing_order_id)
    );

alter table public.subscription_grants
  add constraint subscription_grants_billing_order_fk
    foreign key (platform_id, platform_account_id, billing_order_id)
    references public.billing_orders(platform_id, platform_account_id, id) on delete restrict;
create unique index subscription_grants_one_billing_order_idx
  on public.subscription_grants(billing_order_id) where billing_order_id is not null;

alter table public.billing_provider_accounts enable row level security;
alter table public.billing_provider_products enable row level security;
alter table public.billing_checkout_intents enable row level security;
alter table public.billing_orders enable row level security;
alter table public.billing_webhook_events enable row level security;
alter table public.billing_processing_jobs enable row level security;
alter table public.billing_settlements enable row level security;
alter table public.billing_provider_accounts force row level security;
alter table public.billing_provider_products force row level security;
alter table public.billing_checkout_intents force row level security;
alter table public.billing_orders force row level security;
alter table public.billing_webhook_events force row level security;
alter table public.billing_processing_jobs force row level security;
alter table public.billing_settlements force row level security;

create policy billing_provider_accounts_domain_owner on public.billing_provider_accounts for all to domain_owner using (true) with check (true);
create policy billing_provider_products_domain_owner on public.billing_provider_products for all to domain_owner using (true) with check (true);
create policy billing_checkout_intents_domain_owner on public.billing_checkout_intents for all to domain_owner using (true) with check (true);
create policy billing_orders_domain_owner on public.billing_orders for all to domain_owner using (true) with check (true);
create policy billing_webhook_events_domain_owner on public.billing_webhook_events for all to domain_owner using (true) with check (true);
create policy billing_processing_jobs_domain_owner on public.billing_processing_jobs for all to domain_owner using (true) with check (true);
create policy billing_settlements_domain_owner on public.billing_settlements for all to domain_owner using (true) with check (true);

create trigger billing_provider_accounts_set_updated_at before update on public.billing_provider_accounts for each row execute function private.set_updated_at();
create trigger billing_provider_products_set_updated_at before update on public.billing_provider_products for each row execute function private.set_updated_at();
create trigger billing_checkout_intents_set_updated_at before update on public.billing_checkout_intents for each row execute function private.set_updated_at();
create trigger billing_orders_set_updated_at before update on public.billing_orders for each row execute function private.set_updated_at();
create trigger billing_processing_jobs_set_updated_at before update on public.billing_processing_jobs for each row execute function private.set_updated_at();
create trigger billing_settlements_set_updated_at before update on public.billing_settlements for each row execute function private.set_updated_at();

revoke all on public.billing_provider_accounts, public.billing_provider_products,
  public.billing_checkout_intents, public.billing_orders, public.billing_webhook_events,
  public.billing_processing_jobs, public.billing_settlements
  from public, anon, authenticated, account_executor, admin_executor, job_executor,
  recovery_executor, billing_ingress;
grant select, insert, update on public.billing_provider_accounts, public.billing_provider_products,
  public.billing_checkout_intents, public.billing_orders, public.billing_webhook_events,
  public.billing_processing_jobs, public.billing_settlements to domain_owner;

create or replace function private.subscription_checkout_create(
  p_ctx private.account_context,
  p_checkout_id uuid,
  p_product_code text,
  p_idempotency_key text,
  p_token_key_version smallint default null,
  p_token_digest bytea default null
)
returns table (
  checkout_id uuid,
  status text,
  product_code text,
  price_amount numeric,
  currency text,
  term_kind text,
  duration_value integer,
  duration_unit text,
  expires_at timestamptz,
  provider_account_id uuid,
  provider_product_id uuid,
  provider_display_name text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_authorization text;
  v_account_id uuid;
  v_platform public.platforms;
  v_account public.platform_accounts;
  v_product public.subscription_products;
  v_config public.platform_subscription_config;
  v_plan public.plans;
  v_provider public.billing_provider_accounts;
  v_provider_product public.billing_provider_products;
  v_existing public.billing_checkout_intents;
  v_checkout public.billing_checkout_intents;
  v_request_hash bytea;
  v_key_hash bytea;
begin
  if p_checkout_id is null
     or p_product_code is null or p_product_code not in ('monthly', 'yearly', 'lifetime')
     or p_idempotency_key is null or length(p_idempotency_key) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select principal.authorization, principal.platform_account_id into v_authorization, v_account_id
  from private.account_principal(p_ctx) principal;
  if v_authorization <> 'allowed' or v_account_id is null then
    raise exception using errcode = '42501', message = coalesce(v_authorization, 'account_not_activated');
  end if;
  v_key_hash := extensions.digest(convert_to(p_idempotency_key, 'utf8'), 'sha256');
  v_request_hash := extensions.digest(convert_to(jsonb_build_array(p_product_code)::text, 'utf8'), 'sha256');

  select p.* into v_platform from public.platforms p where p.id = (p_ctx).platform_id for update;
  if not found or v_platform.status <> 'active' then
    raise exception using errcode = '42501', message = 'platform_disabled';
  end if;
  select a.* into v_account from public.platform_accounts a
  where a.platform_id = (p_ctx).platform_id and a.id = v_account_id for update;
  if not found or v_account.status <> 'active' then
    raise exception using errcode = '42501', message = 'account_suspended';
  end if;

  select c.* into v_existing from public.billing_checkout_intents c
  where c.platform_id = (p_ctx).platform_id and c.platform_account_id = v_account_id
    and c.idempotency_key_hash = v_key_hash for update;
  if found then
    if v_existing.request_hash <> v_request_hash then
      raise exception using errcode = '23505', message = 'idempotency_conflict';
    end if;
    return query select v_existing.id, v_existing.status, v_existing.product_code,
      v_existing.price_amount, v_existing.currency, v_existing.term_kind_snapshot,
      v_existing.duration_value_snapshot, v_existing.duration_unit_snapshot,
      v_existing.expires_at, v_existing.provider_account_id, v_existing.provider_product_id,
      (select pa.name from public.billing_provider_accounts pa where pa.id = v_existing.provider_account_id);
    return;
  end if;

  select product.* into v_product from public.subscription_products product
  where product.code = p_product_code and product.status = 'active';
  if not found then raise exception using errcode = 'P0001', message = 'product_unavailable'; end if;
  select c.* into v_config from public.platform_subscription_config c
  where c.platform_id = (p_ctx).platform_id;
  if not found or v_config.paid_plan_id is null then
    raise exception using errcode = 'P0001', message = 'paid_plan_not_configured';
  end if;
  if (p_product_code = 'monthly' and not v_config.monthly_enabled)
     or (p_product_code = 'yearly' and not v_config.yearly_enabled)
     or (p_product_code = 'lifetime' and not v_config.lifetime_enabled) then
    raise exception using errcode = 'P0001', message = 'product_disabled';
  end if;
  select p.* into v_plan from public.plans p
  where p.platform_id = (p_ctx).platform_id and p.id = v_config.paid_plan_id
  for update;
  if not found or v_plan.status <> 'active' or v_plan.kind <> 'paid' then
    raise exception using errcode = 'P0001', message = 'plan_unavailable';
  end if;

  select pa.* into v_provider
  from public.billing_provider_accounts pa
  where pa.status = 'active';
  select pp.* into v_provider_product
  from public.billing_provider_products pp
  where pp.provider_account_id = v_provider.id
    and pp.subscription_product_id = v_product.id
    and pp.published and pp.enabled
    and pp.validation_status = 'verified'
    and pp.price_version = v_product.price_version
    and pp.expected_show_amount = v_product.price_amount
    and pp.currency = v_product.currency;
  if not found then
    raise exception using errcode = 'P0001', message = 'provider_mapping_unavailable';
  end if;
  if p_token_key_version is null or p_token_digest is null or octet_length(p_token_digest) <> 32 then
    raise exception using errcode = 'P0001', message = 'checkout_key_unavailable';
  end if;

  insert into public.billing_checkout_intents (
    id, platform_id, platform_account_id, subscription_product_id, entitlement_plan_id,
    provider_account_id, provider_product_id, product_code, term_kind_snapshot,
    duration_value_snapshot, duration_unit_snapshot, price_amount, currency,
    price_version, mapping_version, token_key_version, token_digest,
    idempotency_key_hash, request_hash, expires_at
  ) values (
    p_checkout_id, (p_ctx).platform_id, v_account_id, v_product.id, v_plan.id,
    v_provider.id, v_provider_product.id, v_product.code, v_product.term_kind,
    v_product.duration_value, v_product.duration_unit, v_product.price_amount,
    v_product.currency, v_product.price_version, v_provider_product.mapping_version,
    p_token_key_version, p_token_digest, v_key_hash, v_request_hash,
    clock_timestamp() + interval '30 minutes'
  ) returning * into v_checkout;
  perform private.audit_append((p_ctx).request_id, 'user', (p_ctx).user_id,
    (p_ctx).platform_id, v_account_id, 'billing.checkout_created',
    'billing_checkout_intent', v_checkout.id, null, null,
    jsonb_build_object('product_code', v_product.code, 'price_version', v_product.price_version,
      'mapping_version', v_provider_product.mapping_version));
  return query select v_checkout.id, v_checkout.status, v_checkout.product_code,
    v_checkout.price_amount, v_checkout.currency, v_checkout.term_kind_snapshot,
    v_checkout.duration_value_snapshot, v_checkout.duration_unit_snapshot,
    v_checkout.expires_at, v_checkout.provider_account_id, v_checkout.provider_product_id,
    v_provider.name;
end;
$$;

create or replace function private.subscription_checkout_read(
  p_ctx private.account_context,
  p_checkout_id uuid
)
returns table (
  checkout_id uuid,
  status text,
  product_code text,
  price_amount numeric,
  currency text,
  term_kind text,
  duration_value integer,
  duration_unit text,
  expires_at timestamptz,
  provider_display_name text,
  paid_at timestamptz,
  granted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_account_id uuid;
begin
  select principal.platform_account_id into v_account_id
  from private.account_principal(p_ctx) principal
  where principal.authorization = 'allowed';
  return query
    select c.id, c.status, c.product_code, c.price_amount, c.currency,
      c.term_kind_snapshot, c.duration_value_snapshot, c.duration_unit_snapshot,
      c.expires_at, pa.name, c.paid_at, c.granted_at
    from public.billing_checkout_intents c
    left join public.billing_provider_accounts pa on pa.id = c.provider_account_id
    where c.platform_id = (p_ctx).platform_id
      and c.platform_account_id = v_account_id and c.id = p_checkout_id;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
end;
$$;

create or replace function private.billing_webhook_ingest(
  p_provider_account_id uuid,
  p_provider_event_key text,
  p_payload_hash bytea,
  p_signature_status text,
  p_provider_order_no text
)
returns table (event_id uuid, job_id uuid, duplicate boolean, processing_status text)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_event public.billing_webhook_events;
  v_job public.billing_processing_jobs;
begin
  if p_provider_account_id is null or p_provider_event_key is null
     or length(p_provider_event_key) not between 1 and 256
     or p_payload_hash is null or octet_length(p_payload_hash) <> 32
     or p_signature_status not in ('verified', 'unverified', 'invalid', 'missing') then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if not exists (select 1 from public.billing_provider_accounts pa where pa.id = p_provider_account_id) then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  insert into public.billing_webhook_events(
    provider_account_id, provider_event_key, payload_hash, signature_status,
    processing_status, provider_order_no
  ) values (
    p_provider_account_id, p_provider_event_key, p_payload_hash, p_signature_status,
    'queued', nullif(p_provider_order_no, '')
  )
  on conflict (provider_account_id, provider_event_key) do nothing
  returning * into v_event;
  if not found then
    select e.* into v_event from public.billing_webhook_events e
    where e.provider_account_id = p_provider_account_id and e.provider_event_key = p_provider_event_key
    for update;
    if v_event.payload_hash <> p_payload_hash then
      raise exception using errcode = '23505', message = 'webhook_payload_conflict';
    end if;
    select j.* into v_job from public.billing_processing_jobs j where j.webhook_event_id = v_event.id;
    return query select v_event.id, v_job.id, true, v_event.processing_status;
    return;
  end if;
  insert into public.billing_processing_jobs(job_kind, webhook_event_id)
  values ('webhook_order_discovery', v_event.id)
  returning * into v_job;
  return query select v_event.id, v_job.id, false, v_event.processing_status;
end;
$$;

create or replace function private.billing_processing_job_claim(
  p_ctx private.job_context,
  p_limit integer default 20
)
returns table (
  job_id uuid,
  job_kind text,
  webhook_event_id uuid,
  billing_order_id uuid,
  attempt integer,
  fence bigint,
  lease_until timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
begin
  if (p_ctx).job_id is null or (p_ctx).lease_owner is null
     or length((p_ctx).lease_owner) not between 1 and 128
     or (p_ctx).fencing_token is null or (p_ctx).fencing_token < 1
     or (p_ctx).request_id is null
     or p_limit is null or p_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  return query
    with candidates as (
      select j.id
      from public.billing_processing_jobs j
      where j.state in ('pending', 'retryable')
        and j.next_attempt_at <= clock_timestamp()
        and (j.lease_until is null or j.lease_until <= clock_timestamp())
      order by j.next_attempt_at, j.created_at, j.id
      for update skip locked
      limit p_limit
    ), claimed as (
      update public.billing_processing_jobs j
      set state = 'processing', attempts = j.attempts + 1,
          lease_owner = (p_ctx).lease_owner,
          lease_until = clock_timestamp() + interval '60 seconds',
          fence = j.fence + 1
      from candidates
      where j.id = candidates.id
      returning j.id, j.job_kind, j.webhook_event_id, j.billing_order_id,
        j.attempts, j.fence, j.lease_until
    ) select * from claimed;
end;
$$;

create or replace function private.billing_processing_job_finish(
  p_ctx private.job_context,
  p_job_id uuid,
  p_fence bigint,
  p_state text,
  p_error_class text default null,
  p_error_code text default null
)
returns table (job_id uuid, state text, fence bigint)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
begin
  if (p_ctx).job_id is null or (p_ctx).lease_owner is null
     or (p_ctx).fencing_token is null or (p_ctx).request_id is null
     or p_job_id is null or p_fence is null or p_fence <> (p_ctx).fencing_token
     or p_state not in ('retryable', 'completed', 'manual_review') then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  return query
    update public.billing_processing_jobs j
    set state = p_state, lease_owner = null, lease_until = null,
        error_class = p_error_class, error_code = p_error_code,
        next_attempt_at = case when p_state = 'retryable' then clock_timestamp() + interval '1 minute' else j.next_attempt_at end
    where j.id = p_job_id and j.state = 'processing'
      and j.lease_owner = (p_ctx).lease_owner and j.fence = p_fence
    returning j.id, j.state, j.fence;
  if not found then raise exception using errcode = '40001', message = 'fence_conflict'; end if;
end;
$$;

alter function private.subscription_checkout_create(private.account_context, uuid, text, text, smallint, bytea) owner to domain_owner;
alter function private.subscription_checkout_read(private.account_context, uuid) owner to domain_owner;
alter function private.billing_webhook_ingest(uuid, text, bytea, text, text) owner to domain_owner;
alter function private.billing_processing_job_claim(private.job_context, integer) owner to domain_owner;
alter function private.billing_processing_job_finish(private.job_context, uuid, bigint, text, text, text) owner to domain_owner;

revoke all on function private.subscription_checkout_create(private.account_context, uuid, text, text, smallint, bytea) from public, anon, authenticated, admin_executor, job_executor, recovery_executor, billing_ingress;
revoke all on function private.subscription_checkout_read(private.account_context, uuid) from public, anon, authenticated, admin_executor, job_executor, recovery_executor, billing_ingress;
revoke all on function private.billing_webhook_ingest(uuid, text, bytea, text, text) from public, anon, authenticated, account_executor, admin_executor, job_executor, recovery_executor;
revoke all on function private.billing_processing_job_claim(private.job_context, integer) from public, anon, authenticated, account_executor, admin_executor, recovery_executor, billing_ingress;
revoke all on function private.billing_processing_job_finish(private.job_context, uuid, bigint, text, text, text) from public, anon, authenticated, account_executor, admin_executor, recovery_executor, billing_ingress;
grant execute on function private.subscription_checkout_create(private.account_context, uuid, text, text, smallint, bytea) to account_executor;
grant execute on function private.subscription_checkout_read(private.account_context, uuid) to account_executor;
grant execute on function private.billing_webhook_ingest(uuid, text, bytea, text, text) to billing_ingress;
grant execute on function private.billing_processing_job_claim(private.job_context, integer) to job_executor;
grant execute on function private.billing_processing_job_finish(private.job_context, uuid, bigint, text, text, text) to job_executor;
