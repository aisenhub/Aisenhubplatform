begin;

select plan(5);

select has_function(
  'private',
  'subscription_checkout_payment_facts',
  array['private.account_context', 'uuid']::text[],
  'checkout payment facts function exists'
);
select ok(
  has_function_privilege(
    'account_executor',
    'private.subscription_checkout_payment_facts(private.account_context, uuid)',
    'execute'
  ),
  'account executor can read checkout payment facts'
);
select ok(
  not has_function_privilege(
    'anon',
    'private.subscription_checkout_payment_facts(private.account_context, uuid)',
    'execute'
  ),
  'anonymous callers cannot read checkout payment facts'
);
select ok(
  not exists (
    select 1
    from pg_proc proc
    join pg_namespace namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'private'
      and proc.proname = 'subscription_checkout_payment_facts'
      and proc.prosecdef
      and proc.proconfig is null
  ),
  'payment facts function is not an unsafe unpinned security definer'
);
select ok(
  exists (
    select 1
    from pg_proc proc
    join pg_namespace namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'private'
      and proc.proname = 'subscription_checkout_payment_facts'
      and proc.prosecdef
      and array_to_string(proc.proconfig, ',') like '%search_path=pg_catalog, private, public%'
  ),
  'payment facts function pins its search path'
);

select * from finish();

rollback;
