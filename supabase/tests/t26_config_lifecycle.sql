begin;

select plan(29);

select has_function('private', 'config_delete_reconcile', array['uuid','timestamptz'], 'Config delete reconciliation helper exists');
select has_function('private', 'config_account_privacy_cleanup', array['uuid','timestamptz','text'], 'Config privacy cleanup helper exists');
select ok(not has_function_privilege('job_executor', 'private.config_account_privacy_cleanup(uuid, timestamptz, text)', 'execute'), 'job executor cannot invoke privacy helper directly');
select ok(has_function_privilege('job_executor', 'private.account_retention_cleanup(private.job_context, uuid, timestamptz, integer)', 'execute'), 'retention worker keeps its domain entrypoint');
select ok(has_function_privilege('job_executor', 'private.deletion_job_step(private.job_context, uuid, bigint, text, text, text)', 'execute'), 'global delete worker keeps its domain entrypoint');
select ok(exists(select 1 from pg_trigger where tgname='platform_configs_delete_reconcile' and not tgisinternal), 'Config deleting trigger exists');
select ok(exists(select 1 from pg_trigger where tgname='platform_config_files_config_delete_reconcile' and not tgisinternal), 'Config Version file reconciliation trigger exists');

insert into auth.users(id,aud,role,email,encrypted_password,created_at,updated_at) values
('00000000-0000-4000-8000-000000007001','authenticated','authenticated','life-a@example.invalid','x',now(),now()),
('00000000-0000-4000-8000-000000007002','authenticated','authenticated','life-global@example.invalid','x',now(),now()),
('00000000-0000-4000-8000-000000007003','authenticated','authenticated','life-retain@example.invalid','x',now(),now());

insert into public.platforms(id,code,name,status,allow_activation)
values('00000000-0000-4000-8000-000000007010','config-life','Config Lifecycle','active',true);
insert into public.platform_accounts(id,platform_id,user_id,status,activated_at,closed_at) values
('00000000-0000-4000-8000-000000007020','00000000-0000-4000-8000-000000007010','00000000-0000-4000-8000-000000007001','active',now(),null),
('00000000-0000-4000-8000-000000007021','00000000-0000-4000-8000-000000007010','00000000-0000-4000-8000-000000007002','closed',now(),now()),
('00000000-0000-4000-8000-000000007022','00000000-0000-4000-8000-000000007010','00000000-0000-4000-8000-000000007003','closed',now(),now()-interval '2 days');

-- A Config with no Versions is immediately terminal once deletion is requested.
insert into public.platform_configs(id,platform_id,platform_account_id,title,description,status)
values('00000000-0000-4000-8000-000000007030','00000000-0000-4000-8000-000000007010','00000000-0000-4000-8000-000000007020','Empty Config','no versions','active');
update public.platform_configs
set status='deleting', delete_requested_at=now()
where id='00000000-0000-4000-8000-000000007030';
select is((select status from public.platform_configs where id='00000000-0000-4000-8000-000000007030'),'deleted','zero-Version Config reconciles immediately');

-- A two-Version Config remains deleting until the last physical file is confirmed deleted.
insert into public.platform_configs(id,platform_id,platform_account_id,title,description,status)
values('00000000-0000-4000-8000-000000007031','00000000-0000-4000-8000-000000007010','00000000-0000-4000-8000-000000007020','Two Version Config','reconcile','active');
insert into public.platform_config_files(
 id,platform_id,platform_account_id,original_name,storage_path,mime_type,purpose,requested_size_bytes,actual_size_bytes,sha256,reserved_bytes,reserved_count,status,intent_expires_at,write_outcome,resource_kind
) values
('00000000-0000-4000-8000-000000007040','00000000-0000-4000-8000-000000007010','00000000-0000-4000-8000-000000007020','v1.json','life/a/v1','application/json','config_version',10,10,repeat('a',64),10,1,'active',now()+interval '1 hour','confirmed','config_version'),
('00000000-0000-4000-8000-000000007041','00000000-0000-4000-8000-000000007010','00000000-0000-4000-8000-000000007020','v2.json','life/a/v2','application/json','config_version',10,10,repeat('b',64),10,1,'active',now()+interval '1 hour','confirmed','config_version');
insert into public.platform_config_versions(id,platform_id,platform_account_id,config_id,file_id,version_number,schema_key,schema_version,changelog) values
('00000000-0000-4000-8000-000000007050','00000000-0000-4000-8000-000000007010','00000000-0000-4000-8000-000000007020','00000000-0000-4000-8000-000000007031','00000000-0000-4000-8000-000000007040',1,'life.schema','1','first'),
('00000000-0000-4000-8000-000000007051','00000000-0000-4000-8000-000000007010','00000000-0000-4000-8000-000000007020','00000000-0000-4000-8000-000000007031','00000000-0000-4000-8000-000000007041',2,'life.schema','2','second');
update public.platform_configs set status='deleting',delete_requested_at=now() where id='00000000-0000-4000-8000-000000007031';
update public.platform_config_files set status='deleted',deleted_at=now(),reserved_bytes=0,reserved_count=0 where id='00000000-0000-4000-8000-000000007040';
select is((select status from public.platform_configs where id='00000000-0000-4000-8000-000000007031'),'deleting','one remaining Version file keeps Config deleting');
update public.platform_config_files set status='deleted',deleted_at=now(),reserved_bytes=0,reserved_count=0 where id='00000000-0000-4000-8000-000000007041';
select is((select status from public.platform_configs where id='00000000-0000-4000-8000-000000007031'),'deleted','last Version file deletion reconciles Config deleted');

-- Global Delete fixture: approved Gallery entry, pending re-review, like and usage facts.
insert into public.platform_configs(id,platform_id,platform_account_id,title,description,status)
values('00000000-0000-4000-8000-000000007060','00000000-0000-4000-8000-000000007010','00000000-0000-4000-8000-000000007021','Personal Global Title','personal global description','active');
insert into public.platform_config_files(
 id,platform_id,platform_account_id,original_name,storage_path,mime_type,purpose,requested_size_bytes,actual_size_bytes,sha256,reserved_bytes,reserved_count,status,intent_expires_at,write_outcome,resource_kind
) values('00000000-0000-4000-8000-000000007061','00000000-0000-4000-8000-000000007010','00000000-0000-4000-8000-000000007021','global.json','life/global/v1','application/json','config_version',20,20,repeat('c',64),20,1,'active',now()+interval '1 hour','confirmed','config_version');
insert into public.platform_config_versions(id,platform_id,platform_account_id,config_id,file_id,version_number,schema_key,schema_version,changelog)
values('00000000-0000-4000-8000-000000007062','00000000-0000-4000-8000-000000007010','00000000-0000-4000-8000-000000007021','00000000-0000-4000-8000-000000007060','00000000-0000-4000-8000-000000007061',1,'personal.global.schema','person-v1','personal changelog');
insert into public.platform_config_gallery_submissions(id,platform_id,config_id,version_id,submitted_by_account_id,status,reviewed_at)
values('00000000-0000-4000-8000-000000007063','00000000-0000-4000-8000-000000007010','00000000-0000-4000-8000-000000007060','00000000-0000-4000-8000-000000007062','00000000-0000-4000-8000-000000007021','approved',now());
insert into public.platform_config_gallery_entries(config_id,platform_id,published_version_id,approved_submission_id,status,approved_at)
values('00000000-0000-4000-8000-000000007060','00000000-0000-4000-8000-000000007010','00000000-0000-4000-8000-000000007062','00000000-0000-4000-8000-000000007063','approved',now());
insert into public.platform_config_gallery_submissions(id,platform_id,config_id,version_id,submitted_by_account_id,status)
values('00000000-0000-4000-8000-000000007064','00000000-0000-4000-8000-000000007010','00000000-0000-4000-8000-000000007060','00000000-0000-4000-8000-000000007062','00000000-0000-4000-8000-000000007021','pending');
insert into public.platform_config_likes(platform_id,config_id,platform_account_id)
values('00000000-0000-4000-8000-000000007010','00000000-0000-4000-8000-000000007060','00000000-0000-4000-8000-000000007021');
insert into public.platform_config_usage_events(id,platform_id,config_id,version_id,actor_platform_account_id,event_type,event_key)
values('00000000-0000-4000-8000-000000007065','00000000-0000-4000-8000-000000007010','00000000-0000-4000-8000-000000007060','00000000-0000-4000-8000-000000007062','00000000-0000-4000-8000-000000007021','download_completed','global-use');
insert into private.deletion_requests(id,user_id,request_session_id,state,requested_at,approved_at)
values('00000000-0000-4000-8000-000000007070','00000000-0000-4000-8000-000000007002','00000000-0000-4000-8000-000000007071','approved',now(),now());
insert into private.deletion_jobs(id,request_id,user_id,state,checkpoint,fence,next_attempt_at)
values('00000000-0000-4000-8000-000000007072','00000000-0000-4000-8000-000000007070','00000000-0000-4000-8000-000000007002','running','accounts_closed',7,now());
insert into private.job_leases(job_kind,resource_id,lease_owner,lease_until,fencing_token)
values('global_delete','00000000-0000-4000-8000-000000007072','phase04-global',now()+interval '1 hour',7);
create temporary table global_files_blocked on commit drop as
select * from private.deletion_job_step(
  row('00000000-0000-4000-8000-000000007072','phase04-global',7,'00000000-0000-4000-8000-000000007073')::private.job_context,
  '00000000-0000-4000-8000-000000007072',7,'files_blocked','completed',null
);
select is((select checkpoint from global_files_blocked),'files_blocked','Global Delete advances through real files_blocked checkpoint');
select is((select status from public.platform_config_gallery_entries where config_id='00000000-0000-4000-8000-000000007060'),'removed','Global Delete immediately removes authored Gallery entry');
select is((select status from public.platform_config_gallery_submissions where id='00000000-0000-4000-8000-000000007064'),'cancelled','Global Delete cancels pending Config review');
select is((select status from public.platform_configs where id='00000000-0000-4000-8000-000000007060'),'deleting','Global Delete moves personal Config into deleting');
select ok((select title='[deleted]' and description is null from public.platform_configs where id='00000000-0000-4000-8000-000000007060'),'Global Delete minimizes Config user text');
select ok((select schema_key='deleted' and schema_version='0' and changelog is null from public.platform_config_versions where id='00000000-0000-4000-8000-000000007062'),'Global Delete minimizes immutable Version user text only for privacy lifecycle');
select is((select count(*)::integer from public.platform_config_likes where platform_account_id='00000000-0000-4000-8000-000000007021'),0,'Global Delete removes target account liker relations');
select is((select actor_platform_account_id from public.platform_config_usage_events where id='00000000-0000-4000-8000-000000007065'),null::uuid,'Global Delete anonymizes Usage actor');
select is((select count(*)::integer from public.platform_config_usage_events where id='00000000-0000-4000-8000-000000007065'),1,'Global Delete retains non-personal Usage fact');
select is((select status from public.platform_config_files where id='00000000-0000-4000-8000-000000007061'),'deleting','Global Delete leaves physical removal to file cleanup state machine');

insert into private.file_backup_barriers(id,scope,recovery_set_id,state,started_at,deadline_at)
values('00000000-0000-4000-8000-000000007074','global','phase04-config-recovery','active',now(),now()+interval '1 hour');
select is(
  (select action from private.file_cleanup_claim(
    row('00000000-0000-4000-8000-000000007075','phase04-file-worker',1,'00000000-0000-4000-8000-000000007076')::private.job_context,
    '00000000-0000-4000-8000-000000007061',60
  )),
  'backup_barrier',
  'existing backup barrier blocks Config Version physical deletion'
);
delete from private.file_backup_barriers where id='00000000-0000-4000-8000-000000007074';

-- Retention uses the same privacy minimization but keeps its explicit legal-policy gate.
insert into public.platform_configs(id,platform_id,platform_account_id,title,description,status)
values('00000000-0000-4000-8000-000000007080','00000000-0000-4000-8000-000000007010','00000000-0000-4000-8000-000000007022','Personal Retention Title','personal retention description','active');
insert into public.platform_config_files(
 id,platform_id,platform_account_id,original_name,storage_path,mime_type,purpose,requested_size_bytes,actual_size_bytes,sha256,reserved_bytes,reserved_count,status,intent_expires_at,write_outcome,resource_kind
) values('00000000-0000-4000-8000-000000007081','00000000-0000-4000-8000-000000007010','00000000-0000-4000-8000-000000007022','retain.json','life/retain/v1','application/json','config_version',30,30,repeat('d',64),30,1,'active',now()+interval '1 hour','confirmed','config_version');
insert into public.platform_config_versions(id,platform_id,platform_account_id,config_id,file_id,version_number,schema_key,schema_version,changelog)
values('00000000-0000-4000-8000-000000007082','00000000-0000-4000-8000-000000007010','00000000-0000-4000-8000-000000007022','00000000-0000-4000-8000-000000007080','00000000-0000-4000-8000-000000007081',1,'personal.retain.schema','private-v1','retention personal changelog');
insert into public.platform_config_gallery_submissions(id,platform_id,config_id,version_id,submitted_by_account_id,status,reviewed_at)
values('00000000-0000-4000-8000-000000007083','00000000-0000-4000-8000-000000007010','00000000-0000-4000-8000-000000007080','00000000-0000-4000-8000-000000007082','00000000-0000-4000-8000-000000007022','approved',now());
insert into public.platform_config_gallery_entries(config_id,platform_id,published_version_id,approved_submission_id,status,approved_at)
values('00000000-0000-4000-8000-000000007080','00000000-0000-4000-8000-000000007010','00000000-0000-4000-8000-000000007082','00000000-0000-4000-8000-000000007083','approved',now());
insert into public.platform_config_likes(platform_id,config_id,platform_account_id)
values('00000000-0000-4000-8000-000000007010','00000000-0000-4000-8000-000000007080','00000000-0000-4000-8000-000000007022');
insert into public.platform_config_usage_events(id,platform_id,config_id,version_id,actor_platform_account_id,event_type,event_key)
values('00000000-0000-4000-8000-000000007084','00000000-0000-4000-8000-000000007010','00000000-0000-4000-8000-000000007080','00000000-0000-4000-8000-000000007082','00000000-0000-4000-8000-000000007022','apply_delivery_completed','retain-use');
delete from private.account_retention_policy;
insert into private.account_retention_policy(personal_data_retention_days,policy_source,policy_reference)
values(1,'phase04-test','OPT-007 lifecycle regression');
create temporary table retention_result on commit drop as
select * from private.account_retention_cleanup(
  row('00000000-0000-4000-8000-000000007085','phase04-retention',1,'00000000-0000-4000-8000-000000007086')::private.job_context,
  '00000000-0000-4000-8000-000000007022',null,60
);
select is((select action from retention_result),'cleaned','retention executes real Config privacy cleanup');
select ok((select user_id is null and anonymized_at is not null from public.platform_accounts where id='00000000-0000-4000-8000-000000007022'),'retention detaches global identity after Config cleanup');
select is((select status from public.platform_configs where id='00000000-0000-4000-8000-000000007080'),'deleting','retention leaves Config deleting while its Version file remains');
select ok((select title='[deleted]' and description is null from public.platform_configs where id='00000000-0000-4000-8000-000000007080'),'retention minimizes Config user text');
select is((select status from public.platform_config_gallery_entries where config_id='00000000-0000-4000-8000-000000007080'),'removed','retention removes authored Gallery visibility');
select is((select count(*)::integer from public.platform_config_likes where platform_account_id='00000000-0000-4000-8000-000000007022'),0,'retention removes target liker relations');
select ok((select actor_platform_account_id is null from public.platform_config_usage_events where id='00000000-0000-4000-8000-000000007084') and (select count(*)=1 from public.platform_config_usage_events where id='00000000-0000-4000-8000-000000007084'),'retention anonymizes Usage actor but retains Usage fact');
select ok((select status='deleting' from public.platform_config_files where id='00000000-0000-4000-8000-000000007081') and (select schema_key='deleted' and schema_version='0' and changelog is null from public.platform_config_versions where id='00000000-0000-4000-8000-000000007082'),'retention preserves physical deletion workflow while minimizing Version text');

select * from finish();
rollback;