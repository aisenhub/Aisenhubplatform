begin;

select plan(8);

select has_function('private', 'deletion_job_file_list', array['private.job_context', 'uuid', 'bigint'], 'global delete file list exists');
select has_function('private', 'deletion_job_auth_target', array['private.job_context', 'uuid', 'bigint'], 'global delete auth target exists');
select ok((select prosecdef from pg_proc where oid = 'private.deletion_job_file_list(private.job_context, uuid, bigint)'::regprocedure), 'file list is security definer');
select ok((select prosecdef from pg_proc where oid = 'private.deletion_job_auth_target(private.job_context, uuid, bigint)'::regprocedure), 'auth target is security definer');
select ok((select array_to_string(proconfig, ',') like 'search_path=pg_catalog%' from pg_proc where oid = 'private.deletion_job_file_list(private.job_context, uuid, bigint)'::regprocedure), 'file list pins search_path');
select ok(has_function_privilege('job_executor', 'private.deletion_job_file_list(private.job_context, uuid, bigint)', 'execute'), 'worker can list delete files through wrapper');
select ok(has_function_privilege('job_executor', 'private.deletion_job_auth_target(private.job_context, uuid, bigint)', 'execute'), 'worker can read auth target through wrapper');
select ok(pg_get_functiondef('private.deletion_job_file_list(private.job_context, uuid, bigint)'::regprocedure) like '%stale_job_fence%', 'file list rejects stale fence');

select * from finish();

rollback;
