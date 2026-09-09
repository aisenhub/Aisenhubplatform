begin;

select plan(23);

select has_function('private', 'admin_deletion_job_start', array['private.admin_context', 'uuid', 'uuid', 'text'], 'admin delete start exists');
select has_function('private', 'admin_deletion_job_list', array['private.admin_context', 'integer'], 'admin delete list exists');
select has_function('private', 'admin_deletion_job_read', array['private.admin_context', 'uuid'], 'admin delete read exists');
select has_function('private', 'admin_deletion_job_retry', array['private.admin_context', 'uuid', 'uuid', 'text'], 'admin delete retry exists');
select has_function('private', 'deletion_job_claim', array['private.job_context', 'uuid', 'integer'], 'job claim exists');
select has_function('private', 'deletion_job_step', array['private.job_context', 'uuid', 'bigint', 'text', 'text', 'text'], 'job checkpoint step exists');
select has_function('private', 'admin_file_delete_request', array['private.admin_context', 'uuid', 'uuid', 'text'], 'admin file delete exists');

select ok((select prosecdef from pg_proc where oid = 'private.admin_deletion_job_start(private.admin_context, uuid, uuid, text)'::regprocedure), 'admin start is security definer');
select ok((select prosecdef from pg_proc where oid = 'private.deletion_job_claim(private.job_context, uuid, integer)'::regprocedure), 'job claim is security definer');
select ok((select array_to_string(proconfig, ',') like 'search_path=pg_catalog%' from pg_proc where oid = 'private.deletion_job_step(private.job_context, uuid, bigint, text, text, text)'::regprocedure), 'job step pins search_path');
select ok((select prosecdef from pg_proc where oid = 'private.admin_file_delete_request(private.admin_context, uuid, uuid, text)'::regprocedure), 'admin file delete is security definer');

select ok(has_function_privilege('admin_executor', 'private.admin_deletion_job_start(private.admin_context, uuid, uuid, text)', 'execute'), 'admin can start deletion job');
select ok(has_function_privilege('admin_executor', 'private.admin_deletion_job_retry(private.admin_context, uuid, uuid, text)', 'execute'), 'admin can retry deletion job');
select ok(has_function_privilege('job_executor', 'private.deletion_job_claim(private.job_context, uuid, integer)', 'execute'), 'worker can claim deletion job');
select ok(has_function_privilege('job_executor', 'private.deletion_job_step(private.job_context, uuid, bigint, text, text, text)', 'execute'), 'worker can advance checkpoint');
select ok(has_function_privilege('admin_executor', 'private.admin_file_delete_request(private.admin_context, uuid, uuid, text)', 'execute'), 'admin can request file delete');
select ok(not has_function_privilege('account_executor', 'private.admin_deletion_job_start(private.admin_context, uuid, uuid, text)', 'execute'), 'account cannot start deletion job');
select ok(not has_table_privilege('admin_executor', 'private.deletion_jobs', 'update'), 'admin cannot update deletion table directly');
select ok(not has_table_privilege('job_executor', 'private.deletion_jobs', 'update'), 'worker cannot update deletion table directly');
select ok(pg_get_functiondef('private.deletion_job_step(private.job_context, uuid, bigint, text, text, text)'::regprocedure) like '%stale_job_fence%', 'step rejects stale lease fence');
select ok(pg_get_functiondef('private.deletion_job_step(private.job_context, uuid, bigint, text, text, text)'::regprocedure) like '%invalid_delete_checkpoint%', 'step enforces ordered checkpoints');
select ok(pg_get_functiondef('private.admin_deletion_job_retry(private.admin_context, uuid, uuid, text)'::regprocedure) like '%recent_mfa_required%', 'retry requires recent MFA');
select ok(pg_get_functiondef('private.admin_deletion_job_start(private.admin_context, uuid, uuid, text)'::regprocedure) like '%identity_lifecycle%', 'start engages identity deletion barrier');

select * from finish();

rollback;
