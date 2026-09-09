begin;

select plan(14);

select has_function('private', 'platform_key_verify', array['text', 'integer'], 'Platform Key verifier exists');
select has_function('private', 'account_principal', array['private.account_context'], 'Principal resolver exists');
select has_function('private', 'admin_platform_update', array['private.admin_context', 'uuid', 'text', 'boolean'], 'Admin platform update exists');
select has_function('private', 'admin_platform_key_revoke', array['private.admin_context', 'uuid', 'uuid'], 'Admin key revoke exists');

select ok(
  has_function_privilege('account_executor', 'private.platform_key_verify(text, integer)', 'execute'),
  'account executor can verify a platform key'
);
select ok(
  has_function_privilege('account_executor', 'private.account_principal(private.account_context)', 'execute'),
  'account executor can resolve Principal'
);
select ok(
  has_function_privilege('admin_executor', 'private.admin_platform_update(private.admin_context, uuid, text, boolean)', 'execute'),
  'admin executor can update a platform through the wrapper'
);
select ok(
  has_function_privilege('admin_executor', 'private.admin_platform_key_revoke(private.admin_context, uuid, uuid)', 'execute'),
  'admin executor can revoke a key through the wrapper'
);

select ok(
  not has_function_privilege('account_executor', 'private.admin_platform_update(private.admin_context, uuid, text, boolean)', 'execute'),
  'account executor cannot call an Admin platform wrapper'
);
select ok(
  not has_table_privilege('account_executor', 'private.platform_api_keys', 'select'),
  'account executor cannot read Platform Key storage directly'
);
select ok(
  exists (select 1 from pg_policy where polrelid = 'public.platforms'::regclass and polname = 'platforms_domain_owner'),
  'platform domain-owner policy exists for controlled functions'
);
select ok(
  exists (select 1 from pg_policy where polrelid = 'public.platform_accounts'::regclass and polname = 'platform_accounts_domain_owner'),
  'account domain-owner policy exists for Principal'
);
select ok(
  (select prosecdef from pg_proc where oid = 'private.account_principal(private.account_context)'::regprocedure),
  'Principal resolver is security definer'
);
select ok(
  (select array_to_string(proconfig, ',') like 'search_path=pg_catalog%'
   from pg_proc where oid = 'private.platform_key_verify(text, integer)'::regprocedure),
  'Platform Key verifier pins search_path'
);

select * from finish();

rollback;
