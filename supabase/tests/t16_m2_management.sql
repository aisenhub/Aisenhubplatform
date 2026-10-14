begin;

select plan(20);

select has_function('private', 'admin_platform_list_v3', array['private.admin_context','text','integer','timestamp with time zone','uuid'], 'platform list wrapper exists');
select has_function('private', 'admin_platform_get', array['private.admin_context', 'uuid'], 'platform detail wrapper exists');
select has_function('private', 'admin_platform_create', array['private.admin_context', 'text', 'text', 'text', 'boolean', 'text', 'jsonb'], 'platform create wrapper exists');
select has_function('private', 'admin_origin_list_v2', array['private.admin_context','uuid','text'], 'origin list wrapper exists');
select has_function('private', 'admin_origin_create', array['private.admin_context', 'uuid', 'text', 'text', 'text', 'text', 'text'], 'origin create wrapper exists');
select has_function('private', 'admin_account_list_v3', array['private.admin_context','uuid','uuid','integer','text','text','uuid','text','text','timestamp with time zone','timestamp with time zone'], 'account list wrapper exists');
select has_function('private', 'admin_account_workbench_read', array['private.admin_context', 'uuid', 'uuid'], 'account detail wrapper exists');
select has_function('private', 'admin_account_transition', array['private.admin_context','uuid','uuid','text','text'], 'account transition wrapper exists');
select has_function('private', 'admin_platform_key_list_v3', array['private.admin_context','uuid','text'], 'key list wrapper exists');
select has_function('private', 'admin_platform_key_create', array['private.admin_context', 'uuid', 'uuid', 'text', 'text', 'integer', 'text', 'text', 'uuid', 'timestamptz'], 'key create wrapper exists');

select ok(has_function_privilege('admin_executor', 'private.admin_platform_list_v3(private.admin_context, text, integer, timestamptz, uuid)', 'execute'), 'admin can list platforms');
select ok(has_function_privilege('admin_executor', 'private.admin_platform_create(private.admin_context, text, text, text, boolean, text, jsonb)', 'execute'), 'admin can create platforms');
select ok(has_function_privilege('admin_executor', 'private.admin_origin_create(private.admin_context, uuid, text, text, text, text, text)', 'execute'), 'admin can create origins');
select ok(has_function_privilege('admin_executor', 'private.admin_account_transition(private.admin_context, uuid, uuid, text, text)', 'execute'), 'admin can transition accounts');
select ok(has_function_privilege('admin_executor', 'private.admin_platform_key_create(private.admin_context, uuid, uuid, text, text, integer, text, text, uuid, timestamptz)', 'execute'), 'admin can create platform keys');
select ok(not has_function_privilege('account_executor', 'private.admin_platform_create(private.admin_context, text, text, text, boolean, text, jsonb)', 'execute'), 'account cannot create platforms');
select ok((select prosecdef from pg_proc where oid = 'private.admin_platform_create(private.admin_context, text, text, text, boolean, text, jsonb)'::regprocedure), 'platform create is security definer');
select ok((select prosecdef from pg_proc where oid = 'private.admin_platform_key_create(private.admin_context, uuid, uuid, text, text, integer, text, text, uuid, timestamptz)'::regprocedure), 'key create is security definer');
select ok((select array_to_string(proconfig, ',') like 'search_path=pg_catalog%' from pg_proc where oid = 'private.admin_origin_create(private.admin_context, uuid, text, text, text, text, text)'::regprocedure), 'origin create pins search_path');
select ok(not has_table_privilege('admin_executor', 'private.platform_api_keys', 'insert'), 'admin cannot insert key table directly');

select * from finish();

rollback;
