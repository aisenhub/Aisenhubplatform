begin;

select plan(21);

select has_function('private', 'admin_file_policy_update', array['private.admin_context', 'uuid', 'boolean', 'bigint', 'integer', 'bigint'], 'admin policy update exists');
select has_function('private', 'file_intent_create', array['private.account_context', 'text', 'bigint', 'text', 'text', 'uuid', 'text'], 'file intent create exists');
select has_function('private', 'file_receive_claim', array['private.account_context', 'uuid', 'text', 'integer'], 'file receive claim exists');
select has_function('private', 'file_prepare_store', array['private.account_context', 'uuid', 'bigint', 'text', 'text'], 'file prepare store exists');

select ok(has_function_privilege('admin_executor', 'private.admin_file_policy_update(private.admin_context, uuid, boolean, bigint, integer, bigint)', 'execute'), 'admin can update policy through wrapper');
select ok(has_function_privilege('account_executor', 'private.file_intent_create(private.account_context, text, bigint, text, text, uuid, text)', 'execute'), 'account can reserve intent through wrapper');
select ok(has_function_privilege('account_executor', 'private.file_receive_claim(private.account_context, uuid, text, integer)', 'execute'), 'account can claim receiving state through wrapper');
select ok(has_function_privilege('account_executor', 'private.file_prepare_store(private.account_context, uuid, bigint, text, text)', 'execute'), 'account can prepare store through wrapper');

select ok(not has_table_privilege('account_executor', 'public.platform_config_files', 'select'), 'account cannot read file table directly');
select ok(not has_table_privilege('admin_executor', 'public.platform_file_policies', 'update'), 'admin cannot update policy table directly');
select ok(not has_table_privilege('job_executor', 'private.file_write_attempts', 'update'), 'job cannot update attempts directly');
select ok((select prosecdef from pg_proc where oid = 'private.file_intent_create(private.account_context, text, bigint, text, text, uuid, text)'::regprocedure), 'intent function is security definer');
select ok((select prosecdef from pg_proc where oid = 'private.file_prepare_store(private.account_context, uuid, bigint, text, text)'::regprocedure), 'prepare function is security definer');
select ok((select array_to_string(proconfig, ',') like 'search_path=pg_catalog%' from pg_proc where oid = 'private.file_intent_create(private.account_context, text, bigint, text, text, uuid, text)'::regprocedure), 'intent function pins search_path');

select ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'platform_config_files' and column_name = 'lease_owner'), 'receive lease retains owner metadata');
select ok(exists (select 1 from pg_indexes where indexname = 'platform_config_files_expiry_idx'), 'pending receive expiry has a scheduler index');
select ok(exists (select 1 from pg_indexes where indexname = 'file_write_attempts_recovery_idx'), 'write attempt recovery has a scheduler index');
select ok(exists (select 1 from pg_trigger where tgrelid = 'public.platform_file_policies'::regclass and tgname = 'platform_file_policies_set_updated_at'), 'policy updates timestamp');
select ok(exists (select 1 from pg_trigger where tgrelid = 'public.platform_config_files'::regclass and tgname = 'platform_config_files_set_updated_at'), 'file updates timestamp');
select ok(exists (select 1 from pg_policy where polrelid = 'public.platform_file_policies'::regclass and polname = 'platform_file_policies_domain_owner'), 'policy table remains domain controlled');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.platform_config_files'::regclass and pg_get_constraintdef(oid) like '%lease_owner%'), 'lease owner length is constrained');

select * from finish();

rollback;
