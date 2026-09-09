begin;

select plan(10);

select has_function('private', 'account_retention_candidates', array['timestamptz', 'uuid', 'integer'], 'retention candidates exists');
select has_function('private', 'account_retention_cleanup', array['private.job_context', 'uuid', 'timestamptz', 'integer'], 'retention cleanup exists');
select ok((select prosecdef from pg_proc where oid = 'private.account_retention_candidates(timestamptz, uuid, integer)'::regprocedure), 'retention candidates is security definer');
select ok((select prosecdef from pg_proc where oid = 'private.account_retention_cleanup(private.job_context, uuid, timestamptz, integer)'::regprocedure), 'retention cleanup is security definer');
select ok((select array_to_string(proconfig, ',') like 'search_path=pg_catalog%' from pg_proc where oid = 'private.account_retention_cleanup(private.job_context, uuid, timestamptz, integer)'::regprocedure), 'retention cleanup pins search_path');
select ok(has_function_privilege('job_executor', 'private.account_retention_candidates(timestamptz, uuid, integer)', 'execute'), 'worker can scan retention candidates');
select ok(has_function_privilege('job_executor', 'private.account_retention_cleanup(private.job_context, uuid, timestamptz, integer)', 'execute'), 'worker can clean retained accounts');
select ok(not has_table_privilege('job_executor', 'public.platform_accounts', 'update'), 'worker cannot update accounts directly');
select ok(pg_get_functiondef('private.account_retention_candidates(timestamptz, uuid, integer)'::regprocedure) like '%30 days%', 'default retention is 30 days');
select ok(pg_get_functiondef('private.account_retention_cleanup(private.job_context, uuid, timestamptz, integer)'::regprocedure) like '%status <> ''closed''%', 'retention cleanup excludes non-closed accounts');

select * from finish();

rollback;
