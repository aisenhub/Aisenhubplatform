begin;

select plan(20);

select has_function('private', 'admin_platform_list', array['private.admin_context', 'integer'], 'platform list wrapper exists');
select has_function('private', 'admin_platform_get', array['private.admin_context', 'uuid'], 'platform detail wrapper exists');
select has_function('private', 'admin_platform_create', array['private.admin_context', 'text', 'text', 'text', 'boolean', 'text', 'jsonb'], 'platform create wrapper exists');
select has_function('private', 'admin_origin_list', array['private.admin_context', 'uuid'], 'origin list wrapper exists');
select has_function('private', 'admin_origin_create', array['private.admin_context', 'uuid', 'text', 'text', 'text', 'text', 'text'], 'origin create wrapper exists');
select has_function('private', 'admin_account_list', array['private.admin_context', 'uuid', 'integer'], 'account list wrapper exists');
select has_function('private', 'admin_account_get', array['private.admin_context', 'uuid', 'uuid'], 'account detail wrapper exists');
select has_function('private', 'admin_account_patch', array['private.admin_context', 'uuid', 'uuid', 'text'], 'account patch wrapper exists');
select has_function('private', 'admin_platform_key_list', array['private.admin_context', 'uuid'], 'key list wrapper exists');
select has_function('private', 'admin_platform_key_create', array['private.admin_context', 'uuid', 'uuid', 'text', 'text', 'integer', 'text', 'text', 'uuid', 'timestamptz'], 'key create wrapper exists');

select ok(has_function_privilege('admin_executor', 'private.admin_platform_list(private.admin_context, integer)', 'execute'), 'admin can list platforms');
select ok(has_function_privilege('admin_executor', 'private.admin_platform_create(private.admin_context, text, text, text, boolean, text, jsonb)', 'execute'), 'admin can create platforms');
select ok(has_function_privilege('admin_executor', 'private.admin_origin_create(private.admin_context, uuid, text, text, text, text, text)', 'execute'), 'admin can create origins');
select ok(has_function_privilege('admin_executor', 'private.admin_account_patch(private.admin_context, uuid, uuid, text)', 'execute'), 'admin can patch accounts');
select ok(has_function_privilege('admin_executor', 'private.admin_platform_key_create(private.admin_context, uuid, uuid, text, text, integer, text, text, uuid, timestamptz)', 'execute'), 'admin can create platform keys');
select ok(not has_function_privilege('account_executor', 'private.admin_platform_create(private.admin_context, text, text, text, boolean, text, jsonb)', 'execute'), 'account cannot create platforms');
select ok((select prosecdef from pg_proc where oid = 'private.admin_platform_create(private.admin_context, text, text, text, boolean, text, jsonb)'::regprocedure), 'platform create is security definer');
select ok((select prosecdef from pg_proc where oid = 'private.admin_platform_key_create(private.admin_context, uuid, uuid, text, text, integer, text, text, uuid, timestamptz)'::regprocedure), 'key create is security definer');
select ok((select array_to_string(proconfig, ',') like 'search_path=pg_catalog%' from pg_proc where oid = 'private.admin_origin_create(private.admin_context, uuid, text, text, text, text, text)'::regprocedure), 'origin create pins search_path');
select ok(not has_table_privilege('admin_executor', 'private.platform_api_keys', 'insert'), 'admin cannot insert key table directly');

select * from finish();

rollback;
