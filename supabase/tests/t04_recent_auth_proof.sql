begin;

select plan(5);

select has_function(
  'private',
  'admin_step_up_issue',
  array['private.admin_context', 'uuid'],
  'central recent-auth proof issuer exists'
);
select ok(
  has_function_privilege(
    'admin_executor',
    'private.admin_step_up_issue(private.admin_context, uuid)',
    'execute'
  ),
  'admin executor can issue a constrained recent-auth proof'
);
select ok(
  not has_function_privilege(
    'account_executor',
    'private.admin_step_up_issue(private.admin_context, uuid)',
    'execute'
  ),
  'account executor cannot issue a recent-auth proof'
);
select ok(
  (select array_to_string(proconfig, ',') like 'search_path=pg_catalog%'
   from pg_proc
   where oid = 'private.admin_step_up_issue(private.admin_context, uuid)'::regprocedure),
  'recent-auth proof issuer pins a system-only search path'
);
select ok(
  not has_table_privilege('admin_executor', 'auth.mfa_factors', 'select')
    and not has_schema_privilege('domain_owner', 'auth', 'usage'),
  'only Auth HTTP verification, never runtime SQL roles, reads MFA factors'
);

select * from finish();

rollback;
