begin;

select plan(15);

select has_function('private', 'file_budget_read', array['private.account_context'], 'account budget read exists');
select has_function('private', 'admin_file_policy_read', array['private.admin_context', 'uuid'], 'admin policy read exists');
select has_function('private', 'admin_file_policy_update', array['private.admin_context', 'uuid', 'boolean', 'bigint', 'integer', 'bigint'], 'admin policy update remains available');

select ok((select prosecdef from pg_proc where oid = 'private.file_budget_read(private.account_context)'::regprocedure), 'account budget read is security definer');
select ok((select prosecdef from pg_proc where oid = 'private.admin_file_policy_read(private.admin_context, uuid)'::regprocedure), 'admin policy read is security definer');
select ok((select array_to_string(proconfig, ',') like 'search_path=pg_catalog%' from pg_proc where oid = 'private.file_budget_read(private.account_context)'::regprocedure), 'budget read pins search_path');
select ok((select pg_get_function_result('private.file_budget_read(private.account_context)'::regprocedure) like '%over_quota%'), 'budget read exposes over quota');
select ok((select pg_get_function_result('private.file_budget_read(private.account_context)'::regprocedure) like '%available_bytes%'), 'budget read exposes available bytes');

select ok(has_function_privilege('account_executor', 'private.file_budget_read(private.account_context)', 'execute'), 'account can read budget through wrapper');
select ok(has_function_privilege('admin_executor', 'private.admin_file_policy_read(private.admin_context, uuid)', 'execute'), 'admin can read policy through wrapper');
select ok(has_function_privilege('admin_executor', 'private.admin_file_policy_update(private.admin_context, uuid, boolean, bigint, integer, bigint)', 'execute'), 'admin can update policy through domain function');
select ok(not has_function_privilege('account_executor', 'private.admin_file_policy_read(private.admin_context, uuid)', 'execute'), 'account cannot read admin policy wrapper');
select ok(not has_table_privilege('account_executor', 'public.platform_file_policies', 'select'), 'account cannot read policy table directly');
select ok(not has_table_privilege('admin_executor', 'public.platform_file_policies', 'select'), 'admin cannot read policy table directly');
select ok(not exists (select 1 from pg_proc where proname in ('file_budget_read', 'admin_file_policy_read') and pg_get_functiondef(oid) like '%execute immediate%'), 'policy wrappers do not accept arbitrary SQL');

select * from finish();

rollback;
