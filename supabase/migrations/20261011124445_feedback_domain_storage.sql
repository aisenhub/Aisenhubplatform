-- OPT-008 Phase 01: platform Feedback domain and dedicated private image storage.

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
values (
  'platform-feedback-attachments',
  'platform-feedback-attachments',
  false,
  4194304,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.platform_feedback (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null references public.platforms(id) on delete restrict,
  platform_account_id uuid,
  user_id uuid references auth.users(id) on delete set null,
  author_display_name_snapshot text
    check (author_display_name_snapshot is null or length(author_display_name_snapshot) <= 120),
  contact_allowed boolean not null default false,
  contact_email_snapshot text
    check (contact_email_snapshot is null or length(contact_email_snapshot) between 3 and 320),
  category text not null
    check (category in ('bug', 'idea', 'experience', 'other')),
  title text check (title is null or (length(title) between 1 and 160 and title !~ '[[:cntrl:]]')),
  body text check (body is null or length(body) between 1 and 10000),
  status text not null default 'draft'
    check (status in ('draft', 'new', 'reviewing', 'planned', 'resolved', 'closed', 'deleting', 'deleted')),
  flagged boolean not null default false,
  client_context jsonb not null default '{}'::jsonb
    check (jsonb_typeof(client_context) = 'object'),
  row_version bigint not null default 1 check (row_version > 0),
  submitted_at timestamptz,
  resolved_at timestamptz,
  delete_requested_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform_id, id),
  foreign key (platform_id, platform_account_id)
    references public.platform_accounts(platform_id, id) on delete restrict,
  check (
    status = 'deleted'
    or (platform_account_id is not null and user_id is not null)
  ),
  check (status <> 'draft' or submitted_at is null),
  check (
    status in ('draft', 'deleting', 'deleted')
    or submitted_at is not null
  ),
  check (status not in ('deleting', 'deleted') or delete_requested_at is not null),
  check (status <> 'deleted' or deleted_at is not null),
  check (status not in ('draft', 'new', 'reviewing', 'planned', 'resolved', 'closed')
    or (title is not null and body is not null))
);

create table public.platform_feedback_attachments (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null,
  platform_id uuid not null,
  platform_account_id uuid,
  original_name text not null
    check (length(original_name) between 1 and 255 and original_name !~ '[[:cntrl:]]'),
  storage_bucket text not null default 'platform-feedback-attachments'
    check (storage_bucket = 'platform-feedback-attachments'),
  storage_path text unique
    check (storage_path is null or length(storage_path) between 1 and 512),
  object_path_hash text not null check (object_path_hash ~ '^[0-9a-f]{64}$'),
  mime_type text not null
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  requested_size_bytes bigint not null
    check (requested_size_bytes between 1 and 4194304),
  actual_size_bytes bigint
    check (actual_size_bytes is null or actual_size_bytes between 1 and 4194304),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending'
    check (status in ('pending', 'receiving', 'storing', 'active', 'deleting', 'deleted', 'failed', 'expired')),
  write_outcome text not null default 'not_started'
    check (write_outcome in ('not_started', 'in_flight', 'confirmed', 'unknown', 'settled_absent')),
  intent_expires_at timestamptz not null,
  lease_owner text check (lease_owner is null or length(lease_owner) between 1 and 128),
  lease_until timestamptz,
  fencing_token bigint not null default 0 check (fencing_token >= 0),
  retry_count integer not null default 0 check (retry_count >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error_code text check (last_error_code is null or length(last_error_code) between 1 and 128),
  uploaded_at timestamptz,
  cancel_requested_at timestamptz,
  delete_requested_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform_id, id),
  foreign key (platform_id, feedback_id)
    references public.platform_feedback(platform_id, id) on delete restrict,
  foreign key (platform_id, platform_account_id)
    references public.platform_accounts(platform_id, id) on delete restrict,
  check (actual_size_bytes is null or actual_size_bytes <= requested_size_bytes),
  check (status <> 'active' or (actual_size_bytes is not null and sha256 is not null and write_outcome = 'confirmed')),
  check (status <> 'deleted' or (deleted_at is not null and storage_path is null)),
  check (status = 'deleted' or (platform_account_id is not null and storage_path is not null))
);

create table private.feedback_attachment_write_attempts (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null references public.platforms(id) on delete restrict,
  attachment_id uuid not null,
  fencing_token bigint not null check (fencing_token >= 0),
  state text not null default 'in_flight'
    check (state in ('in_flight', 'confirmed', 'unknown', 'settled_absent')),
  provider_request_id text
    check (provider_request_id is null or length(provider_request_id) between 1 and 256),
  error_code text check (error_code is null or length(error_code) between 1 and 128),
  actual_size_bytes bigint not null check (actual_size_bytes between 1 and 4194304),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  started_at timestamptz not null default now(),
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (platform_id, attachment_id)
    references public.platform_feedback_attachments(platform_id, id) on delete restrict,
  check ((state in ('confirmed', 'settled_absent')) = (settled_at is not null))
);

create table public.platform_feedback_labels (
  platform_id uuid not null,
  feedback_id uuid not null,
  label text not null check (length(label) between 1 and 32 and label !~ '[[:cntrl:]]'),
  created_at timestamptz not null default now(),
  primary key (feedback_id, label),
  foreign key (platform_id, feedback_id)
    references public.platform_feedback(platform_id, id) on delete restrict
);

create table public.platform_feedback_events (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null,
  feedback_id uuid not null,
  event_type text not null
    check (event_type in ('submitted', 'status_changed', 'labels_changed', 'note_added', 'flag_changed', 'delete_requested', 'deleted')),
  actor_user_id uuid references auth.users(id) on delete set null,
  note_body text check (note_body is null or length(note_body) between 1 and 5000),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (platform_id, feedback_id)
    references public.platform_feedback(platform_id, id) on delete restrict
);

create unique index feedback_attachment_unsettled_write_idx
  on private.feedback_attachment_write_attempts(attachment_id)
  where state in ('in_flight', 'unknown');
create index feedback_attachment_write_recovery_idx
  on private.feedback_attachment_write_attempts(state, started_at, id);
create index platform_feedback_account_created_idx
  on public.platform_feedback(platform_id, platform_account_id, created_at desc, id desc);
create index platform_feedback_status_created_idx
  on public.platform_feedback(platform_id, status, created_at desc, id desc);
create index platform_feedback_category_created_idx
  on public.platform_feedback(platform_id, category, created_at desc, id desc);
create index platform_feedback_user_idx
  on public.platform_feedback(platform_id, user_id, created_at desc, id desc)
  where user_id is not null;
create index platform_feedback_attachments_feedback_idx
  on public.platform_feedback_attachments(platform_id, feedback_id, status, created_at, id);
create index platform_feedback_attachments_account_fk_idx
  on public.platform_feedback_attachments(platform_id, platform_account_id)
  where platform_account_id is not null;
create index platform_feedback_attachments_cleanup_idx
  on public.platform_feedback_attachments(status, next_attempt_at, id)
  where status in ('receiving', 'storing', 'deleting');
create index platform_feedback_labels_filter_idx
  on public.platform_feedback_labels(platform_id, label, feedback_id);
create index platform_feedback_events_feedback_idx
  on public.platform_feedback_events(platform_id, feedback_id, created_at, id);

create trigger platform_feedback_set_updated_at
before update on public.platform_feedback
for each row execute function private.set_updated_at();

create trigger platform_feedback_attachments_set_updated_at
before update on public.platform_feedback_attachments
for each row execute function private.set_updated_at();

alter table public.platform_feedback enable row level security;
alter table public.platform_feedback force row level security;
alter table public.platform_feedback_attachments enable row level security;
alter table public.platform_feedback_attachments force row level security;
alter table private.feedback_attachment_write_attempts enable row level security;
alter table private.feedback_attachment_write_attempts force row level security;
alter table public.platform_feedback_labels enable row level security;
alter table public.platform_feedback_labels force row level security;
alter table public.platform_feedback_events enable row level security;
alter table public.platform_feedback_events force row level security;

create policy platform_feedback_domain_owner on public.platform_feedback
  for all to domain_owner using (true) with check (true);
create policy platform_feedback_attachments_domain_owner on public.platform_feedback_attachments
  for all to domain_owner using (true) with check (true);
create policy feedback_attachment_write_attempts_domain_owner on private.feedback_attachment_write_attempts
  for all to domain_owner using (true) with check (true);
create policy platform_feedback_labels_domain_owner on public.platform_feedback_labels
  for all to domain_owner using (true) with check (true);
create policy platform_feedback_events_domain_owner on public.platform_feedback_events
  for all to domain_owner using (true) with check (true);

revoke all on table public.platform_feedback,
  public.platform_feedback_attachments,
  private.feedback_attachment_write_attempts,
  public.platform_feedback_labels,
  public.platform_feedback_events
from public, anon, authenticated, account_executor, admin_executor, job_executor, recovery_executor;

grant select, insert, update, delete on table public.platform_feedback,
  public.platform_feedback_attachments,
  private.feedback_attachment_write_attempts,
  public.platform_feedback_labels,
  public.platform_feedback_events
to domain_owner;
