begin;

select plan(71);

select has_table('public', 'platform_feedback', 'Feedback root table exists');
select has_table('public', 'platform_feedback_attachments', 'Feedback attachment ledger exists');
select has_table('public', 'platform_feedback_labels', 'Feedback labels exist');
select has_table('public', 'platform_feedback_events', 'Feedback event timeline exists');
select has_table('private', 'feedback_attachment_write_attempts', 'Feedback attachment write attempts exist');
select ok(
  exists (
    select 1 from storage.buckets b
    where b.id = 'platform-feedback-attachments'
      and b.public = false
      and b.file_size_limit = 4194304
      and cardinality(b.allowed_mime_types) = 3
      and b.allowed_mime_types @> array['image/jpeg', 'image/png', 'image/webp']::text[]
  ),
  'Feedback attachment bucket is private and bounded to approved image MIME types'
);
select ok(
  (select bool_and(c.relforcerowsecurity)
   from pg_class c
   where c.oid in (
     'public.platform_feedback'::regclass,
     'public.platform_feedback_attachments'::regclass,
     'public.platform_feedback_labels'::regclass,
     'public.platform_feedback_events'::regclass
   )),
  'all public Feedback tables force RLS'
);
select ok(to_regclass('private.feedback_attachment_write_attempts_platform_attachment_fk_idx') is not null,
  'Feedback write-attempt composite FK has a covering index');
select ok(to_regclass('public.platform_feedback_user_fk_idx') is not null,
  'Feedback Auth user FK has a covering index');
select ok(to_regclass('public.platform_feedback_events_actor_user_fk_idx') is not null,
  'Feedback event actor FK has a covering index');
select ok(to_regclass('public.platform_feedback_labels_platform_feedback_fk_idx') is not null,
  'Feedback label parent FK has a covering index');
select ok(
  not has_table_privilege('account_executor', 'public.platform_feedback', 'select')
  and not has_table_privilege('account_executor', 'public.platform_feedback_attachments', 'insert')
  and not has_table_privilege('account_executor', 'public.platform_feedback_events', 'select'),
  'account executor cannot bypass Feedback domain functions'
);
select ok(
  not has_table_privilege('admin_executor', 'public.platform_feedback', 'select')
  and not has_table_privilege('admin_executor', 'public.platform_feedback_labels', 'update'),
  'admin executor has no direct Feedback table access in Phase 01'
);
select has_function(
  'private', 'feedback_create',
  array['private.account_context', 'text', 'text', 'text', 'boolean', 'jsonb', 'text'],
  'Feedback create boundary exists'
);
select has_function(
  'private', 'feedback_attachment_intent_create',
  array['private.account_context', 'uuid', 'text', 'bigint', 'text', 'text'],
  'Feedback attachment intent boundary exists'
);
select has_function(
  'private', 'feedback_attachment_cleanup_claim',
  array['private.job_context', 'uuid', 'integer'],
  'Feedback attachment cleanup boundary exists'
);
select ok(
  has_function_privilege(
    'account_executor',
    'private.feedback_create(private.account_context, text, text, text, boolean, jsonb, text)',
    'execute'
  ),
  'account executor can create Feedback through wrapper'
);
select ok(
  has_function_privilege(
    'account_executor',
    'private.feedback_attachment_intent_create(private.account_context, uuid, text, bigint, text, text)',
    'execute'
  ),
  'account executor can create attachment intents through wrapper'
);
select ok(
  has_function_privilege(
    'job_executor',
    'private.feedback_attachment_cleanup_claim(private.job_context, uuid, integer)',
    'execute'
  ),
  'job executor can claim Feedback attachment cleanup through wrapper'
);
select ok(
  not has_function_privilege(
    'anon',
    'private.feedback_submit(private.account_context, uuid, text)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'private.feedback_attachment_cleanup_candidates(uuid, integer)',
    'execute'
  ),
  'browser roles cannot invoke Feedback domain functions directly'
);
select ok(
  not has_function_privilege(
    'account_executor',
    'private.feedback_privacy_delete(uuid, text, timestamptz)',
    'execute'
  ),
  'account executor cannot invoke privacy deletion helper directly'
);
select ok(
  not has_function_privilege(
    'job_executor',
    'private.feedback_account_privacy_cleanup(uuid, timestamptz, text)',
    'execute'
  ),
  'job executor cannot invoke account privacy helper directly before lifecycle integration'
);
select ok(
  (select prosecdef and array_to_string(proconfig, ',') like 'search_path=pg_catalog%'
   from pg_proc
   where oid = 'private.feedback_create(private.account_context, text, text, text, boolean, jsonb, text)'::regprocedure),
  'Feedback create is a pinned security definer'
);
select ok(
  (select prosecdef and array_to_string(proconfig, ',') like 'search_path=pg_catalog%'
   from pg_proc
   where oid = 'private.feedback_attachment_cleanup_claim(private.job_context, uuid, integer)'::regprocedure),
  'Feedback cleanup claim is a pinned security definer'
);
select ok(
  not exists (
    select 1 from pg_trigger
    where tgname = 'platform_feedback_delete_reconcile' and not tgisinternal
  ),
  'Feedback root does not reconcile before privacy minimization completes'
);
select ok(
  exists (
    select 1 from pg_trigger
    where tgname = 'platform_feedback_attachment_delete_reconcile' and not tgisinternal
  ),
  'Attachment deletion reconciles its parent Feedback'
);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000008001', 'authenticated', 'authenticated', 'feedback-owner@example.invalid', 'x', now(), now()),
  ('00000000-0000-4000-8000-000000008002', 'authenticated', 'authenticated', 'feedback-other@example.invalid', 'x', now(), now());

insert into auth.sessions (id, user_id, created_at, updated_at, not_after)
values
  ('00000000-0000-4000-8000-000000008011', '00000000-0000-4000-8000-000000008001', now(), now(), now() + interval '1 hour'),
  ('00000000-0000-4000-8000-000000008012', '00000000-0000-4000-8000-000000008002', now(), now(), now() + interval '1 hour');

insert into public.platforms (id, code, name, status, allow_activation)
values
  ('00000000-0000-4000-8000-000000008020', 'feedback-main', 'Feedback Main', 'active', true),
  ('00000000-0000-4000-8000-000000008021', 'feedback-other', 'Feedback Other', 'active', true);

insert into public.platform_accounts (id, platform_id, user_id, status, activated_at)
values
  ('00000000-0000-4000-8000-000000008040', '00000000-0000-4000-8000-000000008020', '00000000-0000-4000-8000-000000008001', 'active', now()),
  ('00000000-0000-4000-8000-000000008041', '00000000-0000-4000-8000-000000008020', '00000000-0000-4000-8000-000000008002', 'active', now()),
  ('00000000-0000-4000-8000-000000008042', '00000000-0000-4000-8000-000000008021', '00000000-0000-4000-8000-000000008001', 'active', now());

insert into public.platform_profiles (platform_account_id, display_name)
values
  ('00000000-0000-4000-8000-000000008040', 'Feedback Owner'),
  ('00000000-0000-4000-8000-000000008041', 'Feedback Other'),
  ('00000000-0000-4000-8000-000000008042', 'Feedback Owner Other Platform');

insert into private.platform_api_keys (
  id, platform_id, name, key_hmac, hmac_key_version, key_prefix, key_suffix, creation_operation_id
)
values
  ('00000000-0000-4000-8000-000000008050', '00000000-0000-4000-8000-000000008020', 'Feedback main key', repeat('8', 64), 1, 'feedback-main', 'fixture', '00000000-0000-4000-8000-000000008060'),
  ('00000000-0000-4000-8000-000000008051', '00000000-0000-4000-8000-000000008021', 'Feedback other key', repeat('9', 64), 1, 'feedback-other', 'fixture', '00000000-0000-4000-8000-000000008061');

create temporary table feedback_main on commit drop as
select * from private.feedback_create(
  row(
    '00000000-0000-4000-8000-000000008001', '00000000-0000-4000-8000-000000008011',
    '00000000-0000-4000-8000-000000008020', '00000000-0000-4000-8000-000000008050',
    '00000000-0000-4000-8000-000000008070'
  )::private.account_context,
  'bug', 'Upload issue', 'Initial feedback body', true,
  '{"app_version":"1.2.3","route":"/settings","browser":"fixture"}'::jsonb,
  'feedback-create-main'
);
select ok(
  (select status = 'draft' and category = 'bug' and row_version = 1 from feedback_main),
  'Feedback starts as an editable draft'
);

create temporary table feedback_main_replay on commit drop as
select * from private.feedback_create(
  row(
    '00000000-0000-4000-8000-000000008001', '00000000-0000-4000-8000-000000008011',
    '00000000-0000-4000-8000-000000008020', '00000000-0000-4000-8000-000000008050',
    '00000000-0000-4000-8000-000000008071'
  )::private.account_context,
  'bug', 'Upload issue', 'Initial feedback body', true,
  '{"app_version":"1.2.3","route":"/settings","browser":"fixture"}'::jsonb,
  'feedback-create-main'
);
select is(
  (select feedback_id from feedback_main_replay),
  (select feedback_id from feedback_main),
  'Feedback create idempotency replay returns the original draft'
);

select throws_ok(
  $$select * from private.feedback_create(
    row(
      '00000000-0000-4000-8000-000000008001', '00000000-0000-4000-8000-000000008011',
      '00000000-0000-4000-8000-000000008020', '00000000-0000-4000-8000-000000008050',
      '00000000-0000-4000-8000-000000008072'
    )::private.account_context,
    'idea', 'Different request', 'Different body', true, '{}'::jsonb,
    'feedback-create-main'
  )$$,
  '23505', 'idempotency_conflict', 'Feedback create rejects conflicting idempotency replay'
);

select throws_ok(
  $$select * from private.feedback_create(
    row(
      '00000000-0000-4000-8000-000000008001', '00000000-0000-4000-8000-000000008011',
      '00000000-0000-4000-8000-000000008020', '00000000-0000-4000-8000-000000008050',
      '00000000-0000-4000-8000-000000008073'
    )::private.account_context,
    'bug', 'Bad context', 'Body', false, '{"headers":"secret"}'::jsonb,
    'feedback-bad-context'
  )$$,
  '22023', 'invalid_input', 'Feedback rejects unknown client context keys'
);

select throws_ok(
  format($query$select * from private.feedback_read(
    row(
      '00000000-0000-4000-8000-000000008002', '00000000-0000-4000-8000-000000008012',
      '00000000-0000-4000-8000-000000008020', '00000000-0000-4000-8000-000000008050',
      '00000000-0000-4000-8000-000000008074'
    )::private.account_context, %L::uuid
  )$query$, (select feedback_id from feedback_main)),
  'P0002', 'resource_not_found', 'another account cannot read Feedback by ID'
);

select throws_ok(
  format($query$select * from private.feedback_read(
    row(
      '00000000-0000-4000-8000-000000008001', '00000000-0000-4000-8000-000000008011',
      '00000000-0000-4000-8000-000000008021', '00000000-0000-4000-8000-000000008051',
      '00000000-0000-4000-8000-000000008075'
    )::private.account_context, %L::uuid
  )$query$, (select feedback_id from feedback_main)),
  'P0002', 'resource_not_found', 'another platform cannot read Feedback by ID'
);

create temporary table feedback_patched on commit drop as
select * from private.feedback_patch(
  row(
    '00000000-0000-4000-8000-000000008001', '00000000-0000-4000-8000-000000008011',
    '00000000-0000-4000-8000-000000008020', '00000000-0000-4000-8000-000000008050',
    '00000000-0000-4000-8000-000000008076'
  )::private.account_context,
  (select feedback_id from feedback_main), 1, 'experience',
  'Updated title', 'Updated feedback body', true,
  '{"route":"/feedback","locale":"zh-CN"}'::jsonb
);
select is((select row_version from feedback_patched), 2::bigint, 'draft patch increments row version');

select throws_ok(
  format($query$select * from private.feedback_patch(
    row(
      '00000000-0000-4000-8000-000000008001', '00000000-0000-4000-8000-000000008011',
      '00000000-0000-4000-8000-000000008020', '00000000-0000-4000-8000-000000008050',
      '00000000-0000-4000-8000-000000008077'
    )::private.account_context,
    %L::uuid, 1, 'bug', 'Stale', 'Stale body', false, '{}'::jsonb
  )$query$, (select feedback_id from feedback_main)),
  '40001', 'precondition_failed', 'stale draft patch fails closed'
);

select throws_ok(
  format($query$select * from private.feedback_attachment_intent_create(
    row(
      '00000000-0000-4000-8000-000000008001', '00000000-0000-4000-8000-000000008011',
      '00000000-0000-4000-8000-000000008020', '00000000-0000-4000-8000-000000008050',
      '00000000-0000-4000-8000-000000008078'
    )::private.account_context,
    %L::uuid, 'bad.svg', 100, 'image/svg+xml', 'feedback-bad-mime'
  )$query$, (select feedback_id from feedback_main)),
  '22023', 'invalid_input', 'SVG attachment intent is rejected'
);

select throws_ok(
  format($query$select * from private.feedback_attachment_intent_create(
    row(
      '00000000-0000-4000-8000-000000008001', '00000000-0000-4000-8000-000000008011',
      '00000000-0000-4000-8000-000000008020', '00000000-0000-4000-8000-000000008050',
      '00000000-0000-4000-8000-000000008079'
    )::private.account_context,
    %L::uuid, 'too-large.png', 4194305, 'image/png', 'feedback-too-large'
  )$query$, (select feedback_id from feedback_main)),
  '22023', 'invalid_input', 'single attachment above 4 MiB is rejected'
);

create temporary table attachment_main on commit drop as
select * from private.feedback_attachment_intent_create(
  row(
    '00000000-0000-4000-8000-000000008001', '00000000-0000-4000-8000-000000008011',
    '00000000-0000-4000-8000-000000008020', '00000000-0000-4000-8000-000000008050',
    '00000000-0000-4000-8000-000000008080'
  )::private.account_context,
  (select feedback_id from feedback_main), 'screen.png', 100, 'image/png', 'feedback-attachment-main'
);
select ok(
  (select status = 'pending' and write_outcome = 'not_started' and requested_size_bytes = 100 from attachment_main),
  'valid attachment intent starts pending without a Storage write'
);

create temporary table attachment_claim on commit drop as
select * from private.feedback_attachment_receive_claim(
  row(
    '00000000-0000-4000-8000-000000008001', '00000000-0000-4000-8000-000000008011',
    '00000000-0000-4000-8000-000000008020', '00000000-0000-4000-8000-000000008050',
    '00000000-0000-4000-8000-000000008081'
  )::private.account_context,
  (select attachment_id from attachment_main), 'feedback-receiver', 15
);
select ok(
  (select status = 'receiving' and fencing_token = 1 and lease_until is not null from attachment_claim),
  'attachment receive claim establishes lease and fence'
);

create temporary table attachment_store on commit drop as
select * from private.feedback_attachment_prepare_store(
  row(
    '00000000-0000-4000-8000-000000008001', '00000000-0000-4000-8000-000000008011',
    '00000000-0000-4000-8000-000000008020', '00000000-0000-4000-8000-000000008050',
    '00000000-0000-4000-8000-000000008082'
  )::private.account_context,
  (select attachment_id from attachment_main), 100, repeat('a', 64), 'feedback-store-main'
);
select ok(
  (select status = 'storing' and write_outcome = 'in_flight' and write_attempt_id is not null from attachment_store),
  'verified bytes create one in-flight Storage write attempt'
);

select throws_ok(
  format($query$select * from private.feedback_submit(
    row(
      '00000000-0000-4000-8000-000000008001', '00000000-0000-4000-8000-000000008011',
      '00000000-0000-4000-8000-000000008020', '00000000-0000-4000-8000-000000008050',
      '00000000-0000-4000-8000-000000008083'
    )::private.account_context,
    %L::uuid, 'feedback-owner@example.invalid'
  )$query$, (select feedback_id from feedback_main)),
  'P0001', 'feedback_attachment_not_ready', 'Feedback cannot submit while an attachment write is unsettled'
);

create temporary table attachment_unknown on commit drop as
select * from private.feedback_attachment_mark_unknown(
  row(
    '00000000-0000-4000-8000-000000008001', '00000000-0000-4000-8000-000000008011',
    '00000000-0000-4000-8000-000000008020', '00000000-0000-4000-8000-000000008050',
    '00000000-0000-4000-8000-000000008084'
  )::private.account_context,
  (select attachment_id from attachment_main), (select write_attempt_id from attachment_store),
  'provider_timeout'
);
select is((select write_outcome from attachment_unknown), 'unknown', 'provider timeout remains an unknown write outcome');

create temporary table attachment_final on commit drop as
select * from private.feedback_attachment_finalize(
  row(
    '00000000-0000-4000-8000-000000008001', '00000000-0000-4000-8000-000000008011',
    '00000000-0000-4000-8000-000000008020', '00000000-0000-4000-8000-000000008050',
    '00000000-0000-4000-8000-000000008085'
  )::private.account_context,
  (select attachment_id from attachment_main), (select write_attempt_id from attachment_store),
  100, repeat('a', 64), 'provider-request-main'
);
select ok(
  (select status = 'active' and write_outcome = 'confirmed' and uploaded_at is not null from attachment_final),
  'unknown write can settle to a confirmed active attachment'
);

create temporary table feedback_submitted on commit drop as
select * from private.feedback_submit(
  row(
    '00000000-0000-4000-8000-000000008001', '00000000-0000-4000-8000-000000008011',
    '00000000-0000-4000-8000-000000008020', '00000000-0000-4000-8000-000000008050',
    '00000000-0000-4000-8000-000000008086'
  )::private.account_context,
  (select feedback_id from feedback_main), 'feedback-owner@example.invalid'
);
select is((select status from feedback_submitted), 'new', 'settled draft submits to new');
select ok(
  (select author_display_name_snapshot = 'Feedback Owner'
      and contact_email_snapshot = 'feedback-owner@example.invalid'
   from public.platform_feedback where id = (select feedback_id from feedback_main)),
  'submit snapshots trusted profile and contact email facts'
);
select ok(
  (select position('Updated feedback body' in metadata::text) = 0
      and position('feedback-owner@example.invalid' in metadata::text) = 0
   from public.audit_logs
   where event_type = 'feedback.submitted' and target_id = (select feedback_id from feedback_main)
   order by created_at desc limit 1),
  'Feedback audit metadata excludes body and contact email'
);

create temporary table feedback_no_contact on commit drop as
select * from private.feedback_create(
  row(
    '00000000-0000-4000-8000-000000008001', '00000000-0000-4000-8000-000000008011',
    '00000000-0000-4000-8000-000000008020', '00000000-0000-4000-8000-000000008050',
    '00000000-0000-4000-8000-000000008086'
  )::private.account_context,
  'other', 'No contact', 'Identity snapshot still comes from Auth', false, '{}'::jsonb,
  'feedback-no-contact'
);
select * from private.feedback_submit(
  row(
    '00000000-0000-4000-8000-000000008001', '00000000-0000-4000-8000-000000008011',
    '00000000-0000-4000-8000-000000008020', '00000000-0000-4000-8000-000000008050',
    '00000000-0000-4000-8000-000000008087'
  )::private.account_context,
  (select feedback_id from feedback_no_contact), 'feedback-owner@example.invalid'
);
select ok(
  (select contact_allowed = false and contact_email_snapshot = 'feedback-owner@example.invalid'
   from public.platform_feedback where id = (select feedback_id from feedback_no_contact)),
  'contact permission does not discard the server-confirmed identity email snapshot'
);

insert into public.platform_feedback_labels(platform_id, feedback_id, label)
values ('00000000-0000-4000-8000-000000008020', (select feedback_id from feedback_main), 'urgent');
insert into public.platform_feedback_events(platform_id, feedback_id, event_type, actor_user_id, note_body, metadata)
values (
  '00000000-0000-4000-8000-000000008020', (select feedback_id from feedback_main),
  'note_added', '00000000-0000-4000-8000-000000008001', 'private admin note',
  '{"private":"context"}'::jsonb
);
select private.feedback_privacy_delete((select feedback_id from feedback_main), 'test_delete', clock_timestamp());
select is(
  (select status from public.platform_feedback where id = (select feedback_id from feedback_main)),
  'deleting', 'privacy deletion keeps Feedback deleting until physical attachment removal is proven'
);
select ok(
  (select title is null and body is null and contact_email_snapshot is null
      and author_display_name_snapshot is null and client_context = '{}'::jsonb
   from public.platform_feedback where id = (select feedback_id from feedback_main)),
  'privacy deletion immediately minimizes Feedback personal content'
);
select ok(
  (select count(*) = 0 from public.platform_feedback_labels where feedback_id = (select feedback_id from feedback_main))
  and (select bool_and(note_body is null and metadata = '{}'::jsonb)
       from public.platform_feedback_events
       where feedback_id = (select feedback_id from feedback_main) and event_type = 'note_added'),
  'privacy deletion clears labels and internal note content'
);
select is(
  (select status from public.platform_feedback_attachments where id = (select attachment_id from attachment_main)),
  'deleting', 'privacy deletion moves active attachment into deleting without guessing Storage outcome'
);

insert into private.file_backup_barriers(id, scope, recovery_set_id, state, started_at, deadline_at)
values(
  '00000000-0000-4000-8000-000000008090', 'global', 'feedback-phase01-backup',
  'active', now(), now() + interval '1 hour'
);
create temporary table feedback_cleanup_barrier on commit drop as
select * from private.feedback_attachment_cleanup_claim(
  row(
    '00000000-0000-4000-8000-000000008091', 'feedback-cleanup-barrier', 1,
    '00000000-0000-4000-8000-000000008092'
  )::private.job_context,
  (select attachment_id from attachment_main), 60
);
select is((select action from feedback_cleanup_barrier), 'backup_barrier', 'active backup barrier blocks Feedback attachment physical deletion');
delete from private.file_backup_barriers where id = '00000000-0000-4000-8000-000000008090';

create temporary table feedback_cleanup_remove on commit drop as
select * from private.feedback_attachment_cleanup_claim(
  row(
    '00000000-0000-4000-8000-000000008093', 'feedback-cleanup-remove', 1,
    '00000000-0000-4000-8000-000000008094'
  )::private.job_context,
  (select attachment_id from attachment_main), 60
);
select is((select action from feedback_cleanup_remove), 'remove', 'confirmed deleting attachment is the only Storage removal action');

create temporary table feedback_cleanup_finished on commit drop as
select * from private.feedback_attachment_cleanup_finish(
  row(
    '00000000-0000-4000-8000-000000008095', 'feedback-cleanup-remove', 1,
    '00000000-0000-4000-8000-000000008096'
  )::private.job_context,
  (select attachment_id from attachment_main),
  (select fencing_token from feedback_cleanup_remove), 'removed', null
);
select is((select status from feedback_cleanup_finished), 'deleted', 'confirmed Storage removal marks attachment deleted');
select is(
  (select status from public.platform_feedback where id = (select feedback_id from feedback_main)),
  'deleted', 'last attachment deletion reconciles parent Feedback to deleted'
);
select ok(
  (select platform_account_id is null and user_id is null
   from public.platform_feedback where id = (select feedback_id from feedback_main)),
  'terminal Feedback detaches account and identity references'
);
select is(
  (select count(*)::integer from public.platform_feedback_events
   where feedback_id = (select feedback_id from feedback_main)
     and event_type in ('delete_requested', 'deleted')),
  2, 'privacy deletion records request and terminal deletion events without sensitive content'
);

create temporary table feedback_zero on commit drop as
select * from private.feedback_create(
  row(
    '00000000-0000-4000-8000-000000008001', '00000000-0000-4000-8000-000000008011',
    '00000000-0000-4000-8000-000000008020', '00000000-0000-4000-8000-000000008050',
    '00000000-0000-4000-8000-000000008097'
  )::private.account_context,
  'idea', 'Text only', 'No attachment feedback', false, '{}'::jsonb, 'feedback-zero'
);
select ok((select feedback_id is not null from feedback_zero), 'text-only Feedback draft can be created');
select private.feedback_privacy_delete((select feedback_id from feedback_zero), 'zero_delete', clock_timestamp());
select is(
  (select status from public.platform_feedback where id = (select feedback_id from feedback_zero)),
  'deleted', 'zero-attachment privacy deletion reconciles only after minimization finishes'
);
select is(
  (select count(*)::integer from public.platform_feedback_events
   where feedback_id = (select feedback_id from feedback_zero)
     and event_type in ('delete_requested', 'deleted')),
  2, 'zero-attachment deletion emits both lifecycle events'
);

create temporary table feedback_receive_race on commit drop as
select * from private.feedback_create(
  row(
    '00000000-0000-4000-8000-000000008001', '00000000-0000-4000-8000-000000008011',
    '00000000-0000-4000-8000-000000008020', '00000000-0000-4000-8000-000000008050',
    '00000000-0000-4000-8000-000000008115'
  )::private.account_context,
  'bug', 'Receive race', 'Cleanup must honor the active receive lease', false, '{}'::jsonb,
  'feedback-receive-race'
);
create temporary table attachment_receive_race on commit drop as
select * from private.feedback_attachment_intent_create(
  row(
    '00000000-0000-4000-8000-000000008001', '00000000-0000-4000-8000-000000008011',
    '00000000-0000-4000-8000-000000008020', '00000000-0000-4000-8000-000000008050',
    '00000000-0000-4000-8000-000000008116'
  )::private.account_context,
  (select feedback_id from feedback_receive_race), 'race.png', 100, 'image/png', 'feedback-race-attachment'
);
select * from private.feedback_attachment_receive_claim(
  row(
    '00000000-0000-4000-8000-000000008001', '00000000-0000-4000-8000-000000008011',
    '00000000-0000-4000-8000-000000008020', '00000000-0000-4000-8000-000000008050',
    '00000000-0000-4000-8000-000000008117'
  )::private.account_context,
  (select attachment_id from attachment_receive_race), 'feedback-race-receiver', 15
);
select * from private.feedback_attachment_cancel(
  row(
    '00000000-0000-4000-8000-000000008001', '00000000-0000-4000-8000-000000008011',
    '00000000-0000-4000-8000-000000008020', '00000000-0000-4000-8000-000000008050',
    '00000000-0000-4000-8000-000000008118'
  )::private.account_context,
  (select attachment_id from attachment_receive_race)
);
select ok(
  (select status = 'deleting' and next_attempt_at >= lease_until
   from public.platform_feedback_attachments where id = (select attachment_id from attachment_receive_race)),
  'cancelled receiving attachment defers cleanup until its receive lease expires'
);
create temporary table receive_race_early_cleanup on commit drop as
select * from private.feedback_attachment_cleanup_claim(
  row(
    '00000000-0000-4000-8000-000000008119', 'feedback-race-cleanup', 1,
    '00000000-0000-4000-8000-000000008120'
  )::private.job_context,
  (select attachment_id from attachment_receive_race), 60
);
select is(
  (select action from receive_race_early_cleanup), 'receive_in_progress',
  'cleanup refuses to declare no Storage object while a receive lease is active'
);
select is(
  (select status from public.platform_feedback_attachments where id = (select attachment_id from attachment_receive_race)),
  'deleting', 'early cleanup leaves the raced attachment recoverable'
);
update public.platform_feedback_attachments
set lease_until = clock_timestamp() - interval '1 second',
    next_attempt_at = clock_timestamp() - interval '1 second'
where id = (select attachment_id from attachment_receive_race);
create temporary table receive_race_late_cleanup on commit drop as
select * from private.feedback_attachment_cleanup_claim(
  row(
    '00000000-0000-4000-8000-000000008121', 'feedback-race-cleanup', 1,
    '00000000-0000-4000-8000-000000008122'
  )::private.job_context,
  (select attachment_id from attachment_receive_race), 60
);
select ok(
  (select action = 'no_storage' and status = 'deleted' from receive_race_late_cleanup),
  'after the receive lease expires cleanup may prove no Storage write and terminalize the attachment'
);

create temporary table feedback_expire on commit drop as
select * from private.feedback_create(
  row(
    '00000000-0000-4000-8000-000000008001', '00000000-0000-4000-8000-000000008011',
    '00000000-0000-4000-8000-000000008020', '00000000-0000-4000-8000-000000008050',
    '00000000-0000-4000-8000-000000008098'
  )::private.account_context,
  'other', 'Expire attachment', 'Expiry regression', false, '{}'::jsonb, 'feedback-expire'
);
create temporary table attachment_expire on commit drop as
select * from private.feedback_attachment_intent_create(
  row(
    '00000000-0000-4000-8000-000000008001', '00000000-0000-4000-8000-000000008011',
    '00000000-0000-4000-8000-000000008020', '00000000-0000-4000-8000-000000008050',
    '00000000-0000-4000-8000-000000008099'
  )::private.account_context,
  (select feedback_id from feedback_expire), 'expire.webp', 50, 'image/webp', 'feedback-expire-attachment'
);
update public.platform_feedback_attachments
set intent_expires_at = clock_timestamp() - interval '1 minute', next_attempt_at = clock_timestamp() - interval '1 minute'
where id = (select attachment_id from attachment_expire);
create temporary table attachment_expired_cleanup on commit drop as
select * from private.feedback_attachment_cleanup_claim(
  row(
    '00000000-0000-4000-8000-000000008100', 'feedback-expire-worker', 1,
    '00000000-0000-4000-8000-000000008101'
  )::private.job_context,
  (select attachment_id from attachment_expire), 60
);
select is((select action from attachment_expired_cleanup), 'no_storage', 'expired intent with no write requires no Storage call');
select ok(
  (select status = 'expired' and storage_path is not null and platform_account_id is not null
   from public.platform_feedback_attachments where id = (select attachment_id from attachment_expire)),
  'expired attachment retains immutable path and ownership evidence without violating ledger constraints'
);

create temporary table feedback_limit on commit drop as
select * from private.feedback_create(
  row(
    '00000000-0000-4000-8000-000000008001', '00000000-0000-4000-8000-000000008011',
    '00000000-0000-4000-8000-000000008020', '00000000-0000-4000-8000-000000008050',
    '00000000-0000-4000-8000-000000008102'
  )::private.account_context,
  'bug', 'Five images', 'Count limit fixture', false, '{}'::jsonb, 'feedback-limit'
);
create temporary table limit_a1 on commit drop as select * from private.feedback_attachment_intent_create(row('00000000-0000-4000-8000-000000008001','00000000-0000-4000-8000-000000008011','00000000-0000-4000-8000-000000008020','00000000-0000-4000-8000-000000008050','00000000-0000-4000-8000-000000008103')::private.account_context,(select feedback_id from feedback_limit),'1.png',1,'image/png','limit-1');
create temporary table limit_a2 on commit drop as select * from private.feedback_attachment_intent_create(row('00000000-0000-4000-8000-000000008001','00000000-0000-4000-8000-000000008011','00000000-0000-4000-8000-000000008020','00000000-0000-4000-8000-000000008050','00000000-0000-4000-8000-000000008104')::private.account_context,(select feedback_id from feedback_limit),'2.png',1,'image/png','limit-2');
create temporary table limit_a3 on commit drop as select * from private.feedback_attachment_intent_create(row('00000000-0000-4000-8000-000000008001','00000000-0000-4000-8000-000000008011','00000000-0000-4000-8000-000000008020','00000000-0000-4000-8000-000000008050','00000000-0000-4000-8000-000000008105')::private.account_context,(select feedback_id from feedback_limit),'3.png',1,'image/png','limit-3');
create temporary table limit_a4 on commit drop as select * from private.feedback_attachment_intent_create(row('00000000-0000-4000-8000-000000008001','00000000-0000-4000-8000-000000008011','00000000-0000-4000-8000-000000008020','00000000-0000-4000-8000-000000008050','00000000-0000-4000-8000-000000008106')::private.account_context,(select feedback_id from feedback_limit),'4.png',1,'image/png','limit-4');
create temporary table limit_a5 on commit drop as select * from private.feedback_attachment_intent_create(row('00000000-0000-4000-8000-000000008001','00000000-0000-4000-8000-000000008011','00000000-0000-4000-8000-000000008020','00000000-0000-4000-8000-000000008050','00000000-0000-4000-8000-000000008107')::private.account_context,(select feedback_id from feedback_limit),'5.png',1,'image/png','limit-5');
select is(
  (select count(*)::integer from public.platform_feedback_attachments where feedback_id = (select feedback_id from feedback_limit) and status = 'pending'),
  5, 'five live attachment intents are allowed'
);
select throws_ok(
  format($query$select * from private.feedback_attachment_intent_create(
    row('00000000-0000-4000-8000-000000008001','00000000-0000-4000-8000-000000008011','00000000-0000-4000-8000-000000008020','00000000-0000-4000-8000-000000008050','00000000-0000-4000-8000-000000008108')::private.account_context,
    %L::uuid, '6.png', 1, 'image/png', 'limit-6')$query$, (select feedback_id from feedback_limit)),
  'P0001', 'feedback_attachment_limit_exceeded', 'sixth live attachment is rejected'
);

create temporary table feedback_bytes on commit drop as
select * from private.feedback_create(
  row(
    '00000000-0000-4000-8000-000000008001', '00000000-0000-4000-8000-000000008011',
    '00000000-0000-4000-8000-000000008020', '00000000-0000-4000-8000-000000008050',
    '00000000-0000-4000-8000-000000008109'
  )::private.account_context,
  'experience', 'Twelve MiB', 'Byte limit fixture', false, '{}'::jsonb, 'feedback-bytes'
);
create temporary table bytes_a1 on commit drop as select * from private.feedback_attachment_intent_create(row('00000000-0000-4000-8000-000000008001','00000000-0000-4000-8000-000000008011','00000000-0000-4000-8000-000000008020','00000000-0000-4000-8000-000000008050','00000000-0000-4000-8000-000000008110')::private.account_context,(select feedback_id from feedback_bytes),'a.png',4194304,'image/png','bytes-1');
create temporary table bytes_a2 on commit drop as select * from private.feedback_attachment_intent_create(row('00000000-0000-4000-8000-000000008001','00000000-0000-4000-8000-000000008011','00000000-0000-4000-8000-000000008020','00000000-0000-4000-8000-000000008050','00000000-0000-4000-8000-000000008111')::private.account_context,(select feedback_id from feedback_bytes),'b.png',4194304,'image/png','bytes-2');
create temporary table bytes_a3 on commit drop as select * from private.feedback_attachment_intent_create(row('00000000-0000-4000-8000-000000008001','00000000-0000-4000-8000-000000008011','00000000-0000-4000-8000-000000008020','00000000-0000-4000-8000-000000008050','00000000-0000-4000-8000-000000008112')::private.account_context,(select feedback_id from feedback_bytes),'c.png',4194304,'image/png','bytes-3');
select is(
  (select sum(requested_size_bytes)::bigint from public.platform_feedback_attachments where feedback_id = (select feedback_id from feedback_bytes) and status = 'pending'),
  12582912::bigint, 'three 4 MiB attachments exactly fill the per-Feedback byte ceiling'
);
select throws_ok(
  format($query$select * from private.feedback_attachment_intent_create(
    row('00000000-0000-4000-8000-000000008001','00000000-0000-4000-8000-000000008011','00000000-0000-4000-8000-000000008020','00000000-0000-4000-8000-000000008050','00000000-0000-4000-8000-000000008113')::private.account_context,
    %L::uuid, 'overflow.png', 1, 'image/png', 'bytes-overflow')$query$, (select feedback_id from feedback_bytes)),
  'P0001', 'feedback_attachment_bytes_exceeded', 'attachment bytes above 12 MiB are rejected even below count limit'
);

create temporary table feedback_other_cleanup on commit drop as
select * from private.feedback_create(
  row(
    '00000000-0000-4000-8000-000000008002', '00000000-0000-4000-8000-000000008012',
    '00000000-0000-4000-8000-000000008020', '00000000-0000-4000-8000-000000008050',
    '00000000-0000-4000-8000-000000008114'
  )::private.account_context,
  'other', 'Retention fixture', 'Sensitive retention body', true, '{}'::jsonb, 'feedback-other-cleanup'
);
select is(
  private.feedback_account_privacy_cleanup(
    '00000000-0000-4000-8000-000000008041', clock_timestamp(), 'retention_test'
  ),
  1, 'account privacy helper processes all non-deleted Feedback for the target account'
);
select is(
  (select status from public.platform_feedback where id = (select feedback_id from feedback_other_cleanup)),
  'deleted', 'account privacy helper immediately terminalizes text-only Feedback'
);

select * from finish();
rollback;
