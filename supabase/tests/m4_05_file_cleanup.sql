begin;

select plan(28);

select has_function('private', 'file_delete_request', array['private.account_context', 'uuid', 'text'], 'delete request exists');
select has_function('private', 'file_cleanup_candidates', array['uuid', 'integer'], 'cleanup candidates exists');
select has_function('private', 'file_cleanup_claim', array['private.job_context', 'uuid', 'integer'], 'cleanup claim exists');
select has_function('private', 'file_cleanup_finish', array['private.job_context', 'uuid', 'bigint', 'text', 'text'], 'cleanup finish exists');
select has_function('private', 'file_reconcile_step', array['private.job_context', 'uuid', 'integer'], 'reconcile step exists');

select ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'platform_config_files' and column_name = 'cancel_requested_at'), 'cancel request timestamp exists');
select ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'platform_config_files' and column_name = 'retry_count'), 'file retry count exists');
select ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'platform_config_files' and column_name = 'next_attempt_at'), 'file retry schedule exists');
select ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'platform_config_files' and column_name = 'last_error_code'), 'file error code exists');
select ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'platform_config_files' and column_name = 'over_quota'), 'over quota marker exists');
select ok(exists (select 1 from pg_indexes where indexname = 'platform_config_files_cleanup_idx'), 'cleanup scheduler index exists');

select ok((select prosecdef from pg_proc where oid = 'private.file_delete_request(private.account_context, uuid, text)'::regprocedure), 'delete request is security definer');
select ok((select prosecdef from pg_proc where oid = 'private.file_cleanup_candidates(uuid, integer)'::regprocedure), 'cleanup candidates is security definer');
select ok((select prosecdef from pg_proc where oid = 'private.file_cleanup_claim(private.job_context, uuid, integer)'::regprocedure), 'cleanup claim is security definer');
select ok((select prosecdef from pg_proc where oid = 'private.file_cleanup_finish(private.job_context, uuid, bigint, text, text)'::regprocedure), 'cleanup finish is security definer');
select ok((select prosecdef from pg_proc where oid = 'private.file_reconcile_step(private.job_context, uuid, integer)'::regprocedure), 'reconcile is security definer');
select ok((select array_to_string(proconfig, ',') like 'search_path=pg_catalog%' from pg_proc where oid = 'private.file_cleanup_finish(private.job_context, uuid, bigint, text, text)'::regprocedure), 'cleanup finish pins search_path');

select ok(has_function_privilege('account_executor', 'private.file_delete_request(private.account_context, uuid, text)', 'execute'), 'account can request deletion through wrapper');
select ok(has_function_privilege('job_executor', 'private.file_cleanup_candidates(uuid, integer)', 'execute'), 'job can list fixed cleanup candidates');
select ok(has_function_privilege('job_executor', 'private.file_cleanup_claim(private.job_context, uuid, integer)', 'execute'), 'job can claim cleanup through wrapper');
select ok(has_function_privilege('job_executor', 'private.file_cleanup_finish(private.job_context, uuid, bigint, text, text)', 'execute'), 'job can finish cleanup through wrapper');
select ok(has_function_privilege('job_executor', 'private.file_reconcile_step(private.job_context, uuid, integer)', 'execute'), 'job can reconcile through wrapper');
select ok(not has_function_privilege('account_executor', 'private.file_cleanup_finish(private.job_context, uuid, bigint, text, text)', 'execute'), 'account cannot finish cleanup');
select ok(not has_table_privilege('job_executor', 'public.platform_config_files', 'update'), 'job cannot update file state directly');

select ok((select relrowsecurity from pg_class where oid = 'public.platform_config_files'::regclass), 'file table remains protected by RLS');
select ok(exists (select 1 from pg_proc where proname = 'job_lease_claim' and pronamespace = 'private'::regnamespace), 'cleanup reuses generic job lease');
select ok(exists (select 1 from pg_policy where polrelid = 'private.job_leases'::regclass and polname = 'job_leases_domain_owner'), 'job lease policy remains domain controlled');
select ok(not exists (select 1 from pg_proc where proname = 'file_cleanup_claim' and pg_get_functiondef(oid) like '%execute immediate%'), 'cleanup does not accept arbitrary SQL');

select * from finish();

rollback;
