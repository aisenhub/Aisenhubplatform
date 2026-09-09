begin;

select plan(4);

select ok(has_table_privilege('domain_owner', 'public.audit_logs', 'update'), 'domain owner can anonymize audit history through domain functions');
select ok(not has_table_privilege('job_executor', 'public.audit_logs', 'update'), 'job executor cannot update audit history directly');
select ok(pg_get_functiondef('private.deletion_job_step(private.job_context, uuid, bigint, text, text, text)'::regprocedure) like '%audit_logs%', 'global delete performs audit anonymization');
select ok((select count(*) from pg_policies where schemaname = 'public' and tablename = 'audit_logs' and policyname = 'audit_logs_domain_owner_update') = 1, 'audit update is restricted to domain owner policy');

select * from finish();

rollback;
