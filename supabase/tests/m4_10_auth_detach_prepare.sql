begin;

select plan(4);

select has_function('private', 'deletion_job_auth_prepare', array['private.job_context', 'uuid', 'bigint'], 'auth detach prepare exists');
select ok((select prosecdef from pg_proc where oid = 'private.deletion_job_auth_prepare(private.job_context, uuid, bigint)'::regprocedure), 'auth detach prepare is security definer');
select ok(has_function_privilege('job_executor', 'private.deletion_job_auth_prepare(private.job_context, uuid, bigint)', 'execute'), 'worker can detach accounts through wrapper');
select ok(pg_get_functiondef('private.deletion_job_auth_prepare(private.job_context, uuid, bigint)'::regprocedure) like '%user_id = null%', 'prepare detaches account user FK before Auth delete');

select * from finish();

rollback;
