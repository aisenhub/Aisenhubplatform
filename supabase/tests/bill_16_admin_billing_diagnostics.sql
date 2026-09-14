begin;

select plan(15);

select has_function(
  'private',
  'admin_billing_order_read_v3',
  array['private.admin_context', 'uuid'],
  'billing detail v3 exposes operational diagnostics'
);
select ok(
  (select prosecdef from pg_proc
   where oid = 'private.admin_billing_order_read_v3(private.admin_context, uuid)'::regprocedure),
  'billing detail v3 remains security definer'
);
select ok(
  has_function_privilege(
    'admin_executor',
    'private.admin_billing_order_read_v3(private.admin_context, uuid)',
    'execute'
  ),
  'admin executor can execute the diagnostics read'
);
select ok(
  not has_function_privilege(
    'account_executor',
    'private.admin_billing_order_read_v3(private.admin_context, uuid)',
    'execute'
  ),
  'account executor cannot execute the diagnostics read'
);
select ok(
  pg_get_function_result(
    'private.admin_billing_order_read_v3(private.admin_context, uuid)'::regprocedure
  ) like '%timeline%',
  'billing detail v3 preserves the detail contract'
);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values (
  '00000000-0000-4000-8000-000000000800', 'authenticated', 'authenticated',
  'bill16-admin@example.invalid', 'not-a-real-password', now(), now()
);
insert into private.system_admin (user_id)
values ('00000000-0000-4000-8000-000000000800');
insert into auth.sessions (id, user_id, created_at, updated_at, not_after)
values (
  '00000000-0000-4000-8000-000000000801',
  '00000000-0000-4000-8000-000000000800',
  now(), now(), now() + interval '1 hour'
);
insert into public.billing_provider_accounts (id, provider, name, status, secret_reference)
values (
  '00000000-0000-4000-8000-000000000802', 'afdian', 'BILL-16 fixture',
  'active', 'test-secret-reference'
);
insert into public.billing_orders (
  id, provider_account_id, provider_order_no, provider_status,
  verification_status, entitlement_status, linkage_status,
  created_at, updated_at
) values (
  '00000000-0000-4000-8000-000000000803',
  '00000000-0000-4000-8000-000000000802',
  'bill16-target', 'unknown', 'unverified', 'blocked', 'unlinked',
  '2026-09-10 00:00:00+00', '2026-09-10 00:00:00+00'
);
insert into public.billing_webhook_events (
  id, provider_account_id, provider_event_key, payload_hash,
  signature_status, processing_status, provider_order_no, received_at
) values (
  '00000000-0000-4000-8000-000000000805',
  '00000000-0000-4000-8000-000000000802', 'bill16-event-target',
  decode(repeat('ab', 32), 'hex'), 'verified', 'processing', 'bill16-target',
  '2026-09-10 01:00:00+00'
);
insert into public.billing_processing_jobs (
  id, job_kind, webhook_event_id, billing_order_id, state, attempts,
  max_attempts, retry_attempts, next_attempt_at, lease_owner, lease_until,
  fence, error_class, error_code, last_error_class, last_error_code,
  created_at, updated_at
) values (
  '00000000-0000-4000-8000-000000000807', 'webhook_order_discovery',
  '00000000-0000-4000-8000-000000000805',
  '00000000-0000-4000-8000-000000000803', 'processing', 3,
  8, 2, '2026-09-10 03:00:00+00', 'worker-secret-owner',
  '2026-09-10 02:00:00+00', 4, 'provider', 'PROVIDER_TIMEOUT',
  'provider', 'PROVIDER_TIMEOUT',
  '2026-09-10 01:01:00+00', '2026-09-10 01:02:00+00'
);

create temp table bill16_detail on commit drop as
select *
from private.admin_billing_order_read_v3(
  row(
    '00000000-0000-4000-8000-000000000800',
    '00000000-0000-4000-8000-000000000801',
    '00000000-0000-4000-8000-000000000808'
  )::private.admin_context,
  '00000000-0000-4000-8000-000000000803'
);

select is(
  (select jsonb_array_length(timeline) from bill16_detail),
  3,
  'diagnostic timeline keeps order, webhook and job as separate evidence'
);
select is(
  (select item ->> 'job_id'
   from bill16_detail, jsonb_array_elements(timeline) as item
   where item ->> 'source' = 'provider_webhook'),
  '00000000-0000-4000-8000-000000000807',
  'webhook evidence links to its processing job without merging states'
);
select is(
  (select item -> 'details' ->> 'payload_hash_prefix'
   from bill16_detail, jsonb_array_elements(timeline) as item
   where item ->> 'source' = 'provider_webhook'),
  'abababababababab',
  'webhook exposes only a bounded payload hash prefix'
);
select is(
  (select item -> 'details' ->> 'signature_status'
   from bill16_detail, jsonb_array_elements(timeline) as item
   where item ->> 'source' = 'provider_webhook'),
  'verified',
  'webhook signature result remains independent from job state'
);
select is(
  (select item -> 'details' ->> 'health'
   from bill16_detail, jsonb_array_elements(timeline) as item
   where item ->> 'source' = 'processing_job'),
  'lost',
  'expired processing lease is diagnosed as lost'
);
select is(
  (select item -> 'details' ->> 'attempts'
   from bill16_detail, jsonb_array_elements(timeline) as item
   where item ->> 'source' = 'processing_job'),
  '3',
  'job lifetime attempts remain visible'
);
select is(
  (select item -> 'details' ->> 'max_attempts'
   from bill16_detail, jsonb_array_elements(timeline) as item
   where item ->> 'source' = 'processing_job'),
  '8',
  'job retry budget remains visible'
);
select ok(
  (select (item -> 'details' ->> 'lease_owner_fingerprint') <> 'worker-secret-owner'
      and length(item -> 'details' ->> 'lease_owner_fingerprint') = 12
   from bill16_detail, jsonb_array_elements(timeline) as item
   where item ->> 'source' = 'processing_job'),
  'lease owner is represented by a short fingerprint rather than its raw value'
);
select is(
  (select item -> 'details' ->> 'next_attempt_at'
   from bill16_detail, jsonb_array_elements(timeline) as item
   where item ->> 'source' = 'processing_job'),
  '2026-09-10T03:00:00+00:00',
  'next attempt time remains distinct from lease expiry'
);
select is(
  (select item -> 'details' ->> 'last_error_code'
   from bill16_detail, jsonb_array_elements(timeline) as item
   where item ->> 'source' = 'processing_job'),
  'PROVIDER_TIMEOUT',
  'classified retry failure remains visible to operators'
);

select * from finish();

rollback;
