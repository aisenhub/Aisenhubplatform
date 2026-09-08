-- M4-02: persistent file model and recovery metadata.
-- Upload, Storage, quota algorithms and workers are intentionally delivered by later tasks.

create table public.platform_file_policies (
  platform_id uuid primary key references public.platforms(id) on delete restrict,
  enabled boolean not null default true,
  max_file_bytes bigint not null default 1048576
    check (max_file_bytes between 1 and 1048576),
  max_files integer not null default 10 check (max_files > 0),
  max_total_bytes bigint not null default 10485760 check (max_total_bytes > 0),
  updated_at timestamptz not null default now(),
  check (max_file_bytes <= max_total_bytes)
);

create table public.platform_config_files (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null,
  platform_account_id uuid not null,
  original_name text not null
    check (length(original_name) between 1 and 255),
  storage_bucket text not null default 'platform-config-files'
    check (storage_bucket = 'platform-config-files'),
  storage_path text not null unique
    check (length(storage_path) between 1 and 512),
  mime_type text
    check (mime_type is null or length(mime_type) between 1 and 255),
  purpose text
    check (purpose is null or length(purpose) between 1 and 128),
  requested_size_bytes bigint not null
    check (requested_size_bytes between 1 and 1048576),
  actual_size_bytes bigint
    check (actual_size_bytes is null or actual_size_bytes between 1 and 1048576),
  sha256 text
    check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  reserved_bytes bigint not null default 0 check (reserved_bytes >= 0),
  reserved_count integer not null default 1 check (reserved_count in (0, 1)),
  status text not null default 'pending'
    check (status in ('pending', 'receiving', 'storing', 'active',
      'deleting', 'deleted', 'failed', 'expired')),
  replaces_file_id uuid,
  intent_expires_at timestamptz not null,
  lease_until timestamptz,
  fencing_token bigint not null default 0 check (fencing_token >= 0),
  write_outcome text not null default 'not_started'
    check (write_outcome in ('not_started', 'in_flight', 'confirmed', 'unknown', 'settled_absent')),
  uploaded_at timestamptz,
  delete_requested_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform_id, platform_account_id, id),
  foreign key (platform_id, platform_account_id)
    references public.platform_accounts(platform_id, id) on delete restrict,
  foreign key (platform_id, platform_account_id, replaces_file_id)
    references public.platform_config_files(platform_id, platform_account_id, id)
    on delete restrict,
  check (actual_size_bytes is null or actual_size_bytes <= requested_size_bytes),
  check (status <> 'active' or (actual_size_bytes is not null and sha256 is not null)),
  check (replaces_file_id is null or replaces_file_id <> id),
  check (status <> 'deleted' or deleted_at is not null),
  check (write_outcome <> 'confirmed' or actual_size_bytes is not null)
);

create unique index platform_config_files_live_replace_idx
  on public.platform_config_files(replaces_file_id)
  where replaces_file_id is not null
    and status in ('pending', 'receiving', 'storing');

create index platform_config_files_account_status_idx
  on public.platform_config_files(platform_id, platform_account_id, status, created_at desc, id desc);

create index platform_config_files_expiry_idx
  on public.platform_config_files(status, intent_expires_at)
  where status in ('pending', 'receiving', 'storing');

create table private.file_write_attempts (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null,
  platform_account_id uuid not null,
  file_id uuid not null,
  fencing_token bigint not null check (fencing_token >= 0),
  started_at timestamptz not null default now(),
  settled_at timestamptz,
  state text not null default 'in_flight'
    check (state in ('in_flight', 'confirmed', 'unknown', 'settled_absent')),
  provider_request_id text
    check (provider_request_id is null or length(provider_request_id) between 1 and 256),
  error_code text
    check (error_code is null or length(error_code) between 1 and 128),
  actual_size_bytes bigint
    check (actual_size_bytes is null or actual_size_bytes between 1 and 1048576),
  sha256 text
    check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  foreign key (platform_id, platform_account_id, file_id)
    references public.platform_config_files(platform_id, platform_account_id, id)
    on delete restrict,
  check ((state in ('confirmed', 'settled_absent')) = (settled_at is not null)),
  check (state <> 'confirmed' or (actual_size_bytes is not null and sha256 is not null))
);

create unique index file_write_attempts_unsettled_idx
  on private.file_write_attempts(file_id)
  where state in ('in_flight', 'unknown');

create index file_write_attempts_recovery_idx
  on private.file_write_attempts(state, started_at, id);

create table private.file_backup_barriers (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('platform', 'global', 'file')),
  recovery_set_id text not null check (length(recovery_set_id) between 1 and 256),
  state text not null default 'active'
    check (state in ('active', 'running', 'complete', 'failed')),
  lease_owner text check (lease_owner is null or length(lease_owner) between 1 and 128),
  fencing_token bigint not null default 1 check (fencing_token > 0),
  started_at timestamptz not null default now(),
  deadline_at timestamptz not null,
  finished_at timestamptz,
  manifest_version text
    check (manifest_version is null or length(manifest_version) between 1 and 128),
  last_error_code text
    check (last_error_code is null or length(last_error_code) between 1 and 128),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scope, recovery_set_id),
  check (deadline_at >= started_at),
  check ((state = 'complete') = (finished_at is not null and last_error_code is null)),
  check (state <> 'complete' or manifest_version is not null),
  check (state <> 'failed' or last_error_code is not null)
);

create index file_backup_barriers_active_idx
  on private.file_backup_barriers(scope, state, deadline_at);

create table private.file_deletion_tombstones (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique,
  platform_id uuid not null references public.platforms(id) on delete restrict,
  platform_account_ref_hash text not null check (platform_account_ref_hash ~ '^[0-9a-f]{64}$'),
  file_ref_hash text not null check (file_ref_hash ~ '^[0-9a-f]{64}$'),
  object_path_hash text not null check (object_path_hash ~ '^[0-9a-f]{64}$'),
  original_status text not null
    check (original_status in ('pending', 'receiving', 'storing', 'active', 'deleting', 'failed', 'expired')),
  requested_at timestamptz not null,
  confirmed_at timestamptz,
  reason_code text not null check (length(reason_code) between 1 and 128),
  data_version text not null check (length(data_version) between 1 and 64),
  source_commit text not null check (length(source_commit) between 1 and 128),
  manifest_version text
    check (manifest_version is null or length(manifest_version) between 1 and 128),
  created_at timestamptz not null default now(),
  check (confirmed_at is null or confirmed_at >= requested_at)
);

create index file_deletion_tombstones_platform_idx
  on private.file_deletion_tombstones(platform_id, created_at desc, id desc);

create trigger platform_file_policies_set_updated_at
before update on public.platform_file_policies
for each row execute function private.set_updated_at();

create trigger platform_config_files_set_updated_at
before update on public.platform_config_files
for each row execute function private.set_updated_at();

create trigger file_backup_barriers_set_updated_at
before update on private.file_backup_barriers
for each row execute function private.set_updated_at();

alter table public.platform_file_policies enable row level security;
alter table public.platform_config_files enable row level security;
alter table private.file_write_attempts enable row level security;
alter table private.file_backup_barriers enable row level security;
alter table private.file_deletion_tombstones enable row level security;

alter table public.platform_file_policies force row level security;
alter table public.platform_config_files force row level security;
alter table private.file_write_attempts force row level security;
alter table private.file_backup_barriers force row level security;
alter table private.file_deletion_tombstones force row level security;

revoke all on table
  public.platform_file_policies,
  public.platform_config_files,
  private.file_write_attempts,
  private.file_backup_barriers,
  private.file_deletion_tombstones
from public, anon, authenticated, account_executor, admin_executor, job_executor, recovery_executor;

grant all on table
  public.platform_file_policies,
  public.platform_config_files,
  private.file_write_attempts,
  private.file_backup_barriers,
  private.file_deletion_tombstones
to domain_owner;

create policy platform_file_policies_domain_owner on public.platform_file_policies
  for all to domain_owner using (true) with check (true);
create policy platform_config_files_domain_owner on public.platform_config_files
  for all to domain_owner using (true) with check (true);
create policy file_write_attempts_domain_owner on private.file_write_attempts
  for all to domain_owner using (true) with check (true);
create policy file_backup_barriers_domain_owner on private.file_backup_barriers
  for all to domain_owner using (true) with check (true);
create policy file_deletion_tombstones_domain_owner on private.file_deletion_tombstones
  for all to domain_owner using (true) with check (true);
