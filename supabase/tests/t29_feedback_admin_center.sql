begin;

select plan(36);

select has_function('private','admin_feedback_list',array['private.admin_context','uuid','uuid','integer','text','text','text','text','text','text','boolean','timestamptz','timestamptz'],'Admin Feedback list exists');
select has_function('private','admin_feedback_read',array['private.admin_context','uuid','uuid'],'Admin Feedback detail exists');
select has_function('private','admin_feedback_status_update',array['private.admin_context','uuid','uuid','bigint','text','text'],'Admin Feedback status mutation exists');
select has_function('private','admin_feedback_batch_delete',array['private.admin_context','uuid','uuid[]','text','uuid'],'Admin Feedback batch delete exists');
select ok(has_function_privilege('admin_executor','private.admin_feedback_list(private.admin_context, uuid, uuid, integer, text, text, text, text, text, text, boolean, timestamptz, timestamptz)','execute'),'admin executor can list Feedback');
select ok(not has_function_privilege('account_executor','private.admin_feedback_read(private.admin_context, uuid, uuid)','execute'),'account executor cannot invoke Admin Feedback detail');
select ok((select prosecdef and array_to_string(proconfig,',') like 'search_path=pg_catalog%' from pg_proc where oid='private.admin_feedback_list(private.admin_context, uuid, uuid, integer, text, text, text, text, text, text, boolean, timestamptz, timestamptz)'::regprocedure),'Admin Feedback list is pinned security definer');
select ok((select pg_get_function_result('private.admin_platform_overview(private.admin_context, uuid, integer)'::regprocedure) like '%pending_feedback%'),'Overview exposes authoritative pending Feedback');
select ok(to_regclass('public.platform_feedback_admin_sort_idx') is not null,'Admin Feedback stable-sort index exists');
select ok(to_regclass('public.platform_feedback_contact_email_idx') is not null,'Admin Feedback email filter index exists');

insert into auth.users(id,aud,role,email,encrypted_password,created_at,updated_at)
values
 ('00000000-0000-4000-8000-000000008300','authenticated','authenticated','feedback-admin@example.invalid','x',now(),now()),
 ('00000000-0000-4000-8000-000000008301','authenticated','authenticated','owner@example.invalid','x',now(),now()),
 ('00000000-0000-4000-8000-000000008302','authenticated','authenticated','other@example.invalid','x',now(),now());
insert into auth.sessions(id,user_id,created_at,updated_at,not_after)
values ('00000000-0000-4000-8000-000000008310','00000000-0000-4000-8000-000000008300',now(),now(),now()+interval '1 hour');
insert into private.system_admin(user_id) values('00000000-0000-4000-8000-000000008300')
on conflict(singleton_id) do update set user_id=excluded.user_id;
insert into public.platforms(id,code,name,status,allow_activation)
values
 ('00000000-0000-4000-8000-000000008320','feedback-admin-main','Feedback Admin Main','active',true),
 ('00000000-0000-4000-8000-000000008321','feedback-admin-other','Feedback Admin Other','active',true);
insert into public.platform_accounts(id,platform_id,user_id,status,activated_at)
values
 ('00000000-0000-4000-8000-000000008330','00000000-0000-4000-8000-000000008320','00000000-0000-4000-8000-000000008301','active',now()),
 ('00000000-0000-4000-8000-000000008331','00000000-0000-4000-8000-000000008320','00000000-0000-4000-8000-000000008302','active',now());
insert into public.platform_feedback(
 id,platform_id,platform_account_id,user_id,author_display_name_snapshot,contact_allowed,contact_email_snapshot,
 category,title,body,status,flagged,client_context,row_version,submitted_at,created_at,updated_at
) values
 ('00000000-0000-4000-8000-000000008340','00000000-0000-4000-8000-000000008320','00000000-0000-4000-8000-000000008330','00000000-0000-4000-8000-000000008301','Owner',true,'owner@example.invalid','bug','Upload broken','The upload button fails on mobile','new',false,'{"route":"/upload"}'::jsonb,1,now()-interval '2 minutes',now()-interval '2 minutes',now()-interval '2 minutes'),
 ('00000000-0000-4000-8000-000000008341','00000000-0000-4000-8000-000000008320','00000000-0000-4000-8000-000000008331','00000000-0000-4000-8000-000000008302','Other',false,'other@example.invalid','idea','Dark mode','Please add dark mode','reviewing',true,'{}'::jsonb,1,now()-interval '3 minutes',now()-interval '3 minutes',now()-interval '3 minutes');
insert into public.platform_feedback_labels(platform_id,feedback_id,label)
values ('00000000-0000-4000-8000-000000008320','00000000-0000-4000-8000-000000008340','mobile');
insert into public.platform_feedback_events(id,platform_id,feedback_id,event_type,actor_user_id,metadata,created_at)
values ('00000000-0000-4000-8000-000000008350','00000000-0000-4000-8000-000000008320','00000000-0000-4000-8000-000000008340','submitted','00000000-0000-4000-8000-000000008301','{}'::jsonb,now()-interval '2 minutes');
insert into public.platform_feedback_attachments(
 id,feedback_id,platform_id,platform_account_id,original_name,storage_path,object_path_hash,mime_type,
 requested_size_bytes,actual_size_bytes,sha256,status,write_outcome,intent_expires_at,uploaded_at
) values (
 '00000000-0000-4000-8000-000000008360','00000000-0000-4000-8000-000000008340','00000000-0000-4000-8000-000000008320','00000000-0000-4000-8000-000000008330',
 'screen.png','feedback/admin/screen',repeat('a',64),'image/png',100,100,repeat('b',64),'active','confirmed',now()+interval '1 hour',now()
);

set local role admin_executor;
create temporary table feedback_filtered on commit drop as
select * from private.admin_feedback_list(
 row('00000000-0000-4000-8000-000000008300','00000000-0000-4000-8000-000000008310','00000000-0000-4000-8000-000000008370')::private.admin_context,
 '00000000-0000-4000-8000-000000008320',null,20,'upload','new','bug','mobile','Owner','owner@',true,null,null
);
create temporary table feedback_detail on commit drop as
select * from private.admin_feedback_read(
 row('00000000-0000-4000-8000-000000008300','00000000-0000-4000-8000-000000008310','00000000-0000-4000-8000-000000008371')::private.admin_context,
 '00000000-0000-4000-8000-000000008320','00000000-0000-4000-8000-000000008340'
);
create temporary table attachment_auth on commit drop as
select * from private.admin_feedback_attachment_download_authorize(
 row('00000000-0000-4000-8000-000000008300','00000000-0000-4000-8000-000000008310','00000000-0000-4000-8000-000000008372')::private.admin_context,
 '00000000-0000-4000-8000-000000008320','00000000-0000-4000-8000-000000008340','00000000-0000-4000-8000-000000008360'
);
set local role postgres;
select is((select count(*)::integer from feedback_filtered),1,'Admin filters apply before pagination and stay platform-scoped');
select is((select feedback_id from feedback_filtered),'00000000-0000-4000-8000-000000008340'::uuid,'filter returns the matching Feedback');
select ok((select labels=array['mobile']::text[] and attachment_count=1 from feedback_filtered),'list projects labels and attachment count centrally');
select ok((select jsonb_array_length(attachments)=1 and jsonb_array_length(timeline)=1 from feedback_detail),'detail projects protected attachments and timeline');
select is((select contact_email from feedback_detail),'owner@example.invalid','detail returns trusted contact snapshot');
select is((select storage_bucket from attachment_auth),'platform-feedback-attachments','attachment authorization targets dedicated private bucket');

select throws_ok(
 $$select * from private.admin_feedback_read(row('00000000-0000-4000-8000-000000008300','00000000-0000-4000-8000-000000008310','00000000-0000-4000-8000-000000008373')::private.admin_context,'00000000-0000-4000-8000-000000008321','00000000-0000-4000-8000-000000008340')$$,
 'P0002','resource_not_found','Admin Feedback detail rejects cross-platform IDOR'
);
select throws_ok(
 $$select * from private.admin_feedback_status_update(row('00000000-0000-4000-8000-000000008300','00000000-0000-4000-8000-000000008310','00000000-0000-4000-8000-000000008374')::private.admin_context,'00000000-0000-4000-8000-000000008320','00000000-0000-4000-8000-000000008340',99,'reviewing','stale')$$,
 '40001','precondition_failed','stale status update fails closed'
);

set local role admin_executor;
create temporary table status_updated on commit drop as
select * from private.admin_feedback_status_update(
 row('00000000-0000-4000-8000-000000008300','00000000-0000-4000-8000-000000008310','00000000-0000-4000-8000-000000008375')::private.admin_context,
 '00000000-0000-4000-8000-000000008320','00000000-0000-4000-8000-000000008340',1,'reviewing','triage started'
);
create temporary table labels_updated on commit drop as
select * from private.admin_feedback_labels_replace(
 row('00000000-0000-4000-8000-000000008300','00000000-0000-4000-8000-000000008310','00000000-0000-4000-8000-000000008376')::private.admin_context,
 '00000000-0000-4000-8000-000000008320','00000000-0000-4000-8000-000000008340',2,array['Mobile','urgent','mobile']
);
create temporary table flag_updated on commit drop as
select * from private.admin_feedback_flag_update(
 row('00000000-0000-4000-8000-000000008300','00000000-0000-4000-8000-000000008310','00000000-0000-4000-8000-000000008377')::private.admin_context,
 '00000000-0000-4000-8000-000000008320','00000000-0000-4000-8000-000000008340',3,true,'needs attention'
);
create temporary table note_added on commit drop as
select * from private.admin_feedback_note_add(
 row('00000000-0000-4000-8000-000000008300','00000000-0000-4000-8000-000000008310','00000000-0000-4000-8000-000000008378')::private.admin_context,
 '00000000-0000-4000-8000-000000008320','00000000-0000-4000-8000-000000008340','Internal follow-up only'
);
set local role postgres;
select ok((select status='reviewing' and row_version=2 from status_updated),'status mutation advances state and version');
select ok((select labels=array['mobile','urgent']::text[] and row_version=3 from labels_updated),'labels normalize/deduplicate and advance version');
select ok((select flagged and row_version=4 from flag_updated),'flag mutation advances version');
select ok((select event_id is not null from note_added),'internal note is append-only timeline event');
select is((select note_body from public.platform_feedback_events where id=(select event_id from note_added)),'Internal follow-up only','internal note stays in protected timeline');
select ok((select metadata = '{}'::jsonb from public.audit_logs where event_type='feedback.note_added' and target_id='00000000-0000-4000-8000-000000008340' order by created_at desc limit 1),'audit log does not copy internal note body');

set local role admin_executor;
create temporary table overview_feedback on commit drop as
select * from private.admin_platform_overview(
 row('00000000-0000-4000-8000-000000008300','00000000-0000-4000-8000-000000008310','00000000-0000-4000-8000-000000008379')::private.admin_context,
 '00000000-0000-4000-8000-000000008320',30
);
create temporary table export_rows on commit drop as
select * from private.admin_feedback_export_rows(
 row('00000000-0000-4000-8000-000000008300','00000000-0000-4000-8000-000000008310','00000000-0000-4000-8000-000000008380')::private.admin_context,
 '00000000-0000-4000-8000-000000008320',array['00000000-0000-4000-8000-000000008340'::uuid],null,null,null,null,null,null,null,null,null,5001
);
set local role postgres;
select is((select pending_feedback from overview_feedback),2::bigint,'Overview pending Feedback is new + reviewing from authoritative facts');
select is((select count(*)::integer from export_rows),1,'selected export is server-side and not limited to current page');
select is((select body from export_rows),'The upload button fails on mobile','export row includes full Feedback body only in protected Admin boundary');

set local role admin_executor;
create temporary table deleted_batch on commit drop as
select * from private.admin_feedback_batch_delete(
 row('00000000-0000-4000-8000-000000008300','00000000-0000-4000-8000-000000008310','00000000-0000-4000-8000-000000008381')::private.admin_context,
 '00000000-0000-4000-8000-000000008320',array['00000000-0000-4000-8000-000000008341'::uuid],'duplicate report','00000000-0000-4000-8000-000000008382'
);
set local role postgres;
create temporary table deleted_batch_baseline on commit drop as
select row_version
from public.platform_feedback
where id='00000000-0000-4000-8000-000000008341';
set local role admin_executor;
create temporary table deleted_batch_replay on commit drop as
select * from private.admin_feedback_batch_delete(
 row('00000000-0000-4000-8000-000000008300','00000000-0000-4000-8000-000000008310','00000000-0000-4000-8000-000000008384')::private.admin_context,
 '00000000-0000-4000-8000-000000008320',array['00000000-0000-4000-8000-000000008341'::uuid],'duplicate report','00000000-0000-4000-8000-000000008382'
);
set local role postgres;
select is((select status from deleted_batch),'deleted','zero-attachment Admin delete reaches terminal deleted through shared lifecycle');
select is((select status from deleted_batch_replay),'deleted','same operation id safely replays the cached batch result');
select is((select row_version from public.platform_feedback where id='00000000-0000-4000-8000-000000008341'),(select row_version from deleted_batch_baseline),'idempotent replay does not increment Feedback row_version again');
select is((select count(*)::integer from public.platform_feedback_events where feedback_id='00000000-0000-4000-8000-000000008341' and event_type='delete_requested'),1,'idempotent replay does not append delete_requested twice');
select is((select count(*)::integer from public.audit_logs where event_type='feedback.batch_delete_requested' and metadata->>'operation_id'='00000000-0000-4000-8000-000000008382'),1,'idempotent replay does not append batch audit twice');
select throws_ok(
 $$select * from private.admin_feedback_batch_delete(row('00000000-0000-4000-8000-000000008300','00000000-0000-4000-8000-000000008310','00000000-0000-4000-8000-000000008385')::private.admin_context,'00000000-0000-4000-8000-000000008320',array['00000000-0000-4000-8000-000000008341'::uuid],'changed reason','00000000-0000-4000-8000-000000008382')$$,
 '23505','idempotency_conflict','same operation id with a different request hash is rejected'
);
select ok((select title is null and body is null and contact_email_snapshot is null and platform_account_id is null and user_id is null from public.platform_feedback where id='00000000-0000-4000-8000-000000008341'),'Admin batch delete immediately minimizes personal Feedback data');
select ok((select metadata->>'operation_id'='00000000-0000-4000-8000-000000008382' from public.audit_logs where event_type='feedback.batch_delete_requested' order by created_at desc limit 1),'batch delete audit records operation id without Feedback content');
select throws_ok(
 $$select * from private.admin_feedback_attachment_download_authorize(row('00000000-0000-4000-8000-000000008300','00000000-0000-4000-8000-000000008310','00000000-0000-4000-8000-000000008383')::private.admin_context,'00000000-0000-4000-8000-000000008321','00000000-0000-4000-8000-000000008340','00000000-0000-4000-8000-000000008360')$$,
 'P0002','resource_not_found','attachment authorization rejects cross-platform scope'
);

select * from finish();
rollback;
