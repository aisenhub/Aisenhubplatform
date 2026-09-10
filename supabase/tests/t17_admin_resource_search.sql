begin;

select plan(11);

select has_function(
  'private',
  'admin_platform_list_v2',
  array['private.admin_context', 'text', 'integer'],
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
  'admin_account_list_v2',
  array['private.admin_context', 'uuid', 'text', 'integer'],
  'account search wrapper exists'
);
select has_function(
  'private',
  'admin_platform_key_list_v3',
  array['private.admin_context', 'uuid', 'text'],
  'key search wrapper exists'
);
select has_function(
  'private',
  'admin_file_list_v2',
  array['private.admin_context', 'uuid', 'integer', 'text'],
  'file search wrapper exists'
);
select has_function(
  'private',
  'admin_file_list_v3',
  array['private.admin_context', 'uuid', 'uuid', 'integer', 'text'],
  'scoped file search wrapper exists'
);
select ok(
  has_function_privilege('admin_executor', 'private.admin_platform_list_v2(private.admin_context, text, integer)', 'execute')
    and has_function_privilege('admin_executor', 'private.admin_origin_list_v2(private.admin_context, uuid, text)', 'execute')
    and has_function_privilege('admin_executor', 'private.admin_account_list_v2(private.admin_context, uuid, text, integer)', 'execute')
    and has_function_privilege('admin_executor', 'private.admin_platform_key_list_v3(private.admin_context, uuid, text)', 'execute')
    and has_function_privilege('admin_executor', 'private.admin_file_list_v2(private.admin_context, uuid, integer, text)', 'execute')
    and has_function_privilege('admin_executor', 'private.admin_file_list_v3(private.admin_context, uuid, uuid, integer, text)', 'execute'),
  'admin executor can use every search wrapper'
);
select ok(
  not has_function_privilege('account_executor', 'private.admin_platform_list_v2(private.admin_context, text, integer)', 'execute')
    and not has_function_privilege('account_executor', 'private.admin_file_list_v2(private.admin_context, uuid, integer, text)', 'execute')
    and not has_function_privilege('account_executor', 'private.admin_file_list_v3(private.admin_context, uuid, uuid, integer, text)', 'execute'),
  'account executor cannot use Admin search wrappers'
);
select ok(
  (select prosecdef from pg_proc where oid = 'private.admin_file_list_v2(private.admin_context, uuid, integer, text)'::regprocedure)
    and (select array_to_string(proconfig, ',') like 'search_path=pg_catalog%' from pg_proc where oid = 'private.admin_file_list_v2(private.admin_context, uuid, integer, text)'::regprocedure),
  'file search wrapper is pinned security definer'
);
select ok(
  (select prosecdef from pg_proc where oid = 'private.admin_file_list_v3(private.admin_context, uuid, uuid, integer, text)'::regprocedure)
    and (select array_to_string(proconfig, ',') like 'search_path=pg_catalog%' from pg_proc where oid = 'private.admin_file_list_v3(private.admin_context, uuid, uuid, integer, text)'::regprocedure),
  'scoped file search wrapper is pinned security definer'
);
select ok(
  (select array_to_string(proconfig, ',') like 'search_path=pg_catalog%' from pg_proc where oid = 'private.admin_platform_list_v2(private.admin_context, text, integer)'::regprocedure),
  'platform search wrapper pins search_path'
);

select * from finish();

rollback;
