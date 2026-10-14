begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_catalog;

select plan(28);

select ok(
  has_function_privilege('admin_executor', 'private.admin_system_admin_add(private.admin_context, uuid, uuid, uuid, text)', 'execute'),
  'admin executor can add System Admin memberships'
);
select ok(
  has_function_privilege('recovery_executor', 'private.recovery_system_admin_add(uuid, uuid, text)', 'execute'),
  'recovery executor owns the offline System Admin recovery capability'
);
select is(
  (select count(*)::bigint from information_schema.columns where table_schema='private' and table_name='system_admin' and column_name='singleton_id'),
  0::bigint,
  'System Admin membership no longer has singleton_id'
);

insert into auth.users(id,aud,role,email,encrypted_password,created_at,updated_at)
values
  ('00000000-0000-4600-8000-000000000001','authenticated','authenticated','resilience-a@example.test','x',now(),now()),
  ('00000000-0000-4600-8000-000000000002','authenticated','authenticated','resilience-b@example.test','x',now(),now()),
  ('00000000-0000-4600-8000-000000000003','authenticated','authenticated','resilience-c@example.test','x',now(),now()),
  ('00000000-0000-4600-8000-000000000004','authenticated','authenticated','resilience-d@example.test','x',now(),now()),
  ('00000000-0000-4600-8000-000000000005','authenticated','authenticated','resilience-e@example.test','x',now(),now());

insert into auth.sessions(id,user_id,created_at,updated_at,aal,not_after)
values
  ('00000000-0000-4610-8000-000000000001','00000000-0000-4600-8000-000000000001',now(),now(),'aal2',now()+interval '1 hour'),
  ('00000000-0000-4610-8000-000000000002','00000000-0000-4600-8000-000000000002',now(),now(),'aal2',now()+interval '1 hour'),
  ('00000000-0000-4610-8000-000000000003','00000000-0000-4600-8000-000000000003',now(),now(),'aal2',now()+interval '1 hour');

insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at)
values
  ('00000000-0000-4620-8000-000000000001','00000000-0000-4600-8000-000000000001','totp','verified',now(),now()),
  ('00000000-0000-4620-8000-000000000002','00000000-0000-4600-8000-000000000001','totp','verified',now(),now()),
  ('00000000-0000-4620-8000-000000000003','00000000-0000-4600-8000-000000000002','totp','verified',now(),now()),
  ('00000000-0000-4620-8000-000000000004','00000000-0000-4600-8000-000000000002','totp','verified',now(),now()),
  ('00000000-0000-4620-8000-000000000005','00000000-0000-4600-8000-000000000003','totp','verified',now(),now());

insert into private.system_admin(user_id,state,activated_at)
values
  ('00000000-0000-4600-8000-000000000001','active',now()),
  ('00000000-0000-4600-8000-000000000002','active',now());

insert into private.admin_step_up(id,user_id,session_id,factor_id,verified_at,expires_at)
values
  ('00000000-0000-4630-8000-000000000001','00000000-0000-4600-8000-000000000001','00000000-0000-4610-8000-000000000001','00000000-0000-4620-8000-000000000001',now(),now()+interval '10 minutes'),
  ('00000000-0000-4630-8000-000000000002','00000000-0000-4600-8000-000000000002','00000000-0000-4610-8000-000000000002','00000000-0000-4620-8000-000000000003',now(),now()+interval '10 minutes');

select ok(
  (select readiness_healthy from private.admin_system_admin_self_status(
    row('00000000-0000-4600-8000-000000000001','00000000-0000-4610-8000-000000000001','00000000-0000-4640-8000-000000000001')::private.admin_context,
    'aal2'
  )),
  'two active admins with two verified TOTP factors are readiness healthy'
);

select is(
  private.admin_system_admin_add(
    row('00000000-0000-4600-8000-000000000001','00000000-0000-4610-8000-000000000001','00000000-0000-4640-8000-000000000002')::private.admin_context,
    '00000000-0000-4600-8000-000000000003',
    '00000000-0000-4630-8000-000000000001',
    '00000000-0000-4650-8000-000000000001',
    'add pending admin'
  )->>'state',
  'pending',
  'new System Admin membership starts pending'
);
select is(
  private.admin_system_admin_add(
    row('00000000-0000-4600-8000-000000000001','00000000-0000-4610-8000-000000000001','00000000-0000-4640-8000-000000000003')::private.admin_context,
    '00000000-0000-4600-8000-000000000003',
    '00000000-0000-4630-8000-000000000001',
    '00000000-0000-4650-8000-000000000001',
    'add pending admin'
  )->>'replayed',
  'true',
  'System Admin add replays the same operation idempotently'
);
select is(
  (select state from private.system_admin where user_id='00000000-0000-4600-8000-000000000003'),
  'pending',
  'pending membership is persisted explicitly'
);
select throws_ok(
  $$select * from private.admin_system_admin_list(row('00000000-0000-4600-8000-000000000003','00000000-0000-4610-8000-000000000003','00000000-0000-4640-8000-000000000004')::private.admin_context)$$,
  '42501',
  'admin_required',
  'pending membership cannot use ordinary Admin authorization'
);
select throws_ok(
  $$select private.admin_system_admin_activate(row('00000000-0000-4600-8000-000000000001','00000000-0000-4610-8000-000000000001','00000000-0000-4640-8000-000000000005')::private.admin_context,'00000000-0000-4600-8000-000000000003','00000000-0000-4630-8000-000000000001','00000000-0000-4650-8000-000000000002','activate before backup totp')$$,
  'P0001',
  'system_admin_mfa_readiness_required',
  'activation is blocked until two verified TOTP factors exist'
);

insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at)
values ('00000000-0000-4620-8000-000000000006','00000000-0000-4600-8000-000000000003','totp','verified',now(),now());

select is(
  private.admin_system_admin_activate(
    row('00000000-0000-4600-8000-000000000001','00000000-0000-4610-8000-000000000001','00000000-0000-4640-8000-000000000006')::private.admin_context,
    '00000000-0000-4600-8000-000000000003',
    '00000000-0000-4630-8000-000000000001',
    '00000000-0000-4650-8000-000000000003',
    'activate ready admin'
  )->>'state',
  'active',
  'two verified TOTP factors allow explicit activation'
);

select is(
  (select reason from private.account_principal(
    row('00000000-0000-4600-8000-000000000003','00000000-0000-4610-8000-000000000003','00000000-0000-4660-8000-000000000001','00000000-0000-4660-8000-000000000002','00000000-0000-4640-8000-000000000007')::private.account_context
  )),
  'admin_identity',
  'System Admin identity is rejected from Consumer principal resolution'
);
select is(
  (select "authorization" from private.account_principal(
    row('00000000-0000-4600-8000-000000000003','00000000-0000-4610-8000-000000000003','00000000-0000-4660-8000-000000000001','00000000-0000-4660-8000-000000000002','00000000-0000-4640-8000-000000000008')::private.account_context
  )),
  'unauthorized',
  'System Admin identity receives no Consumer authorization'
);

insert into public.platforms(id,code,name)
values ('00000000-0000-4670-8000-000000000001','resilience-dedicated','Resilience Dedicated Identity');
insert into public.platform_accounts(id,platform_id,user_id,status)
values ('00000000-0000-4670-8000-000000000002','00000000-0000-4670-8000-000000000001','00000000-0000-4600-8000-000000000004','active');

select throws_ok(
  $$select private.admin_system_admin_add(row('00000000-0000-4600-8000-000000000001','00000000-0000-4610-8000-000000000001','00000000-0000-4640-8000-000000000009')::private.admin_context,'00000000-0000-4600-8000-000000000004','00000000-0000-4630-8000-000000000001','00000000-0000-4650-8000-000000000004','reject consumer identity')$$,
  'P0001',
  'dedicated_admin_identity_required',
  'existing Consumer identity cannot become a System Admin'
);

select is(
  private.admin_system_admin_remove(
    row('00000000-0000-4600-8000-000000000001','00000000-0000-4610-8000-000000000001','00000000-0000-4640-8000-000000000010')::private.admin_context,
    '00000000-0000-4600-8000-000000000002',
    '00000000-0000-4630-8000-000000000001',
    '00000000-0000-4650-8000-000000000005',
    'remove redundant admin'
  )->>'removed',
  'true',
  'removal succeeds while three active admins exist'
);
select is((select count(*)::bigint from auth.sessions where user_id='00000000-0000-4600-8000-000000000002'),0::bigint,'removal revokes Auth sessions immediately');
select is((select count(*)::bigint from private.admin_step_up where user_id='00000000-0000-4600-8000-000000000002'),0::bigint,'removal revokes recent MFA proofs immediately');
select is((select count(*)::bigint from private.system_admin where state='active'),2::bigint,'normal removal leaves two active admins');
select throws_ok(
  $$select private.admin_system_admin_remove(row('00000000-0000-4600-8000-000000000001','00000000-0000-4610-8000-000000000001','00000000-0000-4640-8000-000000000011')::private.admin_context,'00000000-0000-4600-8000-000000000003','00000000-0000-4630-8000-000000000001','00000000-0000-4650-8000-000000000006','would fall below floor')$$,
  'P0001',
  'minimum_active_system_admins_required',
  'normal removal cannot reduce active admins below two'
);

insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at)
values
  ('00000000-0000-4620-8000-000000000007','00000000-0000-4600-8000-000000000005','totp','verified',now(),now()),
  ('00000000-0000-4620-8000-000000000008','00000000-0000-4600-8000-000000000005','totp','verified',now(),now());

select is(
  private.recovery_system_admin_add('00000000-0000-4680-8000-000000000001','00000000-0000-4600-8000-000000000005','offline recovery add')->>'state',
  'pending',
  'offline recovery adds only a pending membership'
);
select is(
  private.recovery_system_admin_activate('00000000-0000-4680-8000-000000000002','00000000-0000-4600-8000-000000000005','offline recovery activate')->>'state',
  'active',
  'offline recovery activation enforces and accepts two verified TOTP factors'
);
select is((select count(*)::bigint from private.system_admin where state='active'),3::bigint,'recovery can restore redundant active capacity');
select is(
  private.recovery_system_admin_remove('00000000-0000-4680-8000-000000000003','00000000-0000-4600-8000-000000000005','offline recovery cleanup')->>'removed',
  'true',
  'offline recovery removal follows the same active-admin floor'
);
select is((select count(*)::bigint from private.system_admin where state='active'),2::bigint,'recovery cleanup preserves the two-admin floor');

select ok(exists(select 1 from public.audit_logs where event_type='system_admin.membership_added' and target_id='00000000-0000-4600-8000-000000000003'),'membership add is audited');
select ok(exists(select 1 from public.audit_logs where event_type='system_admin.activated' and target_id='00000000-0000-4600-8000-000000000003'),'membership activation is audited');
select ok(exists(select 1 from public.audit_logs where event_type='system_admin.membership_removed' and target_id='00000000-0000-4600-8000-000000000002'),'membership removal is audited');
select ok(exists(select 1 from public.audit_logs where event_type='system_admin.recovery_membership_added' and target_id='00000000-0000-4600-8000-000000000005'),'offline recovery is audited');
select ok(
  (select readiness_healthy from private.admin_system_admin_self_status(
    row('00000000-0000-4600-8000-000000000001','00000000-0000-4610-8000-000000000001','00000000-0000-4640-8000-000000000012')::private.admin_context,
    'aal2'
  )),
  'final two-admin state remains readiness healthy'
);

select * from finish();
rollback;
