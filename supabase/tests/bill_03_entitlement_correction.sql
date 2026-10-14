begin;

select plan(14);

select has_function(
  'private','admin_entitlement_correction_preview',
  array['private.admin_context','uuid','uuid','uuid'],
  'correction preview exists'
);
select has_function(
  'private','admin_entitlement_correction_apply',
  array['private.admin_context','uuid','uuid','uuid','bigint','uuid','integer','text','uuid','text'],
  'correction apply exists'
);
select has_table('public','subscription_grant_corrections','correction relation exists');
select ok(
  (select relforcerowsecurity from pg_class where oid='public.subscription_grant_corrections'::regclass),
  'correction relation forces RLS'
);
select ok(
  exists(select 1 from pg_policy where polrelid='public.subscription_grant_corrections'::regclass
    and polname='subscription_grant_corrections_domain_owner'),
  'correction relation has domain owner policy'
);
select ok(
  not has_table_privilege('admin_executor','public.subscription_grant_corrections','insert'),
  'admin executor cannot insert corrections directly'
);
select ok(
  has_function_privilege(
    'admin_executor',
    'private.admin_entitlement_correction_preview(private.admin_context, uuid, uuid, uuid)',
    'execute'
  ),
  'admin executor can preview corrections'
);
select ok(
  has_function_privilege(
    'admin_executor',
    'private.admin_entitlement_correction_apply(private.admin_context, uuid, uuid, uuid, bigint, uuid, integer, text, uuid, text)',
    'execute'
  ),
  'admin executor can apply corrections'
);
select ok(
  (select prosecdef from pg_proc where oid=
    'private.admin_entitlement_correction_apply(private.admin_context, uuid, uuid, uuid, bigint, uuid, integer, text, uuid, text)'::regprocedure),
  'correction apply is security definer'
);
select ok(
  (select array_to_string(proconfig,',') like 'search_path=pg_catalog%' from pg_proc where oid=
    'private.admin_entitlement_correction_apply(private.admin_context, uuid, uuid, uuid, bigint, uuid, integer, text, uuid, text)'::regprocedure),
  'correction apply pins search_path'
);
select ok(
  pg_get_functiondef('private.admin_entitlement_correction_apply(private.admin_context, uuid, uuid, uuid, bigint, uuid, integer, text, uuid, text)'::regprocedure)
    like '%precondition_failed%',
  'correction apply checks preview version'
);
select ok(
  pg_get_functiondef('private.admin_entitlement_correction_apply(private.admin_context, uuid, uuid, uuid, bigint, uuid, integer, text, uuid, text)'::regprocedure)
    like '%correction_exists%',
  'correction apply prevents a second active chain'
);
select ok(
  exists(select 1 from pg_constraint where conrelid='public.subscription_grant_corrections'::regclass
    and contype='u' and pg_get_constraintdef(oid) like '%original_grant_id%'),
  'one correction chain per original grant'
);
select ok(
  exists(select 1 from pg_constraint where conrelid='public.subscription_grant_corrections'::regclass
    and contype='f' and pg_get_constraintdef(oid) like '%subscription_grants%'),
  'correction links remain strong grant FKs'
);

select * from finish();
rollback;
