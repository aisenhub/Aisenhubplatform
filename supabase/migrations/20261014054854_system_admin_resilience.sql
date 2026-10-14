begin;

alter table private.system_admin drop constraint if exists system_admin_pkey;
alter table private.system_admin drop constraint if exists system_admin_singleton_id_check;
alter table private.system_admin drop constraint if exists system_admin_user_id_key;
alter table private.system_admin
  add column state text not null default 'active',
  add column activated_at timestamptz,
  add column created_by_user_id uuid;
update private.system_admin set state='active', activated_at=coalesce(activated_at,created_at);
alter table private.system_admin drop column singleton_id;
alter table private.system_admin
  add constraint system_admin_pkey primary key(user_id),
  add constraint system_admin_state_check check(state in ('pending','active')),
  add constraint system_admin_created_by_user_id_fkey foreign key(created_by_user_id) references auth.users(id) on delete set null;
create index system_admin_state_created_idx on private.system_admin(state,created_at,user_id);

create or replace view private.active_system_admin as
select user_id,created_at,updated_at,activated_at,created_by_user_id from private.system_admin where state='active';
alter view private.active_system_admin owner to domain_owner;
revoke all on private.active_system_admin from public;
grant select on private.active_system_admin to domain_owner;

do $$
declare v_oid oid; v_definition text;
begin
  for v_oid in
    select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private' and p.prokind='f' and pg_get_functiondef(p.oid) like '%private.system_admin%'
  loop
    v_definition:=replace(pg_get_functiondef(v_oid),'private.system_admin','private.active_system_admin');
    execute v_definition;
  end loop;
end;
$$;

create table private.system_admin_operations(
  actor_user_id uuid not null,
  operation_id uuid not null,
  operation text not null,
  target_user_id uuid not null,
  request_fingerprint text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(actor_user_id,operation_id),
  check(length(operation) between 1 and 64),
  check(length(request_fingerprint) between 1 and 1024),
  check(jsonb_typeof(result)='object')
);
alter table private.system_admin_operations owner to domain_owner;
alter table private.system_admin_operations enable row level security;
alter table private.system_admin_operations force row level security;
create policy system_admin_operations_domain_owner on private.system_admin_operations to domain_owner using(true) with check(true);
revoke all on private.system_admin_operations from public,anon,authenticated,account_executor,admin_executor,job_executor,recovery_executor;

create or replace function private.system_admin_verified_totp_count(p_user_id uuid) returns integer
language sql stable security definer set search_path=pg_catalog,auth as $$
 select count(*)::integer from auth.mfa_factors f where f.user_id=p_user_id and f.factor_type::text='totp' and f.status::text='verified'
$$;
alter function private.system_admin_verified_totp_count(uuid) owner to postgres;
revoke all on function private.system_admin_verified_totp_count(uuid) from public;
grant execute on function private.system_admin_verified_totp_count(uuid) to domain_owner;

create or replace function private.system_admin_auth_available(p_user_id uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,auth as $$
 select exists(select 1 from auth.users u where u.id=p_user_id and u.deleted_at is null and coalesce(u.is_anonymous,false)=false and (u.banned_until is null or u.banned_until<=now()))
$$;
alter function private.system_admin_auth_available(uuid) owner to postgres;
revoke all on function private.system_admin_auth_available(uuid) from public;
grant execute on function private.system_admin_auth_available(uuid) to domain_owner;

create or replace function private.system_admin_auth_email(p_user_id uuid) returns text
language sql stable security definer set search_path=pg_catalog,auth as $$ select u.email::text from auth.users u where u.id=p_user_id $$;
alter function private.system_admin_auth_email(uuid) owner to postgres;
revoke all on function private.system_admin_auth_email(uuid) from public;
grant execute on function private.system_admin_auth_email(uuid) to domain_owner;

create or replace function private.system_admin_revoke_auth_sessions(p_user_id uuid) returns integer
language plpgsql security definer set search_path=pg_catalog,auth as $$
declare v_count integer;
begin
 if p_user_id is null then raise exception using errcode='22023',message='invalid_input'; end if;
 delete from auth.sessions s where s.user_id=p_user_id;
 get diagnostics v_count=row_count;
 return v_count;
end;
$$;
alter function private.system_admin_revoke_auth_sessions(uuid) owner to postgres;
revoke all on function private.system_admin_revoke_auth_sessions(uuid) from public;
grant execute on function private.system_admin_revoke_auth_sessions(uuid) to domain_owner;

create or replace function private.system_admin_member_json(p_user_id uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,private as $$
 select jsonb_build_object('user_id',m.user_id,'email',private.system_admin_auth_email(m.user_id),'state',m.state,'verified_totp_count',private.system_admin_verified_totp_count(m.user_id),'auth_available',private.system_admin_auth_available(m.user_id),'created_at',m.created_at,'activated_at',m.activated_at,'created_by_user_id',m.created_by_user_id)
 from private.system_admin m where m.user_id=p_user_id
$$;
alter function private.system_admin_member_json(uuid) owner to domain_owner;
revoke all on function private.system_admin_member_json(uuid) from public;

create or replace function private.system_admin_mutation_assert(p_ctx private.admin_context,p_recent_proof_id uuid) returns void
language plpgsql stable security definer set search_path=pg_catalog,private as $$
begin
 if (p_ctx).admin_user_id is null or (p_ctx).session_id is null or (p_ctx).request_id is null or p_recent_proof_id is null
    or not exists(select 1 from private.active_system_admin a where a.user_id=(p_ctx).admin_user_id)
    or not exists(select 1 from private.check_user_session((p_ctx).admin_user_id,(p_ctx).session_id) s where s.active)
 then raise exception using errcode='42501',message='admin_required'; end if;
 if not private.admin_step_up_valid((p_ctx).admin_user_id,(p_ctx).session_id,p_recent_proof_id) then raise exception using errcode='42501',message='recent_mfa_required'; end if;
end;
$$;
alter function private.system_admin_mutation_assert(private.admin_context,uuid) owner to domain_owner;
revoke all on function private.system_admin_mutation_assert(private.admin_context,uuid) from public;

create or replace function private.system_admin_operation_replay(p_actor_user_id uuid,p_operation_id uuid,p_operation text,p_target_user_id uuid,p_request_fingerprint text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,private as $$
declare v_existing private.system_admin_operations%rowtype;
begin
 if p_actor_user_id is null or p_operation_id is null or p_operation is null or p_target_user_id is null or p_request_fingerprint is null or length(p_request_fingerprint) not between 1 and 1024 then raise exception using errcode='22023',message='invalid_input'; end if;
 perform pg_advisory_xact_lock(hashtextextended('system-admin-operation:'||p_operation_id::text,0));
 select * into v_existing from private.system_admin_operations o where o.actor_user_id=p_actor_user_id and o.operation_id=p_operation_id;
 if not found then return null; end if;
 if v_existing.operation<>p_operation or v_existing.target_user_id<>p_target_user_id or v_existing.request_fingerprint<>p_request_fingerprint then raise exception using errcode='23505',message='idempotency_conflict'; end if;
 return v_existing.result||jsonb_build_object('replayed',true);
end;
$$;
alter function private.system_admin_operation_replay(uuid,uuid,text,uuid,text) owner to domain_owner;
revoke all on function private.system_admin_operation_replay(uuid,uuid,text,uuid,text) from public;

create or replace function private.system_admin_operation_record(p_actor_user_id uuid,p_operation_id uuid,p_operation text,p_target_user_id uuid,p_request_fingerprint text,p_result jsonb) returns void
language plpgsql security definer set search_path=pg_catalog,private as $$
begin insert into private.system_admin_operations(actor_user_id,operation_id,operation,target_user_id,request_fingerprint,result) values(p_actor_user_id,p_operation_id,p_operation,p_target_user_id,p_request_fingerprint,p_result); end;
$$;
alter function private.system_admin_operation_record(uuid,uuid,text,uuid,text,jsonb) owner to domain_owner;
revoke all on function private.system_admin_operation_record(uuid,uuid,text,uuid,text,jsonb) from public;

create or replace function private.admin_system_admin_self_status(p_ctx private.admin_context,p_current_aal text)
returns table(membership_state text,current_aal text,recent_mfa_expires_at timestamptz,verified_totp_count integer,active_admin_count integer,member_count integer,readiness_healthy boolean)
language plpgsql stable security definer set search_path=pg_catalog,private as $$
declare v_member private.system_admin%rowtype;
begin
 if p_current_aal is null or p_current_aal not in ('aal1','aal2') then raise exception using errcode='22023',message='invalid_input'; end if;
 select * into v_member from private.system_admin m where m.user_id=(p_ctx).admin_user_id;
 if not found then raise exception using errcode='42501',message='admin_required'; end if;
 if not exists(select 1 from private.check_user_session((p_ctx).admin_user_id,(p_ctx).session_id) s where s.active) then raise exception using errcode='42501',message='session_not_active'; end if;
 return query select v_member.state,p_current_aal,
  (select max(p.expires_at) from private.admin_step_up p where p.user_id=(p_ctx).admin_user_id and p.session_id=(p_ctx).session_id and p.verified_at<=now() and p.expires_at>now()),
  private.system_admin_verified_totp_count(v_member.user_id),
  (select count(*)::integer from private.system_admin a where a.state='active'),
  (select count(*)::integer from private.system_admin),
  (select count(*) from private.system_admin a where a.state='active')>=2 and not exists(select 1 from private.system_admin a where a.state='active' and (private.system_admin_verified_totp_count(a.user_id)<2 or not private.system_admin_auth_available(a.user_id)));
end;
$$;
alter function private.admin_system_admin_self_status(private.admin_context,text) owner to domain_owner;
revoke all on function private.admin_system_admin_self_status(private.admin_context,text) from public;
grant execute on function private.admin_system_admin_self_status(private.admin_context,text) to admin_executor;

create or replace function private.admin_system_admin_list(p_ctx private.admin_context)
returns table(user_id uuid,email text,state text,verified_totp_count integer,auth_available boolean,created_at timestamptz,activated_at timestamptz,created_by_user_id uuid,active_admin_count integer,readiness_healthy boolean)
language plpgsql stable security definer set search_path=pg_catalog,private as $$
declare v_active_count integer; v_ready boolean;
begin
 if not exists(select 1 from private.active_system_admin a where a.user_id=(p_ctx).admin_user_id) or not exists(select 1 from private.check_user_session((p_ctx).admin_user_id,(p_ctx).session_id) s where s.active) then raise exception using errcode='42501',message='admin_required'; end if;
 select count(*)::integer into v_active_count from private.system_admin a where a.state='active';
 select v_active_count>=2 and not exists(select 1 from private.system_admin a where a.state='active' and (private.system_admin_verified_totp_count(a.user_id)<2 or not private.system_admin_auth_available(a.user_id))) into v_ready;
 return query select m.user_id,private.system_admin_auth_email(m.user_id),m.state,private.system_admin_verified_totp_count(m.user_id),private.system_admin_auth_available(m.user_id),m.created_at,m.activated_at,m.created_by_user_id,v_active_count,v_ready from private.system_admin m order by (m.state='active') desc,m.created_at,m.user_id;
end;
$$;
alter function private.admin_system_admin_list(private.admin_context) owner to domain_owner;
revoke all on function private.admin_system_admin_list(private.admin_context) from public;
grant execute on function private.admin_system_admin_list(private.admin_context) to admin_executor;

create or replace function private.admin_system_admin_add(p_ctx private.admin_context,p_target_user_id uuid,p_recent_proof_id uuid,p_operation_id uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,private,public as $$
declare v_fingerprint text; v_replay jsonb; v_result jsonb;
begin
 if p_target_user_id is null or p_operation_id is null or p_reason is null or length(btrim(p_reason)) not between 1 and 512 then raise exception using errcode='22023',message='invalid_input'; end if;
 perform pg_advisory_xact_lock(hashtextextended('system-admin-membership',0));
 perform private.system_admin_mutation_assert(p_ctx,p_recent_proof_id);
 v_fingerprint:='add:'||p_target_user_id::text||':'||btrim(p_reason);
 v_replay:=private.system_admin_operation_replay((p_ctx).admin_user_id,p_operation_id,'add',p_target_user_id,v_fingerprint); if v_replay is not null then return v_replay; end if;
 if not private.system_admin_auth_available(p_target_user_id) then raise exception using errcode='P0001',message='admin_identity_unavailable'; end if;
 if exists(select 1 from public.platform_accounts a where a.user_id=p_target_user_id) then raise exception using errcode='P0001',message='dedicated_admin_identity_required'; end if;
 if exists(select 1 from private.system_admin a where a.user_id=p_target_user_id) then raise exception using errcode='P0001',message='system_admin_member_exists'; end if;
 insert into private.system_admin(user_id,state,activated_at,created_by_user_id) values(p_target_user_id,'pending',null,(p_ctx).admin_user_id);
 perform private.audit_append((p_ctx).request_id,'admin',(p_ctx).admin_user_id,null,null,'system_admin.membership_added','system_admin',p_target_user_id,null,null,jsonb_build_object('operation_id',p_operation_id,'reason',btrim(p_reason),'state','pending'));
 v_result:=private.system_admin_member_json(p_target_user_id)||jsonb_build_object('replayed',false);
 perform private.system_admin_operation_record((p_ctx).admin_user_id,p_operation_id,'add',p_target_user_id,v_fingerprint,v_result); return v_result;
end;
$$;
alter function private.admin_system_admin_add(private.admin_context,uuid,uuid,uuid,text) owner to domain_owner;
revoke all on function private.admin_system_admin_add(private.admin_context,uuid,uuid,uuid,text) from public;
grant execute on function private.admin_system_admin_add(private.admin_context,uuid,uuid,uuid,text) to admin_executor;

create or replace function private.admin_system_admin_activate(p_ctx private.admin_context,p_target_user_id uuid,p_recent_proof_id uuid,p_operation_id uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,private as $$
declare v_fingerprint text; v_replay jsonb; v_state text; v_result jsonb;
begin
 if p_target_user_id is null or p_operation_id is null or p_reason is null or length(btrim(p_reason)) not between 1 and 512 then raise exception using errcode='22023',message='invalid_input'; end if;
 perform pg_advisory_xact_lock(hashtextextended('system-admin-membership',0));
 perform private.system_admin_mutation_assert(p_ctx,p_recent_proof_id);
 v_fingerprint:='activate:'||p_target_user_id::text||':'||btrim(p_reason);
 v_replay:=private.system_admin_operation_replay((p_ctx).admin_user_id,p_operation_id,'activate',p_target_user_id,v_fingerprint); if v_replay is not null then return v_replay; end if;
 select state into v_state from private.system_admin where user_id=p_target_user_id for update; if not found then raise exception using errcode='P0002',message='resource_not_found'; end if;
 if not private.system_admin_auth_available(p_target_user_id) then raise exception using errcode='P0001',message='admin_identity_unavailable'; end if;
 if private.system_admin_verified_totp_count(p_target_user_id)<2 then raise exception using errcode='P0001',message='system_admin_mfa_readiness_required'; end if;
 if v_state='pending' then update private.system_admin set state='active',activated_at=clock_timestamp() where user_id=p_target_user_id; perform private.audit_append((p_ctx).request_id,'admin',(p_ctx).admin_user_id,null,null,'system_admin.activated','system_admin',p_target_user_id,null,null,jsonb_build_object('operation_id',p_operation_id,'reason',btrim(p_reason),'verified_totp_count',private.system_admin_verified_totp_count(p_target_user_id))); end if;
 v_result:=private.system_admin_member_json(p_target_user_id)||jsonb_build_object('replayed',false); perform private.system_admin_operation_record((p_ctx).admin_user_id,p_operation_id,'activate',p_target_user_id,v_fingerprint,v_result); return v_result;
end;
$$;
alter function private.admin_system_admin_activate(private.admin_context,uuid,uuid,uuid,text) owner to domain_owner;
revoke all on function private.admin_system_admin_activate(private.admin_context,uuid,uuid,uuid,text) from public;
grant execute on function private.admin_system_admin_activate(private.admin_context,uuid,uuid,uuid,text) to admin_executor;

create or replace function private.admin_system_admin_remove(p_ctx private.admin_context,p_target_user_id uuid,p_recent_proof_id uuid,p_operation_id uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,private as $$
declare v_fingerprint text; v_replay jsonb; v_state text; v_active_count integer; v_revoked_sessions integer; v_result jsonb;
begin
 if p_target_user_id is null or p_operation_id is null or p_reason is null or length(btrim(p_reason)) not between 1 and 512 then raise exception using errcode='22023',message='invalid_input'; end if;
 perform pg_advisory_xact_lock(hashtextextended('system-admin-membership',0));
 perform private.system_admin_mutation_assert(p_ctx,p_recent_proof_id);
 v_fingerprint:='remove:'||p_target_user_id::text||':'||btrim(p_reason);
 v_replay:=private.system_admin_operation_replay((p_ctx).admin_user_id,p_operation_id,'remove',p_target_user_id,v_fingerprint); if v_replay is not null then return v_replay; end if;
 select state into v_state from private.system_admin where user_id=p_target_user_id for update; if not found then raise exception using errcode='P0002',message='resource_not_found'; end if;
 select count(*)::integer into v_active_count from private.system_admin where state='active'; if v_state='active' and v_active_count<=2 then raise exception using errcode='P0001',message='minimum_active_system_admins_required'; end if;
 delete from private.admin_step_up where user_id=p_target_user_id; delete from private.system_admin where user_id=p_target_user_id; v_revoked_sessions:=private.system_admin_revoke_auth_sessions(p_target_user_id);
 select count(*)::integer into v_active_count from private.system_admin where state='active';
 perform private.audit_append((p_ctx).request_id,'admin',(p_ctx).admin_user_id,null,null,'system_admin.membership_removed','system_admin',p_target_user_id,null,null,jsonb_build_object('operation_id',p_operation_id,'reason',btrim(p_reason),'previous_state',v_state,'revoked_sessions',v_revoked_sessions));
 v_result:=jsonb_build_object('user_id',p_target_user_id,'removed',true,'previous_state',v_state,'active_admin_count',v_active_count,'revoked_sessions',v_revoked_sessions,'replayed',false); perform private.system_admin_operation_record((p_ctx).admin_user_id,p_operation_id,'remove',p_target_user_id,v_fingerprint,v_result); return v_result;
end;
$$;
alter function private.admin_system_admin_remove(private.admin_context,uuid,uuid,uuid,text) owner to domain_owner;
revoke all on function private.admin_system_admin_remove(private.admin_context,uuid,uuid,uuid,text) from public;
grant execute on function private.admin_system_admin_remove(private.admin_context,uuid,uuid,uuid,text) to admin_executor;

create or replace function private.recovery_system_admin_add(p_recovery_id uuid,p_target_user_id uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,private,public as $$
begin
 if p_recovery_id is null or p_target_user_id is null or p_reason is null or length(btrim(p_reason)) not between 1 and 512 then raise exception using errcode='22023',message='invalid_input'; end if;
 perform pg_advisory_xact_lock(hashtextextended('system-admin-membership',0));
 if not private.system_admin_auth_available(p_target_user_id) then raise exception using errcode='P0001',message='admin_identity_unavailable'; end if;
 if exists(select 1 from public.platform_accounts a where a.user_id=p_target_user_id) then raise exception using errcode='P0001',message='dedicated_admin_identity_required'; end if;
 insert into private.system_admin(user_id,state,created_by_user_id) values(p_target_user_id,'pending',null) on conflict(user_id) do nothing;
 perform private.audit_append(p_recovery_id,'recovery',null,null,null,'system_admin.recovery_membership_added','system_admin',p_target_user_id,null,null,jsonb_build_object('recovery_id',p_recovery_id,'reason',btrim(p_reason))); return private.system_admin_member_json(p_target_user_id);
end;
$$;
alter function private.recovery_system_admin_add(uuid,uuid,text) owner to domain_owner;
revoke all on function private.recovery_system_admin_add(uuid,uuid,text) from public;
grant execute on function private.recovery_system_admin_add(uuid,uuid,text) to recovery_executor;

create or replace function private.recovery_system_admin_activate(p_recovery_id uuid,p_target_user_id uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,private as $$
begin
 if p_recovery_id is null or p_target_user_id is null or p_reason is null or length(btrim(p_reason)) not between 1 and 512 then raise exception using errcode='22023',message='invalid_input'; end if;
 perform pg_advisory_xact_lock(hashtextextended('system-admin-membership',0));
 if not exists(select 1 from private.system_admin where user_id=p_target_user_id) then raise exception using errcode='P0002',message='resource_not_found'; end if;
 if not private.system_admin_auth_available(p_target_user_id) then raise exception using errcode='P0001',message='admin_identity_unavailable'; end if;
 if private.system_admin_verified_totp_count(p_target_user_id)<2 then raise exception using errcode='P0001',message='system_admin_mfa_readiness_required'; end if;
 update private.system_admin set state='active',activated_at=coalesce(activated_at,clock_timestamp()) where user_id=p_target_user_id;
 perform private.audit_append(p_recovery_id,'recovery',null,null,null,'system_admin.recovery_activated','system_admin',p_target_user_id,null,null,jsonb_build_object('recovery_id',p_recovery_id,'reason',btrim(p_reason))); return private.system_admin_member_json(p_target_user_id);
end;
$$;
alter function private.recovery_system_admin_activate(uuid,uuid,text) owner to domain_owner;
revoke all on function private.recovery_system_admin_activate(uuid,uuid,text) from public;
grant execute on function private.recovery_system_admin_activate(uuid,uuid,text) to recovery_executor;

create or replace function private.recovery_system_admin_remove(p_recovery_id uuid,p_target_user_id uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,private as $$
declare v_state text; v_active_count integer; v_revoked integer;
begin
 if p_recovery_id is null or p_target_user_id is null or p_reason is null or length(btrim(p_reason)) not between 1 and 512 then raise exception using errcode='22023',message='invalid_input'; end if;
 perform pg_advisory_xact_lock(hashtextextended('system-admin-membership',0));
 select state into v_state from private.system_admin where user_id=p_target_user_id for update; if not found then raise exception using errcode='P0002',message='resource_not_found'; end if;
 select count(*)::integer into v_active_count from private.system_admin where state='active'; if v_state='active' and v_active_count<=2 then raise exception using errcode='P0001',message='minimum_active_system_admins_required'; end if;
 delete from private.admin_step_up where user_id=p_target_user_id; delete from private.system_admin where user_id=p_target_user_id; v_revoked:=private.system_admin_revoke_auth_sessions(p_target_user_id);
 perform private.audit_append(p_recovery_id,'recovery',null,null,null,'system_admin.recovery_membership_removed','system_admin',p_target_user_id,null,null,jsonb_build_object('recovery_id',p_recovery_id,'reason',btrim(p_reason),'previous_state',v_state,'revoked_sessions',v_revoked)); return jsonb_build_object('user_id',p_target_user_id,'removed',true,'previous_state',v_state,'revoked_sessions',v_revoked);
end;
$$;
alter function private.recovery_system_admin_remove(uuid,uuid,text) owner to domain_owner;
revoke all on function private.recovery_system_admin_remove(uuid,uuid,text) from public;
grant execute on function private.recovery_system_admin_remove(uuid,uuid,text) to recovery_executor;

create or replace function private.account_principal(p_ctx private.account_context)
returns table(ok boolean,reason text,user_id uuid,platform_id uuid,platform_status text,platform_account_id uuid,account_status text,authorization text)
language plpgsql stable security definer set search_path=pg_catalog,private,public as $$
declare v_session record; v_platform record; v_account record;
begin
 if (p_ctx).user_id is null or (p_ctx).session_id is null or (p_ctx).platform_id is null or (p_ctx).platform_key_id is null then return query select false,'invalid_input',null::uuid,null::uuid,null::text,null::uuid,null::text,'unauthorized'; return; end if;
 select * into v_session from private.check_user_session((p_ctx).user_id,(p_ctx).session_id); if not coalesce(v_session.active,false) then return query select false,v_session.reason,(p_ctx).user_id,(p_ctx).platform_id,null::text,null::uuid,null::text,'unauthorized'; return; end if;
 if exists(select 1 from private.system_admin m where m.user_id=(p_ctx).user_id) then return query select false,'admin_identity',(p_ctx).user_id,(p_ctx).platform_id,null::text,null::uuid,null::text,'unauthorized'; return; end if;
 select p.id,p.status into v_platform from public.platforms p where p.id=(p_ctx).platform_id and exists(select 1 from private.platform_api_keys k where k.id=(p_ctx).platform_key_id and k.platform_id=p.id and k.status='active' and (k.expires_at is null or k.expires_at>now())); if not found then return query select false,'platform_key_invalid',(p_ctx).user_id,(p_ctx).platform_id,null::text,null::uuid,null::text,'unauthorized'; return; end if;
 select a.id,a.status into v_account from public.platform_accounts a where a.platform_id=(p_ctx).platform_id and a.user_id=(p_ctx).user_id; if not found then return query select true,'ok',(p_ctx).user_id,(p_ctx).platform_id,v_platform.status,null::uuid,'not_activated',case when v_platform.status='active' then 'not_activated' else 'platform_disabled' end; return; end if;
 return query select true,'ok',(p_ctx).user_id,(p_ctx).platform_id,v_platform.status,v_account.id,v_account.status,case when v_platform.status<>'active' then 'platform_disabled' when v_account.status='active' then 'allowed' when v_account.status='suspended' then 'suspended' else 'closed' end;
end;
$$;
alter function private.account_principal(private.account_context) owner to domain_owner;

create or replace function private.account_principal_presented(p_user_id uuid,p_session_id uuid,p_platform_key_id uuid,p_key_hmac text,p_hmac_key_version integer)
returns table(key_id uuid,platform_id uuid,platform_status text,ok boolean,reason text,user_id uuid,platform_account_id uuid,account_status text,authorization text)
language plpgsql stable security definer set search_path=pg_catalog,private,public as $$
declare v_key record; v_session record; v_account record;
begin
 if p_user_id is null or p_session_id is null or p_platform_key_id is null or p_key_hmac is null or p_hmac_key_version is null then return; end if;
 select verified.key_id,verified.platform_id,verified.platform_status into v_key from private.platform_key_verify_presented(p_platform_key_id,p_key_hmac,p_hmac_key_version) verified; if not found then return; end if;
 select * into v_session from private.check_user_session(p_user_id,p_session_id); if not coalesce(v_session.active,false) then return query select v_key.key_id,v_key.platform_id,v_key.platform_status,false,v_session.reason,p_user_id,null::uuid,null::text,'unauthorized'::text; return; end if;
 if exists(select 1 from private.system_admin m where m.user_id=p_user_id) then return query select v_key.key_id,v_key.platform_id,v_key.platform_status,false,'admin_identity',p_user_id,null::uuid,null::text,'unauthorized'::text; return; end if;
 select a.id,a.status into v_account from public.platform_accounts a where a.platform_id=v_key.platform_id and a.user_id=p_user_id; if not found then return query select v_key.key_id,v_key.platform_id,v_key.platform_status,true,'ok',p_user_id,null::uuid,null::text,case when v_key.platform_status='active' then 'not_activated' else 'platform_disabled' end; return; end if;
 return query select v_key.key_id,v_key.platform_id,v_key.platform_status,true,'ok',p_user_id,v_account.id,v_account.status,case when v_key.platform_status<>'active' then 'platform_disabled' when v_account.status='active' then 'allowed' when v_account.status='suspended' then 'suspended' else 'closed' end;
end;
$$;
alter function private.account_principal_presented(uuid,uuid,uuid,text,integer) owner to domain_owner;

commit;
