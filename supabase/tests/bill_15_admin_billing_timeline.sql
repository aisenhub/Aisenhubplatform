begin;

select plan(16);

select has_function(
  'private',
  'admin_billing_order_read_v2',
  array['private.admin_context', 'uuid'],
  'billing detail v2 exposes the evidence timeline contract'
);
select ok(
  (select prosecdef from pg_proc
   where oid = 'private.admin_billing_order_read_v2(private.admin_context, uuid)'::regprocedure),
  'billing detail v2 remains security definer'
);
select ok(
  has_function_privilege(
    'admin_executor',
    'private.admin_billing_order_read_v2(private.admin_context, uuid)',
    'execute'
  ),
  'admin executor can read the timeline'
);
select ok(
  not has_function_privilege(
    'account_executor',
    'private.admin_billing_order_read_v2(private.admin_context, uuid)',
    'execute'
  ),
  'account executor cannot read the admin timeline'
);
select ok(
  pg_get_function_result(
    'private.admin_billing_order_read_v2(private.admin_context, uuid)'::regprocedure
  ) like '%timeline%',
  'the public function result includes timeline data'
);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values (
  '00000000-0000-4000-8000-000000000700', 'authenticated', 'authenticated',
  'bill15-admin@example.invalid', 'not-a-real-password', now(), now()
);
insert into private.system_admin (user_id)
values ('00000000-0000-4000-8000-000000000700');
insert into auth.sessions (id, user_id, created_at, updated_at, not_after)
values (
  '00000000-0000-4000-8000-000000000701',
  '00000000-0000-4000-8000-000000000700',
  now(), now(), now() + interval '1 hour'
);
insert into public.billing_provider_accounts (id, provider, name, status, secret_reference)
values (
  '00000000-0000-4000-8000-000000000702', 'afdian', 'BILL-15 fixture',
  'active', 'test-secret-reference'
);
insert into public.billing_orders (
  id, provider_account_id, provider_order_no, provider_status,
  verification_status, entitlement_status, linkage_status,
  provider_created_at, provider_paid_at, created_at, updated_at
) values (
  '00000000-0000-4000-8000-000000000703',
  '00000000-0000-4000-8000-000000000702',
  'bill15-target', 'paid', 'verified', 'blocked', 'unlinked',
  '2026-09-10 01:00:00+00', null,
  '2026-09-10 00:00:00+00', '2026-09-10 00:00:00+00'
), (
  '00000000-0000-4000-8000-000000000704',
  '00000000-0000-4000-8000-000000000702',
  'bill15-other', 'paid', 'verified', 'blocked', 'unlinked',
  null, null,
  '2026-09-10 00:00:01+00', '2026-09-10 00:00:01+00'
);
insert into public.billing_webhook_events (
  id, provider_account_id, provider_event_key, payload_hash,
  signature_status, processing_status, provider_order_no, received_at
) values (
  '00000000-0000-4000-8000-000000000705',
  '00000000-0000-4000-8000-000000000702', 'bill15-event-target',
  decode(repeat('ab', 32), 'hex'), 'verified', 'processed', 'bill15-target',
  '2026-09-10 02:00:00+00'
), (
  '00000000-0000-4000-8000-000000000706',
  '00000000-0000-4000-8000-000000000702', 'bill15-event-other',
  decode(repeat('cd', 32), 'hex'), 'verified', 'processed', 'bill15-other',
  '2026-09-10 02:00:01+00'
);
insert into public.billing_processing_jobs (
  id, job_kind, webhook_event_id, billing_order_id, state, attempts,
  created_at, updated_at
) values (
  '00000000-0000-4000-8000-000000000707', 'order_verification',
  '00000000-0000-4000-8000-000000000705',
  '00000000-0000-4000-8000-000000000703', 'completed', 1,
  '2026-09-10 02:01:00+00', '2026-09-10 02:02:00+00'
);
insert into public.billing_order_observations (
  id, billing_order_id, processing_job_id, provider_status,
  provider_contract_version, source, provider_facts, observed_at
) values (
  '00000000-0000-4000-8000-000000000708',
  '00000000-0000-4000-8000-000000000703',
  '00000000-0000-4000-8000-000000000707',
  'paid', 2, 'order_verification',
  '{"provider_status":"paid","provider_paid_at":null}'::jsonb,
  '2026-09-10 02:03:00+00'
);
insert into public.billing_settlements (
  id, billing_order_id, checkout_intent_id, platform_id, platform_account_id,
  settlement_kind, state, operation_id, decision_reason, decision_code
) values (
  '00000000-0000-4000-8000-000000000709',
  '00000000-0000-4000-8000-000000000703', null, null, null,
  'manual', 'review_required', '00000000-0000-4000-8000-000000000710',
  'timeline fixture', 'unlinked_order'
);
select private.audit_append(
  '00000000-0000-4000-8000-000000000711', 'admin',
  '00000000-0000-4000-8000-000000000700', null, null,
  'billing.order.requery_requested', 'billing_order',
  '00000000-0000-4000-8000-000000000703', null, null,
  '{"reason":"operator retry","secret_token":"must-not-leak"}'::jsonb
);
select private.audit_append(
  '00000000-0000-4000-8000-000000000712', 'admin',
  '00000000-0000-4000-8000-000000000700', null, null,
  'billing.order.requery_requested', 'billing_order',
  '00000000-0000-4000-8000-000000000704', null, null,
  '{"reason":"other order"}'::jsonb
);

create temp table bill15_detail on commit drop as
select *
from private.admin_billing_order_read_v2(
  row(
    '00000000-0000-4000-8000-000000000700',
    '00000000-0000-4000-8000-000000000701',
    '00000000-0000-4000-8000-000000000724'
  )::private.admin_context,
  '00000000-0000-4000-8000-000000000703'
);

select is(
  (select jsonb_array_length(timeline) from bill15_detail),
  6,
  'timeline contains order, webhook, job, observation, settlement and audit evidence'
);
select ok(
  (select bool_and(source in (
    'billing_order', 'provider_webhook', 'processing_job',
    'provider_observation', 'settlement', 'admin_audit'
  ))
   from bill15_detail, jsonb_array_elements(bill15_detail.timeline) as timeline_event
   cross join lateral (select timeline_event ->> 'source' as source) labels),
  'timeline sources are restricted to the order evidence model'
);
select is(
  (select timeline_event ->> 'provider_event_at'
   from bill15_detail, jsonb_array_elements(bill15_detail.timeline) as timeline_event
   where timeline_event ->> 'event_type' = 'order.created'),
  '2026-09-10T01:00:00+00:00',
  'order timeline preserves the provider-created timestamp'
);
select is(
  (select timeline_event ->> 'provider_event_at'
   from bill15_detail, jsonb_array_elements(bill15_detail.timeline) as timeline_event
   where timeline_event ->> 'event_type' = 'webhook.received'),
  null,
  'webhook receive time is not presented as provider event time'
);
select is(
  (select timeline_event ->> 'received_at'
   from bill15_detail, jsonb_array_elements(bill15_detail.timeline) as timeline_event
   where timeline_event ->> 'event_type' = 'webhook.received'),
  '2026-09-10T02:00:00+00:00',
  'webhook evidence preserves the local receive time'
);
select ok(
  (select count(*) = 0
   from bill15_detail, jsonb_array_elements(bill15_detail.timeline) as timeline_event
   where timeline_event ->> 'entity_id' in (
     '00000000-0000-4000-8000-000000000704',
     '00000000-0000-4000-8000-000000000706'
   )),
  'timeline is isolated from another order with the same provider account'
);
select is(
  (select timeline_event -> 'details' ->> 'reason'
   from bill15_detail, jsonb_array_elements(bill15_detail.timeline) as timeline_event
   where timeline_event ->> 'source' = 'admin_audit'),
  'operator retry',
  'admin audit keeps the operator reason'
);
select is(
  (select timeline_event -> 'details' ->> 'secret_token'
   from bill15_detail, jsonb_array_elements(bill15_detail.timeline) as timeline_event
   where timeline_event ->> 'source' = 'admin_audit'),
  null,
  'admin audit does not expose unapproved metadata keys'
);
select ok(
  (select count(*) = 0
   from bill15_detail, jsonb_array_elements(bill15_detail.timeline) as timeline_event
   where (timeline_event ->> 'source') in ('provider_webhook', 'processing_job', 'provider_observation')
     and timeline_event ->> 'provider_event_at' is not null),
  'locally observed evidence does not fabricate provider timestamps'
);
select ok(
  (select bool_and(event_at >= lag_event_at)
   from (
     select (timeline_event ->> 'event_at')::timestamptz as event_at,
       lag((timeline_event ->> 'event_at')::timestamptz) over (order by ordinality) as lag_event_at
      from bill15_detail, jsonb_array_elements(bill15_detail.timeline)
        with ordinality as events(timeline_event, ordinality)
   ) ordered where lag_event_at is null or event_at >= lag_event_at),
  'timeline rows are returned in causal time order'
);
select is(
  (select open_job_count from bill15_detail),
  0::bigint,
  'completed jobs are excluded from the open task count while remaining in history'
);

select * from finish();

rollback;
