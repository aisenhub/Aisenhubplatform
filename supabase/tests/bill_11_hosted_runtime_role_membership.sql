begin;

select plan(5);

select ok(
  exists (
    select 1
    from pg_auth_members membership
    join pg_roles granted_role on granted_role.oid = membership.roleid
    join pg_roles member_role on member_role.oid = membership.member
    where member_role.rolname = 'postgres'
      and granted_role.rolname = 'account_executor'
  ),
  'hosted postgres is an explicit member of account_executor'
);
select ok(
  exists (
    select 1
    from pg_auth_members membership
    join pg_roles granted_role on granted_role.oid = membership.roleid
    join pg_roles member_role on member_role.oid = membership.member
    where member_role.rolname = 'postgres'
      and granted_role.rolname = 'admin_executor'
  ),
  'hosted postgres is an explicit member of admin_executor'
);
select ok(
  exists (
    select 1
    from pg_auth_members membership
    join pg_roles granted_role on granted_role.oid = membership.roleid
    join pg_roles member_role on member_role.oid = membership.member
    where member_role.rolname = 'postgres'
      and granted_role.rolname = 'job_executor'
  ),
  'hosted postgres is an explicit member of job_executor'
);
select ok(
  exists (
    select 1
    from pg_auth_members membership
    join pg_roles granted_role on granted_role.oid = membership.roleid
    join pg_roles member_role on member_role.oid = membership.member
    where member_role.rolname = 'postgres'
      and granted_role.rolname = 'recovery_executor'
  ),
  'hosted postgres is an explicit member of recovery_executor'
);
select ok(
  exists (
    select 1
    from pg_auth_members membership
    join pg_roles granted_role on granted_role.oid = membership.roleid
    join pg_roles member_role on member_role.oid = membership.member
    where member_role.rolname = 'postgres'
      and granted_role.rolname = 'billing_ingress'
  ),
  'hosted postgres is an explicit member of billing_ingress'
);

select * from finish();

rollback;
