begin;

select plan(9);

select has_function(
  'private',
  'admin_audit_list',
  array['private.admin_context', 'uuid', 'integer', 'text'],
  'Admin audit list wrapper exists'
);
select ok(
  has_function_privilege(
    'admin_executor',
    'private.admin_audit_list(private.admin_context, uuid, integer, text)',
    'execute'
  ),
  'admin executor can use the audit list wrapper'
);
select ok(
  not has_function_privilege(
    'account_executor',
    'private.admin_audit_list(private.admin_context, uuid, integer, text)',
    'execute'
  ),
  'account executor cannot use the audit list wrapper'
);
select ok(
  (select prosecdef from pg_proc
   where oid = 'private.admin_audit_list(private.admin_context, uuid, integer, text)'::regprocedure),
  'audit list wrapper is security definer'
);
select ok(
  (select array_to_string(proconfig, ',') like 'search_path=pg_catalog%'
   from pg_proc
   where oid = 'private.admin_audit_list(private.admin_context, uuid, integer, text)'::regprocedure),
  'audit list wrapper pins search_path'
);
select ok(
  pg_get_functiondef(
    'private.admin_audit_list(private.admin_context, uuid, integer, text)'::regprocedure
  ) like '%order by a.created_at desc, a.id desc%',
  'audit list wrapper has stable cursor ordering'
);
select ok(
  pg_get_functiondef(
    'private.admin_audit_list(private.admin_context, uuid, integer, text)'::regprocedure
  ) like '%metadata ->> ''outcome''%',
  'audit list wrapper exposes only the redacted outcome field'
);
select ok(
  pg_get_functiondef(
    'private.admin_audit_list(private.admin_context, uuid, integer, text)'::regprocedure
  ) like '%length(btrim(p_query)) > 128%',
  'audit query length is bounded'
);
select ok(
  pg_get_functiondef(
    'private.admin_audit_list(private.admin_context, uuid, integer, text)'::regprocedure
  ) like '%p_limit not between 1 and 100%',
  'audit page size is bounded'
);

select * from finish();

rollback;
