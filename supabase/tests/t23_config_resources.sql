begin;

select plan(63);

select has_table('public', 'platform_configs', 'Config identity table exists');
select has_table('public', 'platform_config_versions', 'immutable Config version table exists');
select has_table('public', 'platform_config_gallery_submissions', 'Gallery submission history exists');
select has_table('public', 'platform_config_gallery_entries', 'Gallery current entry projection exists');
select has_table('public', 'platform_config_likes', 'Gallery likes exist');
select has_table('public', 'platform_config_usage_events', 'Gallery usage facts exist');
select has_column('public', 'platform_config_files', 'resource_kind', 'physical file ledger distinguishes legacy and Config versions');
select has_column('public', 'platform_file_policies', 'max_platform_total_bytes', 'platform storage policy has a physical total cap');
select ok(
  (select bool_and(c.relforcerowsecurity)
   from pg_class c
   where c.oid in (
     'public.platform_configs'::regclass,
     'public.platform_config_versions'::regclass,
     'public.platform_config_gallery_submissions'::regclass,
     'public.platform_config_gallery_entries'::regclass,
     'public.platform_config_likes'::regclass,
     'public.platform_config_usage_events'::regclass
   )),
  'all new public Config tables force RLS'
);
select ok(
  not has_table_privilege('account_executor', 'public.platform_configs', 'select')
  and not has_table_privilege('account_executor', 'public.platform_config_versions', 'select')
  and not has_table_privilege('account_executor', 'public.platform_config_gallery_entries', 'select'),
  'account executor cannot read Config tables directly'
);
select ok(
  not has_table_privilege('admin_executor', 'public.platform_configs', 'select')
  and not has_table_privilege('admin_executor', 'public.platform_config_gallery_submissions', 'update'),
  'admin executor cannot bypass Config domain functions'
);
select has_function('private', 'config_create', array['private.account_context', 'text', 'text'], 'Config create boundary exists');
select has_function('private', 'config_version_intent_create', array['private.account_context', 'uuid', 'text', 'bigint', 'text', 'text', 'text', 'text', 'text'], 'Config version reservation boundary exists');
select has_function('private', 'config_gallery_submission_create', array['private.account_context', 'uuid', 'uuid'], 'Gallery submission boundary exists');
select has_function('private', 'config_gallery_like_set', array['private.account_context', 'uuid', 'boolean'], 'Gallery like boundary exists');
select has_function('private', 'config_gallery_usage_record', array['private.account_context', 'uuid', 'text', 'text'], 'Gallery usage boundary exists');
select has_function('private', 'admin_config_gallery_review', array['private.admin_context', 'uuid', 'text', 'text'], 'Admin Gallery review boundary exists');
select ok(has_function_privilege('account_executor', 'private.config_create(private.account_context, text, text)', 'execute'), 'account executor can create Config through wrapper');
select ok(has_function_privilege('account_executor', 'private.config_gallery_like_set(private.account_context, uuid, boolean)', 'execute'), 'account executor can mutate Gallery likes through wrapper');
select ok(has_function_privilege('account_executor', 'private.config_gallery_usage_record(private.account_context, uuid, text, text)', 'execute'), 'account executor can append central Gallery usage facts through wrapper');
select ok(has_function_privilege('admin_executor', 'private.admin_config_gallery_review(private.admin_context, uuid, text, text)', 'execute'), 'admin executor can review Gallery through wrapper');
select ok(
  not has_function_privilege('anon', 'private.config_gallery_like_set(private.account_context, uuid, boolean)', 'execute')
  and not has_function_privilege('authenticated', 'private.config_gallery_usage_record(private.account_context, uuid, text, text)', 'execute'),
  'browser roles cannot call Gallery mutation or usage wrappers directly'
);
select ok(not has_function_privilege('account_executor', 'private.config_slot_limit(private.account_context)', 'execute'), 'slot helper is internal only');
select ok(
  (select prosecdef and array_to_string(proconfig, ',') like 'search_path=pg_catalog%'
   from pg_proc where oid = 'private.config_create(private.account_context, text, text)'::regprocedure),
  'Config create is a pinned security definer'
);
select ok(exists (
  select 1 from pg_indexes where indexname = 'platform_config_gallery_one_pending_idx'
    and indexdef like '%UNIQUE%'
), 'one pending Gallery submission per Config is enforced');
select ok(exists (
  select 1 from pg_constraint
  where conrelid = 'public.platform_config_files'::regclass
    and pg_get_constraintdef(oid) like '%resource_kind%legacy%config_version%'
), 'file resource kind is constrained to legacy or config_version');
select ok(exists (
  select 1 from pg_constraint
  where conrelid = 'public.platform_file_policies'::regclass
    and pg_get_constraintdef(oid) like '%max_platform_total_bytes%'
), 'platform total capacity is constrained');

select is(
  (select count(*)::integer from pg_indexes
   where indexname in (
     'platform_configs_current_version_fk_idx',
     'platform_config_versions_owner_config_fk_idx',
     'platform_config_versions_owner_file_fk_idx',
     'platform_config_gallery_submissions_config_fk_idx',
     'platform_config_gallery_submissions_version_fk_idx',
     'platform_config_gallery_submissions_submitter_fk_idx',
     'platform_config_gallery_submissions_reviewer_fk_idx',
     'platform_config_gallery_entries_version_fk_idx',
     'platform_config_gallery_entries_submission_fk_idx',
     'platform_config_gallery_entries_approver_fk_idx',
     'platform_config_likes_account_fk_idx',
     'platform_config_usage_events_version_fk_idx',
     'platform_config_usage_events_actor_fk_idx'
   )),
  13,
  'Config-resource foreign keys have covering indexes'
);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000005100', 'authenticated', 'authenticated', 'config-admin@example.invalid', 'not-a-real-password', now(), now()),
  ('00000000-0000-4000-8000-000000005101', 'authenticated', 'authenticated', 'config-owner@example.invalid', 'not-a-real-password', now(), now()),
  ('00000000-0000-4000-8000-000000005102', 'authenticated', 'authenticated', 'config-other@example.invalid', 'not-a-real-password', now(), now());

insert into auth.sessions (id, user_id, created_at, updated_at, not_after)
values
  ('00000000-0000-4000-8000-000000005110', '00000000-0000-4000-8000-000000005100', now(), now(), now() + interval '1 hour'),
  ('00000000-0000-4000-8000-000000005111', '00000000-0000-4000-8000-000000005101', now(), now(), now() + interval '1 hour'),
  ('00000000-0000-4000-8000-000000005112', '00000000-0000-4000-8000-000000005102', now(), now(), now() + interval '1 hour');

insert into private.system_admin (user_id)
values ('00000000-0000-4000-8000-000000005100')
on conflict (singleton_id) do update set user_id = excluded.user_id;

insert into public.platforms (id, code, name, status, allow_activation)
values
  ('00000000-0000-4000-8000-000000005120', 'config-main', 'Config Main', 'active', true),
  ('00000000-0000-4000-8000-000000005121', 'config-other', 'Config Other', 'active', true);

insert into public.plans (id, platform_id, code, name, kind, features, status)
values
  ('00000000-0000-4000-8000-000000005130', '00000000-0000-4000-8000-000000005120', 'free', 'Free', 'free', '{"config_slot_limit":2}'::jsonb, 'active'),
  ('00000000-0000-4000-8000-000000005131', '00000000-0000-4000-8000-000000005121', 'free', 'Free', 'free', '{"config_slot_limit":"2"}'::jsonb, 'active');

update public.platforms set default_plan_id = '00000000-0000-4000-8000-000000005130', default_plan_kind = 'free'
where id = '00000000-0000-4000-8000-000000005120';
update public.platforms set default_plan_id = '00000000-0000-4000-8000-000000005131', default_plan_kind = 'free'
where id = '00000000-0000-4000-8000-000000005121';

insert into public.platform_accounts (id, platform_id, user_id, status, activated_at)
values
  ('00000000-0000-4000-8000-000000005140', '00000000-0000-4000-8000-000000005120', '00000000-0000-4000-8000-000000005101', 'active', now()),
  ('00000000-0000-4000-8000-000000005141', '00000000-0000-4000-8000-000000005120', '00000000-0000-4000-8000-000000005102', 'active', now()),
  ('00000000-0000-4000-8000-000000005142', '00000000-0000-4000-8000-000000005121', '00000000-0000-4000-8000-000000005101', 'active', now());

insert into private.platform_api_keys (
  id, platform_id, name, key_hmac, hmac_key_version, key_prefix, key_suffix, creation_operation_id
)
values
  ('00000000-0000-4000-8000-000000005150', '00000000-0000-4000-8000-000000005120', 'Config main key', repeat('a', 64), 1, 'config-main', 'fixture', '00000000-0000-4000-8000-000000005160'),
  ('00000000-0000-4000-8000-000000005151', '00000000-0000-4000-8000-000000005121', 'Config other key', repeat('b', 64), 1, 'config-other', 'fixture', '00000000-0000-4000-8000-000000005161');

insert into public.platform_file_policies (
  platform_id, enabled, max_file_bytes, max_files, max_total_bytes, max_platform_total_bytes
)
values ('00000000-0000-4000-8000-000000005120', true, 1048576, 10, 10485760, 1048576);

select is(
  private.config_slot_limit(row(
    '00000000-0000-4000-8000-000000005101', '00000000-0000-4000-8000-000000005111',
    '00000000-0000-4000-8000-000000005120', '00000000-0000-4000-8000-000000005150',
    '00000000-0000-4000-8000-000000005170'
  )::private.account_context),
  2,
  'numeric config_slot_limit is projected from the effective free plan'
);
select is(
  private.config_slot_limit(row(
    '00000000-0000-4000-8000-000000005101', '00000000-0000-4000-8000-000000005111',
    '00000000-0000-4000-8000-000000005121', '00000000-0000-4000-8000-000000005151',
    '00000000-0000-4000-8000-000000005171'
  )::private.account_context),
  0,
  'non-numeric config_slot_limit fails closed to zero'
);

create temporary table config_one on commit drop as
select * from private.config_create(row(
  '00000000-0000-4000-8000-000000005101', '00000000-0000-4000-8000-000000005111',
  '00000000-0000-4000-8000-000000005120', '00000000-0000-4000-8000-000000005150',
  '00000000-0000-4000-8000-000000005172'
)::private.account_context, 'Owner Config A', 'first');
select is((select title from config_one), 'Owner Config A', 'first Config is created inside slot limit');

create temporary table config_two on commit drop as
select * from private.config_create(row(
  '00000000-0000-4000-8000-000000005101', '00000000-0000-4000-8000-000000005111',
  '00000000-0000-4000-8000-000000005120', '00000000-0000-4000-8000-000000005150',
  '00000000-0000-4000-8000-000000005173'
)::private.account_context, 'Owner Config B', null);
select is((select count(*)::integer from config_two), 1, 'second Config fills the second slot');

select throws_ok(
  $$select * from private.config_create(row(
    '00000000-0000-4000-8000-000000005101', '00000000-0000-4000-8000-000000005111',
    '00000000-0000-4000-8000-000000005120', '00000000-0000-4000-8000-000000005150',
    '00000000-0000-4000-8000-000000005174'
  )::private.account_context, 'Owner Config C', null)$$,
  'P0001', 'config_slot_limit_exceeded', 'third Config is rejected at the slot boundary'
);

select throws_ok(
  format($query$select * from private.config_read(row(
    '00000000-0000-4000-8000-000000005102', '00000000-0000-4000-8000-000000005112',
    '00000000-0000-4000-8000-000000005120', '00000000-0000-4000-8000-000000005150',
    '00000000-0000-4000-8000-000000005175'
  )::private.account_context, %L::uuid)$query$, (select config_id from config_one)),
  'P0002', 'resource_not_found', 'another platform account cannot read the Config by ID'
);

update public.plans set features = '{"config_slot_limit":0}'::jsonb
where id = '00000000-0000-4000-8000-000000005130';

create temporary table version_one on commit drop as
select * from private.config_version_intent_create(row(
  '00000000-0000-4000-8000-000000005101', '00000000-0000-4000-8000-000000005111',
  '00000000-0000-4000-8000-000000005120', '00000000-0000-4000-8000-000000005150',
  '00000000-0000-4000-8000-000000005176'
)::private.account_context, (select config_id from config_one), 'config-a-v1.json', 100,
  'application/json', 'example.config', '1', 'initial', 'config-version-1');
select is((select version_number from version_one), 1, 'existing Config can add a Version after slot downgrade');
select is(
  (select resource_kind from public.platform_config_files where id = (select file_id from version_one)),
  'config_version',
  'Version reservation uses the shared file ledger as config_version'
);
select is(
  (select count(*)::integer from private.file_list(row(
    '00000000-0000-4000-8000-000000005101', '00000000-0000-4000-8000-000000005111',
    '00000000-0000-4000-8000-000000005120', '00000000-0000-4000-8000-000000005150',
    '00000000-0000-4000-8000-000000005177'
  )::private.account_context, null, 20)),
  0,
  'legacy Account file list does not expose Config Version files'
);
select is(
  (select count(*)::integer from private.admin_file_list_v3(row(
    '00000000-0000-4000-8000-000000005100', '00000000-0000-4000-8000-000000005110',
    '00000000-0000-4000-8000-000000005178'
  )::private.admin_context, '00000000-0000-4000-8000-000000005120', null, 20, null)),
  0,
  'legacy Admin file list does not expose Config Version files'
);
select is(
  (select count(*)::integer from private.admin_file_list(row(
    '00000000-0000-4000-8000-000000005100', '00000000-0000-4000-8000-000000005110',
    '00000000-0000-4000-8000-000000005178'
  )::private.admin_context, null, 20)),
  0,
  'legacy Admin v1 file list also excludes Config Version files'
);
select throws_ok(
  format($query$select * from private.file_delete_request(row(
    '00000000-0000-4000-8000-000000005101', '00000000-0000-4000-8000-000000005111',
    '00000000-0000-4000-8000-000000005120', '00000000-0000-4000-8000-000000005150',
    '00000000-0000-4000-8000-000000005179'
  )::private.account_context, %L::uuid, 'legacy-delete-fence')$query$, (select file_id from version_one)),
  'P0002', 'resource_not_found', 'legacy Account delete cannot delete a Config Version file'
);
select throws_ok(
  format($query$select * from private.admin_file_delete_request(row(
    '00000000-0000-4000-8000-000000005100', '00000000-0000-4000-8000-000000005110',
    '00000000-0000-4000-8000-000000005180'
  )::private.admin_context, %L::uuid, 'admin-legacy-delete-fence')$query$, (select file_id from version_one)),
  'P0002', 'resource_not_found', 'legacy Admin delete cannot delete a Config Version file'
);
select throws_ok(
  format($query$select * from private.config_version_activate(row(
    '00000000-0000-4000-8000-000000005101', '00000000-0000-4000-8000-000000005111',
    '00000000-0000-4000-8000-000000005120', '00000000-0000-4000-8000-000000005150',
    '00000000-0000-4000-8000-000000005181'
  )::private.account_context, %L::uuid, %L::uuid)$query$,
    (select config_id from config_one), (select version_id from version_one)),
  'P0001', 'version_not_ready', 'pending file cannot become current Config Version'
);

update public.platform_config_files
set status = 'active', write_outcome = 'confirmed', actual_size_bytes = 100,
  sha256 = repeat('a', 64), uploaded_at = now()
where id = (select file_id from version_one);

create temporary table activated_one on commit drop as
select * from private.config_version_activate(row(
  '00000000-0000-4000-8000-000000005101', '00000000-0000-4000-8000-000000005111',
  '00000000-0000-4000-8000-000000005120', '00000000-0000-4000-8000-000000005150',
  '00000000-0000-4000-8000-000000005182'
)::private.account_context, (select config_id from config_one), (select version_id from version_one));
select is((select current_version_id from activated_one), (select version_id from version_one), 'confirmed Version becomes current');

create temporary table submission_one on commit drop as
select * from private.config_gallery_submission_create(row(
  '00000000-0000-4000-8000-000000005101', '00000000-0000-4000-8000-000000005111',
  '00000000-0000-4000-8000-000000005120', '00000000-0000-4000-8000-000000005150',
  '00000000-0000-4000-8000-000000005183'
)::private.account_context, (select config_id from config_one), (select version_id from version_one));
select is((select status from submission_one), 'pending', 'current Version can enter pending Gallery review');

create temporary table review_one on commit drop as
select * from private.admin_config_gallery_review(row(
  '00000000-0000-4000-8000-000000005100', '00000000-0000-4000-8000-000000005110',
  '00000000-0000-4000-8000-000000005184'
)::private.admin_context, (select submission_id from submission_one), 'approve', 'approved fixture');
select is((select entry_status from review_one), 'approved', 'Admin approval creates an approved Gallery Entry');
select is(
  (select published_version_id from public.platform_config_gallery_entries where config_id = (select config_id from config_one)),
  (select version_id from version_one),
  'Gallery Entry points to the explicitly approved immutable Version'
);

create temporary table like_once on commit drop as
select * from private.config_gallery_like_set(row(
  '00000000-0000-4000-8000-000000005102', '00000000-0000-4000-8000-000000005112',
  '00000000-0000-4000-8000-000000005120', '00000000-0000-4000-8000-000000005150',
  '00000000-0000-4000-8000-000000005193'
)::private.account_context, (select config_id from config_one), true);
select is((select like_count from like_once), 1::bigint, 'approved Gallery Entry can be liked');
select is(
  (select like_count from private.config_gallery_like_set(row(
    '00000000-0000-4000-8000-000000005102', '00000000-0000-4000-8000-000000005112',
    '00000000-0000-4000-8000-000000005120', '00000000-0000-4000-8000-000000005150',
    '00000000-0000-4000-8000-000000005194'
  )::private.account_context, (select config_id from config_one), true)),
  1::bigint,
  'repeating Like is idempotent under the unique relation'
);
select is(
  (select like_count from private.config_gallery_like_set(row(
    '00000000-0000-4000-8000-000000005102', '00000000-0000-4000-8000-000000005112',
    '00000000-0000-4000-8000-000000005120', '00000000-0000-4000-8000-000000005150',
    '00000000-0000-4000-8000-000000005195'
  )::private.account_context, (select config_id from config_one), false)),
  0::bigint,
  'Unlike removes only the caller relation'
);
select ok(
  exists (select 1 from private.rate_limit_windows where limit_count = 240),
  'Like and Unlike use the frozen 240 per hour limiter'
);

create temporary table usage_once on commit drop as
select * from private.config_gallery_usage_record(row(
  '00000000-0000-4000-8000-000000005102', '00000000-0000-4000-8000-000000005112',
  '00000000-0000-4000-8000-000000005120', '00000000-0000-4000-8000-000000005150',
  '00000000-0000-4000-8000-000000005196'
)::private.account_context, (select config_id from config_one), 'download_completed', 'download-fixture');
select is((select version_id from usage_once), (select version_id from version_one), 'download usage is bound to the approved published Version');

create temporary table usage_repeat on commit drop as
select * from private.config_gallery_usage_record(row(
  '00000000-0000-4000-8000-000000005102', '00000000-0000-4000-8000-000000005112',
  '00000000-0000-4000-8000-000000005120', '00000000-0000-4000-8000-000000005150',
  '00000000-0000-4000-8000-000000005197'
)::private.account_context, (select config_id from config_one), 'download_completed', 'download-fixture');
select is((select usage_event_id from usage_repeat), (select usage_event_id from usage_once), 'repeated usage event key returns the existing central fact');
select is(
  (select count(*)::integer from public.platform_config_usage_events
   where platform_id = '00000000-0000-4000-8000-000000005120'
     and event_type = 'download_completed' and event_key = 'download-fixture'),
  1,
  'repeated delivery does not double count usage'
);
select ok(
  exists (select 1 from private.rate_limit_windows where limit_count = 600),
  'Gallery download and apply delivery share the frozen 600 per hour limiter'
);
select is(
  (select event_type from private.config_gallery_usage_record(row(
    '00000000-0000-4000-8000-000000005102', '00000000-0000-4000-8000-000000005112',
    '00000000-0000-4000-8000-000000005120', '00000000-0000-4000-8000-000000005150',
    '00000000-0000-4000-8000-000000005198'
  )::private.account_context, (select config_id from config_one), 'apply_delivery_completed', 'apply-fixture')),
  'apply_delivery_completed',
  'apply usage records central content delivery without claiming target-platform success'
);
select is(
  (select count(*)::integer from public.platform_config_usage_events
   where platform_id = '00000000-0000-4000-8000-000000005120'
     and config_id = (select config_id from config_one)),
  2,
  'download and apply delivery are separate central usage facts'
);

create temporary table version_two on commit drop as
select * from private.config_version_intent_create(row(
  '00000000-0000-4000-8000-000000005101', '00000000-0000-4000-8000-000000005111',
  '00000000-0000-4000-8000-000000005120', '00000000-0000-4000-8000-000000005150',
  '00000000-0000-4000-8000-000000005185'
)::private.account_context, (select config_id from config_one), 'config-a-v2.json', 100,
  'application/json', 'example.config', '2', 'second', 'config-version-2');
update public.platform_config_files
set status = 'active', write_outcome = 'confirmed', actual_size_bytes = 100,
  sha256 = repeat('b', 64), uploaded_at = now()
where id = (select file_id from version_two);
select is((select version_number from version_two), 2, 'Version numbers are monotonic inside a Config');

select * from private.config_version_activate(row(
  '00000000-0000-4000-8000-000000005101', '00000000-0000-4000-8000-000000005111',
  '00000000-0000-4000-8000-000000005120', '00000000-0000-4000-8000-000000005150',
  '00000000-0000-4000-8000-000000005186'
)::private.account_context, (select config_id from config_one), (select version_id from version_two));

create temporary table submission_two on commit drop as
select * from private.config_gallery_submission_create(row(
  '00000000-0000-4000-8000-000000005101', '00000000-0000-4000-8000-000000005111',
  '00000000-0000-4000-8000-000000005120', '00000000-0000-4000-8000-000000005150',
  '00000000-0000-4000-8000-000000005187'
)::private.account_context, (select config_id from config_one), (select version_id from version_two));
select is(
  (select published_version_id from public.platform_config_gallery_entries where config_id = (select config_id from config_one)),
  (select version_id from version_one),
  'pending newer Version does not replace the last approved Gallery Version'
);

select * from private.admin_config_gallery_review(row(
  '00000000-0000-4000-8000-000000005100', '00000000-0000-4000-8000-000000005110',
  '00000000-0000-4000-8000-000000005188'
)::private.admin_context, (select submission_id from submission_two), 'reject', 'not ready for gallery');
select is(
  (select published_version_id from public.platform_config_gallery_entries where config_id = (select config_id from config_one)),
  (select version_id from version_one),
  'rejecting a newer submission preserves the existing approved Gallery Version'
);

select throws_ok(
  $$select * from private.file_intent_create(row(
    '00000000-0000-4000-8000-000000005101', '00000000-0000-4000-8000-000000005111',
    '00000000-0000-4000-8000-000000005120', '00000000-0000-4000-8000-000000005150',
    '00000000-0000-4000-8000-000000005189'
  )::private.account_context, 'legacy-large.bin', 1048500, 'application/octet-stream', null, null, 'platform-capacity')$$,
  'P0001', 'platform_storage_quota_exceeded', 'legacy and Config Version reservations share the platform physical capacity'
);

select throws_ok(
  format($query$select * from private.config_patch(row(
    '00000000-0000-4000-8000-000000005101', '00000000-0000-4000-8000-000000005111',
    '00000000-0000-4000-8000-000000005120', '00000000-0000-4000-8000-000000005150',
    '00000000-0000-4000-8000-000000005190'
  )::private.account_context, %L::uuid, 1, 'stale write', null)$query$, (select config_id from config_one)),
  '40001', 'precondition_failed', 'stale Config metadata update is rejected after Version activation changes row_version'
);

select is(
  (select count(*)::integer from private.config_list(row(
    '00000000-0000-4000-8000-000000005101', '00000000-0000-4000-8000-000000005111',
    '00000000-0000-4000-8000-000000005120', '00000000-0000-4000-8000-000000005150',
    '00000000-0000-4000-8000-000000005191'
  )::private.account_context, null, 20)),
  2,
  'owner Config list returns the two active Config identities independent of Version count'
);

select throws_ok(
  format($query$select * from private.config_read(row(
    '00000000-0000-4000-8000-000000005101', '00000000-0000-4000-8000-000000005111',
    '00000000-0000-4000-8000-000000005121', '00000000-0000-4000-8000-000000005151',
    '00000000-0000-4000-8000-000000005192'
  )::private.account_context, %L::uuid)$query$, (select config_id from config_one)),
  'P0002', 'resource_not_found', 'the same user cannot use another platform context to read a Config'
);

select * from finish();

rollback;
