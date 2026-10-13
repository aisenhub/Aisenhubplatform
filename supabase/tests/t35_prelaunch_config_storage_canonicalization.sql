begin;

select plan(19);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.platform_config_files'::regclass
      and pg_get_constraintdef(oid) like '%resource_kind%config_version%'
      and pg_get_constraintdef(oid) not like '%legacy%'
  ),
  'physical Config storage ledger accepts only config_version resources'
);
select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'platform_file_policies'
      and column_name in ('max_files', 'max_total_bytes')
  ),
  'retired account-level file count and byte quotas are absent'
);
select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'platform_config_files'
      and column_name in ('replaces_file_id', 'over_quota')
  ),
  'generic replacement and account over-quota columns are absent'
);

select ok(
  to_regprocedure('private.file_intent_create(private.account_context,text,bigint,text,text,uuid,text)') is null
  and to_regprocedure('private.file_list(private.account_context,uuid,integer)') is null
  and to_regprocedure('private.file_read(private.account_context,uuid)') is null
  and to_regprocedure('private.file_delete_request(private.account_context,uuid,text)') is null
  and to_regprocedure('private.file_upload_state(private.account_context,uuid)') is null,
  'retired Account generic file-product functions are absent'
);
select ok(
  to_regprocedure('private.admin_file_list_v3(private.admin_context,uuid,uuid,integer,text)') is null
  and to_regprocedure('private.admin_file_read(private.admin_context,uuid)') is null
  and to_regprocedure('private.admin_file_delete_request(private.admin_context,uuid,text)') is null
  and to_regprocedure('private.admin_file_policy_read_v2(private.admin_context,uuid)') is null,
  'retired Admin generic file-product functions are absent'
);

select has_function(
  'private', 'config_version_upload_state',
  array['private.account_context', 'uuid', 'uuid'],
  'Config Version upload-state wrapper remains canonical'
);
select has_function(
  'private', 'config_version_receive_claim',
  array['private.account_context', 'uuid', 'uuid', 'text', 'integer'],
  'Config Version receive-claim wrapper remains canonical'
);
select has_function(
  'private', 'config_version_prepare_store',
  array['private.account_context', 'uuid', 'uuid', 'bigint', 'text', 'text'],
  'Config Version prepare-store wrapper remains canonical'
);
select has_function(
  'private', 'config_storage_upload_state',
  array['private.account_context', 'uuid', 'text'],
  'internal Config storage state primitive exists under canonical name'
);
select ok(
  not has_function_privilege(
    'account_executor',
    'private.config_storage_upload_state(private.account_context, uuid, text)',
    'execute'
  ),
  'Account executor cannot bypass Config Version wrapper through storage primitive'
);
select ok(
  pg_get_functiondef('private.config_storage_upload_state(private.account_context, uuid, text)'::regprocedure) not like '%legacy%'
  and pg_get_functiondef('private.config_storage_receive_claim(private.account_context, uuid, text, text, integer)'::regprocedure) not like '%legacy%'
  and pg_get_functiondef('private.config_storage_prepare_store(private.account_context, uuid, text, bigint, text, text, text)'::regprocedure) not like '%legacy%'
  and pg_get_functiondef('private.config_storage_write_attempt_mark_unknown(private.account_context, uuid, text, uuid, text)'::regprocedure) not like '%legacy%'
  and pg_get_functiondef('private.config_storage_write_attempt_finalize(private.account_context, uuid, text, uuid, bigint, text, text)'::regprocedure) not like '%legacy%',
  'surviving Config storage primitives contain no legacy resource-kind branch'
);
select ok(
  has_function_privilege(
    'account_executor',
    'private.config_version_upload_state(private.account_context, uuid, uuid)',
    'execute'
  ),
  'Account executor can use the Config Version upload wrapper'
);

select has_function(
  'private', 'admin_storage_policy_read',
  array['private.admin_context', 'uuid'],
  'canonical Admin Storage Policy read exists'
);
select has_function(
  'private', 'admin_storage_policy_update',
  array['private.admin_context', 'uuid', 'boolean', 'bigint', 'bigint'],
  'canonical Admin Storage Policy update exists'
);
select ok(
  has_function_privilege(
    'admin_executor',
    'private.admin_storage_policy_update(private.admin_context, uuid, boolean, bigint, bigint)',
    'execute'
  )
  and not has_function_privilege(
    'account_executor',
    'private.admin_storage_policy_update(private.admin_context, uuid, boolean, bigint, bigint)',
    'execute'
  ),
  'Storage Policy mutation is Admin-only'
);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000007100', 'authenticated', 'authenticated', 'config-cursor-admin@example.invalid', 'x', now(), now()),
  ('00000000-0000-4000-8000-000000007101', 'authenticated', 'authenticated', 'config-cursor-owner@example.invalid', 'x', now(), now());
insert into auth.sessions (id, user_id, created_at, updated_at, not_after)
values ('00000000-0000-4000-8000-000000007110', '00000000-0000-4000-8000-000000007100', now(), now(), now() + interval '1 hour');
insert into private.system_admin(user_id)
values ('00000000-0000-4000-8000-000000007100')
on conflict (singleton_id) do update set user_id = excluded.user_id;
insert into public.platforms(id, code, name, status, allow_activation)
values ('00000000-0000-4000-8000-000000007120', 'config-cursor', 'Config Cursor', 'active', true);
insert into public.platform_accounts(id, platform_id, user_id, status, activated_at)
values ('00000000-0000-4000-8000-000000007130', '00000000-0000-4000-8000-000000007120', '00000000-0000-4000-8000-000000007101', 'active', now());
insert into public.platform_configs(
  id, platform_id, platform_account_id, title, status, created_at, updated_at
) values
  ('00000000-0000-4000-8000-000000007201', '00000000-0000-4000-8000-000000007120', '00000000-0000-4000-8000-000000007130', 'Config A', 'active', '2026-10-13 10:03:00+00', '2026-10-13 10:03:00+00'),
  ('00000000-0000-4000-8000-000000007202', '00000000-0000-4000-8000-000000007120', '00000000-0000-4000-8000-000000007130', 'Config B', 'active', '2026-10-13 10:02:00+00', '2026-10-13 10:02:00+00'),
  ('00000000-0000-4000-8000-000000007203', '00000000-0000-4000-8000-000000007120', '00000000-0000-4000-8000-000000007130', 'Config C', 'active', '2026-10-13 10:01:00+00', '2026-10-13 10:01:00+00');

set local role admin_executor;
create temporary table config_cursor_page_one on commit drop as
select * from private.admin_config_resource_list(
  row(
    '00000000-0000-4000-8000-000000007100',
    '00000000-0000-4000-8000-000000007110',
    '00000000-0000-4000-8000-000000007301'
  )::private.admin_context,
  '00000000-0000-4000-8000-000000007120', null, 2, null, null
);
set local role postgres;
select is((select count(*)::integer from config_cursor_page_one), 2, 'first Config page is bounded');
select ok(
  exists (select 1 from config_cursor_page_one where config_id = '00000000-0000-4000-8000-000000007201')
  and exists (select 1 from config_cursor_page_one where config_id = '00000000-0000-4000-8000-000000007202'),
  'first Config page follows immutable creation order'
);

update public.platform_configs
set title = title || ' updated', updated_at = case id
  when '00000000-0000-4000-8000-000000007202'::uuid then '2026-10-14 12:00:00+00'::timestamptz
  else '2026-10-12 12:00:00+00'::timestamptz
end
where id in (
  '00000000-0000-4000-8000-000000007202',
  '00000000-0000-4000-8000-000000007203'
);

set local role admin_executor;
create temporary table config_cursor_page_two on commit drop as
select * from private.admin_config_resource_list(
  row(
    '00000000-0000-4000-8000-000000007100',
    '00000000-0000-4000-8000-000000007110',
    '00000000-0000-4000-8000-000000007302'
  )::private.admin_context,
  '00000000-0000-4000-8000-000000007120',
  '00000000-0000-4000-8000-000000007202', 2, null, null
);
set local role postgres;
select ok(
  (select count(*) from config_cursor_page_two) = 1
  and (select config_id from config_cursor_page_two limit 1) = '00000000-0000-4000-8000-000000007203'::uuid,
  'mutating updated_at between pages does not move the Config cursor boundary'
);
select ok(
  pg_get_functiondef(
    'private.admin_config_resource_list(private.admin_context, uuid, uuid, integer, text, text)'::regprocedure
  ) like '%c.created_at%'
  and pg_get_functiondef(
    'private.admin_config_resource_list(private.admin_context, uuid, uuid, integer, text, text)'::regprocedure
  ) not like '%v_cursor_updated_at%',
  'Admin Config list implementation is anchored to immutable created_at rather than updated_at'
);

select * from finish();
rollback;
