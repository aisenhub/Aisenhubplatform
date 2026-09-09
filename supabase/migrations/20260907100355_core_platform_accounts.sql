-- T08: core platform/account model.  Runtime access stays deny-by-default;
-- domain functions and their role grants are delivered by later M1/M2 tasks.

create schema if not exists private;

create type private.account_context as (
  user_id uuid,
  session_id uuid,
  platform_id uuid,
  platform_key_id uuid,
  request_id uuid
);

create type private.admin_context as (
  admin_user_id uuid,
  session_id uuid,
  request_id uuid
);

create type private.job_context as (
  job_id uuid,
  lease_owner text,
  fencing_token bigint,
  request_id uuid
);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create table public.platforms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  status text not null default 'active'
    check (status in ('active', 'disabled')),
  allow_activation boolean not null default true,
  default_locale text,
  default_plan_id uuid,
  default_plan_kind text not null default 'free'
    check (default_plan_kind = 'free'),
  config jsonb not null default '{}'::jsonb
    check (jsonb_typeof(config) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.platform_accounts (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null
    references public.platforms(id) on delete restrict,
  user_id uuid references auth.users(id) on delete restrict,
  status text not null default 'active'
    check (status in ('active', 'suspended', 'closed')),
  activated_at timestamptz not null default now(),
  suspended_at timestamptz,
  closed_at timestamptz,
  anonymized_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform_id, user_id),
  unique (platform_id, id),
  check (
    (user_id is not null and anonymized_at is null)
    or (user_id is null and status = 'closed' and anonymized_at is not null)
  )
);

create table public.platform_profiles (
  platform_account_id uuid primary key
    references public.platform_accounts(id) on delete cascade,
  display_name text,
  avatar_url text,
  bio text,
  locale text,
  timezone text,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  row_version bigint not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.platform_preferences (
  platform_account_id uuid primary key
    references public.platform_accounts(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb
    check (jsonb_typeof(preferences) = 'object'),
  row_version bigint not null default 1 check (row_version > 0),
  updated_at timestamptz not null default now()
);

create table public.platform_auth_origins (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null
    references public.platforms(id) on delete restrict,
  environment text not null
    check (environment in ('local', 'preview', 'staging', 'production')),
  origin text not null,
  oauth_callback_url text not null,
  password_reset_url text not null,
  email_confirmation_url text not null,
  status text not null default 'active'
    check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (environment, origin),
  unique (platform_id, id)
);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null
    references public.platforms(id) on delete restrict,
  code text not null,
  name text not null,
  description text,
  kind text not null check (kind in ('free', 'paid')),
  features jsonb not null default '{}'::jsonb
    check (jsonb_typeof(features) = 'object'),
  status text not null default 'active'
    check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform_id, code),
  unique (platform_id, id),
  unique (platform_id, id, kind)
);

alter table public.platforms
  add constraint platform_default_free_plan_fk
  foreign key (id, default_plan_id, default_plan_kind)
  references public.plans(platform_id, id, kind)
  on delete restrict;

create trigger platforms_set_updated_at
before update on public.platforms
for each row execute function private.set_updated_at();

create trigger platform_accounts_set_updated_at
before update on public.platform_accounts
for each row execute function private.set_updated_at();

create trigger platform_profiles_set_updated_at
before update on public.platform_profiles
for each row execute function private.set_updated_at();

create trigger platform_preferences_set_updated_at
before update on public.platform_preferences
for each row execute function private.set_updated_at();

create trigger platform_auth_origins_set_updated_at
before update on public.platform_auth_origins
for each row execute function private.set_updated_at();

create trigger plans_set_updated_at
before update on public.plans
for each row execute function private.set_updated_at();

alter table public.platforms enable row level security;
alter table public.platform_accounts enable row level security;
alter table public.platform_profiles enable row level security;
alter table public.platform_preferences enable row level security;
alter table public.platform_auth_origins enable row level security;
alter table public.plans enable row level security;

alter table public.platforms force row level security;
alter table public.platform_accounts force row level security;
alter table public.platform_profiles force row level security;
alter table public.platform_preferences force row level security;
alter table public.platform_auth_origins force row level security;
alter table public.plans force row level security;

revoke all on table
  public.platforms,
  public.platform_accounts,
  public.platform_profiles,
  public.platform_preferences,
  public.platform_auth_origins,
  public.plans
from public, anon, authenticated;

revoke all on schema private from public, anon, authenticated;
revoke all on function private.set_updated_at() from public, anon, authenticated;
