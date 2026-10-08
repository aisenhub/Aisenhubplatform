begin;

select plan(9);

select has_function(
  'private',
  'admin_step_up_issue',
  array['private.admin_context', 'uuid', 'timestamptz', 'uuid'],
  'central recent-auth proof issuer exists'
);
select ok(
  to_regprocedure('private.admin_step_up_issue(private.admin_context, uuid)') is null,
  'legacy issuer without a verified timestamp is removed'
);
select ok(
  has_function_privilege(
    'admin_executor',
    'private.admin_step_up_issue(private.admin_context, uuid, timestamptz, uuid)',
    'execute'
  ),
  'admin executor can issue a constrained recent-auth proof'
);
select ok(
  not has_function_privilege(
    'account_executor',
    'private.admin_step_up_issue(private.admin_context, uuid, timestamptz, uuid)',
    'execute'
  ),
  'account executor cannot issue a recent-auth proof'
);
select ok(
  (select array_to_string(proconfig, ',') like 'search_path=pg_catalog%'
   from pg_proc
   where oid = 'private.admin_step_up_issue(private.admin_context, uuid, timestamptz, uuid)'::regprocedure),
  'recent-auth proof issuer pins a system-only search path'
);
select ok(
  pg_get_functiondef('private.admin_step_up_issue(private.admin_context, uuid, timestamptz, uuid)'::regprocedure) like '%30 minutes%'
    or pg_get_functiondef('private.admin_step_up_issue(private.admin_context, uuid, timestamptz, uuid)'::regprocedure) like '%00:30:00%',
  'recent-auth proof issuer grants at most thirty minutes'
);
select ok(
  pg_get_functiondef('private.admin_step_up_valid(uuid, uuid, uuid)'::regprocedure) like '%30 minutes%'
    or pg_get_functiondef('private.admin_step_up_valid(uuid, uuid, uuid)'::regprocedure) like '%00:30:00%',
  'recent-auth proof validator enforces the thirty-minute bound'
);
select ok(
  (select indexdef ilike 'create unique index%attestation_nonce%'
   from pg_indexes
   where schemaname = 'private'
     and indexname = 'admin_step_up_attestation_nonce_idx'),
  'MFA attestation nonce is uniquely consumed per Admin session'
);
select ok(
  not has_table_privilege('admin_executor', 'auth.mfa_factors', 'select')
    and not has_schema_privilege('domain_owner', 'auth', 'usage'),
  'only Auth HTTP verification, never runtime SQL roles, reads MFA factors'
);

select * from finish();

rollback;
