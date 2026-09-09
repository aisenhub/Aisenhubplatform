begin;

select plan(7);

select has_function('private', 'deletion_job_backup_barrier_guard', array['private.job_context', 'uuid', 'bigint'], 'backup barrier guard exists');
select ok((select prosecdef from pg_proc where oid = 'private.deletion_job_backup_barrier_guard(private.job_context, uuid, bigint)'::regprocedure), 'backup barrier guard is security definer');
select ok((select array_to_string(proconfig, ',') like 'search_path=pg_catalog%' from pg_proc where oid = 'private.deletion_job_backup_barrier_guard(private.job_context, uuid, bigint)'::regprocedure), 'backup barrier guard pins search_path');
select ok(has_function_privilege('job_executor', 'private.deletion_job_backup_barrier_guard(private.job_context, uuid, bigint)', 'execute'), 'worker can check backup barrier');
select ok(not has_table_privilege('job_executor', 'private.file_backup_barriers', 'select'), 'worker cannot read barrier table directly');
select ok(pg_get_functiondef('private.deletion_job_backup_barrier_guard(private.job_context, uuid, bigint)'::regprocedure) like '%backup_barrier%', 'guard returns backup barrier code');
select ok(pg_get_functiondef('private.deletion_job_backup_barrier_guard(private.job_context, uuid, bigint)'::regprocedure) like '%stale_job_fence%', 'guard rejects stale fence');

select * from finish();

rollback;
