begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_catalog;

select plan(17);

select has_function(
  'private',
  'admin_mfa_factor_delete_prepare',
  array['private.admin_context','uuid','uuid','uuid'],
  'verified TOTP deletion prepare function exists'
);
select has_function(
  'private',
  'admin_mfa_factor_delete_finalize',
  array['private.admin_context','uuid','uuid','text','text'],
  'verified TOTP deletion finalize function exists'
);
select ok(
  has_function_privilege('admin_executor','private.admin_mfa_factor_delete_prepare(private.admin_context,uuid,uuid,uuid)','execute')
  and has_function_privilege('admin_executor','private.admin_mfa_factor_delete_finalize(private.admin_context,uuid,uuid,text,text)','execute'),
  'admin executor can prepare and finalize the controlled deletion operation'
);
select ok(
  not has_function_privilege('account_executor','private.admin_mfa_factor_delete_prepare(private.admin_context,uuid,uuid,uuid)','execute')
  and not has_function_privilege('job_executor','private.admin_mfa_factor_delete_prepare(private.admin_context,uuid,uuid,uuid)','execute')
  and not has_function_privilege('recovery_executor','private.admin_mfa_factor_delete_prepare(private.admin_context,uuid,uuid,uuid)','execute'),
  'non-admin runtime roles cannot prepare MFA factor deletion'
);
select ok(
  not has_table_privilege('admin_executor','private.admin_mfa_factor_operations','select')
  and not has_table_privilege('admin_executor','private.admin_mfa_factor_operations','insert')
  and not has_table_privilege('admin_executor','private.admin_mfa_factor_operations','update'),
  'admin executor cannot bypass the operation domain functions'
);

insert into auth.users(id,aud,role,email,encrypted_password,created_at,updated_at)
values ('00000000-0000-4700-8000-000000000001','authenticated','authenticated','mfa-factor-lifecycle@example.test','x',now(),now());
insert into auth.sessions(id,user_id,created_at,updated_at,aal,not_after)
values
  ('00000000-0000-4710-8000-000000000001','00000000-0000-4700-8000-000000000001',now(),now(),'aal2',now()+interval '1 hour'),
  ('00000000-0000-4710-8000-000000000002','00000000-0000-4700-8000-000000000001',now(),now(),'aal2',now()+interval '1 hour');
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at)
values
  ('00000000-0000-4720-8000-000000000001','00000000-0000-4700-8000-000000000001','totp','verified',now(),now()),
  ('00000000-0000-4720-8000-000000000002','00000000-0000-4700-8000-000000000001','totp','verified',now(),now()),
  ('00000000-0000-4720-8000-000000000003','00000000-0000-4700-8000-000000000001','totp','verified',now(),now());
insert into private.system_admin(user_id,state,activated_at)
values ('00000000-0000-4700-8000-000000000001','active',now());
insert into private.admin_step_up(id,user_id,session_id,factor_id,verified_at,expires_at)
values
  ('00000000-0000-4730-8000-000000000001','00000000-0000-4700-8000-000000000001','00000000-0000-4710-8000-000000000001','00000000-0000-4720-8000-000000000001',now()-interval '1 minute',now()+interval '9 minutes'),
  ('00000000-0000-4730-8000-000000000004','00000000-0000-4700-8000-000000000001','00000000-0000-4710-8000-000000000001','00000000-0000-4720-8000-000000000001',now(),now()+interval '10 minutes'),
  ('00000000-0000-4730-8000-000000000002','00000000-0000-4700-8000-000000000001','00000000-0000-4710-8000-000000000002','00000000-0000-4720-8000-000000000002',now(),now()+interval '10 minutes');

select ok(
  not private.admin_step_up_valid('00000000-0000-4700-8000-000000000001','00000000-0000-4710-8000-000000000001','00000000-0000-4730-8000-000000000001'),
  'an older recent proof is invalid as soon as the same session has a newer proof'
);
select ok(
  private.admin_step_up_valid('00000000-0000-4700-8000-000000000001','00000000-0000-4710-8000-000000000001','00000000-0000-4730-8000-000000000004'),
  'only the newest recent proof for a user/session is valid'
);

set local role admin_executor;
create temporary table mfa_delete_prepare_snapshot on commit drop as
select * from private.admin_mfa_factor_delete_prepare(
  row('00000000-0000-4700-8000-000000000001','00000000-0000-4710-8000-000000000001','00000000-0000-4740-8000-000000000001')::private.admin_context,
  '00000000-0000-4730-8000-000000000004',
  '00000000-0000-4720-8000-000000000003',
  '00000000-0000-4750-8000-000000000001'
);
set local role postgres;
select is(
  (select operation_id from mfa_delete_prepare_snapshot),
  '00000000-0000-4750-8000-000000000001'::uuid,
  'prepare returns the caller operation id'
);

select is(
  (select count(*)::bigint from private.admin_step_up where session_id='00000000-0000-4710-8000-000000000001'),
  0::bigint,
  'prepare invalidates all old recent proofs for the mutating session'
);
select is(
  (select count(*)::bigint from private.admin_step_up where session_id='00000000-0000-4710-8000-000000000002'),
  1::bigint,
  'prepare does not consume a different session proof'
);

set local role admin_executor;
do $$
declare
  error_message text;
begin
  begin
    perform 1 from private.admin_mfa_factor_delete_prepare(
      row('00000000-0000-4700-8000-000000000001','00000000-0000-4710-8000-000000000002','00000000-0000-4740-8000-000000000002')::private.admin_context,
      '00000000-0000-4730-8000-000000000002',
      '00000000-0000-4720-8000-000000000002',
      '00000000-0000-4750-8000-000000000002'
    );
    raise exception 'concurrent factor deletion unexpectedly prepared';
  exception when raise_exception then
    get stacked diagnostics error_message = message_text;
    if error_message <> 'mfa_factor_operation_in_progress' then
      raise exception 'expected mfa_factor_operation_in_progress, received %', error_message;
    end if;
  end;
end
$$;
set local role postgres;
select ok(true, 'a second session cannot prepare a concurrent factor deletion');

delete from auth.mfa_factors where id='00000000-0000-4720-8000-000000000003';
set local role admin_executor;
create temporary table mfa_delete_finalize_snapshot on commit drop as
select * from private.admin_mfa_factor_delete_finalize(
  row('00000000-0000-4700-8000-000000000001','00000000-0000-4710-8000-000000000001','00000000-0000-4740-8000-000000000003')::private.admin_context,
  '00000000-0000-4750-8000-000000000001',
  '00000000-0000-4720-8000-000000000003',
  'completed',
  null
);
create temporary table mfa_delete_replay_snapshot on commit drop as
select * from private.admin_mfa_factor_delete_finalize(
  row('00000000-0000-4700-8000-000000000001','00000000-0000-4710-8000-000000000001','00000000-0000-4740-8000-000000000004')::private.admin_context,
  '00000000-0000-4750-8000-000000000001',
  '00000000-0000-4720-8000-000000000003',
  'completed',
  null
);
set local role postgres;
select is(
  (select state from mfa_delete_finalize_snapshot),
  'completed',
  'finalize accepts a Provider-confirmed absent factor'
);
select ok(
  (select replayed from mfa_delete_replay_snapshot),
  'finalize replay is idempotent'
);
select ok(
  exists(select 1 from public.audit_logs where event_type='system_admin.mfa_factor_removed' and target_id='00000000-0000-4720-8000-000000000003'),
  'successful factor removal is audited only after Provider state is absent'
);

insert into private.admin_step_up(id,user_id,session_id,factor_id,verified_at,expires_at)
values ('00000000-0000-4730-8000-000000000003','00000000-0000-4700-8000-000000000001','00000000-0000-4710-8000-000000000001','00000000-0000-4720-8000-000000000001',now(),now()+interval '10 minutes');
set local role admin_executor;
do $$
declare
  error_message text;
begin
  begin
    perform 1 from private.admin_mfa_factor_delete_prepare(
      row('00000000-0000-4700-8000-000000000001','00000000-0000-4710-8000-000000000001','00000000-0000-4740-8000-000000000005')::private.admin_context,
      '00000000-0000-4730-8000-000000000003',
      '00000000-0000-4720-8000-000000000002',
      '00000000-0000-4750-8000-000000000003'
    );
    raise exception 'factor floor unexpectedly allowed deletion';
  exception when raise_exception then
    get stacked diagnostics error_message = message_text;
    if error_message <> 'mfa_factor_floor_required' then
      raise exception 'expected mfa_factor_floor_required, received %', error_message;
    end if;
  end;
end
$$;
set local role postgres;
select ok(true, 'active System Admin cannot delete below two verified TOTP factors');

select is(
  (select count(*)::bigint from private.admin_mfa_factor_operations where state='authorized'),
  0::bigint,
  'no active mutation lease remains after completed operation and rejected floor check'
);
select is(
  (select count(*)::bigint from private.admin_mfa_factor_operations where state='completed'),
  1::bigint,
  'completed factor mutation remains as durable recovery evidence'
);

select * from finish();
rollback;
