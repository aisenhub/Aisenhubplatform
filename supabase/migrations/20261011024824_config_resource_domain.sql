-- OPT-007 Phase 01: first-class Config resources while preserving the existing
-- private file ledger and the canonical /v1/config-files compatibility surface.

alter table public.platform_file_policies
  add column max_platform_total_bytes bigint not null default 1073741824;

alter table public.platform_file_policies
  add constraint platform_file_policies_platform_total_bytes_check
    check (max_platform_total_bytes between 1048576 and 1099511627776),
  add constraint platform_file_policies_file_platform_total_check
    check (max_file_bytes <= max_platform_total_bytes);

alter table public.platform_config_files
  add column resource_kind text not null default 'legacy';

alter table public.platform_config_files
  add constraint platform_config_files_resource_kind_check
    check (resource_kind in ('legacy', 'config_version'));

create index platform_config_files_platform_resource_status_idx
  on public.platform_config_files(platform_id, resource_kind, status, created_at desc, id desc);

create table public.platform_configs (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null,
  platform_account_id uuid not null,
  title text not null check (length(title) between 1 and 120 and title !~ '[[:cntrl:]]'),
  description text check (description is null or length(description) <= 2000),
  status text not null default 'active'
    check (status in ('active', 'deleting', 'deleted')),
  current_version_id uuid,
  row_version bigint not null default 1 check (row_version > 0),
  delete_requested_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform_id, id),
  unique (platform_id, platform_account_id, id),
  foreign key (platform_id, platform_account_id)
    references public.platform_accounts(platform_id, id) on delete restrict,
  check (status <> 'deleted' or deleted_at is not null),
  check (status = 'active' or delete_requested_at is not null)
);

create table public.platform_config_versions (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null,
  platform_account_id uuid not null,
  config_id uuid not null,
  file_id uuid not null unique,
  version_number integer not null check (version_number > 0),
  schema_key text not null
    check (length(schema_key) between 1 and 128 and schema_key !~ '[[:cntrl:]]'),
  schema_version text not null
    check (length(schema_version) between 1 and 64 and schema_version !~ '[[:cntrl:]]'),
  changelog text check (changelog is null or length(changelog) <= 2000),
  created_at timestamptz not null default now(),
  unique (config_id, version_number),
  unique (config_id, id),
  unique (platform_id, config_id, id),
  foreign key (platform_id, platform_account_id, config_id)
    references public.platform_configs(platform_id, platform_account_id, id)
    on delete restrict,
  foreign key (platform_id, platform_account_id, file_id)
    references public.platform_config_files(platform_id, platform_account_id, id)
    on delete restrict
);

alter table public.platform_configs
  add constraint platform_configs_current_version_fk
  foreign key (id, current_version_id)
  references public.platform_config_versions(config_id, id)
  on delete restrict;

create table public.platform_config_gallery_submissions (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null,
  config_id uuid not null,
  version_id uuid not null,
  submitted_by_account_id uuid not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by uuid references auth.users(id) on delete set null,
  review_reason text check (review_reason is null or length(review_reason) <= 2000),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (platform_id, id),
  foreign key (platform_id, config_id)
    references public.platform_configs(platform_id, id) on delete restrict,
  foreign key (platform_id, config_id, version_id)
    references public.platform_config_versions(platform_id, config_id, id) on delete restrict,
  foreign key (platform_id, submitted_by_account_id)
    references public.platform_accounts(platform_id, id) on delete restrict,
  check ((status = 'pending' and reviewed_at is null and reviewed_by is null)
    or status <> 'pending')
);

create unique index platform_config_gallery_one_pending_idx
  on public.platform_config_gallery_submissions(config_id)
  where status = 'pending';

create index platform_config_gallery_submissions_platform_status_idx
  on public.platform_config_gallery_submissions(platform_id, status, submitted_at, id);

create table public.platform_config_gallery_entries (
  config_id uuid primary key,
  platform_id uuid not null,
  published_version_id uuid not null,
  approved_submission_id uuid not null,
  status text not null default 'approved'
    check (status in ('approved', 'removed', 'blocked')),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz not null,
  governance_reason text check (governance_reason is null or length(governance_reason) <= 2000),
  updated_at timestamptz not null default now(),
  unique (platform_id, config_id),
  foreign key (platform_id, config_id)
    references public.platform_configs(platform_id, id) on delete restrict,
  foreign key (platform_id, config_id, published_version_id)
    references public.platform_config_versions(platform_id, config_id, id) on delete restrict,
  foreign key (platform_id, approved_submission_id)
    references public.platform_config_gallery_submissions(platform_id, id) on delete restrict
);

create index platform_config_gallery_entries_platform_status_idx
  on public.platform_config_gallery_entries(platform_id, status, approved_at desc, config_id);

create table public.platform_config_likes (
  platform_id uuid not null,
  config_id uuid not null,
  platform_account_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (platform_id, config_id, platform_account_id),
  foreign key (platform_id, config_id)
    references public.platform_configs(platform_id, id) on delete restrict,
  foreign key (platform_id, platform_account_id)
    references public.platform_accounts(platform_id, id) on delete restrict
);

create index platform_config_likes_config_idx
  on public.platform_config_likes(platform_id, config_id, created_at desc);

create table public.platform_config_usage_events (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null,
  config_id uuid not null,
  version_id uuid not null,
  actor_platform_account_id uuid,
  event_type text not null
    check (event_type in ('download_completed', 'apply_delivery_completed')),
  event_key text not null check (length(event_key) between 1 and 128),
  occurred_at timestamptz not null default now(),
  unique (platform_id, event_type, event_key),
  foreign key (platform_id, config_id)
    references public.platform_configs(platform_id, id) on delete restrict,
  foreign key (platform_id, config_id, version_id)
    references public.platform_config_versions(platform_id, config_id, id) on delete restrict,
  foreign key (platform_id, actor_platform_account_id)
    references public.platform_accounts(platform_id, id) on delete restrict
);

create index platform_config_usage_events_config_idx
  on public.platform_config_usage_events(platform_id, config_id, event_type, occurred_at desc);

create trigger platform_configs_set_updated_at
before update on public.platform_configs
for each row execute function private.set_updated_at();

create trigger platform_config_gallery_entries_set_updated_at
before update on public.platform_config_gallery_entries
for each row execute function private.set_updated_at();

alter table public.platform_configs enable row level security;
alter table public.platform_configs force row level security;
alter table public.platform_config_versions enable row level security;
alter table public.platform_config_versions force row level security;
alter table public.platform_config_gallery_submissions enable row level security;
alter table public.platform_config_gallery_submissions force row level security;
alter table public.platform_config_gallery_entries enable row level security;
alter table public.platform_config_gallery_entries force row level security;
alter table public.platform_config_likes enable row level security;
alter table public.platform_config_likes force row level security;
alter table public.platform_config_usage_events enable row level security;
alter table public.platform_config_usage_events force row level security;

create policy platform_configs_domain_owner on public.platform_configs
  for all to domain_owner using (true) with check (true);
create policy platform_config_versions_domain_owner on public.platform_config_versions
  for all to domain_owner using (true) with check (true);
create policy platform_config_gallery_submissions_domain_owner on public.platform_config_gallery_submissions
  for all to domain_owner using (true) with check (true);
create policy platform_config_gallery_entries_domain_owner on public.platform_config_gallery_entries
  for all to domain_owner using (true) with check (true);
create policy platform_config_likes_domain_owner on public.platform_config_likes
  for all to domain_owner using (true) with check (true);
create policy platform_config_usage_events_domain_owner on public.platform_config_usage_events
  for all to domain_owner using (true) with check (true);

revoke all on table public.platform_configs,
  public.platform_config_versions,
  public.platform_config_gallery_submissions,
  public.platform_config_gallery_entries,
  public.platform_config_likes,
  public.platform_config_usage_events
from public, anon, authenticated, account_executor, admin_executor, job_executor, recovery_executor;

grant select, insert, update, delete on table public.platform_configs,
  public.platform_config_versions,
  public.platform_config_gallery_submissions,
  public.platform_config_gallery_entries,
  public.platform_config_likes,
  public.platform_config_usage_events
to domain_owner;
