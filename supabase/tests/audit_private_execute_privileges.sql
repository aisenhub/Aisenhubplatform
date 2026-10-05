begin;
select plan(6);

select is((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and has_function_privilege('anon', p.oid, 'execute')),
  0::bigint, 'anon cannot execute any private function, including later migrations');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and has_function_privilege('authenticated', p.oid, 'execute')),
  0::bigint, 'authenticated cannot execute any private function');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
  lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  where n.nspname = 'private' and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  0::bigint, 'PUBLIC retains no implicit or explicit private EXECUTE grant');
select ok(has_function_privilege('account_executor', 'private.profile_get(private.account_context)', 'execute')
  and has_function_privilege('admin_executor', 'private.admin_platform_list(private.admin_context, integer)', 'execute')
  and has_function_privilege('job_executor', 'private.idempotency_cleanup(private.job_context, timestamptz, integer)', 'execute'),
  'Account, Admin and Worker retain their explicitly granted entry points');

set local role anon;
select throws_ok($$select private.profile_get(null::private.account_context)$$,
  '42501', null, 'anon cannot call the profile entry point with a forged context');
reset role;
set local role authenticated;
select throws_ok($$select private.profile_get(null::private.account_context)$$,
  '42501', null, 'authenticated cannot call the profile entry point with a forged context');
reset role;

select * from finish();
rollback;
