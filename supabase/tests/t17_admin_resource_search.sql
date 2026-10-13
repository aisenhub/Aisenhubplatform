begin;

select plan(10);

select has_function(
  'private',
  'admin_platform_list_v3',
  array['private.admin_context', 'text', 'integer', 'timestamp with time zone', 'uuid'],
  'platform search wrapper exists'
);
select has_function(
  'private',
  'admin_origin_list_v2',
  array['private.admin_context', 'uuid', 'text'],
  'origin search wrapper exists'
);
select has_function(
  'private',
  'admin_account_list_v3',
  array['private.admin_context', 'uuid', 'uuid', 'integer', 'text', 'text', 'uuid', 'text', 'text', 'timestamp with time zone', 'timestamp with time zone'],
  'account search wrapper exists'
);
select has_function(
  'private',
  'admin_platform_key_list_v3',
  array['private.admin_context', 'uuid', 'text'],
  'key search wrapper exists'
);
select ok(
  has_function_privilege('admin_executor', 'private.admin_platform_list_v3(private.admin_context, text, integer, timestamp with time zone, uuid)', 'execute')
    and has_function_privilege('admin_executor', 'private.admin_origin_list_v2(private.admin_context, uuid, text)', 'execute')
    and has_function_privilege('admin_executor', 'private.admin_account_list_v3(private.admin_context, uuid, uuid, integer, text, text, uuid, text, text, timestamp with time zone, timestamp with time zone)', 'execute')
    and has_function_privilege('admin_executor', 'private.admin_platform_key_list_v3(private.admin_context, uuid, text)', 'execute'),
  'admin executor can use every surviving resource search wrapper'
);
select ok(
  not has_function_privilege('account_executor', 'private.admin_platform_list_v3(private.admin_context, text, integer, timestamp with time zone, uuid)', 'execute'),
  'account executor cannot use Admin search wrappers'
);
select ok(
  (select array_to_string(proconfig, ',') like 'search_path=pg_catalog%' from pg_proc where oid = 'private.admin_platform_list_v3(private.admin_context, text, integer, timestamp with time zone, uuid)'::regprocedure),
  'platform search wrapper pins search_path'
);
select ok(
  to_regprocedure('private.admin_platform_list_v2(private.admin_context, text, integer)') is null,
  'retired platform list v2 wrapper is absent'
);

select ok(to_regprocedure('private.admin_account_list_v2(private.admin_context, uuid, text, integer)') is null,
  'retired Account list is absent');
select ok(to_regprocedure('private.admin_platform_key_list_v2(private.admin_context, uuid)') is null,
  'retired Key list is absent');

select * from finish();

rollback;
