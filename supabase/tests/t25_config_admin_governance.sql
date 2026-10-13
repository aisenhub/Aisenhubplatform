begin;

select plan(30);

select has_function('private', 'admin_config_resource_list', array['private.admin_context','uuid','uuid','integer','text','text'], 'Admin Config resource list exists');
select has_function('private', 'admin_config_resource_read', array['private.admin_context','uuid','uuid'], 'Admin Config detail exists');
select has_function('private', 'admin_config_review_list', array['private.admin_context','uuid','uuid','integer'], 'Admin Config review queue exists');
select has_function('private', 'admin_config_gallery_review_v2', array['private.admin_context','uuid','uuid','text','text'], 'Admin platform-scoped review mutation exists');
select has_function('private', 'admin_config_gallery_govern', array['private.admin_context','uuid','uuid','text','text'], 'Admin Gallery governance mutation exists');
select has_function('private', 'admin_config_usage_summary', array['private.admin_context','uuid','uuid'], 'Admin Config usage summary exists');
select has_function('private', 'admin_storage_policy_read', array['private.admin_context','uuid'], 'Admin platform capacity read exists');
select has_function('private', 'admin_storage_policy_update', array['private.admin_context','uuid','boolean','bigint','bigint'], 'Admin platform capacity update exists');
select ok(has_function_privilege('admin_executor', 'private.admin_config_resource_list(private.admin_context, uuid, uuid, integer, text, text)', 'execute'), 'admin executor can list Config resources');
select ok(not has_function_privilege('account_executor', 'private.admin_config_gallery_govern(private.admin_context, uuid, uuid, text, text)', 'execute'), 'account executor cannot invoke Admin Gallery governance');
select ok((select prosecdef and array_to_string(proconfig, ',') like 'search_path=pg_catalog%'
  from pg_proc where oid='private.admin_config_resource_list(private.admin_context, uuid, uuid, integer, text, text)'::regprocedure), 'Admin Config list is pinned security definer');
select ok((select pg_get_function_result('private.admin_platform_overview(private.admin_context, uuid, integer)'::regprocedure) like '%pending_config_reviews%'), 'platform overview exposes authoritative pending Config reviews');

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000006100', 'authenticated', 'authenticated', 'govern-admin@example.invalid', 'x', now(), now()),
  ('00000000-0000-4000-8000-000000006101', 'authenticated', 'authenticated', 'govern-owner@example.invalid', 'x', now(), now()),
  ('00000000-0000-4000-8000-000000006102', 'authenticated', 'authenticated', 'govern-other@example.invalid', 'x', now(), now());
insert into auth.sessions (id, user_id, created_at, updated_at, not_after)
values
  ('00000000-0000-4000-8000-000000006110', '00000000-0000-4000-8000-000000006100', now(), now(), now()+interval '1 hour'),
  ('00000000-0000-4000-8000-000000006111', '00000000-0000-4000-8000-000000006101', now(), now(), now()+interval '1 hour');
insert into private.system_admin(user_id)
values ('00000000-0000-4000-8000-000000006100')
on conflict (singleton_id) do update set user_id=excluded.user_id;

insert into public.platforms(id, code, name, status, allow_activation)
values
  ('00000000-0000-4000-8000-000000006120', 'govern-main', 'Govern Main', 'active', true),
  ('00000000-0000-4000-8000-000000006121', 'govern-other', 'Govern Other', 'active', true);
insert into public.plans(id, platform_id, code, name, kind, features, status)
values
  ('00000000-0000-4000-8000-000000006130', '00000000-0000-4000-8000-000000006120', 'free', 'Free', 'free', '{"config_slot_limit":3,"other_feature":true}'::jsonb, 'active'),
  ('00000000-0000-4000-8000-000000006131', '00000000-0000-4000-8000-000000006121', 'free', 'Free', 'free', '{"config_slot_limit":3}'::jsonb, 'active');
update public.platforms set default_plan_id='00000000-0000-4000-8000-000000006130', default_plan_kind='free'
where id='00000000-0000-4000-8000-000000006120';
update public.platforms set default_plan_id='00000000-0000-4000-8000-000000006131', default_plan_kind='free'
where id='00000000-0000-4000-8000-000000006121';
insert into public.platform_accounts(id, platform_id, user_id, status, activated_at)
values
  ('00000000-0000-4000-8000-000000006140', '00000000-0000-4000-8000-000000006120', '00000000-0000-4000-8000-000000006101', 'active', now()),
  ('00000000-0000-4000-8000-000000006141', '00000000-0000-4000-8000-000000006120', '00000000-0000-4000-8000-000000006102', 'active', now());
insert into private.platform_api_keys(id, platform_id, name, key_hmac, hmac_key_version, key_prefix, key_suffix, creation_operation_id)
values ('00000000-0000-4000-8000-000000006150', '00000000-0000-4000-8000-000000006120', 'Govern key', repeat('a',64), 1, 'govern', 'fixture', '00000000-0000-4000-8000-000000006151');
insert into public.platform_file_policies(platform_id, enabled, max_file_bytes, max_platform_total_bytes)
values ('00000000-0000-4000-8000-000000006120', true, 1048576, 2097152);

create temporary table govern_config on commit drop as
select * from private.config_create(row(
  '00000000-0000-4000-8000-000000006101','00000000-0000-4000-8000-000000006111',
  '00000000-0000-4000-8000-000000006120','00000000-0000-4000-8000-000000006150',
  '00000000-0000-4000-8000-000000006160'
)::private.account_context, 'Govern Config', 'business description');

create temporary table govern_v1 on commit drop as
select * from private.config_version_intent_create(row(
  '00000000-0000-4000-8000-000000006101','00000000-0000-4000-8000-000000006111',
  '00000000-0000-4000-8000-000000006120','00000000-0000-4000-8000-000000006150',
  '00000000-0000-4000-8000-000000006161'
)::private.account_context, (select config_id from govern_config), 'govern-v1.json', 100,
'application/json', 'govern.schema', '1', 'first', 'govern-v1');
update public.platform_config_files
set status='active', write_outcome='confirmed', actual_size_bytes=100,
    sha256=repeat('a',64), uploaded_at=now()
where id=(select file_id from govern_v1);
select * from private.config_version_activate(row(
  '00000000-0000-4000-8000-000000006101','00000000-0000-4000-8000-000000006111',
  '00000000-0000-4000-8000-000000006120','00000000-0000-4000-8000-000000006150',
  '00000000-0000-4000-8000-000000006162'
)::private.account_context, (select config_id from govern_config), (select version_id from govern_v1));
create temporary table govern_submission1 on commit drop as
select * from private.config_gallery_submission_create(row(
  '00000000-0000-4000-8000-000000006101','00000000-0000-4000-8000-000000006111',
  '00000000-0000-4000-8000-000000006120','00000000-0000-4000-8000-000000006150',
  '00000000-0000-4000-8000-000000006163'
)::private.account_context, (select config_id from govern_config), (select version_id from govern_v1));

grant select on govern_config, govern_v1, govern_submission1 to admin_executor;

set local role admin_executor;
create temporary table admin_resource_list on commit drop as
select * from private.admin_config_resource_list(row(
  '00000000-0000-4000-8000-000000006100','00000000-0000-4000-8000-000000006110','00000000-0000-4000-8000-000000006170'
)::private.admin_context, '00000000-0000-4000-8000-000000006120', null, 20, 'Govern', 'pending');
create temporary table admin_review_queue on commit drop as
select * from private.admin_config_review_list(row(
  '00000000-0000-4000-8000-000000006100','00000000-0000-4000-8000-000000006110','00000000-0000-4000-8000-000000006171'
)::private.admin_context, '00000000-0000-4000-8000-000000006120', null, 20);
set local role postgres;
select is((select count(*)::integer from admin_resource_list), 1, 'Admin resource list uses server-side platform/query/Gallery filters');
select is((select pending_submission_id from admin_resource_list), (select submission_id from govern_submission1), 'resource list projects pending review without client inference');
select is((select count(*)::integer from admin_review_queue), 1, 'Admin review queue returns the platform pending submission');
select is((select current_published_version_id from admin_review_queue), null::uuid, 'first pending review has no published Gallery version');

set local role admin_executor;
create temporary table approved_review on commit drop as
select * from private.admin_config_gallery_review_v2(row(
  '00000000-0000-4000-8000-000000006100','00000000-0000-4000-8000-000000006110','00000000-0000-4000-8000-000000006172'
)::private.admin_context, '00000000-0000-4000-8000-000000006120', (select submission_id from govern_submission1), 'approve', 'approved by test');
set local role postgres;
select is((select entry_status from approved_review), 'approved', 'platform-scoped review approves the immutable Version');
select is((select published_version_id from public.platform_config_gallery_entries where config_id=(select config_id from govern_config)), (select version_id from govern_v1), 'approved review switches Gallery published Version');

insert into public.platform_config_likes(platform_id, config_id, platform_account_id)
values ('00000000-0000-4000-8000-000000006120', (select config_id from govern_config), '00000000-0000-4000-8000-000000006141');
insert into public.platform_config_usage_events(platform_id, config_id, version_id, actor_platform_account_id, event_type, event_key)
values
  ('00000000-0000-4000-8000-000000006120', (select config_id from govern_config), (select version_id from govern_v1), '00000000-0000-4000-8000-000000006141', 'download_completed', 'govern-download'),
  ('00000000-0000-4000-8000-000000006120', (select config_id from govern_config), (select version_id from govern_v1), '00000000-0000-4000-8000-000000006141', 'apply_delivery_completed', 'govern-apply');
set local role admin_executor;
create temporary table usage_summary on commit drop as
select * from private.admin_config_usage_summary(row(
  '00000000-0000-4000-8000-000000006100','00000000-0000-4000-8000-000000006110','00000000-0000-4000-8000-000000006173'
)::private.admin_context, '00000000-0000-4000-8000-000000006120', (select config_id from govern_config));
set local role postgres;
select ok((select like_count=1 and download_count=1 and apply_delivery_count=1 from usage_summary), 'Admin usage summary is derived from central Like/Usage facts');

set local role admin_executor;
select * from private.admin_config_gallery_govern(row(
  '00000000-0000-4000-8000-000000006100','00000000-0000-4000-8000-000000006110','00000000-0000-4000-8000-000000006174'
)::private.admin_context, '00000000-0000-4000-8000-000000006120', (select config_id from govern_config), 'remove', 'operator removal');
set local role postgres;
select is((select status from public.platform_config_gallery_entries where config_id=(select config_id from govern_config)), 'removed', 'remove changes only Gallery visibility');
select is((select status from public.platform_configs where id=(select config_id from govern_config)), 'active', 'Gallery remove does not delete the personal Config');
set local role admin_executor;
select * from private.admin_config_gallery_govern(row(
  '00000000-0000-4000-8000-000000006100','00000000-0000-4000-8000-000000006110','00000000-0000-4000-8000-000000006175'
)::private.admin_context, '00000000-0000-4000-8000-000000006120', (select config_id from govern_config), 'restore', 'restore after review');
select * from private.admin_config_gallery_govern(row(
  '00000000-0000-4000-8000-000000006100','00000000-0000-4000-8000-000000006110','00000000-0000-4000-8000-000000006176'
)::private.admin_context, '00000000-0000-4000-8000-000000006120', (select config_id from govern_config), 'block', 'governance block');
set local role postgres;
select is((select status from public.platform_config_gallery_entries where config_id=(select config_id from govern_config)), 'blocked', 'restore then block keeps governance separate from Config deletion');

select * from private.config_version_intent_create(row(
  '00000000-0000-4000-8000-000000006101','00000000-0000-4000-8000-000000006111',
  '00000000-0000-4000-8000-000000006120','00000000-0000-4000-8000-000000006150',
  '00000000-0000-4000-8000-000000006187'
)::private.account_context, (select config_id from govern_config), 'capacity-a.json', 700000,
  'application/json', 'govern.capacity', '1', 'capacity a', 'govern-capacity-a');
select * from private.config_version_intent_create(row(
  '00000000-0000-4000-8000-000000006101','00000000-0000-4000-8000-000000006111',
  '00000000-0000-4000-8000-000000006120','00000000-0000-4000-8000-000000006150',
  '00000000-0000-4000-8000-000000006188'
)::private.account_context, (select config_id from govern_config), 'capacity-b.json', 700000,
  'application/json', 'govern.capacity', '2', 'capacity b', 'govern-capacity-b');
set local role admin_executor;
create temporary table lowered_capacity on commit drop as
select * from private.admin_storage_policy_update(row(
  '00000000-0000-4000-8000-000000006100','00000000-0000-4000-8000-000000006110','00000000-0000-4000-8000-000000006177'
)::private.admin_context, '00000000-0000-4000-8000-000000006120', true, 1048576, 1048576);
set local role postgres;
select is((select max_platform_total_bytes from lowered_capacity), 1048576::bigint, 'Global capacity update persists requested platform cap');
select ok((select platform_reserved_bytes > max_platform_total_bytes and platform_over_capacity from lowered_capacity), 'capacity may be lowered below reserved bytes and reports over-capacity without deleting data');
update public.platform_file_policies
set max_platform_total_bytes = 2097152
where platform_id = '00000000-0000-4000-8000-000000006120';

set local role postgres;
select throws_ok(
  $$select * from private.admin_plan_save(row(
    '00000000-0000-4000-8000-000000006100','00000000-0000-4000-8000-000000006110','00000000-0000-4000-8000-000000006178'
  )::private.admin_context, '00000000-0000-4000-8000-000000006120', null, 'bad-slot', 'Bad Slot', null, 'paid', '{"config_slot_limit":"3","other_feature":true}'::jsonb)$$,
  '22023', 'invalid_input', 'Plan SQL rejects non-numeric config_slot_limit'
);
create temporary table valid_plan on commit drop as
select result.id as plan_id, result.* from private.admin_plan_save(row(
  '00000000-0000-4000-8000-000000006100','00000000-0000-4000-8000-000000006110','00000000-0000-4000-8000-000000006179'
)::private.admin_context, '00000000-0000-4000-8000-000000006120', null, 'valid-slot', 'Valid Slot', null, 'paid', '{"config_slot_limit":5,"other_feature":true}'::jsonb) as result;
set local role postgres;
select is((select features->>'config_slot_limit' from public.plans where id=(select plan_id from valid_plan)), '5', 'Plan upsert accepts numeric config_slot_limit');
select is((select features->>'other_feature' from public.plans where id=(select plan_id from valid_plan)), 'true', 'Plan upsert preserves unrelated feature keys');

create temporary table govern_v2 on commit drop as
select * from private.config_version_intent_create(row(
  '00000000-0000-4000-8000-000000006101','00000000-0000-4000-8000-000000006111',
  '00000000-0000-4000-8000-000000006120','00000000-0000-4000-8000-000000006150',
  '00000000-0000-4000-8000-000000006182'
)::private.account_context, (select config_id from govern_config), 'govern-v2.json', 100,
'application/json', 'govern.schema', '2', 'second', 'govern-v2');
update public.platform_config_files
set status='active', write_outcome='confirmed', actual_size_bytes=100,
    sha256=repeat('b',64), uploaded_at=now()
where id=(select file_id from govern_v2);
select * from private.config_version_activate(row(
  '00000000-0000-4000-8000-000000006101','00000000-0000-4000-8000-000000006111',
  '00000000-0000-4000-8000-000000006120','00000000-0000-4000-8000-000000006150',
  '00000000-0000-4000-8000-000000006183'
)::private.account_context, (select config_id from govern_config), (select version_id from govern_v2));
select * from private.config_gallery_submission_create(row(
  '00000000-0000-4000-8000-000000006101','00000000-0000-4000-8000-000000006111',
  '00000000-0000-4000-8000-000000006120','00000000-0000-4000-8000-000000006150',
  '00000000-0000-4000-8000-000000006184'
)::private.account_context, (select config_id from govern_config), (select version_id from govern_v2));
set local role admin_executor;
create temporary table governance_overview on commit drop as
select * from private.admin_platform_overview(row(
  '00000000-0000-4000-8000-000000006100','00000000-0000-4000-8000-000000006110','00000000-0000-4000-8000-000000006185'
)::private.admin_context, '00000000-0000-4000-8000-000000006120', 30);
set local role postgres;
select is((select pending_config_reviews from governance_overview), 1::bigint, 'Overview pending review metric comes from authoritative pending submissions');
select is((select published_version_id from public.platform_config_gallery_entries where config_id=(select config_id from govern_config)), (select version_id from govern_v1), 'new pending Version does not replace the last approved published Version');

select throws_ok(
  $$select * from private.admin_config_resource_read(row(
    '00000000-0000-4000-8000-000000006100','00000000-0000-4000-8000-000000006110','00000000-0000-4000-8000-000000006186'
  )::private.admin_context, '00000000-0000-4000-8000-000000006121', (select config_id from govern_config))$$,
  'P0002', 'resource_not_found', 'Admin Config detail rejects cross-platform IDOR'
);

select * from finish();
rollback;
