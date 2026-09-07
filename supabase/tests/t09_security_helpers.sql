begin;

select plan(30);

select has_table('private', 'system_admin', 'system_admin exists');
select has_table('private', 'identity_lifecycle', 'identity_lifecycle exists');
select has_table('private', 'platform_api_keys', 'platform_api_keys exists');
select has_table('private', 'idempotency_keys', 'idempotency_keys exists');
select has_table('private', 'admin_idempotency', 'admin_idempotency exists');
select has_table('private', 'admin_step_up', 'admin_step_up exists');
select has_table('private', 'deletion_requests', 'deletion_requests exists');
select has_table('private', 'deletion_jobs', 'deletion_jobs exists');
select has_table('private', 'job_leases', 'job_leases exists');
select has_table('private', 'rate_limit_windows', 'rate_limit_windows exists');
select has_table('public', 'audit_logs', 'audit_logs exists');

select ok(
  (select count(*) = 5 from pg_roles
   where rolname in ('account_executor', 'admin_executor', 'job_executor', 'domain_owner', 'recovery_executor')),
  'all runtime role groups exist'
);
select ok(
  (select count(*) = 5 from pg_roles
   where rolname in ('account_executor', 'admin_executor', 'job_executor', 'domain_owner', 'recovery_executor')
     and not rolcanlogin and not rolbypassrls),
  'runtime role groups are non-login and non-bypass'
);
select ok(
  (select count(*) = 10 from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'private' and c.relkind = 'r' and c.relrowsecurity),
  'all private auxiliary tables have RLS'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.audit_logs'::regclass),
  'audit_logs has RLS'
);

select ok(
  not has_table_privilege('account_executor', 'private.admin_step_up', 'select'),
  'account_executor cannot read step-up storage directly'
);
select ok(
  not has_table_privilege('admin_executor', 'private.platform_api_keys', 'insert'),
  'admin_executor cannot insert key metadata directly'
);
select ok(
  has_function_privilege('job_executor', 'private.job_lease_claim(text, uuid, text, integer)', 'execute'),
  'job_executor can call constrained lease claim'
);
select ok(
  not has_function_privilege('account_executor', 'private.idempotency_claim(uuid, uuid, text, text, text, bytea)', 'execute'),
  'account_executor cannot split idempotency claim directly'
);
select ok(
  has_function_privilege('domain_owner', 'private.check_user_session(uuid, uuid)', 'execute'),
  'domain_owner can call session helper'
);

select ok(
  (select count(*) = 3 from information_schema.columns
   where table_schema = 'private' and table_name = 'admin_step_up'
     and column_name in ('session_id', 'factor_id', 'expires_at')),
  'step-up stores session, factor and expiry binding'
);
select ok(
  exists (select 1 from pg_constraint
          where conrelid = 'private.admin_step_up'::regclass
            and (pg_get_constraintdef(oid) like '%5 minutes%'
                 or pg_get_constraintdef(oid) like '%00:05:00%')),
  'step-up expiry is bounded to five minutes'
);
select ok(
  exists (select 1 from pg_constraint
          where conrelid = 'private.platform_api_keys'::regclass
            and pg_get_constraintdef(oid) like '%key_hmac%'),
  'platform key HMAC has a database check'
);
select ok(
  exists (select 1 from pg_constraint
          where conrelid = 'private.idempotency_keys'::regclass
            and pg_get_constraintdef(oid) like '%octet_length(request_hash)%'),
  'user idempotency request hash is fixed length'
);
select ok(
  exists (select 1 from pg_indexes
          where schemaname = 'private' and indexname = 'deletion_requests_active_user_idx'),
  'active deletion request is unique per user'
);
select ok(
  exists (select 1 from pg_policy
          where polrelid = 'public.audit_logs'::regclass
            and polname = 'audit_logs_domain_owner_insert'),
  'audit append policy exists'
);
select ok(
  not exists (select 1 from pg_policy
             where polrelid = 'public.audit_logs'::regclass
               and polcmd in ('u', 'd')),
  'audit has no update or delete policy'
);
select ok(
  (select count(*) = 8 from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private'
     and p.prosecdef
     and p.proname in (
       'identity_is_blocked', 'check_user_session', 'audit_append',
       'idempotency_claim', 'idempotency_finalize', 'job_lease_claim',
       'job_lease_release', 'rate_limit_consume'
     )),
  'internal helpers are security definer functions'
);
select ok(
  (select count(*) = 8 from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private'
     and p.proname in (
       'identity_is_blocked', 'check_user_session', 'audit_append',
       'idempotency_claim', 'idempotency_finalize', 'job_lease_claim',
       'job_lease_release', 'rate_limit_consume'
     )
     and array_to_string(p.proconfig, ',') like 'search_path=pg_catalog%'),
  'internal helpers pin a system-only search_path'
);
select ok(
  has_function_privilege('domain_owner', 'private.check_user_session(uuid, uuid)', 'execute')
    and not has_table_privilege('account_executor', 'auth.sessions', 'select'),
  'only the constrained helper exposes the Auth session check'
);

select * from finish();

rollback;
