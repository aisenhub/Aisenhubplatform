begin;

select plan(21);

select ok(
  not has_function_privilege('job_executor', 'private.feedback_privacy_delete(uuid, text, timestamptz)', 'execute'),
  'job executor cannot invoke Feedback privacy helper directly'
);
select ok(
  has_function_privilege('job_executor', 'private.account_retention_cleanup(private.job_context, uuid, timestamptz, integer)', 'execute'),
  'retention worker keeps its domain entrypoint'
);
select ok(
  has_function_privilege('job_executor', 'private.deletion_job_step(private.job_context, uuid, bigint, text, text, text)', 'execute'),
  'Global Delete worker keeps its domain entrypoint'
);

insert into auth.users(id,aud,role,email,encrypted_password,created_at,updated_at) values
('00000000-0000-4000-8000-000000008501','authenticated','authenticated','feedback-global@example.invalid','x',now(),now()),
('00000000-0000-4000-8000-000000008502','authenticated','authenticated','feedback-retain@example.invalid','x',now(),now());

insert into public.platforms(id,code,name,status,allow_activation)
values('00000000-0000-4000-8000-000000008510','feedback-life','Feedback Lifecycle','active',true);
insert into public.platform_accounts(id,platform_id,user_id,status,activated_at,closed_at) values
('00000000-0000-4000-8000-000000008520','00000000-0000-4000-8000-000000008510','00000000-0000-4000-8000-000000008501','closed',now(),now()),
('00000000-0000-4000-8000-000000008521','00000000-0000-4000-8000-000000008510','00000000-0000-4000-8000-000000008502','closed',now(),now()-interval '2 days');

insert into public.platform_feedback(
  id,platform_id,platform_account_id,user_id,author_display_name_snapshot,
  contact_allowed,contact_email_snapshot,category,title,body,status,client_context,submitted_at
) values(
  '00000000-0000-4000-8000-000000008530','00000000-0000-4000-8000-000000008510',
  '00000000-0000-4000-8000-000000008520','00000000-0000-4000-8000-000000008501','Global Feedback User',
  true,'feedback-global@example.invalid','bug','Sensitive global title','Sensitive global body','new',
  '{"route":"/private"}'::jsonb,now()
);
insert into public.platform_feedback_labels(platform_id,feedback_id,label)
values('00000000-0000-4000-8000-000000008510','00000000-0000-4000-8000-000000008530','private-label');
insert into public.platform_feedback_events(id,platform_id,feedback_id,event_type,note_body,metadata)
values('00000000-0000-4000-8000-000000008531','00000000-0000-4000-8000-000000008510',
  '00000000-0000-4000-8000-000000008530','note_added','private note','{"private":"metadata"}'::jsonb);
insert into public.platform_feedback_attachments(
  id,feedback_id,platform_id,platform_account_id,original_name,storage_path,object_path_hash,mime_type,
  requested_size_bytes,actual_size_bytes,sha256,status,write_outcome,intent_expires_at
) values(
  '00000000-0000-4000-8000-000000008532','00000000-0000-4000-8000-000000008530',
  '00000000-0000-4000-8000-000000008510','00000000-0000-4000-8000-000000008520','private-name.png',
  'feedback-life/global/object',repeat('a',64),'image/png',12,12,repeat('b',64),'active','confirmed',now()+interval '1 hour'
);

insert into private.deletion_requests(id,user_id,request_session_id,state,requested_at,approved_at)
values('00000000-0000-4000-8000-000000008540','00000000-0000-4000-8000-000000008501',
  '00000000-0000-4000-8000-000000008541','approved',now(),now());
insert into private.deletion_jobs(id,request_id,user_id,state,checkpoint,fence,next_attempt_at)
values('00000000-0000-4000-8000-000000008542','00000000-0000-4000-8000-000000008540',
  '00000000-0000-4000-8000-000000008501','running','accounts_closed',9,now());
insert into private.job_leases(job_kind,resource_id,lease_owner,lease_until,fencing_token)
values('global_delete','00000000-0000-4000-8000-000000008542','feedback-global-worker',now()+interval '1 hour',9);

create temporary table feedback_global_step on commit drop as
select * from private.deletion_job_step(
  row('00000000-0000-4000-8000-000000008542','feedback-global-worker',9,'00000000-0000-4000-8000-000000008543')::private.job_context,
  '00000000-0000-4000-8000-000000008542',9,'files_blocked','completed',null
);
select is((select checkpoint from feedback_global_step),'files_blocked','Global Delete advances through the real files_blocked checkpoint');
select is((select status from public.platform_feedback where id='00000000-0000-4000-8000-000000008530'),'deleting','Global Delete moves Feedback to deleting');
select ok((select title is null and body is null and contact_email_snapshot is null and author_display_name_snapshot is null
  and contact_allowed=false and client_context='{}'::jsonb from public.platform_feedback where id='00000000-0000-4000-8000-000000008530'),
  'Global Delete immediately minimizes Feedback personal content');
select is((select count(*)::integer from public.platform_feedback_labels where feedback_id='00000000-0000-4000-8000-000000008530'),0,
  'Global Delete removes Feedback labels');
select ok((select note_body is null and metadata='{}'::jsonb from public.platform_feedback_events where id='00000000-0000-4000-8000-000000008531'),
  'Global Delete clears internal note content');
select ok((select status='deleting' and original_name='[deleting]' from public.platform_feedback_attachments where id='00000000-0000-4000-8000-000000008532'),
  'Global Delete queues attachment cleanup and minimizes original filename');

insert into private.file_backup_barriers(id,scope,recovery_set_id,state,started_at,deadline_at)
values('00000000-0000-4000-8000-000000008544','global','feedback-lifecycle-recovery','active',now(),now()+interval '1 hour');
select is((select action from private.feedback_attachment_cleanup_claim(
  row('00000000-0000-4000-8000-000000008545','feedback-cleanup-worker',1,'00000000-0000-4000-8000-000000008546')::private.job_context,
  '00000000-0000-4000-8000-000000008532',60)), 'backup_barrier',
  'backup barrier blocks Feedback attachment physical deletion');
delete from private.file_backup_barriers where id='00000000-0000-4000-8000-000000008544';

create temporary table feedback_cleanup_claim on commit drop as
select * from private.feedback_attachment_cleanup_claim(
  row('00000000-0000-4000-8000-000000008547','feedback-cleanup-worker',1,'00000000-0000-4000-8000-000000008548')::private.job_context,
  '00000000-0000-4000-8000-000000008532',60
);
select is((select action from feedback_cleanup_claim),'remove','confirmed Feedback attachment is removable after barrier clears');
create temporary table feedback_cleanup_fail on commit drop as
select * from private.feedback_attachment_cleanup_finish(
  row('00000000-0000-4000-8000-000000008549','feedback-cleanup-worker',1,'00000000-0000-4000-8000-000000008550')::private.job_context,
  '00000000-0000-4000-8000-000000008532',(select fencing_token from feedback_cleanup_claim),'failed','STORAGE_REMOVE_FAILED'
);
select ok((select status='deleting' and retry_count=1 and next_attempt_at > clock_timestamp()
  from feedback_cleanup_fail),'failed Storage removal remains retryable');
update public.platform_feedback_attachments set next_attempt_at=clock_timestamp() where id='00000000-0000-4000-8000-000000008532';
create temporary table feedback_cleanup_retry on commit drop as
select * from private.feedback_attachment_cleanup_claim(
  row('00000000-0000-4000-8000-000000008551','feedback-cleanup-worker',1,'00000000-0000-4000-8000-000000008552')::private.job_context,
  '00000000-0000-4000-8000-000000008532',60
);
create temporary table feedback_cleanup_done on commit drop as
select * from private.feedback_attachment_cleanup_finish(
  row('00000000-0000-4000-8000-000000008553','feedback-cleanup-worker',1,'00000000-0000-4000-8000-000000008554')::private.job_context,
  '00000000-0000-4000-8000-000000008532',(select fencing_token from feedback_cleanup_retry),'removed',null
);
select is((select status from feedback_cleanup_done),'deleted','retry can confirm physical attachment deletion');
select is((select status from public.platform_feedback where id='00000000-0000-4000-8000-000000008530'),'deleted','last attachment deletion reconciles Feedback deleted');
select ok((select platform_account_id is null and user_id is null from public.platform_feedback where id='00000000-0000-4000-8000-000000008530'),
  'deleted Feedback detaches account and identity references');

insert into public.platform_feedback(
  id,platform_id,platform_account_id,user_id,author_display_name_snapshot,
  contact_allowed,contact_email_snapshot,category,title,body,status,client_context,submitted_at
) values(
  '00000000-0000-4000-8000-000000008560','00000000-0000-4000-8000-000000008510',
  '00000000-0000-4000-8000-000000008521','00000000-0000-4000-8000-000000008502','Retention Feedback User',
  true,'feedback-retain@example.invalid','experience','Sensitive retention title','Sensitive retention body','closed',
  '{"route":"/retention"}'::jsonb,now()-interval '2 days'
);
insert into public.platform_feedback_labels(platform_id,feedback_id,label)
values('00000000-0000-4000-8000-000000008510','00000000-0000-4000-8000-000000008560','retention-label');
insert into public.platform_feedback_events(id,platform_id,feedback_id,event_type,note_body,metadata)
values('00000000-0000-4000-8000-000000008561','00000000-0000-4000-8000-000000008510',
  '00000000-0000-4000-8000-000000008560','note_added','retention private note','{"private":"retention"}'::jsonb);
delete from private.account_retention_policy;
insert into private.account_retention_policy(personal_data_retention_days,policy_source,policy_reference)
values(1,'feedback-phase04-test','OPT-008 lifecycle regression');
create temporary table feedback_retention on commit drop as
select * from private.account_retention_cleanup(
  row('00000000-0000-4000-8000-000000008562','feedback-retention-worker',1,'00000000-0000-4000-8000-000000008563')::private.job_context,
  '00000000-0000-4000-8000-000000008521',null,60
);
select is((select action from feedback_retention),'cleaned','retention executes the real Feedback privacy cleanup path');
select is((select status from public.platform_feedback where id='00000000-0000-4000-8000-000000008560'),'deleted','text-only Feedback terminalizes during retention');
select ok((select platform_account_id is null and user_id is null and title is null and body is null and contact_email_snapshot is null
  from public.platform_feedback where id='00000000-0000-4000-8000-000000008560'),'retention minimizes Feedback and detaches identity references');
select is((select count(*)::integer from public.platform_feedback_labels where feedback_id='00000000-0000-4000-8000-000000008560'),0,'retention removes Feedback labels');
select ok((select note_body is null and metadata='{}'::jsonb from public.platform_feedback_events where id='00000000-0000-4000-8000-000000008561'),
  'retention clears Feedback internal note content');
select ok((select user_id is null and anonymized_at is not null from public.platform_accounts where id='00000000-0000-4000-8000-000000008521'),
  'retention still detaches the platform account global identity');

select * from finish();
rollback;
