begin;

select plan(5);

-- TASK-0102-NEG: every shared Grant write must re-check the platform under a
-- row lock.  Billing and Admin callers do not pass through account_principal.
select ok(
  pg_get_functiondef(
    'private.entitlement_apply(uuid, uuid, uuid, text, uuid, integer, text, uuid, text, uuid)'::regprocedure
  ) like '%platform_disabled%',
  'shared entitlement entry has a platform-disabled rejection'
);
select ok(
  pg_get_functiondef(
    'private.entitlement_apply(uuid, uuid, uuid, text, uuid, integer, text, uuid, text, uuid)'::regprocedure
  ) like '%for share%',
  'shared entitlement entry locks the platform before granting'
);

insert into public.platforms (id, code, name, status)
values (
  '00000000-0000-4000-8000-000000002620',
  'repair0102-disabled',
  'Repair 0102 Disabled',
  'disabled'
);
insert into public.plans (id, platform_id, code, name, kind, status)
values (
  '00000000-0000-4000-8000-000000002621',
  '00000000-0000-4000-8000-000000002620',
  'paid',
  'Repair 0102 Paid',
  'paid',
  'active'
);
insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values (
  '00000000-0000-4000-8000-000000002624',
  'authenticated',
  'authenticated',
  'repair0102@example.invalid',
  'not-a-real-password',
  now(),
  now()
);
insert into public.platform_accounts (id, platform_id, user_id, status)
values (
  '00000000-0000-4000-8000-000000002622',
  '00000000-0000-4000-8000-000000002620',
  '00000000-0000-4000-8000-000000002624',
  'active'
);

select throws_ok(
  $$select * from private.entitlement_apply(
    '00000000-0000-4000-8000-000000002620',
    '00000000-0000-4000-8000-000000002622',
    '00000000-0000-4000-8000-000000002621',
    'admin',
    '00000000-0000-4000-8000-000000002623',
    1,
    'month',
    '00000000-0000-4000-8000-000000002624',
    'TASK-0102 disabled platform regression',
    null
  )$$,
  '42501',
  'platform_disabled',
  'a disabled platform cannot receive a shared entitlement grant'
);
select is(
  (select count(*)::integer from public.subscription_grants
   where platform_id = '00000000-0000-4000-8000-000000002620'),
  0,
  'rejected platform grant leaves no ledger row'
);
select is(
  (select count(*)::integer from public.subscription_events
   where platform_id = '00000000-0000-4000-8000-000000002620'),
  0,
  'rejected platform grant leaves no event row'
);

select * from finish();

rollback;
