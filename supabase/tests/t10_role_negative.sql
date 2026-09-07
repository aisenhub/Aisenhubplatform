begin;

select plan(5);

select ok(
  not has_table_privilege('account_executor', 'public.platform_accounts', 'select'),
  'account_executor cannot read public account tables'
);
select ok(
  not has_function_privilege('account_executor', 'private.idempotency_claim(uuid, uuid, text, text, text, bytea)', 'execute'),
  'account_executor cannot call internal idempotency helper'
);

select ok(
  not has_table_privilege('admin_executor', 'private.platform_api_keys', 'select'),
  'admin_executor cannot read key metadata directly'
);

select ok(
  has_function_privilege('job_executor', 'private.job_lease_claim(text, uuid, text, integer)', 'execute'),
  'job_executor can use the constrained lease helper'
);
select ok(
  not has_table_privilege('job_executor', 'private.job_leases', 'select'),
  'job_executor cannot read lease table directly'
);

select * from finish();

rollback;
