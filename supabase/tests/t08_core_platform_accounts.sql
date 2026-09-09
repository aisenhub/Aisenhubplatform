begin;

select plan(24);

select has_schema('private', 'private schema exists');
select ok(
  exists (
    select 1 from pg_type
    where typnamespace = 'private'::regnamespace
      and typname = 'account_context'
  ),
  'account_context type exists'
);
select ok(
  exists (
    select 1 from pg_type
    where typnamespace = 'private'::regnamespace
      and typname = 'admin_context'
  ),
  'admin_context type exists'
);
select ok(
  exists (
    select 1 from pg_type
    where typnamespace = 'private'::regnamespace
      and typname = 'job_context'
  ),
  'job_context type exists'
);

select has_table('public', 'platforms', 'platforms table exists');
select has_table('public', 'platform_accounts', 'platform_accounts table exists');
select has_table('public', 'platform_profiles', 'platform_profiles table exists');
select has_table('public', 'platform_preferences', 'platform_preferences table exists');
select has_table('public', 'platform_auth_origins', 'platform_auth_origins table exists');
select has_table('public', 'plans', 'plans table exists');

select ok(
  exists (
    select 1
    from pg_attribute
    where attrelid = 'public.platform_profiles'::regclass
      and attname = 'row_version'
      and attnotnull
  ),
  'platform_profiles.row_version is required'
);
select ok(
  exists (
    select 1
    from pg_attribute
    where attrelid = 'public.platform_preferences'::regclass
      and attname = 'row_version'
      and attnotnull
  ),
  'platform_preferences.row_version is required'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.platforms'::regclass),
  'platforms has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.platform_accounts'::regclass),
  'platform_accounts has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.platform_profiles'::regclass),
  'platform_profiles has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.platform_preferences'::regclass),
  'platform_preferences has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.platform_auth_origins'::regclass),
  'platform_auth_origins has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.plans'::regclass),
  'plans has RLS enabled'
);

select ok(
  (select relforcerowsecurity from pg_class where oid = 'public.platforms'::regclass),
  'platforms forces RLS'
);
select ok(
  (select relforcerowsecurity from pg_class where oid = 'public.platform_accounts'::regclass),
  'platform_accounts forces RLS'
);
select ok(
  (select relforcerowsecurity from pg_class where oid = 'public.platform_profiles'::regclass),
  'platform_profiles forces RLS'
);
select ok(
  (select relforcerowsecurity from pg_class where oid = 'public.platform_preferences'::regclass),
  'platform_preferences forces RLS'
);
select ok(
  (select relforcerowsecurity from pg_class where oid = 'public.platform_auth_origins'::regclass),
  'platform_auth_origins forces RLS'
);
select ok(
  (select relforcerowsecurity from pg_class where oid = 'public.plans'::regclass),
  'plans forces RLS'
);

select * from finish();

rollback;
