begin;

select plan(8);

select has_function(
  'private',
  'auth_session_recent_for_proof',
  array['uuid', 'uuid', 'timestamptz'],
  'ordinary proof freshness helper exists'
);
select has_function(
  'private',
  'user_recent_auth_proof_issue',
  array['private.account_context', 'uuid', 'text'],
  'ordinary proof issuer exists'
);
select ok(
  has_function_privilege(
    'account_executor',
    'private.user_recent_auth_proof_issue(private.account_context, uuid, text)',
    'execute'
  ),
  'account executor can use the central ordinary proof issuer'
);
select ok(
  not has_function_privilege(
    'account_executor',
    'private.auth_session_recent_for_proof(uuid, uuid, timestamptz)',
    'execute'
  ),
  'account executor cannot call the Auth-session system helper directly'
);
select ok(
  not has_table_privilege('account_executor', 'auth.sessions', 'select'),
  'account executor cannot read Auth sessions directly'
);
select ok(
  (select prosecdef from pg_proc where oid = 'private.user_recent_auth_proof_issue(private.account_context, uuid, text)'::regprocedure),
  'ordinary proof issuer is security definer'
);
select ok(
  (select prosecdef from pg_proc where oid = 'private.auth_session_recent_for_proof(uuid, uuid, timestamptz)'::regprocedure),
  'Auth-session freshness helper is security definer'
);
select ok(
  (select array_to_string(proconfig, ',') like 'search_path=pg_catalog%'
   from pg_proc where oid = 'private.user_recent_auth_proof_issue(private.account_context, uuid, text)'::regprocedure),
  'ordinary proof issuer pins search_path'
);

select * from finish();

rollback;
