begin;

select plan(5);

select ok(
  pg_has_role('postgres', 'account_executor', 'set'),
  'hosted postgres can enter account_executor'
);
select ok(
  pg_has_role('postgres', 'admin_executor', 'set'),
  'hosted postgres can enter admin_executor'
);
select ok(
  pg_has_role('postgres', 'job_executor', 'set'),
  'hosted postgres can enter job_executor'
);
select ok(
  pg_has_role('postgres', 'recovery_executor', 'set'),
  'hosted postgres can enter recovery_executor'
);
select ok(
  pg_has_role('postgres', 'billing_ingress', 'set'),
  'hosted postgres can enter billing_ingress'
);

select * from finish();

rollback;
