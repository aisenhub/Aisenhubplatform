begin;

select plan(11);

select has_function(
  'private',
  'admin_identity_lifecycle_read',
  array['private.admin_context', 'uuid'],
  'Admin identity lifecycle reader exists'
);
select ok(
  has_function_privilege(
    'admin_executor',
    'private.admin_identity_lifecycle_read(private.admin_context, uuid)',
    'execute'
  ),
  'admin executor can read identity lifecycle'
);
select ok(
  not has_function_privilege(
    'account_executor',
    'private.admin_identity_lifecycle_read(private.admin_context, uuid)',
    'execute'
  )
  and not has_function_privilege(
    'job_executor',
    'private.admin_identity_lifecycle_read(private.admin_context, uuid)',
    'execute'
  )
  and not has_function_privilege(
    'recovery_executor',
    'private.admin_identity_lifecycle_read(private.admin_context, uuid)',
    'execute'
  ),
  'non-Admin executors cannot read identity lifecycle'
);
select ok(
  (select prosecdef from pg_proc
   where oid = 'private.admin_identity_lifecycle_read(private.admin_context, uuid)'::regprocedure)
  and (
    select array_to_string(proconfig, ',') like 'search_path=pg_catalog%'
    from pg_proc
    where oid = 'private.admin_identity_lifecycle_read(private.admin_context, uuid)'::regprocedure
  ),
  'identity lifecycle reader is a pinned security definer'
);
select ok(
  pg_get_function_result(
    'private.admin_identity_lifecycle_read(private.admin_context, uuid)'::regprocedure
  ) not ilike '%request_session_id%'
  and pg_get_function_result(
    'private.admin_identity_lifecycle_read(private.admin_context, uuid)'::regprocedure
  ) not ilike '%fence%'
  and pg_get_function_result(
    'private.admin_identity_lifecycle_read(private.admin_context, uuid)'::regprocedure
  ) not ilike '%lease%',
  'identity lifecycle projection excludes session and worker fencing internals'
);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000003110', 'authenticated', 'authenticated', 'lifecycle-admin@example.invalid', 'not-a-real-password', now(), now()),
  ('00000000-0000-4000-8000-000000003111', 'authenticated', 'authenticated', 'lifecycle-user@example.invalid', 'not-a-real-password', now(), now()),
  ('00000000-0000-4000-8000-000000003112', 'authenticated', 'authenticated', 'lifecycle-empty@example.invalid', 'not-a-real-password', now(), now());

insert into private.system_admin (user_id)
values ('00000000-0000-4000-8000-000000003110')
on conflict (singleton_id) do update set user_id = excluded.user_id;

insert into auth.sessions (id, user_id, created_at, updated_at, not_after)
values (
  '00000000-0000-4000-8000-000000003120',
  '00000000-0000-4000-8000-000000003110',
  now(), now(), now() + interval '1 hour'
);

insert into private.identity_lifecycle (user_id, state)
values ('00000000-0000-4000-8000-000000003111', 'deleting');

insert into private.deletion_requests (
  id, user_id, request_session_id, state, requested_at, approved_at,
  approved_by, cancelled_at
)
values
  (
    '00000000-0000-4000-8000-000000003130',
    '00000000-0000-4000-8000-000000003111',
    '00000000-0000-4000-8000-000000003140',
    'approved', now() - interval '2 days', now() - interval '47 hours',
    '00000000-0000-4000-8000-000000003110', null
  ),
  (
    '00000000-0000-4000-8000-000000003131',
    '00000000-0000-4000-8000-000000003111',
    '00000000-0000-4000-8000-000000003141',
    'cancelled', now() - interval '1 day', null, null, now() - interval '23 hours'
  );

insert into private.deletion_jobs (
  id, request_id, user_id, state, checkpoint, retry_count,
  next_attempt_at, last_error_code, created_at
)
values (
  '00000000-0000-4000-8000-000000003150',
  '00000000-0000-4000-8000-000000003130',
  '00000000-0000-4000-8000-000000003111',
  'blocked', 'storage_delete', 2,
  now() + interval '10 minutes', 'storage_timeout', now() - interval '46 hours'
);

set local role admin_executor;
create temporary table identity_lifecycle_snapshot on commit drop as
select *
from private.admin_identity_lifecycle_read(
  row(
    '00000000-0000-4000-8000-000000003110'::uuid,
    '00000000-0000-4000-8000-000000003120'::uuid,
    '00000000-0000-4000-8000-000000003160'::uuid
  )::private.admin_context,
  '00000000-0000-4000-8000-000000003111'::uuid
);
create temporary table identity_lifecycle_empty_snapshot on commit drop as
select *
from private.admin_identity_lifecycle_read(
  row(
    '00000000-0000-4000-8000-000000003110'::uuid,
    '00000000-0000-4000-8000-000000003120'::uuid,
    '00000000-0000-4000-8000-000000003161'::uuid
  )::private.admin_context,
  '00000000-0000-4000-8000-000000003112'::uuid
);
set local role postgres;

select is(
  (select request_id from identity_lifecycle_snapshot),
  '00000000-0000-4000-8000-000000003130'::uuid,
  'active deletion request wins over a newer cancelled request'
);
select is(
  (select identity_state from identity_lifecycle_snapshot),
  'deleting',
  'identity lifecycle state is projected authoritatively'
);
select is(
  (select job_state from identity_lifecycle_snapshot),
  'blocked',
  'job state is linked only through the selected request'
);
select is(
  (select retry_count from identity_lifecycle_snapshot),
  2,
  'job retry metadata required by the Admin lifecycle UI is projected'
);
select ok(
  (select request_id is null and job_id is null and identity_state = 'active'
   from identity_lifecycle_empty_snapshot),
  'identity without a deletion request still returns an active lifecycle row'
);

update auth.sessions
set not_after = now() - interval '1 minute'
where id = '00000000-0000-4000-8000-000000003120';
select throws_ok(
  $$select * from private.admin_identity_lifecycle_read(
    row(
      '00000000-0000-4000-8000-000000003110'::uuid,
      '00000000-0000-4000-8000-000000003120'::uuid,
      gen_random_uuid()
    )::private.admin_context,
    '00000000-0000-4000-8000-000000003111'::uuid
  )$$,
  '42501',
  'admin_required',
  'revoked or expired Admin session cannot read identity lifecycle'
);

select * from finish();

rollback;
