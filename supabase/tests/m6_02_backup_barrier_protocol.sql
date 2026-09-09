begin;

select plan(16);

select has_function(
  'private', 'file_backup_barrier_begin',
  array['private.job_context', 'text', 'text', 'timestamp with time zone', 'text'],
  'backup barrier begin function exists'
);
select has_function(
  'private', 'file_backup_barrier_finish',
  array['private.job_context', 'uuid', 'bigint', 'text', 'text', 'text'],
  'backup barrier finish function exists'
);
select ok(
  (select prosecdef from pg_proc
   where oid = 'private.file_backup_barrier_begin(private.job_context, text, text, timestamptz, text)'::regprocedure),
  'backup barrier begin is security definer'
);
select ok(
  (select prosecdef from pg_proc
   where oid = 'private.file_backup_barrier_finish(private.job_context, uuid, bigint, text, text, text)'::regprocedure),
  'backup barrier finish is security definer'
);
select ok(
  (select array_to_string(proconfig, ',') like 'search_path=pg_catalog, private, public%'
   from pg_proc
   where oid = 'private.file_backup_barrier_begin(private.job_context, text, text, timestamptz, text)'::regprocedure),
  'backup barrier begin pins search_path'
);
select ok(
  (select array_to_string(proconfig, ',') like 'search_path=pg_catalog, private, public%'
   from pg_proc
   where oid = 'private.file_backup_barrier_finish(private.job_context, uuid, bigint, text, text, text)'::regprocedure),
  'backup barrier finish pins search_path'
);
select ok(
  has_function_privilege(
    'job_executor',
    'private.file_backup_barrier_begin(private.job_context, text, text, timestamptz, text)',
    'execute'
  ),
  'job executor can begin a backup barrier'
);
select ok(
  has_function_privilege(
    'job_executor',
    'private.file_backup_barrier_finish(private.job_context, uuid, bigint, text, text, text)',
    'execute'
  ),
  'job executor can finish a backup barrier'
);
select ok(
  not has_function_privilege(
    'account_executor',
    'private.file_backup_barrier_begin(private.job_context, text, text, timestamptz, text)',
    'execute'
  )
  and not has_function_privilege(
    'admin_executor',
    'private.file_backup_barrier_finish(private.job_context, uuid, bigint, text, text, text)',
    'execute'
  ),
  'application executors cannot control backup barriers'
);
select ok(
  not has_table_privilege('job_executor', 'private.file_backup_barriers', 'select')
    and not has_table_privilege('job_executor', 'private.file_backup_barriers', 'update'),
  'job executor cannot bypass the barrier functions'
);
select ok(
  pg_get_functiondef('private.file_backup_barrier_begin(private.job_context, text, text, timestamptz, text)'::regprocedure)
    like '%backup_manifest%'
    and pg_get_functiondef('private.file_backup_barrier_begin(private.job_context, text, text, timestamptz, text)'::regprocedure)
    like '%stale_job_fence%',
  'begin validates the backup lease and fencing token'
);
select ok(
  pg_get_functiondef('private.file_backup_barrier_begin(private.job_context, text, text, timestamptz, text)'::regprocedure)
    like '%2 hours%'
    and pg_get_functiondef('private.file_backup_barrier_finish(private.job_context, uuid, bigint, text, text, text)'::regprocedure)
    like '%deadline_exceeded%',
  'barrier deadline has an explicit failure path'
);
select ok(
  pg_get_functiondef('private.file_backup_barrier_finish(private.job_context, uuid, bigint, text, text, text)'::regprocedure)
    like '%manifest_required%',
  'complete requires a manifest version'
);
select ok(
  pg_get_functiondef('private.file_backup_barrier_finish(private.job_context, uuid, bigint, text, text, text)'::regprocedure)
    like '%error_code_required%',
  'failed requires a non-empty error code'
);
select ok(
  pg_get_functiondef('private.file_backup_barrier_finish(private.job_context, uuid, bigint, text, text, text)'::regprocedure)
    like '%job_lease_release%',
  'finish releases the backup worker lease'
);
select ok(
  pg_get_functiondef('private.file_backup_barrier_finish(private.job_context, uuid, bigint, text, text, text)'::regprocedure)
    like '%state = ''running''%',
  'finish only accepts a running barrier with the matching fence'
);

select * from finish();

rollback;
