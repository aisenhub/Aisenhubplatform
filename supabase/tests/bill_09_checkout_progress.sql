begin;
select plan(12);

select ok(
  to_regprocedure('private.subscription_checkout_read_v2(private.account_context,uuid)') is not null,
  'checkout progress has a versioned read function'
);
select ok(
  pg_get_functiondef('private.subscription_checkout_read_v2(private.account_context,uuid)'::regprocedure) like '%billing_orders%'
    and pg_get_functiondef('private.subscription_checkout_read_v2(private.account_context,uuid)'::regprocedure) like '%billing_processing_jobs%'
    and pg_get_functiondef('private.subscription_checkout_read_v2(private.account_context,uuid)'::regprocedure) like '%billing_settlements%',
  'checkout progress projects order, job, and settlement facts'
);
select ok(
  pg_get_functiondef('private.subscription_checkout_read_v2(private.account_context,uuid)'::regprocedure) like '%clock_timestamp()%',
  'checkout expiry is evaluated at read time'
);
select ok(
  pg_get_functiondef('private.subscription_checkout_read_v2(private.account_context,uuid)'::regprocedure) like '%stored_status in (''granted'', ''resolved'', ''paid'', ''verified'')%',
  'paid and granted states cannot be downgraded by expiry'
);
select ok(
  pg_get_functiondef('private.subscription_checkout_read_v2(private.account_context,uuid)'::regprocedure) like '%settlement_requires_review%',
  'blocked settlements are visible as review progress'
);
select ok(
  has_function_privilege('account_executor', 'private.subscription_checkout_read_v2(private.account_context,uuid)', 'EXECUTE'),
  'account executor can read checkout progress'
);
select ok(
  not has_function_privilege('authenticated', 'private.subscription_checkout_read_v2(private.account_context,uuid)', 'EXECUTE'),
  'authenticated cannot bypass the account executor boundary'
);

select is(
  (select typname from pg_type where oid = (
    select prorettype from pg_proc where oid = 'private.subscription_checkout_read_v2(private.account_context,uuid)'::regprocedure
  )),
  'record',
  'projection returns a row contract'
);
select ok(
  pg_get_functiondef('private.subscription_checkout_read_v2(private.account_context,uuid)'::regprocedure) like '%when projected_entitlement_status = ''granted'' then ''granted''%',
  'granted entitlement wins over a stale checkout status'
);
select ok(
  pg_get_functiondef('private.subscription_checkout_read_v2(private.account_context,uuid)'::regprocedure) like '%projected_job_state = ''manual_review''%',
  'manual review jobs surface a review-required checkout'
);
select ok(
  pg_get_functiondef('private.subscription_checkout_read_v2(private.account_context,uuid)'::regprocedure) like '%when ''review_required'' then ''contact_support''%',
  'review-required checkout tells the user to contact support'
);
select ok(
  pg_get_functiondef('private.subscription_checkout_read_v2(private.account_context,uuid)'::regprocedure) like '%when ''expired'' then ''create_new_checkout''%',
  'expired checkout tells the user to create a new checkout'
);

select * from finish();
rollback;
