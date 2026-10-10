begin;

select plan(21);

select has_function(
  'private',
  'admin_audit_list_v2',
  array['private.admin_context', 'uuid', 'integer', 'text', 'uuid', 'text', 'text', 'text', 'text'],
  'Admin audit v2 list exists'
);
select ok(
  has_function_privilege(
    'admin_executor',
    'private.admin_audit_list_v2(private.admin_context, uuid, integer, text, uuid, text, text, text, text)',
    'execute'
  ),
  'admin executor can use audit v2'
);
select ok(
  not has_function_privilege(
    'account_executor',
    'private.admin_audit_list_v2(private.admin_context, uuid, integer, text, uuid, text, text, text, text)',
    'execute'
  ),
  'account executor cannot use audit v2'
);
select ok(
  has_function_privilege('domain_owner', 'private.audit_actor_email(uuid)', 'execute'),
  'domain owner may resolve the internal actor email projection'
);
select ok(
  not has_function_privilege('admin_executor', 'private.audit_actor_email(uuid)', 'execute'),
  'admin executor cannot call the privileged actor email helper directly'
);
select ok(
  (select prosecdef from pg_proc
   where oid = 'private.admin_audit_list_v2(private.admin_context, uuid, integer, text, uuid, text, text, text, text)'::regprocedure),
  'audit v2 is security definer'
);
select ok(
  (select array_to_string(proconfig, ',') like 'search_path=pg_catalog%'
   from pg_proc
   where oid = 'private.admin_audit_list_v2(private.admin_context, uuid, integer, text, uuid, text, text, text, text)'::regprocedure),
  'audit v2 pins search_path'
);
select ok(
  pg_get_functiondef(
    'private.admin_audit_list_v2(private.admin_context, uuid, integer, text, uuid, text, text, text, text)'::regprocedure
  ) like '%order by e.created_at desc, e.audit_id desc%',
  'audit v2 keeps stable cursor ordering'
);
select ok(
  pg_get_functiondef(
    'private.admin_audit_list_v2(private.admin_context, uuid, integer, text, uuid, text, text, text, text)'::regprocedure
  ) like '%lower(v_outcome) = ''unrecorded''%',
  'audit v2 has an explicit unrecorded outcome filter'
);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000002010', 'authenticated', 'authenticated', 'audit-admin@example.invalid', 'not-a-real-password', now(), now()),
  ('00000000-0000-4000-8000-000000002011', 'authenticated', 'authenticated', 'audit-user@example.invalid', 'not-a-real-password', now(), now());

insert into private.system_admin (user_id)
values ('00000000-0000-4000-8000-000000002010')
on conflict (singleton_id) do update set user_id = excluded.user_id;

insert into auth.sessions (id, user_id, created_at, updated_at, not_after)
values (
  '00000000-0000-4000-8000-000000002012',
  '00000000-0000-4000-8000-000000002010',
  now(), now(), now() + interval '1 hour'
);

insert into public.platforms (id, code, name)
values
  ('00000000-0000-4000-8000-000000002020', 'audit-alpha', 'Audit Alpha'),
  ('00000000-0000-4000-8000-000000002021', 'audit-beta', 'Audit Beta');

insert into public.platform_accounts (id, platform_id, user_id, status)
values (
  '00000000-0000-4000-8000-000000002030',
  '00000000-0000-4000-8000-000000002020',
  '00000000-0000-4000-8000-000000002011',
  'active'
);
insert into public.platform_profiles (platform_account_id, display_name)
values ('00000000-0000-4000-8000-000000002030', 'Audit Reporter');

insert into public.audit_logs (
  id, request_id, actor_type, actor_user_id, platform_id, platform_account_id,
  event_type, target_type, target_id, ip, user_agent, metadata, created_at
)
values
  (
    '00000000-0000-4000-8000-000000002041',
    '00000000-0000-4000-8000-000000002051',
    'user', '00000000-0000-4000-8000-000000002011',
    '00000000-0000-4000-8000-000000002020',
    '00000000-0000-4000-8000-000000002030',
    'account.activated', 'platform_account', '00000000-0000-4000-8000-000000002030',
    '127.0.0.1', 'audit-secret-agent', '{}'::jsonb, now() - interval '1 minute'
  ),
  (
    '00000000-0000-4000-8000-000000002042',
    '00000000-0000-4000-8000-000000002052',
    'admin', '00000000-0000-4000-8000-000000002010',
    '00000000-0000-4000-8000-000000002020',
    '00000000-0000-4000-8000-000000002030',
    'account.suspended', 'platform_account', '00000000-0000-4000-8000-000000002030',
    '127.0.0.2', 'audit-admin-agent', '{"outcome":"failed"}'::jsonb, now() - interval '2 minutes'
  ),
  (
    '00000000-0000-4000-8000-000000002043',
    '00000000-0000-4000-8000-000000002053',
    'system', null,
    '00000000-0000-4000-8000-000000002021', null,
    'platform.updated', 'platform', '00000000-0000-4000-8000-000000002021',
    null, null, '{"outcome":"success"}'::jsonb, now() - interval '3 minutes'
  );

set local role admin_executor;

select is(
  (select count(*)::integer from private.admin_audit_list_v2(
    row('00000000-0000-4000-8000-000000002010', '00000000-0000-4000-8000-000000002012', gen_random_uuid())::private.admin_context,
    null, 20, null, '00000000-0000-4000-8000-000000002020', null, null, null, null
  )),
  2,
  'platform filter runs before paging and returns only the selected platform'
);
select is(
  (select count(*)::integer from private.admin_audit_list_v2(
    row('00000000-0000-4000-8000-000000002010', '00000000-0000-4000-8000-000000002012', gen_random_uuid())::private.admin_context,
    null, 20, null, null, 'audit-user@example.invalid', null, null, null
  )),
  1,
  'actor filter matches Auth email'
);
select is(
  (select count(*)::integer from private.admin_audit_list_v2(
    row('00000000-0000-4000-8000-000000002010', '00000000-0000-4000-8000-000000002012', gen_random_uuid())::private.admin_context,
    null, 20, null, null, 'Audit Reporter', null, null, null
  )),
  1,
  'actor filter matches a trusted user profile name'
);
select is(
  (select count(*)::integer from private.admin_audit_list_v2(
    row('00000000-0000-4000-8000-000000002010', '00000000-0000-4000-8000-000000002012', gen_random_uuid())::private.admin_context,
    null, 20, null, null, null, 'account.suspended', 'platform_account', 'failed'
  )),
  1,
  'action target and outcome filters compose'
);
select is(
  (select count(*)::integer from private.admin_audit_list_v2(
    row('00000000-0000-4000-8000-000000002010', '00000000-0000-4000-8000-000000002012', gen_random_uuid())::private.admin_context,
    null, 20, null, null, null, null, null, 'unrecorded'
  )),
  1,
  'unrecorded outcome matches only missing outcome facts'
);
select is(
  (select platform_name from private.admin_audit_list_v2(
    row('00000000-0000-4000-8000-000000002010', '00000000-0000-4000-8000-000000002012', gen_random_uuid())::private.admin_context,
    null, 20, null, null, null, 'account.activated', null, null
  )),
  'Audit Alpha',
  'audit v2 exposes the authoritative platform name'
);
select is(
  (select actor_display_name from private.admin_audit_list_v2(
    row('00000000-0000-4000-8000-000000002010', '00000000-0000-4000-8000-000000002012', gen_random_uuid())::private.admin_context,
    null, 20, null, null, null, 'account.activated', null, null
  )),
  'Audit Reporter',
  'user actor receives its own trusted platform profile name'
);
select is(
  (select actor_email from private.admin_audit_list_v2(
    row('00000000-0000-4000-8000-000000002010', '00000000-0000-4000-8000-000000002012', gen_random_uuid())::private.admin_context,
    null, 20, null, null, null, 'account.suspended', null, null
  )),
  'audit-admin@example.invalid',
  'admin actor email is resolved from Auth identity'
);
select ok(
  (select actor_display_name is null from private.admin_audit_list_v2(
    row('00000000-0000-4000-8000-000000002010', '00000000-0000-4000-8000-000000002012', gen_random_uuid())::private.admin_context,
    null, 20, null, null, null, 'account.suspended', null, null
  )),
  'target account profile is never mislabeled as the admin actor'
);
select is(
  (select count(*)::integer from private.admin_audit_list_v2(
    row('00000000-0000-4000-8000-000000002010', '00000000-0000-4000-8000-000000002012', gen_random_uuid())::private.admin_context,
    null, 20, 'audit-beta', null, null, null, null, null
  )),
  1,
  'generic query matches platform code/name server-side'
);

set local role postgres;

select throws_ok(
  $$select * from private.admin_audit_list_v2(
    row('00000000-0000-4000-8000-000000002010', '00000000-0000-4000-8000-000000002012', gen_random_uuid())::private.admin_context,
    null, 20, repeat('x', 129), null, null, null, null, null
  )$$,
  '22023',
  'invalid_input',
  'audit v2 bounds keyword length'
);
select throws_ok(
  $$select * from private.admin_audit_list_v2(
    row('00000000-0000-4000-8000-000000002010', '00000000-0000-4000-8000-000000002012', gen_random_uuid())::private.admin_context,
    null, 101, null, null, null, null, null, null
  )$$,
  '22023',
  'invalid_input',
  'audit v2 bounds page size'
);

select * from finish();

rollback;
