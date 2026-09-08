begin;

select plan(4);

select has_function(
  'private',
  'user_recent_auth_proof_issue',
  array['uuid', 'uuid', 'text'],
  'ordinary recent-auth proof issuer exists'
);
select ok(
  has_function_privilege(
    'account_executor',
    'private.user_recent_auth_proof_issue(uuid, uuid, text)',
    'execute'
  ),
  'account executor can issue a constrained ordinary recent-auth proof'
);
select ok(
  not has_function_privilege(
    'admin_executor',
    'private.user_recent_auth_proof_issue(uuid, uuid, text)',
    'execute'
  ),
  'admin executor cannot issue an ordinary recent-auth proof'
);
select ok(
  (
    select array_to_string(proconfig, ',') like 'search_path=pg_catalog%'
    from pg_proc
    where oid = 'private.user_recent_auth_proof_issue(uuid, uuid, text)'::regprocedure
  ),
  'ordinary recent-auth proof issuer pins a system-only search path'
);

select * from finish();

rollback;
