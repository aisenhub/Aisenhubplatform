begin;

select plan(32);

select has_function('private', 'admin_deletion_job_start', array['private.admin_context', 'uuid', 'uuid', 'text'], 'admin delete start exists');
select has_function('private', 'admin_deletion_job_list', array['private.admin_context', 'integer'], 'admin delete list exists');
select has_function('private', 'admin_deletion_job_read', array['private.admin_context', 'uuid'], 'admin delete read exists');
select has_function('private', 'admin_deletion_job_retry', array['private.admin_context', 'uuid', 'uuid', 'text'], 'admin delete retry exists');
select has_function('private', 'deletion_job_claim', array['private.job_context', 'uuid', 'integer'], 'job claim exists');
select has_function('private', 'deletion_job_step', array['private.job_context', 'uuid', 'bigint', 'text', 'text', 'text'], 'job checkpoint step exists');
select has_function('private', 'admin_file_delete_request', array['private.admin_context', 'uuid', 'text'], 'AAL2 admin file delete exists without a recent-proof argument');
select ok(to_regprocedure('private.admin_file_delete_request(private.admin_context, uuid, uuid, text)') is null, 'legacy recent-proof file delete signature is removed');

select ok((select prosecdef from pg_proc where oid = 'private.admin_deletion_job_start(private.admin_context, uuid, uuid, text)'::regprocedure), 'admin start is security definer');
select ok((select prosecdef from pg_proc where oid = 'private.deletion_job_claim(private.job_context, uuid, integer)'::regprocedure), 'job claim is security definer');
select ok((select array_to_string(proconfig, ',') like 'search_path=pg_catalog%' from pg_proc where oid = 'private.deletion_job_step(private.job_context, uuid, bigint, text, text, text)'::regprocedure), 'job step pins search_path');
select ok((select prosecdef from pg_proc where oid = 'private.admin_file_delete_request(private.admin_context, uuid, text)'::regprocedure), 'admin file delete is security definer');

select ok(has_function_privilege('admin_executor', 'private.admin_deletion_job_start(private.admin_context, uuid, uuid, text)', 'execute'), 'admin can start deletion job');
select ok(has_function_privilege('admin_executor', 'private.admin_deletion_job_retry(private.admin_context, uuid, uuid, text)', 'execute'), 'admin can retry deletion job');
select ok(has_function_privilege('job_executor', 'private.deletion_job_claim(private.job_context, uuid, integer)', 'execute'), 'worker can claim deletion job');
select ok(has_function_privilege('job_executor', 'private.deletion_job_step(private.job_context, uuid, bigint, text, text, text)', 'execute'), 'worker can advance checkpoint');
select ok(has_function_privilege('admin_executor', 'private.admin_file_delete_request(private.admin_context, uuid, text)', 'execute'), 'admin can request file delete');
select ok(not has_function_privilege('account_executor', 'private.admin_deletion_job_start(private.admin_context, uuid, uuid, text)', 'execute'), 'account cannot start deletion job');
select ok(not has_table_privilege('admin_executor', 'private.deletion_jobs', 'update'), 'admin cannot update deletion table directly');
select ok(not has_table_privilege('job_executor', 'private.deletion_jobs', 'update'), 'worker cannot update deletion table directly');
select ok(pg_get_functiondef('private.deletion_job_step(private.job_context, uuid, bigint, text, text, text)'::regprocedure) like '%stale_job_fence%', 'step rejects stale lease fence');
select ok(pg_get_functiondef('private.deletion_job_step(private.job_context, uuid, bigint, text, text, text)'::regprocedure) like '%invalid_delete_checkpoint%', 'step enforces ordered checkpoints');
select ok(pg_get_functiondef('private.admin_deletion_job_retry(private.admin_context, uuid, uuid, text)'::regprocedure) like '%recent_mfa_required%', 'retry requires recent MFA');
select ok(pg_get_functiondef('private.admin_deletion_job_list(private.admin_context, integer)'::regprocedure) like '%from private.system_admin sa%' and pg_get_functiondef('private.admin_deletion_job_list(private.admin_context, integer)'::regprocedure) like '%sa.user_id%', 'delete list qualifies admin user lookup');
select ok(pg_get_functiondef('private.admin_deletion_job_read(private.admin_context, uuid)'::regprocedure) like '%from private.system_admin sa%' and pg_get_functiondef('private.admin_deletion_job_read(private.admin_context, uuid)'::regprocedure) like '%sa.user_id%', 'delete read qualifies admin user lookup');
select ok(pg_get_functiondef('private.admin_deletion_job_start(private.admin_context, uuid, uuid, text)'::regprocedure) like '%identity_lifecycle%', 'start engages identity deletion barrier');

-- Execute the real start/retry functions as admin_executor. These fixtures are
-- transaction-local and use non-login placeholder identities only.
insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000004901', 'authenticated', 'authenticated', 'delete-admin@example.invalid', 'fixture', now(), now()),
  ('00000000-0000-4000-8000-000000004902', 'authenticated', 'authenticated', 'delete-target@example.invalid', 'fixture', now(), now());

insert into private.system_admin (user_id)
values ('00000000-0000-4000-8000-000000004901')
on conflict (singleton_id) do update set user_id = excluded.user_id;

insert into auth.sessions (id, user_id, created_at, updated_at, not_after)
values (
  '00000000-0000-4000-8000-000000004910',
  '00000000-0000-4000-8000-000000004901',
  now(), now(), now() + interval '1 hour'
);

insert into private.admin_step_up (
  id, user_id, session_id, factor_id, verified_at, expires_at,
  attestation_nonce
)
values (
  '00000000-0000-4000-8000-000000004911',
  '00000000-0000-4000-8000-000000004901',
  '00000000-0000-4000-8000-000000004910',
  '00000000-0000-4000-8000-000000004912',
  now() - interval '1 minute', now() + interval '20 minutes',
  '00000000-0000-4000-8000-000000004913'
);

insert into private.deletion_requests (
  id, user_id, request_session_id, state, requested_at
)
values (
  '00000000-0000-4000-8000-000000004920',
  '00000000-0000-4000-8000-000000004902',
  '00000000-0000-4000-8000-000000004921',
  'pending_admin', now()
);

set local role admin_executor;
create temporary table deletion_start_snapshot on commit drop as
select *
from private.admin_deletion_job_start(
  row(
    '00000000-0000-4000-8000-000000004901'::uuid,
    '00000000-0000-4000-8000-000000004910'::uuid,
    '00000000-0000-4000-8000-000000004930'::uuid
  )::private.admin_context,
  '00000000-0000-4000-8000-000000004920'::uuid,
  '00000000-0000-4000-8000-000000004911'::uuid,
  'm4-09-behavior-start'
);
set local role postgres;

select is(
  (select state from private.deletion_requests where id = '00000000-0000-4000-8000-000000004920'),
  'approved',
  'start behavior approves the pending deletion request'
);
select is(
  (select state from private.identity_lifecycle where user_id = '00000000-0000-4000-8000-000000004902'),
  'deleting',
  'start behavior engages the identity deletion barrier'
);
select is(
  (select state from deletion_start_snapshot),
  'pending',
  'start behavior returns the pending deletion job'
);

update private.deletion_jobs
set state = 'blocked', last_error_code = 'm4_09_behavior_blocked'
where id = (select job_id from deletion_start_snapshot);

set local role admin_executor;
create temporary table deletion_retry_snapshot on commit drop as
select *
from private.admin_deletion_job_retry(
  row(
    '00000000-0000-4000-8000-000000004901'::uuid,
    '00000000-0000-4000-8000-000000004910'::uuid,
    '00000000-0000-4000-8000-000000004931'::uuid
  )::private.admin_context,
  (select job_id from deletion_start_snapshot),
  '00000000-0000-4000-8000-000000004911'::uuid,
  'm4-09-behavior-retry'
);
set local role postgres;

select is(
  (select state from deletion_retry_snapshot),
  'retry',
  'retry behavior returns the retry state'
);
select is(
  (select retry_count from deletion_retry_snapshot),
  1,
  'retry behavior increments the retry count'
);
select is(
  (select last_error_code from private.deletion_jobs where id = (select job_id from deletion_start_snapshot)),
  null,
  'retry behavior clears the previous error code'
);

select * from finish();

rollback;
