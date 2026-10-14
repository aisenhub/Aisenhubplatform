begin;
select plan(5);

select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='private' and p.proname=any(array[
     'admin_account_get','admin_account_list','admin_account_patch','admin_audit_list',
     'admin_platform_list','admin_platform_key_list','admin_origin_list',
     'admin_billing_metrics','admin_billing_order_read'])),
  0::bigint,
  'retired Admin entry points cannot bypass canonical workbench, pagination or governance'
);

select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind='r'
     and (has_table_privilege('anon',c.oid,'truncate')
       or has_table_privilege('authenticated',c.oid,'truncate')
       or has_table_privilege('anon',c.oid,'trigger')
       or has_table_privilege('authenticated',c.oid,'trigger'))),
  0::bigint,
  'browser roles cannot bypass RLS with TRUNCATE or TRIGGER on business tables'
);
create table public.prelaunch_future_privilege_fixture(id uuid);
select ok(
  not has_table_privilege('anon','public.prelaunch_future_privilege_fixture','select,insert,update,delete,truncate,references,trigger'),
  'new public business tables do not inherit browser privileges'
);
select ok(
  not has_table_privilege('authenticated','public.prelaunch_future_privilege_fixture','select,insert,update,delete,truncate,references,trigger'),
  'authenticated users cannot bypass future table authorization'
);

revoke usage on schema public from public;
set local role domain_owner;
select extensions.lives_ok(
  $$insert into public.platforms(code,name) values('prelaunch-schema-usage-fixture','Synthetic fixture')$$,
  'platform bootstrap works without PUBLIC schema defaults'
);
reset role;

select * from finish();
rollback;
