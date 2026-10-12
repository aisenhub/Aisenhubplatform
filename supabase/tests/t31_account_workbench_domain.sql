begin;

select plan(52);

select has_table('public','platform_account_admin_tags','Account support tags table exists');
select has_table('public','platform_account_admin_notes','Account support notes table exists');
select has_table('public','platform_account_governance_events','Account governance events table exists');
select ok(exists(select 1 from pg_indexes where schemaname='public' and tablename='platform_account_admin_tags' and indexname='platform_account_admin_tags_created_by_idx'),'Support tags created-by FK has covering index');
select ok(exists(select 1 from pg_indexes where schemaname='public' and tablename='platform_account_admin_notes' and indexname='platform_account_admin_notes_created_by_idx'),'Support notes created-by FK has covering index');
select ok(exists(select 1 from pg_indexes where schemaname='public' and tablename='platform_account_governance_events' and indexname='platform_account_governance_events_actor_admin_user_idx'),'Governance actor FK has covering index');
select has_function('private','admin_account_list_v3',array['private.admin_context','uuid','uuid','integer','text','text','uuid','text','text','timestamptz','timestamptz'],'Account list v3 exists');
select has_function('private','admin_account_workbench_read',array['private.admin_context','uuid','uuid'],'Account 360 read exists');
select has_function('private','admin_account_transition_v2',array['private.admin_context','uuid','uuid','text','text'],'Reasoned account transition exists');
select ok(has_function_privilege('admin_executor','private.admin_account_list_v3(private.admin_context, uuid, uuid, integer, text, text, uuid, text, text, timestamptz, timestamptz)','execute'),'Admin executor can invoke list v3');
select ok(not has_function_privilege('account_executor','private.admin_account_workbench_read(private.admin_context, uuid, uuid)','execute'),'Account executor cannot read Admin Account 360');
select ok(not has_function_privilege('job_executor','private.account_admin_support_privacy_cleanup(uuid, timestamptz)','execute'),'Job executor cannot invoke support privacy helper directly');
select ok((select prosecdef and array_to_string(proconfig,',') like 'search_path=pg_catalog%' from pg_proc where oid='private.admin_account_workbench_read(private.admin_context, uuid, uuid)'::regprocedure),'Account 360 is pinned security definer');
select ok(not has_table_privilege('admin_executor','public.platform_account_admin_notes','select'),'Admin executor has no direct support-note table read');

insert into auth.users(id,aud,role,email,encrypted_password,created_at,updated_at) values
 ('00000000-0000-4000-8000-000000009000','authenticated','authenticated','account-admin@example.invalid','x',now(),now()),
 ('00000000-0000-4000-8000-000000009001','authenticated','authenticated','account-owner@example.invalid','x',now(),now()),
 ('00000000-0000-4000-8000-000000009002','authenticated','authenticated','account-second@example.invalid','x',now(),now()),
 ('00000000-0000-4000-8000-000000009003','authenticated','authenticated','account-other@example.invalid','x',now(),now()),
 ('00000000-0000-4000-8000-000000009004','authenticated','authenticated','account-delete@example.invalid','x',now(),now());
insert into auth.sessions(id,user_id,created_at,updated_at,not_after)
values('00000000-0000-4000-8000-000000009010','00000000-0000-4000-8000-000000009000',now(),now(),now()+interval '1 hour');
insert into private.system_admin(user_id) values('00000000-0000-4000-8000-000000009000')
on conflict(singleton_id) do update set user_id=excluded.user_id;

insert into public.platforms(id,code,name,status,allow_activation) values
 ('00000000-0000-4000-8000-000000009020','account-workbench','Account Workbench','active',true),
 ('00000000-0000-4000-8000-000000009021','account-other','Account Other','active',true);
insert into public.plans(id,platform_id,code,name,kind,status) values
 ('00000000-0000-4000-8000-000000009030','00000000-0000-4000-8000-000000009020','pro','Pro Plan','paid','active'),
 ('00000000-0000-4000-8000-000000009031','00000000-0000-4000-8000-000000009020','free','Free Plan','free','active');
insert into public.billing_provider_accounts(id,provider,name,status,secret_reference) values
 ('00000000-0000-4000-8000-000000009032','afdian','Account Workbench Fixture','disabled','fixture://account-workbench');
update public.platforms
set default_plan_id='00000000-0000-4000-8000-000000009031', default_plan_kind='free'
where id='00000000-0000-4000-8000-000000009020';
insert into public.platform_accounts(id,platform_id,user_id,status,activated_at,created_at,updated_at) values
 ('00000000-0000-4000-8000-000000009040','00000000-0000-4000-8000-000000009020','00000000-0000-4000-8000-000000009001','active',now()-interval '10 days',now()-interval '10 days',now()-interval '1 day'),
 ('00000000-0000-4000-8000-000000009041','00000000-0000-4000-8000-000000009020','00000000-0000-4000-8000-000000009002','active',now()-interval '5 days',now()-interval '5 days',now()-interval '2 days'),
 ('00000000-0000-4000-8000-000000009042','00000000-0000-4000-8000-000000009021','00000000-0000-4000-8000-000000009003','active',now(),now(),now()),
 ('00000000-0000-4000-8000-000000009043','00000000-0000-4000-8000-000000009020','00000000-0000-4000-8000-000000009004','closed',now()-interval '40 days',now()-interval '40 days',now()-interval '40 days');
update public.platform_accounts set closed_at=now()-interval '35 days' where id='00000000-0000-4000-8000-000000009043';
insert into public.platform_profiles(platform_account_id,display_name,avatar_url,bio) values
 ('00000000-0000-4000-8000-000000009040','Alice Workbench','https://example.invalid/alice.png','Account profile'),
 ('00000000-0000-4000-8000-000000009041','Bob Workbench',null,null),
 ('00000000-0000-4000-8000-000000009043','Delete Workbench',null,'private');
insert into public.subscriptions(id,platform_id,platform_account_id,plan_id,status,started_at,current_period_end) values
 ('00000000-0000-4000-8000-000000009050','00000000-0000-4000-8000-000000009020','00000000-0000-4000-8000-000000009040','00000000-0000-4000-8000-000000009030','active',now()-interval '4 days',now()+interval '26 days');
insert into public.platform_configs(id,platform_id,platform_account_id,title,status,updated_at) values
 ('00000000-0000-4000-8000-000000009060','00000000-0000-4000-8000-000000009020','00000000-0000-4000-8000-000000009040','Account Config','active',now()-interval '3 hours');
insert into public.platform_feedback(id,platform_id,platform_account_id,user_id,category,title,body,status,submitted_at) values
 ('00000000-0000-4000-8000-000000009070','00000000-0000-4000-8000-000000009020','00000000-0000-4000-8000-000000009040','00000000-0000-4000-8000-000000009001','bug','Account feedback','Needs help','new',now()-interval '2 hours');
insert into public.billing_orders(
 id,provider_account_id,provider_order_no,platform_id,platform_account_id,
 provider_user_id,provider_user_private_id,total_amount,show_amount,currency,
 provider_status,verification_status,entitlement_status,linkage_status,resolution_status,
 created_at,updated_at
) values (
 '00000000-0000-4000-8000-000000009071','00000000-0000-4000-8000-000000009032','account-workbench-order',
 '00000000-0000-4000-8000-000000009020','00000000-0000-4000-8000-000000009040',
 'provider-user-secret','provider-private-secret',88.00,99.00,'CNY',
 'paid','unverified','blocked','unlinked','open',now()-interval '1 hour',now()-interval '1 hour'
);

set local role admin_executor;
create temporary table tags_replaced on commit drop as
select * from private.admin_account_tags_replace(
 row('00000000-0000-4000-8000-000000009000','00000000-0000-4000-8000-000000009010','00000000-0000-4000-8000-000000009080')::private.admin_context,
 '00000000-0000-4000-8000-000000009020','00000000-0000-4000-8000-000000009040',array[' VIP ','beta','vip']
);
create temporary table note_added on commit drop as
select * from private.admin_account_note_add(
 row('00000000-0000-4000-8000-000000009000','00000000-0000-4000-8000-000000009010','00000000-0000-4000-8000-000000009081')::private.admin_context,
 '00000000-0000-4000-8000-000000009020','00000000-0000-4000-8000-000000009040','Private support note'
);
create temporary table account_page_one on commit drop as
select * from private.admin_account_list_v3(
 row('00000000-0000-4000-8000-000000009000','00000000-0000-4000-8000-000000009010','00000000-0000-4000-8000-000000009082')::private.admin_context,
 '00000000-0000-4000-8000-000000009020',null,1,null,'active',null,null,null,null,null
);
create temporary table account_page_two on commit drop as
select * from private.admin_account_list_v3(
 row('00000000-0000-4000-8000-000000009000','00000000-0000-4000-8000-000000009010','00000000-0000-4000-8000-000000009083')::private.admin_context,
 '00000000-0000-4000-8000-000000009020',(select platform_account_id from account_page_one),20,null,'active',null,null,null,null,null
);
create temporary table account_filtered on commit drop as
select * from private.admin_account_list_v3(
 row('00000000-0000-4000-8000-000000009000','00000000-0000-4000-8000-000000009010','00000000-0000-4000-8000-000000009084')::private.admin_context,
 '00000000-0000-4000-8000-000000009020',null,20,'Alice',null,'00000000-0000-4000-8000-000000009030','active','vip',now()-interval '20 days',now()
);
create temporary table account_status_search on commit drop as
select * from private.admin_account_list_v3(
 row('00000000-0000-4000-8000-000000009000','00000000-0000-4000-8000-000000009010','00000000-0000-4000-8000-000000009084')::private.admin_context,
 '00000000-0000-4000-8000-000000009020',null,20,'active',null,null,null,null,null,null
);
create temporary table free_account_filtered on commit drop as
select * from private.admin_account_list_v3(
 row('00000000-0000-4000-8000-000000009000','00000000-0000-4000-8000-000000009010','00000000-0000-4000-8000-000000009072')::private.admin_context,
 '00000000-0000-4000-8000-000000009020',null,20,'Free','active','00000000-0000-4000-8000-000000009031','none',null,null,null
);
create temporary table free_workbench_read on commit drop as
select * from private.admin_account_workbench_read(
 row('00000000-0000-4000-8000-000000009000','00000000-0000-4000-8000-000000009010','00000000-0000-4000-8000-000000009073')::private.admin_context,
 '00000000-0000-4000-8000-000000009020','00000000-0000-4000-8000-000000009041'
);
create temporary table workbench_read on commit drop as
select * from private.admin_account_workbench_read(
 row('00000000-0000-4000-8000-000000009000','00000000-0000-4000-8000-000000009010','00000000-0000-4000-8000-000000009085')::private.admin_context,
 '00000000-0000-4000-8000-000000009020','00000000-0000-4000-8000-000000009040'
);
create temporary table account_suspended on commit drop as
select * from private.admin_account_transition_v2(
 row('00000000-0000-4000-8000-000000009000','00000000-0000-4000-8000-000000009010','00000000-0000-4000-8000-000000009086')::private.admin_context,
 '00000000-0000-4000-8000-000000009020','00000000-0000-4000-8000-000000009040','suspend','chargeback review'
);
set local role postgres;

select is((select tags from tags_replaced),array['beta','vip']::text[],'tags normalize and deduplicate');
select is((select count(*)::integer from account_page_one),1,'first cursor page is bounded');
select is((select count(*)::integer from account_page_two),1,'second cursor page advances without overlap');
select is((select platform_account_id from account_filtered),'00000000-0000-4000-8000-000000009040'::uuid,'filters apply before pagination');
select is((select count(*)::integer from account_status_search),2,'v3 text search preserves account status matching');
select ok((select plan_code='pro' and subscription_status='active' and tags=array['beta','vip']::text[] from account_filtered),'list projects current plan subscription and tags');
select is((select platform_account_id from free_account_filtered),'00000000-0000-4000-8000-000000009041'::uuid,'default free Plan participates in server-side Plan filtering and search');
select ok((select plan_code='free' and plan_kind='free' and subscription_status='none' from free_account_filtered),'list projects effective default free Plan without inventing a subscription');
select ok((select plan_code='free' and plan_kind='free' and subscription_status='none' from free_workbench_read),'Account 360 projects effective default free Plan');
select ok((select display_name='Alice Workbench' and config_active_count=1 and feedback_count=1 and feedback_open_count=1 from workbench_read),'Account 360 aggregates profile Config and Feedback authority');
select ok((select billing_order_count=1 and billing_attention_count=1
  and billing_latest->>'provider_status'='paid'
  and billing_latest->>'verification_status'='unverified'
  and not billing_latest ? 'total_amount' and not billing_latest ? 'show_amount'
  and not billing_latest ? 'provider_user_id' and not billing_latest ? 'provider_user_private_id'
  from workbench_read),'Account 360 keeps Billing summary safe and bounded');
select ok((select jsonb_array_length(notes)=1 and tags=array['beta','vip']::text[] from workbench_read),'Account 360 includes protected support context');
select is((select status from account_suspended),'suspended','reasoned transition uses authoritative account state machine');
select is((select reason from public.platform_account_governance_events where id=(select governance_event_id from account_suspended)),'chargeback review','governance event persists Admin reason');
select ok((select metadata ? 'governance_event_id' and not metadata ? 'reason' from public.audit_logs where request_id='00000000-0000-4000-8000-000000009086'),'audit references governance event without copying reason');
select ok((select metadata ? 'note_id' and metadata::text not like '%Private support note%' from public.audit_logs where request_id='00000000-0000-4000-8000-000000009081'),'audit references note without copying body');
select throws_ok(
 $$select * from private.admin_account_workbench_read(row('00000000-0000-4000-8000-000000009000','00000000-0000-4000-8000-000000009010','00000000-0000-4000-8000-000000009087')::private.admin_context,'00000000-0000-4000-8000-000000009021','00000000-0000-4000-8000-000000009040')$$,
 'P0002','resource_not_found','Account 360 rejects cross-platform IDOR'
);
select throws_ok(
 $$select * from private.admin_account_transition_v2(row('00000000-0000-4000-8000-000000009000','00000000-0000-4000-8000-000000009010','00000000-0000-4000-8000-000000009088')::private.admin_context,'00000000-0000-4000-8000-000000009020','00000000-0000-4000-8000-000000009041','suspend',' ')$$,
 '22023','invalid_input','transition rejects blank reason'
);
select throws_ok(
 $$select * from private.admin_account_list_v3(row('00000000-0000-4000-8000-000000009000','00000000-0000-4000-8000-000000009010','00000000-0000-4000-8000-000000009089')::private.admin_context,'00000000-0000-4000-8000-000000009020','00000000-0000-4000-8000-000000009042',20,null,null,null,null,null,null,null)$$,
 'P0002','resource_not_found','cursor from another platform is rejected'
);

-- Ordinary close does not erase support history.
set local role admin_executor;
select * from private.admin_account_tags_replace(
 row('00000000-0000-4000-8000-000000009000','00000000-0000-4000-8000-000000009010','00000000-0000-4000-8000-000000009090')::private.admin_context,
 '00000000-0000-4000-8000-000000009020','00000000-0000-4000-8000-000000009041',array['keep']
);
select * from private.admin_account_note_add(
 row('00000000-0000-4000-8000-000000009000','00000000-0000-4000-8000-000000009010','00000000-0000-4000-8000-000000009091')::private.admin_context,
 '00000000-0000-4000-8000-000000009020','00000000-0000-4000-8000-000000009041','keep after close'
);
select * from private.admin_account_transition_v2(
 row('00000000-0000-4000-8000-000000009000','00000000-0000-4000-8000-000000009010','00000000-0000-4000-8000-000000009092')::private.admin_context,
 '00000000-0000-4000-8000-000000009020','00000000-0000-4000-8000-000000009041','close','support requested closure'
);
set local role postgres;
select ok((select count(*)=1 from public.platform_account_admin_tags where platform_account_id='00000000-0000-4000-8000-000000009041') and
  (select count(*)=1 from public.platform_account_admin_notes where platform_account_id='00000000-0000-4000-8000-000000009041' and redacted_at is null),
  'ordinary close preserves Admin support history');

-- Close the rich fixture through the same authoritative transition. Domain summaries and
-- support context remain available because ordinary close is not a privacy-delete signal.
set local role admin_executor;
select * from private.admin_account_transition_v2(
 row('00000000-0000-4000-8000-000000009000','00000000-0000-4000-8000-000000009010','00000000-0000-4000-8000-000000009101')::private.admin_context,
 '00000000-0000-4000-8000-000000009020','00000000-0000-4000-8000-000000009040','close','ordinary close before global delete'
);
create temporary table closed_workbench on commit drop as
select * from private.admin_account_workbench_read(
 row('00000000-0000-4000-8000-000000009000','00000000-0000-4000-8000-000000009010','00000000-0000-4000-8000-000000009102')::private.admin_context,
 '00000000-0000-4000-8000-000000009020','00000000-0000-4000-8000-000000009040'
);
set local role postgres;
select ok((select account_status='closed' and config_active_count=1
  and feedback_count=1 and feedback_open_count=1 and billing_order_count=1
  from closed_workbench),'ordinary close preserves authoritative Config Feedback and Billing summaries');
select ok((select tags=array['beta','vip']::text[] and jsonb_array_length(notes)=1
  and notes->0->>'body'='Private support note' from closed_workbench),
  'ordinary close preserves protected support context');

-- Retention invokes the support privacy helper before account anonymization.
insert into public.platform_account_admin_tags(platform_id,platform_account_id,tag,created_by)
values('00000000-0000-4000-8000-000000009020','00000000-0000-4000-8000-000000009043','delete-me','00000000-0000-4000-8000-000000009000');
insert into public.platform_account_admin_notes(id,platform_id,platform_account_id,body,created_by)
values('00000000-0000-4000-8000-000000009093','00000000-0000-4000-8000-000000009020','00000000-0000-4000-8000-000000009043','retention secret','00000000-0000-4000-8000-000000009000');
insert into public.platform_account_governance_events(id,platform_id,platform_account_id,action,reason,actor_admin_user_id)
values('00000000-0000-4000-8000-000000009094','00000000-0000-4000-8000-000000009020','00000000-0000-4000-8000-000000009043','close','retention reason','00000000-0000-4000-8000-000000009000');
delete from private.account_retention_policy;
insert into private.account_retention_policy(personal_data_retention_days,policy_source,policy_reference)
values(30,'opt-009-test','support lifecycle');
create temporary table retention_result on commit drop as
select * from private.account_retention_cleanup(
 row('00000000-0000-4000-8000-000000009095','account-workbench-retention',1,'00000000-0000-4000-8000-000000009096')::private.job_context,
 '00000000-0000-4000-8000-000000009043',null,60
);
select is((select action from retention_result),'cleaned','retention uses authoritative lifecycle path');
select is((select count(*)::integer from public.platform_account_admin_tags where platform_account_id='00000000-0000-4000-8000-000000009043'),0,'retention removes Admin tags');
select ok((select body='[redacted]' and redacted_at is not null from public.platform_account_admin_notes where id='00000000-0000-4000-8000-000000009093'),'retention redacts support note');
select is((select reason from public.platform_account_governance_events where id='00000000-0000-4000-8000-000000009094'),'[redacted]','retention redacts governance reason');
select ok((select user_id is null and anonymized_at is not null from public.platform_accounts where id='00000000-0000-4000-8000-000000009043'),'retention still anonymizes Platform Account');

-- Global Delete minimizes support data at files_blocked, before Auth deletion.
insert into public.platform_account_admin_tags(platform_id,platform_account_id,tag,created_by)
values('00000000-0000-4000-8000-000000009020','00000000-0000-4000-8000-000000009040','global-delete','00000000-0000-4000-8000-000000009000');
insert into private.deletion_requests(id,user_id,request_session_id,state,requested_at,approved_at)
values('00000000-0000-4000-8000-000000009097','00000000-0000-4000-8000-000000009001','00000000-0000-4000-8000-000000009098','approved',now(),now());
insert into private.deletion_jobs(id,request_id,user_id,state,checkpoint,fence,next_attempt_at)
values('00000000-0000-4000-8000-000000009099','00000000-0000-4000-8000-000000009097','00000000-0000-4000-8000-000000009001','running','accounts_closed',11,now());
insert into private.job_leases(job_kind,resource_id,lease_owner,lease_until,fencing_token)
values('global_delete','00000000-0000-4000-8000-000000009099','account-workbench-global',now()+interval '1 hour',11);
create temporary table global_step on commit drop as
select * from private.deletion_job_step(
 row('00000000-0000-4000-8000-000000009099','account-workbench-global',11,'00000000-0000-4000-8000-000000009100')::private.job_context,
 '00000000-0000-4000-8000-000000009099',11,'files_blocked','completed',null
);
select is((select checkpoint from global_step),'files_blocked','Global Delete retains existing checkpoint protocol');
select is((select count(*)::integer from public.platform_account_admin_tags where platform_account_id='00000000-0000-4000-8000-000000009040'),0,'Global Delete removes support tags at files_blocked');
select ok((select body='[redacted]' and redacted_at is not null from public.platform_account_admin_notes where id=(select note_id from note_added)),'Global Delete redacts existing account note');
select is((select reason from public.platform_account_governance_events where id=(select governance_event_id from account_suspended)),'[redacted]','Global Delete redacts governance reason before Auth deletion');

create temporary table deleting_workbench on commit drop as
select * from private.admin_account_workbench_read(
 row('00000000-0000-4000-8000-000000009000','00000000-0000-4000-8000-000000009010','00000000-0000-4000-8000-000000009103')::private.admin_context,
 '00000000-0000-4000-8000-000000009020','00000000-0000-4000-8000-000000009040'
);
select ok((select config_active_count=0 and config_published_count=0
  and config_pending_review_count=0 and feedback_count=0 and feedback_open_count=0
  and billing_order_count=1 and billing_attention_count=1
  and not billing_latest ? 'total_amount' and not billing_latest ? 'show_amount'
  and not billing_latest ? 'provider_user_id' and not billing_latest ? 'provider_user_private_id'
  from deleting_workbench),'files_blocked hides Config Feedback content while retaining only safe Billing status summary');
select ok((select tags='{}'::text[] and notes->0->>'body'='[redacted]'
  and governance_events::text not like '%chargeback review%'
  and governance_events::text not like '%ordinary close before global delete%'
  from deleting_workbench),'files_blocked minimizes Account support data before Auth deletion');
select is((select display_name from deleting_workbench),'Alice Workbench','files_blocked does not skip ahead of personal-data cleanup');

update private.deletion_jobs set state='running', fence=12
where id='00000000-0000-4000-8000-000000009099';
update private.job_leases set lease_owner='account-workbench-global-2',
  lease_until=now()+interval '1 hour', fencing_token=12
where job_kind='global_delete' and resource_id='00000000-0000-4000-8000-000000009099';
select * from private.deletion_job_step(
 row('00000000-0000-4000-8000-000000009099','account-workbench-global-2',12,'00000000-0000-4000-8000-000000009104')::private.job_context,
 '00000000-0000-4000-8000-000000009099',12,'personal_data_cleared','completed',null
);
create temporary table cleared_workbench on commit drop as
select * from private.admin_account_workbench_read(
 row('00000000-0000-4000-8000-000000009000','00000000-0000-4000-8000-000000009010','00000000-0000-4000-8000-000000009105')::private.admin_context,
 '00000000-0000-4000-8000-000000009020','00000000-0000-4000-8000-000000009040'
);
select ok((select display_name is null and avatar_url is null and bio is null
  and locale is null and timezone is null and config_active_count=0 and feedback_count=0
  from cleared_workbench),'personal_data_cleared removes Profile projection without restoring deleted domain summaries');

update private.deletion_jobs set state='running', fence=13
where id='00000000-0000-4000-8000-000000009099';
update private.job_leases set lease_owner='account-workbench-global-3',
  lease_until=now()+interval '1 hour', fencing_token=13
where job_kind='global_delete' and resource_id='00000000-0000-4000-8000-000000009099';
select * from private.deletion_job_step(
 row('00000000-0000-4000-8000-000000009099','account-workbench-global-3',13,'00000000-0000-4000-8000-000000009106')::private.job_context,
 '00000000-0000-4000-8000-000000009099',13,'history_anonymized','completed',null
);
update private.deletion_jobs set state='running', fence=14
where id='00000000-0000-4000-8000-000000009099';
update private.job_leases set lease_owner='account-workbench-global-4',
  lease_until=now()+interval '1 hour', fencing_token=14
where job_kind='global_delete' and resource_id='00000000-0000-4000-8000-000000009099';
create temporary table auth_deleted_step on commit drop as
select * from private.deletion_job_step(
 row('00000000-0000-4000-8000-000000009099','account-workbench-global-4',14,'00000000-0000-4000-8000-000000009107')::private.job_context,
 '00000000-0000-4000-8000-000000009099',14,'auth_deleted','completed',null
);
create temporary table deleted_identity_workbench on commit drop as
select * from private.admin_account_workbench_read(
 row('00000000-0000-4000-8000-000000009000','00000000-0000-4000-8000-000000009010','00000000-0000-4000-8000-000000009108')::private.admin_context,
 '00000000-0000-4000-8000-000000009020','00000000-0000-4000-8000-000000009040'
);
select ok((select user_id is null and anonymized_at is not null and account_status='closed'
  from deleted_identity_workbench),'auth_deleted unlinks Global Identity and leaves only the anonymized Platform Account');
select ok((select config_active_count=0 and feedback_count=0 and tags='{}'::text[]
  and notes->0->>'body'='[redacted]' and billing_order_count=1
  and not billing_latest ? 'total_amount' and not billing_latest ? 'show_amount'
  and not billing_latest ? 'provider_user_id' and not billing_latest ? 'provider_user_private_id'
  from deleted_identity_workbench),'identity-deleted Account 360 remains privacy-minimized with bounded Billing status history');
select ok((select state='completed' and checkpoint='auth_deleted' from auth_deleted_step),
  'Global Delete lifecycle completes through auth_deleted');

select * from finish();
rollback;
