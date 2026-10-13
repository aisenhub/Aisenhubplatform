begin;

select plan(19);

select has_function(
  'private', 'config_version_upload_state',
  array['private.account_context', 'uuid', 'uuid'],
  'Config Version upload state boundary exists'
);
select has_function(
  'private', 'config_gallery_content_authorize',
  array['private.account_context', 'uuid', 'text'],
  'Gallery content authorization boundary exists'
);
select ok(
  has_function_privilege(
    'account_executor',
    'private.config_version_upload_state(private.account_context, uuid, uuid)',
    'execute'
  ),
  'account executor can use Config Version content wrapper'
);
select ok(
  not has_function_privilege(
    'account_executor',
    'private.config_storage_upload_state(private.account_context, uuid, text)',
    'execute'
  ),
  'Config storage primitive stays internal'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'private.config_gallery_content_authorize(private.account_context, uuid, text)',
    'execute'
  ),
  'browser role cannot authorize Gallery Storage directly'
);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000006100', 'authenticated', 'authenticated', 'config-content-owner@example.invalid', 'not-a-real-password', now(), now()),
  ('00000000-0000-4000-8000-000000006101', 'authenticated', 'authenticated', 'config-content-other@example.invalid', 'not-a-real-password', now(), now());

insert into auth.sessions (id, user_id, created_at, updated_at, not_after)
values
  ('00000000-0000-4000-8000-000000006110', '00000000-0000-4000-8000-000000006100', now(), now(), now() + interval '1 hour'),
  ('00000000-0000-4000-8000-000000006111', '00000000-0000-4000-8000-000000006101', now(), now(), now() + interval '1 hour');

insert into public.platforms (id, code, name, status, allow_activation)
values ('00000000-0000-4000-8000-000000006120', 'config-content', 'Config Content', 'active', true);

insert into public.plans (id, platform_id, code, name, kind, features, status)
values (
  '00000000-0000-4000-8000-000000006130',
  '00000000-0000-4000-8000-000000006120',
  'free', 'Free', 'free', '{"config_slot_limit":3}'::jsonb, 'active'
);
update public.platforms
set default_plan_id = '00000000-0000-4000-8000-000000006130', default_plan_kind = 'free'
where id = '00000000-0000-4000-8000-000000006120';

insert into public.platform_accounts (id, platform_id, user_id, status, activated_at)
values
  ('00000000-0000-4000-8000-000000006140', '00000000-0000-4000-8000-000000006120', '00000000-0000-4000-8000-000000006100', 'active', now()),
  ('00000000-0000-4000-8000-000000006141', '00000000-0000-4000-8000-000000006120', '00000000-0000-4000-8000-000000006101', 'active', now());

insert into private.platform_api_keys (
  id, platform_id, name, key_hmac, hmac_key_version, key_prefix, key_suffix, creation_operation_id
) values (
  '00000000-0000-4000-8000-000000006150',
  '00000000-0000-4000-8000-000000006120',
  'Config content key', repeat('c', 64), 1, 'config-content', 'fixture',
  '00000000-0000-4000-8000-000000006160'
);

insert into public.platform_file_policies (
  platform_id, enabled, max_file_bytes, max_platform_total_bytes
) values (
  '00000000-0000-4000-8000-000000006120', true, 1048576, 1073741824
);

insert into public.platform_configs (
  id, platform_id, platform_account_id, title, description, status
) values (
  '00000000-0000-4000-8000-000000006170',
  '00000000-0000-4000-8000-000000006120',
  '00000000-0000-4000-8000-000000006140',
  'Content Config', 'phase 02 fixture', 'active'
);

insert into public.platform_config_files (
  id, platform_id, platform_account_id, original_name, storage_path,
  mime_type, purpose, requested_size_bytes, reserved_bytes, reserved_count,
  status, intent_expires_at, resource_kind
) values (
  '00000000-0000-4000-8000-000000006180',
  '00000000-0000-4000-8000-000000006120',
  '00000000-0000-4000-8000-000000006140',
  'content-v1.json',
  '00000000-0000-4000-8000-000000006120/00000000-0000-4000-8000-000000006140/00000000-0000-4000-8000-000000006180',
  'application/json', 'config_version', 20, 20, 1, 'pending', now() + interval '10 minutes', 'config_version'
);

insert into public.platform_config_versions (
  id, platform_id, platform_account_id, config_id, file_id, version_number,
  schema_key, schema_version, changelog
) values (
  '00000000-0000-4000-8000-000000006190',
  '00000000-0000-4000-8000-000000006120',
  '00000000-0000-4000-8000-000000006140',
  '00000000-0000-4000-8000-000000006170',
  '00000000-0000-4000-8000-000000006180',
  1, 'example.config', '1', 'phase 02'
);

select is(
  (select resource_kind from public.platform_config_files where id = '00000000-0000-4000-8000-000000006180'),
  'config_version',
  'Config Version remains tagged separately in the physical ledger'
);

select is(
  (select file_id from private.config_version_upload_state(row(
    '00000000-0000-4000-8000-000000006100',
    '00000000-0000-4000-8000-000000006110',
    '00000000-0000-4000-8000-000000006120',
    '00000000-0000-4000-8000-000000006150',
    '00000000-0000-4000-8000-000000006201'
  )::private.account_context,
    '00000000-0000-4000-8000-000000006170',
    '00000000-0000-4000-8000-000000006190')),
  '00000000-0000-4000-8000-000000006180'::uuid,
  'owner Config Version wrapper resolves its physical file'
);

select throws_ok(
  $$select * from private.config_version_upload_state(row(
    '00000000-0000-4000-8000-000000006101',
    '00000000-0000-4000-8000-000000006111',
    '00000000-0000-4000-8000-000000006120',
    '00000000-0000-4000-8000-000000006150',
    '00000000-0000-4000-8000-000000006202'
  )::private.account_context,
    '00000000-0000-4000-8000-000000006170',
    '00000000-0000-4000-8000-000000006190')$$,
  'P0002', 'resource_not_found',
  'another account cannot resolve the owner Config Version'
);

select is(
  (select status from private.config_version_receive_claim(row(
    '00000000-0000-4000-8000-000000006100',
    '00000000-0000-4000-8000-000000006110',
    '00000000-0000-4000-8000-000000006120',
    '00000000-0000-4000-8000-000000006150',
    '00000000-0000-4000-8000-000000006204'
  )::private.account_context,
    '00000000-0000-4000-8000-000000006170',
    '00000000-0000-4000-8000-000000006190', 'config-handler', 15)),
  'receiving',
  'Config Version wrapper can claim its own pending file'
);

update public.platform_config_files
set status = 'active', write_outcome = 'confirmed', actual_size_bytes = 20,
  sha256 = repeat('d', 64), uploaded_at = now(), lease_until = null, lease_owner = null
where id = '00000000-0000-4000-8000-000000006180';
update public.platform_configs
set current_version_id = '00000000-0000-4000-8000-000000006190', row_version = row_version + 1
where id = '00000000-0000-4000-8000-000000006170';

select is(
  (select count(*)::integer from private.config_gallery_list(row(
    '00000000-0000-4000-8000-000000006100',
    '00000000-0000-4000-8000-000000006110',
    '00000000-0000-4000-8000-000000006120',
    '00000000-0000-4000-8000-000000006150',
    '00000000-0000-4000-8000-000000006205'
  )::private.account_context, null, 20)),
  0,
  'unapproved Config never appears in Gallery list'
);

insert into public.platform_config_gallery_submissions (
  id, platform_id, config_id, version_id, submitted_by_account_id,
  status, reviewed_at, review_reason
) values (
  '00000000-0000-4000-8000-000000006210',
  '00000000-0000-4000-8000-000000006120',
  '00000000-0000-4000-8000-000000006170',
  '00000000-0000-4000-8000-000000006190',
  '00000000-0000-4000-8000-000000006140',
  'approved', now(), 'phase 02 fixture'
);
insert into public.platform_config_gallery_entries (
  config_id, platform_id, published_version_id, approved_submission_id,
  status, approved_at
) values (
  '00000000-0000-4000-8000-000000006170',
  '00000000-0000-4000-8000-000000006120',
  '00000000-0000-4000-8000-000000006190',
  '00000000-0000-4000-8000-000000006210',
  'approved', now()
);

select is(
  (select count(*)::integer from private.config_gallery_list(row(
    '00000000-0000-4000-8000-000000006101',
    '00000000-0000-4000-8000-000000006111',
    '00000000-0000-4000-8000-000000006120',
    '00000000-0000-4000-8000-000000006150',
    '00000000-0000-4000-8000-000000006206'
  )::private.account_context, null, 20)),
  1,
  'approved active Config is visible to another account on the same platform'
);

select is(
  (select version_id from private.config_gallery_content_authorize(row(
    '00000000-0000-4000-8000-000000006101',
    '00000000-0000-4000-8000-000000006111',
    '00000000-0000-4000-8000-000000006120',
    '00000000-0000-4000-8000-000000006150',
    '00000000-0000-4000-8000-000000006207'
  )::private.account_context,
    '00000000-0000-4000-8000-000000006170', 'download')),
  '00000000-0000-4000-8000-000000006190'::uuid,
  'Gallery content authorization resolves only the approved Version'
);

create temporary table usage_one on commit drop as
select * from private.config_gallery_usage_record(row(
  '00000000-0000-4000-8000-000000006101',
  '00000000-0000-4000-8000-000000006111',
  '00000000-0000-4000-8000-000000006120',
  '00000000-0000-4000-8000-000000006150',
  '00000000-0000-4000-8000-000000006208'
)::private.account_context,
  '00000000-0000-4000-8000-000000006170', 'download_completed', 'phase02-download-1');
select ok((select usage_event_id is not null from usage_one), 'completed Gallery delivery records a usage fact');

select * from private.config_gallery_usage_record(row(
  '00000000-0000-4000-8000-000000006101',
  '00000000-0000-4000-8000-000000006111',
  '00000000-0000-4000-8000-000000006120',
  '00000000-0000-4000-8000-000000006150',
  '00000000-0000-4000-8000-000000006209'
)::private.account_context,
  '00000000-0000-4000-8000-000000006170', 'download_completed', 'phase02-download-1');
select is(
  (select count(*)::integer from public.platform_config_usage_events
   where event_key = 'phase02-download-1'),
  1,
  'repeated delivery event key is idempotent'
);

update public.platform_accounts set status = 'closed', user_id = null, anonymized_at = now(), closed_at = now()
where id = '00000000-0000-4000-8000-000000006140';
select is(
  (select count(*)::integer from private.config_gallery_list(row(
    '00000000-0000-4000-8000-000000006101',
    '00000000-0000-4000-8000-000000006111',
    '00000000-0000-4000-8000-000000006120',
    '00000000-0000-4000-8000-000000006150',
    '00000000-0000-4000-8000-000000006211'
  )::private.account_context, null, 20)),
  0,
  'closed author account immediately disappears from Gallery'
);
update public.platform_accounts set status = 'active', user_id = '00000000-0000-4000-8000-000000006100', anonymized_at = null, closed_at = null
where id = '00000000-0000-4000-8000-000000006140';

create temporary table delete_one on commit drop as
select * from private.config_delete_request(row(
  '00000000-0000-4000-8000-000000006100',
  '00000000-0000-4000-8000-000000006110',
  '00000000-0000-4000-8000-000000006120',
  '00000000-0000-4000-8000-000000006150',
  '00000000-0000-4000-8000-000000006212'
)::private.account_context, '00000000-0000-4000-8000-000000006170');
select is((select status from delete_one), 'deleting', 'Config delete request moves personal Config to deleting');
select is(
  (select status from public.platform_config_gallery_entries where config_id = '00000000-0000-4000-8000-000000006170'),
  'removed',
  'Config delete request removes the public Gallery Entry immediately'
);
select is(
  (select status from public.platform_config_files where id = '00000000-0000-4000-8000-000000006180'),
  'deleting',
  'Config delete request hands Version file to the existing deletion state machine'
);
select is(
  (select count(*)::integer from private.config_gallery_list(row(
    '00000000-0000-4000-8000-000000006101',
    '00000000-0000-4000-8000-000000006111',
    '00000000-0000-4000-8000-000000006120',
    '00000000-0000-4000-8000-000000006150',
    '00000000-0000-4000-8000-000000006213'
  )::private.account_context, null, 20)),
  0,
  'deleted-requested Config is no longer public'
);

select * from finish();
rollback;
