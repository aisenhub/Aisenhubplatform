-- T09: M1 security tables and constrained internal helpers.
-- No role password or external secret is stored in a migration.

do $$
declare
  role_name text;
begin
  foreach role_name in array array[
    'account_executor',
    'admin_executor',
    'job_executor',
    'domain_owner',
    'recovery_executor'
  ] loop
    if not exists (select 1 from pg_roles where rolname = role_name) then
      execute format(
        'create role %I noinherit nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls',
        role_name
      );
    end if;
  end loop;
end;
$$;

grant domain_owner to postgres;
grant usage, create on schema private to domain_owner;

create table private.system_admin (
  singleton_id smallint primary key default 1 check (singleton_id = 1),
  user_id uuid not null unique
    references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table private.identity_lifecycle (
  user_id uuid primary key
    references auth.users(id) on delete restrict,
  state text not null default 'active'
    check (state in ('active', 'deleting')),
  updated_at timestamptz not null default now()
);

create table private.platform_api_keys (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null
    references public.platforms(id) on delete restrict,
  name text not null check (length(name) between 1 and 128),
  key_hmac text not null
    check (length(key_hmac) = 64 and key_hmac ~ '^[0-9a-f]{64}$'),
  hmac_key_version integer not null check (hmac_key_version > 0),
  key_prefix text not null check (length(key_prefix) between 1 and 64),
  key_suffix text not null check (length(key_suffix) between 1 and 64),
  status text not null default 'active'
    check (status in ('active', 'revoked')),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  revoked_by uuid references auth.users(id) on delete set null,
  creation_operation_id uuid not null,
  created_at timestamptz not null default now(),
  check (
    (status = 'active' and revoked_at is null)
    or (status = 'revoked' and revoked_at is not null)
  ),
  unique (hmac_key_version, key_hmac),
  unique (platform_id, creation_operation_id)
);

create table private.idempotency_keys (
  platform_id uuid not null
    references public.platforms(id) on delete restrict,
  platform_account_id uuid not null,
  operation text not null check (length(operation) between 1 and 128),
  actor_scope text not null check (length(actor_scope) between 1 and 256),
  idempotency_key text not null
    check (length(idempotency_key) between 1 and 128),
  request_hash bytea not null check (octet_length(request_hash) = 32),
  state text not null default 'pending'
    check (state in ('pending', 'completed')),
  response_status integer,
  response_body jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  foreign key (platform_id, platform_account_id)
    references public.platform_accounts(platform_id, id) on delete restrict,
  check (expires_at >= created_at and expires_at <= created_at + interval '7 days'),
  check (
    (state = 'pending' and response_status is null and response_body is null)
    or (state = 'completed' and response_status between 100 and 599 and response_body is not null)
  ),
  primary key (platform_id, platform_account_id, operation, actor_scope, idempotency_key)
);

create table private.admin_idempotency (
  admin_user_id uuid not null
    references auth.users(id) on delete restrict,
  platform_id uuid references public.platforms(id) on delete restrict,
  scope text not null check (scope = 'global' or scope like 'platform:%'),
  operation text not null check (length(operation) between 1 and 128),
  idempotency_key text not null
    check (length(idempotency_key) between 1 and 128),
  request_hash bytea not null check (octet_length(request_hash) = 32),
  state text not null default 'pending'
    check (state in ('pending', 'completed')),
  response_status integer,
  response_body jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  check ((scope = 'global' and platform_id is null) or (scope like 'platform:%' and platform_id is not null)),
  check (expires_at >= created_at and expires_at <= created_at + interval '7 days'),
  check (
    (state = 'pending' and response_status is null and response_body is null)
    or (state = 'completed' and response_status between 100 and 599 and response_body is not null)
  ),
  primary key (admin_user_id, scope, operation, idempotency_key)
);

create table private.admin_step_up (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  session_id uuid not null,
  factor_id uuid not null,
  verified_at timestamptz not null,
  expires_at timestamptz not null,
  check (expires_at > verified_at),
  check (expires_at <= verified_at + interval '5 minutes'),
  unique (user_id, session_id, factor_id, verified_at)
);

create table private.deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  request_session_id uuid not null,
  state text not null default 'pending_admin'
    check (state in ('pending_admin', 'approved', 'cancelled')),
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  cancelled_at timestamptz,
  check (
    (state = 'pending_admin' and approved_at is null and cancelled_at is null)
    or (state = 'approved' and approved_at is not null and cancelled_at is null)
    or (state = 'cancelled' and cancelled_at is not null and approved_at is null)
  )
);

create table private.deletion_jobs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique
    references private.deletion_requests(id) on delete restrict,
  user_id uuid references auth.users(id) on delete set null,
  scope text not null default 'global' check (scope = 'global'),
  state text not null default 'pending'
    check (state in ('pending', 'running', 'blocked', 'retry', 'completed')),
  checkpoint text not null default 'created'
    check (length(checkpoint) between 1 and 128),
  fence bigint not null default 1 check (fence > 0),
  retry_count integer not null default 0 check (retry_count >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error_code text check (last_error_code is null or length(last_error_code) between 1 and 128),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  check ((state = 'completed') = (completed_at is not null))
);

create table private.job_leases (
  job_kind text not null check (length(job_kind) between 1 and 64),
  resource_id uuid not null,
  lease_owner text not null check (length(lease_owner) between 1 and 128),
  lease_until timestamptz not null,
  fencing_token bigint not null default 1 check (fencing_token > 0),
  retry_count integer not null default 0 check (retry_count >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error_code text check (last_error_code is null or length(last_error_code) between 1 and 128),
  primary key (job_kind, resource_id)
);

create table private.rate_limit_windows (
  key_hash bytea not null check (octet_length(key_hash) = 32),
  window_started_at timestamptz not null,
  window_seconds integer not null check (window_seconds between 1 and 86400),
  hit_count bigint not null default 0 check (hit_count >= 0),
  limit_count integer not null check (limit_count > 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (key_hash, window_started_at),
  check (expires_at >= window_started_at),
  check (expires_at <= window_started_at + interval '1 day')
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  actor_type text not null
    check (actor_type in ('user', 'admin', 'job', 'recovery', 'system')),
  actor_user_id uuid references auth.users(id) on delete set null,
  platform_id uuid references public.platforms(id) on delete restrict,
  platform_account_id uuid,
  event_type text not null check (length(event_type) between 1 and 128),
  target_type text not null check (length(target_type) between 1 and 128),
  target_id uuid,
  ip inet,
  user_agent text check (user_agent is null or length(user_agent) <= 1024),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) <= 16384),
  created_at timestamptz not null default now(),
  foreign key (platform_id, platform_account_id)
    references public.platform_accounts(platform_id, id) on delete restrict,
  check (platform_account_id is null or platform_id is not null)
);

create index platform_api_keys_active_idx
  on private.platform_api_keys (platform_id, status, expires_at);
create index idempotency_keys_expiry_idx
  on private.idempotency_keys (expires_at);
create index admin_idempotency_expiry_idx
  on private.admin_idempotency (expires_at);
create index admin_step_up_lookup_idx
  on private.admin_step_up (user_id, session_id, expires_at);
create index audit_logs_request_idx on public.audit_logs (request_id);
create index audit_logs_platform_time_idx
  on public.audit_logs (platform_id, created_at desc);
create index deletion_jobs_schedule_idx
  on private.deletion_jobs (state, next_attempt_at);
create index job_leases_schedule_idx
  on private.job_leases (lease_until, next_attempt_at);
create index rate_limit_windows_expiry_idx
  on private.rate_limit_windows (expires_at);

create unique index deletion_requests_active_user_idx
  on private.deletion_requests (user_id)
  where user_id is not null and state in ('pending_admin', 'approved');
create unique index deletion_jobs_active_user_idx
  on private.deletion_jobs (user_id)
  where user_id is not null and state in ('pending', 'running', 'blocked', 'retry');

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

create trigger system_admin_set_updated_at
before update on private.system_admin
for each row execute function private.set_updated_at();

create trigger identity_lifecycle_set_updated_at
before update on private.identity_lifecycle
for each row execute function private.set_updated_at();

create trigger rate_limit_windows_set_updated_at
before update on private.rate_limit_windows
for each row execute function private.set_updated_at();

create or replace function private.identity_is_blocked(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private
as $$
  select exists (
    select 1
    from private.identity_lifecycle
    where user_id = p_user_id
      and state = 'deleting'
  )
$$;

create or replace function private.check_user_session(
  p_user_id uuid,
  p_session_id uuid
)
returns table (active boolean, reason text)
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $$
begin
  if p_user_id is null or p_session_id is null then
    return query select false, 'invalid_input'::text;
    return;
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    return query select false, 'user_not_found'::text;
    return;
  end if;

  if private.identity_is_blocked(p_user_id) then
    return query select false, 'identity_deleting'::text;
    return;
  end if;

  if not exists (
    select 1
    from auth.sessions
    where id = p_session_id
      and user_id = p_user_id
      and (not_after is null or not_after > now())
  ) then
    return query select false, 'session_not_found_or_expired'::text;
    return;
  end if;

  return query select true, 'active'::text;
end;
$$;

create or replace function private.audit_append(
  p_request_id uuid,
  p_actor_type text,
  p_actor_user_id uuid,
  p_platform_id uuid,
  p_platform_account_id uuid,
  p_event_type text,
  p_target_type text,
  p_target_id uuid,
  p_ip inet,
  p_user_agent text,
  p_metadata jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  audit_id uuid;
begin
  if p_request_id is null or p_metadata is null
    or jsonb_typeof(p_metadata) <> 'object'
    or pg_column_size(p_metadata) > 16384 then
    raise exception 'invalid_audit_payload' using errcode = '22023';
  end if;

  insert into public.audit_logs (
    request_id, actor_type, actor_user_id, platform_id, platform_account_id,
    event_type, target_type, target_id, ip, user_agent, metadata
  ) values (
    p_request_id, p_actor_type, p_actor_user_id, p_platform_id, p_platform_account_id,
    p_event_type, p_target_type, p_target_id, p_ip, p_user_agent, p_metadata
  ) returning id into audit_id;

  return audit_id;
end;
$$;

create or replace function private.idempotency_claim(
  p_platform_id uuid,
  p_platform_account_id uuid,
  p_operation text,
  p_actor_scope text,
  p_idempotency_key text,
  p_request_hash bytea
)
returns table (outcome text, response_status integer, response_body jsonb)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private
as $$
declare
  existing private.idempotency_keys%rowtype;
begin
  insert into private.idempotency_keys (
    platform_id, platform_account_id, operation, actor_scope,
    idempotency_key, request_hash
  ) values (
    p_platform_id, p_platform_account_id, p_operation, p_actor_scope,
    p_idempotency_key, p_request_hash
  ) on conflict (platform_id, platform_account_id, operation, actor_scope, idempotency_key)
  do nothing;

  select * into existing
  from private.idempotency_keys
  where platform_id = p_platform_id
    and platform_account_id = p_platform_account_id
    and operation = p_operation
    and actor_scope = p_actor_scope
    and idempotency_key = p_idempotency_key
  for update;

  if existing.request_hash <> p_request_hash then
    return query select 'conflict'::text, null::integer, null::jsonb;
  elsif existing.state = 'completed' then
    return query select 'completed'::text, existing.response_status, existing.response_body;
  else
    return query select 'pending'::text, null::integer, null::jsonb;
  end if;
end;
$$;

create or replace function private.idempotency_finalize(
  p_platform_id uuid,
  p_platform_account_id uuid,
  p_operation text,
  p_actor_scope text,
  p_idempotency_key text,
  p_request_hash bytea,
  p_response_status integer,
  p_response_body jsonb
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, private
as $$
begin
  update private.idempotency_keys
  set state = 'completed',
      response_status = p_response_status,
      response_body = p_response_body
  where platform_id = p_platform_id
    and platform_account_id = p_platform_account_id
    and operation = p_operation
    and actor_scope = p_actor_scope
    and idempotency_key = p_idempotency_key
    and request_hash = p_request_hash
    and state = 'pending';
  return found;
end;
$$;

create or replace function private.job_lease_claim(
  p_job_kind text,
  p_resource_id uuid,
  p_lease_owner text,
  p_lease_seconds integer default 60
)
returns table (claimed boolean, fencing_token bigint, lease_until timestamptz)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private
as $$
declare
  operation_now timestamptz := clock_timestamp();
begin
  if p_lease_seconds < 1 or p_lease_seconds > 3600 then
    raise exception 'invalid_lease_seconds' using errcode = '22023';
  end if;

  insert into private.job_leases (
    job_kind, resource_id, lease_owner, lease_until, fencing_token
  ) values (
    p_job_kind, p_resource_id, p_lease_owner,
    operation_now + make_interval(secs => p_lease_seconds), 1
  ) on conflict (job_kind, resource_id) do update
  set lease_owner = excluded.lease_owner,
      lease_until = excluded.lease_until,
      fencing_token = private.job_leases.fencing_token + 1
  where private.job_leases.lease_until <= operation_now;

  if found then
    return query
      select true, jl.fencing_token, jl.lease_until
      from private.job_leases jl
      where jl.job_kind = p_job_kind and jl.resource_id = p_resource_id;
  else
    return query
      select false, jl.fencing_token, jl.lease_until
      from private.job_leases jl
      where jl.job_kind = p_job_kind and jl.resource_id = p_resource_id;
  end if;
end;
$$;

create or replace function private.job_lease_release(
  p_job_kind text,
  p_resource_id uuid,
  p_lease_owner text,
  p_fencing_token bigint
)
returns boolean
language sql
volatile
security definer
set search_path = pg_catalog, private
as $$
  update private.job_leases
  set lease_until = clock_timestamp()
  where job_kind = p_job_kind
    and resource_id = p_resource_id
    and lease_owner = p_lease_owner
    and fencing_token = p_fencing_token
  returning true
$$;

create or replace function private.rate_limit_consume(
  p_key_hash bytea,
  p_window_started_at timestamptz,
  p_window_seconds integer,
  p_limit_count integer
)
returns table (allowed boolean, hit_count bigint, retry_at timestamptz)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private
as $$
declare
  current_window private.rate_limit_windows%rowtype;
begin
  insert into private.rate_limit_windows (
    key_hash, window_started_at, window_seconds, hit_count,
    limit_count, expires_at
  ) values (
    p_key_hash, p_window_started_at, p_window_seconds, 1,
    p_limit_count,
    p_window_started_at + make_interval(secs => p_window_seconds)
  ) on conflict (key_hash, window_started_at) do update
  set hit_count = private.rate_limit_windows.hit_count + 1,
      updated_at = clock_timestamp();

  select * into current_window
  from private.rate_limit_windows
  where key_hash = p_key_hash and window_started_at = p_window_started_at;

  return query select
    current_window.hit_count <= current_window.limit_count,
    current_window.hit_count,
    current_window.window_started_at
      + make_interval(secs => current_window.window_seconds);
end;
$$;

alter table private.system_admin enable row level security;
alter table private.identity_lifecycle enable row level security;
alter table private.platform_api_keys enable row level security;
alter table private.idempotency_keys enable row level security;
alter table private.admin_idempotency enable row level security;
alter table private.admin_step_up enable row level security;
alter table private.deletion_requests enable row level security;
alter table private.deletion_jobs enable row level security;
alter table private.job_leases enable row level security;
alter table private.rate_limit_windows enable row level security;
alter table public.audit_logs enable row level security;

alter table private.system_admin force row level security;
alter table private.identity_lifecycle force row level security;
alter table private.platform_api_keys force row level security;
alter table private.idempotency_keys force row level security;
alter table private.admin_idempotency force row level security;
alter table private.admin_step_up force row level security;
alter table private.deletion_requests force row level security;
alter table private.deletion_jobs force row level security;
alter table private.job_leases force row level security;
alter table private.rate_limit_windows force row level security;
alter table public.audit_logs force row level security;

alter table private.system_admin owner to domain_owner;
alter table private.identity_lifecycle owner to domain_owner;
alter table private.platform_api_keys owner to domain_owner;
alter table private.idempotency_keys owner to domain_owner;
alter table private.admin_idempotency owner to domain_owner;
alter table private.admin_step_up owner to domain_owner;
alter table private.deletion_requests owner to domain_owner;
alter table private.deletion_jobs owner to domain_owner;
alter table private.job_leases owner to domain_owner;
alter table private.rate_limit_windows owner to domain_owner;

grant all on all tables in schema private to domain_owner;
grant insert, select on table public.audit_logs to domain_owner;

create policy system_admin_domain_owner on private.system_admin
  for all to domain_owner using (true) with check (true);
create policy identity_lifecycle_domain_owner on private.identity_lifecycle
  for all to domain_owner using (true) with check (true);
create policy platform_api_keys_domain_owner on private.platform_api_keys
  for all to domain_owner using (true) with check (true);
create policy idempotency_keys_domain_owner on private.idempotency_keys
  for all to domain_owner using (true) with check (true);
create policy admin_idempotency_domain_owner on private.admin_idempotency
  for all to domain_owner using (true) with check (true);
create policy admin_step_up_domain_owner on private.admin_step_up
  for all to domain_owner using (true) with check (true);
create policy deletion_requests_domain_owner on private.deletion_requests
  for all to domain_owner using (true) with check (true);
create policy deletion_jobs_domain_owner on private.deletion_jobs
  for all to domain_owner using (true) with check (true);
create policy job_leases_domain_owner on private.job_leases
  for all to domain_owner using (true) with check (true);
create policy rate_limit_windows_domain_owner on private.rate_limit_windows
  for all to domain_owner using (true) with check (true);
create policy audit_logs_domain_owner_insert on public.audit_logs
  for insert to domain_owner with check (true);
create policy audit_logs_domain_owner_select on public.audit_logs
  for select to domain_owner using (true);

alter function private.set_updated_at() owner to domain_owner;
alter function private.identity_is_blocked(uuid) owner to domain_owner;
alter function private.audit_append(uuid, text, uuid, uuid, uuid, text, text, uuid, inet, text, jsonb)
  owner to domain_owner;
alter function private.idempotency_claim(uuid, uuid, text, text, text, bytea)
  owner to domain_owner;
alter function private.idempotency_finalize(uuid, uuid, text, text, text, bytea, integer, jsonb)
  owner to domain_owner;
alter function private.job_lease_claim(text, uuid, text, integer) owner to domain_owner;
alter function private.job_lease_release(text, uuid, text, bigint) owner to domain_owner;
alter function private.rate_limit_consume(bytea, timestamptz, integer, integer)
  owner to domain_owner;

revoke all on all tables in schema private from public, anon, authenticated,
  account_executor, admin_executor, job_executor, recovery_executor;
revoke all on table public.audit_logs from public, anon, authenticated,
  account_executor, admin_executor, job_executor, recovery_executor;

grant usage on schema private to account_executor, admin_executor, job_executor,
  domain_owner, recovery_executor;

revoke all on all functions in schema private from public, anon, authenticated,
  account_executor, admin_executor, job_executor, recovery_executor;
grant execute on function private.job_lease_claim(text, uuid, text, integer)
  to job_executor;
grant execute on function private.job_lease_release(text, uuid, text, bigint)
  to job_executor;
grant execute on function private.identity_is_blocked(uuid) to domain_owner;
grant execute on function private.check_user_session(uuid, uuid) to domain_owner;

alter default privileges in schema private
  revoke execute on functions from public, anon, authenticated,
    account_executor, admin_executor, job_executor, recovery_executor;
