begin;

select plan(8);

select has_function(
  'private', 'feedback_attachment_upload_state',
  array['private.account_context', 'uuid', 'uuid'],
  'Feedback attachment upload-state boundary exists'
);
select ok(
  has_function_privilege(
    'account_executor',
    'private.feedback_attachment_upload_state(private.account_context, uuid, uuid)',
    'execute'
  ),
  'account executor can read its attachment upload state'
);
select ok(
  not has_function_privilege(
    'anon',
    'private.feedback_attachment_upload_state(private.account_context, uuid, uuid)',
    'execute'
  )
  and not has_function_privilege(
    'admin_executor',
    'private.feedback_attachment_upload_state(private.account_context, uuid, uuid)',
    'execute'
  ),
  'browser and admin executors cannot invoke the Account content boundary'
);
select ok(
  (select prosecdef and array_to_string(proconfig, ',') like 'search_path=pg_catalog%'
   from pg_proc
   where oid = 'private.feedback_attachment_upload_state(private.account_context, uuid, uuid)'::regprocedure),
  'Feedback attachment upload-state boundary is a pinned security definer'
);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000008101', 'authenticated', 'authenticated', 'content-owner@example.invalid', 'x', now(), now()),
  ('00000000-0000-4000-8000-000000008102', 'authenticated', 'authenticated', 'content-other@example.invalid', 'x', now(), now());

insert into auth.sessions (id, user_id, created_at, updated_at, not_after)
values
  ('00000000-0000-4000-8000-000000008111', '00000000-0000-4000-8000-000000008101', now(), now(), now() + interval '1 hour'),
  ('00000000-0000-4000-8000-000000008112', '00000000-0000-4000-8000-000000008102', now(), now(), now() + interval '1 hour');

insert into public.platforms (id, code, name, status, allow_activation)
values ('00000000-0000-4000-8000-000000008120', 'feedback-content', 'Feedback Content', 'active', true);

insert into public.platform_accounts (id, platform_id, user_id, status, activated_at)
values
  ('00000000-0000-4000-8000-000000008140', '00000000-0000-4000-8000-000000008120', '00000000-0000-4000-8000-000000008101', 'active', now()),
  ('00000000-0000-4000-8000-000000008141', '00000000-0000-4000-8000-000000008120', '00000000-0000-4000-8000-000000008102', 'active', now());

insert into private.platform_api_keys (
  id, platform_id, name, key_hmac, hmac_key_version, key_prefix, key_suffix, creation_operation_id
)
values ('00000000-0000-4000-8000-000000008150', '00000000-0000-4000-8000-000000008120', 'Feedback content key', repeat('a', 64), 1, 'feedback-content', 'fixture', '00000000-0000-4000-8000-000000008160');

create temporary table feedback_fixture on commit drop as
select * from private.feedback_create(
  row(
    '00000000-0000-4000-8000-000000008101', '00000000-0000-4000-8000-000000008111',
    '00000000-0000-4000-8000-000000008120', '00000000-0000-4000-8000-000000008150',
    '00000000-0000-4000-8000-000000008170'
  )::private.account_context,
  'bug', 'Attachment content', 'Content fixture', true, '{}'::jsonb, 'feedback-content-create'
);

create temporary table attachment_fixture on commit drop as
select * from private.feedback_attachment_intent_create(
  row(
    '00000000-0000-4000-8000-000000008101', '00000000-0000-4000-8000-000000008111',
    '00000000-0000-4000-8000-000000008120', '00000000-0000-4000-8000-000000008150',
    '00000000-0000-4000-8000-000000008171'
  )::private.account_context,
  (select feedback_id from feedback_fixture), 'screen.png', 8, 'image/png', 'feedback-content-intent'
);

select ok(
  (select status = 'pending' and mime_type = 'image/png' and platform_account_id = '00000000-0000-4000-8000-000000008140'
   from private.feedback_attachment_upload_state(
     row(
       '00000000-0000-4000-8000-000000008101', '00000000-0000-4000-8000-000000008111',
       '00000000-0000-4000-8000-000000008120', '00000000-0000-4000-8000-000000008150',
       '00000000-0000-4000-8000-000000008172'
     )::private.account_context,
     (select feedback_id from feedback_fixture),
     (select attachment_id from attachment_fixture)
   )),
  'owner can resolve pending attachment content state through its parent Feedback'
);

select throws_ok(
  format(
    $$select * from private.feedback_attachment_upload_state(
      row('00000000-0000-4000-8000-000000008101','00000000-0000-4000-8000-000000008111','00000000-0000-4000-8000-000000008120','00000000-0000-4000-8000-000000008150','00000000-0000-4000-8000-000000008173')::private.account_context,
      '00000000-0000-4000-8000-000000008199'::uuid, %L::uuid)$$,
    (select attachment_id from attachment_fixture)::text
  ),
  'P0002', 'resource_not_found',
  'attachment cannot be rebound to a different Feedback id'
);

select throws_ok(
  format(
    $$select * from private.feedback_attachment_upload_state(
      row('00000000-0000-4000-8000-000000008102','00000000-0000-4000-8000-000000008112','00000000-0000-4000-8000-000000008120','00000000-0000-4000-8000-000000008150','00000000-0000-4000-8000-000000008174')::private.account_context,
      %L::uuid, %L::uuid)$$,
    (select feedback_id from feedback_fixture)::text,
    (select attachment_id from attachment_fixture)::text
  ),
  'P0002', 'resource_not_found',
  'another platform account cannot resolve the attachment content state'
);

update public.platform_feedback
set status = 'new', submitted_at = now(), row_version = row_version + 1
where id = (select feedback_id from feedback_fixture);

select throws_ok(
  format(
    $$select * from private.feedback_attachment_upload_state(
      row('00000000-0000-4000-8000-000000008101','00000000-0000-4000-8000-000000008111','00000000-0000-4000-8000-000000008120','00000000-0000-4000-8000-000000008150','00000000-0000-4000-8000-000000008175')::private.account_context,
      %L::uuid, %L::uuid)$$,
    (select feedback_id from feedback_fixture)::text,
    (select attachment_id from attachment_fixture)::text
  ),
  'P0002', 'resource_not_found',
  'submitted Feedback no longer exposes its attachment write surface'
);

select * from finish();
rollback;
