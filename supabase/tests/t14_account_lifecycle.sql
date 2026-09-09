begin;

select plan(16);

select has_table('private', 'user_recent_auth_proofs', 'recent proof storage exists');
select has_function('private', 'account_activate', array['private.account_context'], 'account_activate exists');
select has_function('private', 'account_close', array['private.account_context', 'uuid'], 'account_close exists');
select has_function('private', 'identity_delete_request', array['private.account_context', 'uuid'], 'identity delete request exists');
select has_function('private', 'admin_account_transition', array['private.admin_context', 'uuid', 'uuid', 'text'], 'Admin account transition exists');

select ok(
  exists (select 1 from pg_constraint where conrelid = 'private.user_recent_auth_proofs'::regclass and (pg_get_constraintdef(oid) like '%5 minutes%' or pg_get_constraintdef(oid) like '%00:05:00%')),
  'recent proof expiry is bounded to five minutes'
);
select ok(
  has_function_privilege('account_executor', 'private.account_activate(private.account_context)', 'execute'),
  'account executor can activate through wrapper'
);
select ok(
  has_function_privilege('account_executor', 'private.account_close(private.account_context, uuid)', 'execute'),
  'account executor can close through wrapper'
);
select ok(
  has_function_privilege('account_executor', 'private.identity_delete_request(private.account_context, uuid)', 'execute'),
  'account executor can request deletion through wrapper'
);
select ok(
  has_function_privilege('admin_executor', 'private.admin_account_transition(private.admin_context, uuid, uuid, text)', 'execute'),
  'Admin executor can transition account through wrapper'
);
select ok(
  not has_table_privilege('account_executor', 'private.user_recent_auth_proofs', 'select'),
  'account executor cannot read recent proof storage directly'
);
select ok(
  (select prosecdef from pg_proc where oid = 'private.account_activate(private.account_context)'::regprocedure),
  'account activation is security definer'
);
select ok(
  (select prosecdef from pg_proc where oid = 'private.account_close(private.account_context, uuid)'::regprocedure),
  'account close is security definer'
);
select ok(
  exists (select 1 from pg_policy where polrelid = 'public.platform_profiles'::regclass and polname = 'platform_profiles_domain_owner')
    and exists (select 1 from pg_policy where polrelid = 'public.platform_preferences'::regclass and polname = 'platform_preferences_domain_owner'),
  'activation has controlled profile/preference policies'
);
select ok(
  (select array_to_string(proconfig, ',') like 'search_path=pg_catalog%'
   from pg_proc where oid = 'private.identity_delete_request(private.account_context, uuid)'::regprocedure),
  'identity delete wrapper pins search_path'
);
select ok(
  not exists (select 1 from pg_policy where polrelid = 'private.user_recent_auth_proofs'::regclass and polcmd in ('u', 'd') and polname like 'account_executor%'),
  'recent proof storage is not directly writable by account executor'
);

select * from finish();

rollback;
