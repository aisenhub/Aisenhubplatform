select plan(28);

select has_function(
  'private',
  'billing_reconciliation_page_target',
  array['private.job_context', 'uuid'],
  'provider page target wrapper exists'
);
select has_function(
  'private',
  'billing_reconciliation_page_ingest',
  array['private.job_context', 'uuid', 'integer', 'bigint', 'integer', 'jsonb'],
  'provider page ingest wrapper exists'
);
select has_function(
  'private',
  'billing_reconciliation_page_failure',
  array['private.job_context', 'uuid', 'integer', 'bigint', 'text'],
  'provider page failure wrapper exists'
);
select ok(
  has_function_privilege(
    'job_executor',
    'private.billing_reconciliation_page_target(private.job_context, uuid)',
    'execute'
  ),
  'job executor can read the discovery page target'
);
select ok(
  has_function_privilege(
    'job_executor',
    'private.billing_reconciliation_page_ingest(private.job_context, uuid, integer, bigint, integer, jsonb)',
    'execute'
  ),
  'job executor can ingest a discovery page'
);
select ok(
  has_function_privilege(
    'job_executor',
    'private.billing_reconciliation_page_failure(private.job_context, uuid, integer, bigint, text)',
    'execute'
  ),
  'job executor can record a discovery page failure'
);
select ok(
  pg_get_functiondef(
    'private.billing_reconciliation_page_ingest(private.job_context, uuid, integer, bigint, integer, jsonb)'::regprocedure
  ) like '%billing_processing_jobs%',
  'page ingest persists processing queue work'
);
select ok(
  pg_get_functiondef(
    'private.billing_reconciliation_page_ingest(private.job_context, uuid, integer, bigint, integer, jsonb)'::regprocedure
  ) like '%billing_reconciliation_cursors%',
  'page ingest advances the independent discovery cursor'
);

insert into public.billing_provider_accounts (
  id, provider, name, status, secret_reference
) values (
  '00000000-0000-4000-8000-000000000701', 'afdian', 'TASK-0701 fixture',
  'active', 'test-secret-reference'
);

select is(
  (select page_number from private.billing_reconciliation_page_target(
    row('00000000-0000-4000-8000-000000000702', 'task-0701-worker', 1, '00000000-0000-4000-8000-000000000703')::private.job_context,
    '00000000-0000-4000-8000-000000000701'
  )),
  1,
  'a provider without a cursor starts at page one'
);
select is(
  (select expected_version from private.billing_reconciliation_page_target(
    row('00000000-0000-4000-8000-000000000702', 'task-0701-worker', 1, '00000000-0000-4000-8000-000000000703')::private.job_context,
    '00000000-0000-4000-8000-000000000701'
  )),
  0::bigint,
  'a provider without a cursor starts at version zero'
);

select is(
  (select discovered_count from private.billing_reconciliation_page_ingest(
    row('00000000-0000-4000-8000-000000000702', 'task-0701-worker', 1, '00000000-0000-4000-8000-000000000703')::private.job_context,
    '00000000-0000-4000-8000-000000000701', 1, 0, 2,
    '[{"out_trade_no":"task-0701-order-1"},{"out_trade_no":"task-0701-order-2"}]'::jsonb
  )),
  2,
  'first page discovers each provider order clue'
);
select is(
  (select count(*)::integer from public.billing_processing_jobs j
   join public.billing_orders o on o.id = j.billing_order_id
   where o.provider_account_id = '00000000-0000-4000-8000-000000000701'
     and j.job_kind = 'reconciliation'
     and j.state = 'pending'),
  2,
  'first page queues each newly discovered order'
);
select is(
  (select count(*)::integer from public.billing_orders
   where provider_account_id = '00000000-0000-4000-8000-000000000701'),
  2,
  'page ingest persists provider order clues'
);
select is(
  (select count(*)::integer from public.billing_processing_jobs j
   join public.billing_orders o on o.id = j.billing_order_id
   where o.provider_account_id = '00000000-0000-4000-8000-000000000701'
     and j.job_kind = 'reconciliation'),
  2,
  'page ingest creates reconciliation jobs'
);
select is(
  (select page_cursor from public.billing_reconciliation_cursors
   where provider_account_id = '00000000-0000-4000-8000-000000000701'
     and stream = 'discovery'),
  '2',
  'successful page stores the next page cursor'
);
select is(
  (select version from public.billing_reconciliation_cursors
   where provider_account_id = '00000000-0000-4000-8000-000000000701'
     and stream = 'discovery'),
  1::bigint,
  'successful first page starts cursor version one'
);

select is(
  (select page_number from private.billing_reconciliation_page_target(
    row('00000000-0000-4000-8000-000000000704', 'task-0701-worker', 1, '00000000-0000-4000-8000-000000000705')::private.job_context,
    '00000000-0000-4000-8000-000000000701'
  )),
  2,
  'target resumes from the persisted next page'
);
select is(
  (select expected_version from private.billing_reconciliation_page_target(
    row('00000000-0000-4000-8000-000000000704', 'task-0701-worker', 1, '00000000-0000-4000-8000-000000000705')::private.job_context,
    '00000000-0000-4000-8000-000000000701'
  )),
  1::bigint,
  'target returns the cursor version for optimistic commit'
);

select is(
  (select queued_count from private.billing_reconciliation_page_ingest(
    row('00000000-0000-4000-8000-000000000704', 'task-0701-worker', 1, '00000000-0000-4000-8000-000000000705')::private.job_context,
    '00000000-0000-4000-8000-000000000701', 2, 1, null,
    '[{"out_trade_no":"task-0701-order-1"},{"out_trade_no":"task-0701-order-2"}]'::jsonb
  )),
  0,
  'replaying a page does not duplicate outstanding reconciliation jobs'
);
select is(
  (select page_cursor from public.billing_reconciliation_cursors
   where provider_account_id = '00000000-0000-4000-8000-000000000701'
     and stream = 'discovery'),
  null::text,
  'last page closes the current discovery cycle'
);
select is(
  (select count(*)::integer from public.billing_processing_jobs j
   join public.billing_orders o on o.id = j.billing_order_id
   where o.provider_account_id = '00000000-0000-4000-8000-000000000701'
     and j.job_kind = 'reconciliation'),
  2,
  'replaying a page does not create duplicate jobs'
);

select is(
  (select page_cursor from private.billing_reconciliation_page_failure(
    row('00000000-0000-4000-8000-000000000706', 'task-0701-worker', 1, '00000000-0000-4000-8000-000000000707')::private.job_context,
    '00000000-0000-4000-8000-000000000701', 1, 2, 'PROVIDER_UNAVAILABLE'
  )),
  '1',
  'provider failure pins the failed page for retry'
);
select is(
  (select last_error_code from public.billing_reconciliation_cursors
   where provider_account_id = '00000000-0000-4000-8000-000000000701'
     and stream = 'discovery'),
  'PROVIDER_UNAVAILABLE',
  'provider failure remains observable'
);
select is(
  (select page_number from private.billing_reconciliation_page_target(
    row('00000000-0000-4000-8000-000000000708', 'task-0701-worker', 1, '00000000-0000-4000-8000-000000000709')::private.job_context,
    '00000000-0000-4000-8000-000000000701'
  )),
  1,
  'failed page is returned again instead of being skipped'
);

select throws_ok(
  $$select * from private.billing_reconciliation_page_ingest(
    row('00000000-0000-4000-8000-000000000710', 'task-0701-worker', 1, '00000000-0000-4000-8000-000000000711')::private.job_context,
    '00000000-0000-4000-8000-000000000701', 1, 3, 2,
    '[{"not_an_order":true}]'::jsonb
  )$$,
  'P0001', 'provider_response_invalid',
  'malformed provider order data does not advance the cursor'
);
select is(
  (select version from public.billing_reconciliation_cursors
   where provider_account_id = '00000000-0000-4000-8000-000000000701'
     and stream = 'discovery'),
  3::bigint,
  'malformed provider data leaves the cursor version unchanged'
);
select is(
  (select page_cursor from public.billing_reconciliation_cursors
   where provider_account_id = '00000000-0000-4000-8000-000000000701'
     and stream = 'discovery'),
  '1',
  'malformed provider data leaves the failed page pinned'
);
select throws_ok(
  $$select * from private.billing_reconciliation_page_failure(
    row('00000000-0000-4000-8000-000000000712', 'task-0701-worker', 1, '00000000-0000-4000-8000-000000000713')::private.job_context,
    '00000000-0000-4000-8000-000000000701', 1, 2, 'PROVIDER_UNAVAILABLE'
  )$$,
  '40001', 'cursor_conflict',
  'stale page failure cannot overwrite a newer cursor version'
);

delete from public.billing_processing_jobs
where billing_order_id in (
  select id from public.billing_orders
  where provider_account_id = '00000000-0000-4000-8000-000000000701'
);
delete from public.billing_reconciliation_cursors
where provider_account_id = '00000000-0000-4000-8000-000000000701';
delete from public.billing_orders
where provider_account_id = '00000000-0000-4000-8000-000000000701';
delete from public.billing_provider_accounts
where id = '00000000-0000-4000-8000-000000000701';

select * from finish();
