begin;

select plan(20);

select has_table(
  'private',
  'billing_cron_invocations',
  'billing cron invocations are stored outside exposed schemas'
);
select has_function(
  'private',
  'billing_maintenance_endpoint',
  array['text'],
  'billing endpoint normalization helper exists'
);
select is(
  private.billing_maintenance_endpoint(
    'https://project.supabase.co/functions/v1/maintenance'
  ),
  'https://project.supabase.co/functions/v1/maintenance/v1/billing/jobs/run',
  'hosted maintenance base URL receives the canonical billing route'
);
select is(
  private.billing_maintenance_endpoint(
    'http://127.0.0.1:54321/functions/v1/maintenance/'
  ),
  'http://127.0.0.1:54321/functions/v1/maintenance/v1/billing/jobs/run',
  'local maintenance base URL is normalized without a duplicate slash'
);
select is(
  private.billing_maintenance_endpoint(
    'https://project.supabase.co/functions/v1/maintenance/v1/billing/jobs/run/'
  ),
  'https://project.supabase.co/functions/v1/maintenance/v1/billing/jobs/run',
  'a complete canonical route is idempotent'
);
select is(
  private.billing_maintenance_endpoint('https://project.supabase.co/functions/v1'),
  null,
  'a base URL without the maintenance function is rejected'
);
select is(
  private.billing_maintenance_endpoint(
    'https://project.supabase.co/functions/v1/maintenance?token=not-allowed'
  ),
  null,
  'query-bearing URLs are rejected to prevent secret leakage and ambiguity'
);
select ok(
  (select prosecdef
   from pg_proc
   where oid = 'private.billing_maintenance_cron()'::regprocedure),
  'billing cron remains security definer'
);
select ok(
  (select prosecdef
   from pg_proc
   where oid = 'private.billing_maintenance_cron_observe()'::regprocedure),
  'billing cron observer remains security definer'
);
select ok(
  (select relrowsecurity and relforcerowsecurity
   from pg_class
   where oid = 'private.billing_cron_invocations'::regclass),
  'billing cron invocations enforce row-level security'
);
select ok(
  has_table_privilege(
    'postgres', 'private.billing_cron_invocations', 'select,insert,update,delete'
  ),
  'only the database owner path can maintain scheduler observations'
);
select ok(
  not has_table_privilege('anon', 'private.billing_cron_invocations', 'select'),
  'anonymous clients cannot read scheduler observations'
);
select ok(
  not has_table_privilege('job_executor', 'private.billing_cron_invocations', 'select'),
  'billing workers cannot bypass the scheduler observation boundary'
);

insert into private.billing_cron_invocations (
  id, request_id, requested_limit, scheduler_state, business_state,
  request_accepted_at
) values (
  '00000000-0000-4702-8000-000000000701', 7002001, 5, 'queued', 'pending', now()
);
insert into net._http_response (
  id, status_code, content_type, headers, content, timed_out, error_msg, created
) values (
  7002001, 200, 'application/json', '{}'::jsonb,
  '{"processed":2,"results":[{"status":200},{"status":503}]}'::text,
  false, null, now()
);
select private.billing_maintenance_cron_observe();
select is(
  (select business_state from private.billing_cron_invocations
   where id = '00000000-0000-4702-8000-000000000701'),
  'completed_with_failures',
  'HTTP success with failed job results is not reported as an all-green batch'
);
select is(
  (select processed_count from private.billing_cron_invocations
   where id = '00000000-0000-4702-8000-000000000701'),
  2,
  'worker processed count is captured from the response contract'
);
select is(
  (select failed_count from private.billing_cron_invocations
   where id = '00000000-0000-4702-8000-000000000701'),
  1,
  'failed worker result count is captured separately'
);
select ok(
  (select http_completed_at is not null
   from private.billing_cron_invocations
   where id = '00000000-0000-4702-8000-000000000701'),
  'HTTP completion is recorded independently from request acceptance'
);

insert into private.billing_cron_invocations (
  id, request_id, requested_limit, scheduler_state, business_state,
  request_accepted_at
) values (
  '00000000-0000-4702-8000-000000000702', 7002002, 5, 'queued', 'pending', now()
);
insert into net._http_response (
  id, status_code, content_type, headers, content, timed_out, error_msg, created
) values (
  7002002, null, null, '{}'::jsonb, null, true, 'timeout', now()
);
select private.billing_maintenance_cron_observe();
select is(
  (select business_state from private.billing_cron_invocations
   where id = '00000000-0000-4702-8000-000000000702'),
  'failed',
  'pg_net timeouts are recorded as failed business delivery'
);
select is(
  (select error_code from private.billing_cron_invocations
   where id = '00000000-0000-4702-8000-000000000702'),
  'HTTP_TIMEOUT',
  'timeout failures have a stable non-secret error code'
);

select ok(
  exists (
    select 1 from cron.job where jobname = 'billing-worker-every-minute'
  ),
  'billing worker remains scheduled every minute'
);

select * from finish();

rollback;
