begin;

create or replace function private.admin_step_up_valid(
  p_user_id uuid,
  p_session_id uuid,
  p_proof_id uuid
) returns boolean
language sql stable security definer
set search_path=pg_catalog,private as $$
  select exists (
    select 1
    from private.admin_step_up proof
    where proof.id = p_proof_id
      and proof.user_id = p_user_id
      and proof.session_id = p_session_id
      and proof.expires_at > now()
      and proof.verified_at <= now()
      and proof.expires_at <= proof.verified_at + interval '30 minutes'
      and proof.id = (
        select latest.id
        from private.admin_step_up latest
        where latest.user_id = p_user_id
          and latest.session_id = p_session_id
        order by latest.verified_at desc, latest.id desc
        limit 1
      )
  )
$$;
alter function private.admin_step_up_valid(uuid,uuid,uuid) owner to domain_owner;

create or replace function private.system_admin_verified_totp_factor_exists(
  p_user_id uuid,
  p_factor_id uuid
) returns boolean
language sql stable security definer
set search_path=pg_catalog,auth as $$
  select exists(
    select 1
    from auth.mfa_factors f
    where f.user_id=p_user_id
      and f.id=p_factor_id
      and f.factor_type::text='totp'
      and f.status::text='verified'
  )
$$;
alter function private.system_admin_verified_totp_factor_exists(uuid,uuid) owner to postgres;
revoke all on function private.system_admin_verified_totp_factor_exists(uuid,uuid) from public,anon,authenticated,account_executor,admin_executor,job_executor,recovery_executor;
grant execute on function private.system_admin_verified_totp_factor_exists(uuid,uuid) to domain_owner;

create table private.admin_mfa_factor_operations(
  operation_id uuid primary key,
  user_id uuid not null references private.system_admin(user_id) on delete cascade,
  session_id uuid not null,
  factor_id uuid not null,
  request_id uuid not null,
  state text not null check(state in ('authorized','completed','failed')),
  authorized_at timestamptz not null default clock_timestamp(),
  lease_until timestamptz not null,
  completed_at timestamptz,
  error_code text,
  check(lease_until>authorized_at),
  check((state='authorized' and completed_at is null) or (state<>'authorized' and completed_at is not null)),
  check(error_code is null or length(error_code) between 1 and 128)
);
alter table private.admin_mfa_factor_operations owner to domain_owner;
alter table private.admin_mfa_factor_operations enable row level security;
alter table private.admin_mfa_factor_operations force row level security;
create policy admin_mfa_factor_operations_domain_owner on private.admin_mfa_factor_operations
  to domain_owner using(true) with check(true);
create unique index admin_mfa_factor_operations_one_active_user
  on private.admin_mfa_factor_operations(user_id) where state='authorized';
create index admin_mfa_factor_operations_cleanup_idx
  on private.admin_mfa_factor_operations(state,lease_until);
revoke all on table private.admin_mfa_factor_operations from public,anon,authenticated,account_executor,admin_executor,job_executor,recovery_executor;

create or replace function private.admin_mfa_factor_delete_prepare(
  p_ctx private.admin_context,
  p_recent_proof_id uuid,
  p_factor_id uuid,
  p_operation_id uuid
) returns table(
  operation_id uuid,
  membership_state text,
  verified_totp_count integer,
  minimum_remaining_factor_count integer,
  lease_until timestamptz,
  revoked_proof_count integer
)
language plpgsql security definer
set search_path=pg_catalog,private as $$
declare
  v_member private.system_admin%rowtype;
  v_verified_count integer;
  v_minimum_remaining integer;
  v_revoked integer;
  v_lease_until timestamptz;
  v_existing private.admin_mfa_factor_operations%rowtype;
begin
  if (p_ctx).admin_user_id is null
     or (p_ctx).session_id is null
     or (p_ctx).request_id is null
     or p_recent_proof_id is null
     or p_factor_id is null
     or p_operation_id is null then
    raise exception using errcode='22023',message='invalid_input';
  end if;

  select * into v_member
  from private.system_admin m
  where m.user_id=(p_ctx).admin_user_id
  for update;
  if not found then
    raise exception using errcode='42501',message='admin_required';
  end if;
  if not exists(
    select 1 from private.check_user_session((p_ctx).admin_user_id,(p_ctx).session_id) s where s.active
  ) then
    raise exception using errcode='42501',message='session_not_active';
  end if;
  if not private.admin_step_up_valid((p_ctx).admin_user_id,(p_ctx).session_id,p_recent_proof_id) then
    raise exception using errcode='42501',message='recent_mfa_required';
  end if;

  select * into v_existing
  from private.admin_mfa_factor_operations o
  where o.user_id=(p_ctx).admin_user_id and o.state='authorized'
  for update;
  if found then
    if v_existing.lease_until>clock_timestamp() then
      raise exception using errcode='P0001',message='mfa_factor_operation_in_progress';
    end if;
    if private.system_admin_verified_totp_factor_exists(v_existing.user_id,v_existing.factor_id) then
      update private.admin_mfa_factor_operations
      set state='failed',completed_at=clock_timestamp(),error_code='lease_expired_factor_present'
      where operation_id=v_existing.operation_id;
    else
      update private.admin_mfa_factor_operations
      set state='completed',completed_at=clock_timestamp(),error_code=null
      where operation_id=v_existing.operation_id;
      perform private.audit_append(
        (p_ctx).request_id,'admin',(p_ctx).admin_user_id,null,null,
        'system_admin.mfa_factor_removed','mfa_factor',v_existing.factor_id,null,null,
        jsonb_build_object('operation_id',v_existing.operation_id,'reconciled',true)
      );
    end if;
  end if;

  if not private.system_admin_verified_totp_factor_exists((p_ctx).admin_user_id,p_factor_id) then
    raise exception using errcode='P0002',message='resource_not_found';
  end if;
  v_verified_count:=private.system_admin_verified_totp_count((p_ctx).admin_user_id);
  v_minimum_remaining:=case when v_member.state='active' then 2 else 1 end;
  if v_verified_count-1 < v_minimum_remaining then
    raise exception using errcode='P0001',message='mfa_factor_floor_required';
  end if;

  v_lease_until:=clock_timestamp()+interval '15 minutes';
  insert into private.admin_mfa_factor_operations(
    operation_id,user_id,session_id,factor_id,request_id,state,lease_until
  ) values(
    p_operation_id,(p_ctx).admin_user_id,(p_ctx).session_id,p_factor_id,(p_ctx).request_id,'authorized',v_lease_until
  );

  delete from private.admin_step_up p
  where p.user_id=(p_ctx).admin_user_id and p.session_id=(p_ctx).session_id;
  get diagnostics v_revoked=row_count;

  return query
  select p_operation_id,v_member.state,v_verified_count,v_minimum_remaining,v_lease_until,v_revoked;
end;
$$;
alter function private.admin_mfa_factor_delete_prepare(private.admin_context,uuid,uuid,uuid) owner to domain_owner;
revoke all on function private.admin_mfa_factor_delete_prepare(private.admin_context,uuid,uuid,uuid) from public,anon,authenticated,account_executor,job_executor,recovery_executor;
grant execute on function private.admin_mfa_factor_delete_prepare(private.admin_context,uuid,uuid,uuid) to admin_executor;

create or replace function private.admin_mfa_factor_delete_finalize(
  p_ctx private.admin_context,
  p_operation_id uuid,
  p_factor_id uuid,
  p_result text,
  p_error_code text default null
) returns table(state text,replayed boolean)
language plpgsql security definer
set search_path=pg_catalog,private as $$
declare
  v_operation private.admin_mfa_factor_operations%rowtype;
  v_now timestamptz:=clock_timestamp();
begin
  if (p_ctx).admin_user_id is null
     or (p_ctx).session_id is null
     or (p_ctx).request_id is null
     or p_operation_id is null
     or p_factor_id is null
     or p_result not in ('completed','failed') then
    raise exception using errcode='22023',message='invalid_input';
  end if;
  if not exists(
    select 1 from private.system_admin m where m.user_id=(p_ctx).admin_user_id
  ) then
    raise exception using errcode='42501',message='admin_required';
  end if;
  if not exists(
    select 1 from private.check_user_session((p_ctx).admin_user_id,(p_ctx).session_id) s where s.active
  ) then
    raise exception using errcode='42501',message='session_not_active';
  end if;

  select * into v_operation
  from private.admin_mfa_factor_operations o
  where o.operation_id=p_operation_id
    and o.user_id=(p_ctx).admin_user_id
    and o.session_id=(p_ctx).session_id
    and o.factor_id=p_factor_id
  for update;
  if not found then
    raise exception using errcode='P0002',message='resource_not_found';
  end if;
  if v_operation.state<>'authorized' then
    return query select v_operation.state,true;
    return;
  end if;

  if p_result='completed' then
    if private.system_admin_verified_totp_factor_exists((p_ctx).admin_user_id,p_factor_id) then
      raise exception using errcode='P0001',message='mfa_factor_still_present';
    end if;
    update private.admin_mfa_factor_operations
    set state='completed',completed_at=v_now,error_code=null
    where operation_id=p_operation_id;
    perform private.audit_append(
      (p_ctx).request_id,'admin',(p_ctx).admin_user_id,null,null,
      'system_admin.mfa_factor_removed','mfa_factor',p_factor_id,null,null,
      jsonb_build_object('operation_id',p_operation_id,'reconciled',false)
    );
    return query select 'completed'::text,false;
    return;
  end if;

  if not private.system_admin_verified_totp_factor_exists((p_ctx).admin_user_id,p_factor_id) then
    raise exception using errcode='P0001',message='mfa_factor_result_unknown';
  end if;
  update private.admin_mfa_factor_operations
  set state='failed',completed_at=v_now,error_code=left(coalesce(nullif(btrim(p_error_code),''),'provider_rejected'),128)
  where operation_id=p_operation_id;
  return query select 'failed'::text,false;
end;
$$;
alter function private.admin_mfa_factor_delete_finalize(private.admin_context,uuid,uuid,text,text) owner to domain_owner;
revoke all on function private.admin_mfa_factor_delete_finalize(private.admin_context,uuid,uuid,text,text) from public,anon,authenticated,account_executor,job_executor,recovery_executor;
grant execute on function private.admin_mfa_factor_delete_finalize(private.admin_context,uuid,uuid,text,text) to admin_executor;

commit;