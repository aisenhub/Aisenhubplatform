begin;
select plan(12);

select has_table('public', 'billing_webhook_event_conflicts', 'webhook hash conflicts have a durable evidence table');
select has_column('public', 'billing_webhook_event_conflicts', 'existing_payload_hash', 'conflict evidence stores the accepted hash');
select has_column('public', 'billing_webhook_event_conflicts', 'conflicting_payload_hash', 'conflict evidence stores the rejected hash');
select ok(
  pg_get_functiondef('private.billing_webhook_ingest(uuid, text, bytea, text, text)'::regprocedure) like '%billing_webhook_event_conflicts%',
  'ingest records same-key different-payload conflicts'
);
select ok(
  pg_get_functiondef('private.billing_webhook_ingest(uuid, text, bytea, text, text)'::regprocedure) like '%p_provider_order_no is null%',
  'ingest requires a trusted order identity from the verified payload'
);

insert into public.billing_provider_accounts (id, provider, name, status, secret_reference)
values ('00000000-0000-4000-8000-000000000805', 'afdian', 'BILL-08 fixture', 'active', 'test-secret-reference');

select is(
  (select duplicate from private.billing_webhook_ingest(
    '00000000-0000-4000-8000-000000000805', 'afdian:stable-order', decode(repeat('01', 32), 'hex'), 'verified', 'stable-order'
  )), false, 'first stable provider event is accepted'
);
select is(
  (select duplicate from private.billing_webhook_ingest(
    '00000000-0000-4000-8000-000000000805', 'afdian:stable-order', decode(repeat('02', 32), 'hex'), 'verified', 'stable-order'
  )), false, 'same event key with a different hash is isolated from the queue'
);
select is(
  (select processing_status from public.billing_webhook_events where provider_event_key = 'afdian:stable-order'),
  'manual_review', 'same event key with a different hash enters manual review'
);
select is(
  (select count(*)::integer from public.billing_webhook_event_conflicts where provider_event_key = 'afdian:stable-order'),
  1, 'the conflicting hash is recorded once'
);
select is(
  (select count(*)::integer from public.billing_processing_jobs where webhook_event_id = (
    select id from public.billing_webhook_events where provider_event_key = 'afdian:stable-order'
  )),
  1, 'a payload conflict cannot enqueue a second job'
);
select is(
  (select duplicate from private.billing_webhook_ingest(
    '00000000-0000-4000-8000-000000000805', 'afdian:stable-order', decode(repeat('01', 32), 'hex'), 'verified', 'stable-order'
  )), true, 'the original payload remains idempotently acknowledged'
);
select is(
  (select count(*)::integer from public.billing_webhook_event_conflicts where provider_event_key = 'afdian:stable-order'),
  1, 'replaying the original payload does not create conflict evidence'
);

select * from finish();
rollback;
