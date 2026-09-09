begin;

select plan(28);

select has_table('public', 'platform_file_policies', 'file policy table exists');
select has_table('public', 'platform_config_files', 'config file table exists');
select has_table('private', 'file_write_attempts', 'write attempt table exists');
select has_table('private', 'file_backup_barriers', 'backup barrier table exists');
select has_table('private', 'file_deletion_tombstones', 'deletion tombstone table exists');

select ok(
  (select relrowsecurity and relforcerowsecurity
   from pg_class where oid = 'public.platform_file_policies'::regclass),
  'file policies force RLS'
);
select ok(
  (select relrowsecurity and relforcerowsecurity
   from pg_class where oid = 'public.platform_config_files'::regclass),
  'config files force RLS'
);
select ok(
  (select relrowsecurity and relforcerowsecurity
   from pg_class where oid = 'private.file_write_attempts'::regclass),
  'write attempts force RLS'
);
select ok(
  (select relrowsecurity and relforcerowsecurity
   from pg_class where oid = 'private.file_backup_barriers'::regclass),
  'backup barriers force RLS'
);
select ok(
  (select relrowsecurity and relforcerowsecurity
   from pg_class where oid = 'private.file_deletion_tombstones'::regclass),
  'tombstones force RLS'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.platform_config_files'::regclass
      and contype = 'f'
      and confrelid = 'public.platform_accounts'::regclass
      and pg_get_constraintdef(oid) like '%(platform_id, platform_account_id)%'
  ),
  'config files use a same-platform account foreign key'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.platform_config_files'::regclass
      and contype = 'f'
      and confrelid = 'public.platform_config_files'::regclass
      and pg_get_constraintdef(oid) like '%replaces_file_id%'
  ),
  'replacement target uses a same-platform composite foreign key'
);
select ok(
  exists (select 1 from pg_indexes where indexname = 'platform_config_files_live_replace_idx'),
  'only one live replacement per target is indexed'
);
select ok(
  exists (select 1 from pg_indexes where indexname = 'file_write_attempts_unsettled_idx'),
  'only one unsettled write attempt per file is indexed'
);

select ok(
  has_table_privilege('domain_owner', 'public.platform_config_files', 'select')
    and has_table_privilege('domain_owner', 'public.platform_config_files', 'insert')
    and has_table_privilege('domain_owner', 'public.platform_config_files', 'update'),
  'domain owner has controlled file table privileges'
);
select ok(
  not has_table_privilege('account_executor', 'public.platform_config_files', 'select')
    and not has_table_privilege('account_executor', 'public.platform_config_files', 'insert')
    and not has_table_privilege('account_executor', 'public.platform_config_files', 'update'),
  'account executor cannot directly access config files'
);
select ok(
  not has_table_privilege('admin_executor', 'public.platform_config_files', 'select')
    and not has_table_privilege('admin_executor', 'public.platform_config_files', 'insert'),
  'admin executor cannot directly access config files'
);
select ok(
  not has_table_privilege('job_executor', 'private.file_write_attempts', 'select')
    and not has_table_privilege('job_executor', 'private.file_write_attempts', 'update'),
  'job executor cannot directly access write attempts'
);
select ok(
  not has_table_privilege('anon', 'public.platform_config_files', 'select')
    and not has_table_privilege('authenticated', 'public.platform_config_files', 'select'),
  'browser roles cannot read config files'
);

select ok(
  (select count(*) = 4 from information_schema.columns
   where table_schema = 'public' and table_name = 'platform_file_policies'
     and column_name in ('enabled', 'max_file_bytes', 'max_files', 'max_total_bytes')),
  'file policy exposes the four bounded policy fields'
);
select ok(
  (select count(*) >= 8 from information_schema.columns
   where table_schema = 'public' and table_name = 'platform_config_files'
     and column_name in ('original_name', 'storage_path', 'requested_size_bytes',
       'actual_size_bytes', 'reserved_bytes', 'reserved_count', 'status', 'write_outcome')),
  'config files separate lifecycle and write outcome fields'
);
select ok(
  (select count(*) = 4 from information_schema.columns
   where table_schema = 'private' and table_name = 'file_write_attempts'
     and column_name in ('fencing_token', 'settled_at', 'provider_request_id', 'error_code')),
  'write attempts retain fence, settlement and provider evidence'
);
select ok(
  (select count(*) = 6 from information_schema.columns
   where table_schema = 'private' and table_name = 'file_backup_barriers'
     and column_name in ('scope', 'recovery_set_id', 'state', 'fencing_token', 'deadline_at', 'manifest_version')),
  'backup barriers retain recovery scope and manifest metadata'
);
select ok(
  (select count(*) = 5 from information_schema.columns
   where table_schema = 'private' and table_name = 'file_deletion_tombstones'
     and column_name in ('operation_id', 'platform_account_ref_hash', 'file_ref_hash', 'object_path_hash', 'reason_code')),
  'tombstones retain hashes and reason without original personal metadata'
);

select ok(
  exists (select 1 from pg_policy where polrelid = 'public.platform_config_files'::regclass
    and polname = 'platform_config_files_domain_owner'),
  'config files have a domain-owner policy'
);
select ok(
  exists (select 1 from pg_policy where polrelid = 'private.file_write_attempts'::regclass
    and polname = 'file_write_attempts_domain_owner'),
  'write attempts have a domain-owner policy'
);
select ok(
  exists (select 1 from pg_constraint
    where conrelid = 'private.file_backup_barriers'::regclass
      and lower(pg_get_constraintdef(oid)) like '%manifest_version is not null%'),
  'backup barrier completion requires a manifest'
);
select ok(
  exists (select 1 from pg_constraint
    where conrelid = 'private.file_deletion_tombstones'::regclass
      and lower(pg_get_constraintdef(oid)) like '%confirmed_at >= requested_at%'),
  'tombstone confirmation cannot precede request'
);

select * from finish();

rollback;
