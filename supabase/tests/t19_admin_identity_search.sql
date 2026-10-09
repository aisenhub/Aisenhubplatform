begin;

select plan(10);

select has_function(
  'private',
  'admin_identity_accounts',
  array['private.admin_context', 'uuid[]', 'uuid'],
  'Admin identity association wrapper exists'
);
select ok(
  has_function_privilege(
    'admin_executor',
    'private.admin_identity_accounts(private.admin_context, uuid[], uuid)',
    'execute'
  ),
  'admin executor can enrich Auth identities'
);
select ok(
  not has_function_privilege(
    'account_executor',
    'private.admin_identity_accounts(private.admin_context, uuid[], uuid)',
    'execute'
  )
  and not has_function_privilege(
    'job_executor',
    'private.admin_identity_accounts(private.admin_context, uuid[], uuid)',
    'execute'
  ),
  'non-Admin executors cannot enrich Auth identities'
);
select ok(
  (select prosecdef from pg_proc where oid = 'private.admin_identity_accounts(private.admin_context, uuid[], uuid)'::regprocedure)
    and (
      select array_to_string(proconfig, ',') like 'search_path=pg_catalog%'
      from pg_proc
      where oid = 'private.admin_identity_accounts(private.admin_context, uuid[], uuid)'::regprocedure
    ),
  'identity association lookup is a pinned security definer'
);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000009910', 'authenticated', 'authenticated', 'identity-admin@example.invalid', 'not-a-real-password', now() - interval '3 days', now()),
  ('00000000-0000-4000-8000-000000009911', 'authenticated', 'authenticated', 'identity-one@example.invalid', 'not-a-real-password', now() - interval '2 days', now()),
  ('00000000-0000-4000-8000-000000009912', 'authenticated', 'authenticated', 'identity-two@example.invalid', 'not-a-real-password', now() - interval '1 day', now());

insert into private.system_admin (user_id)
values ('00000000-0000-4000-8000-000000009910')
on conflict (singleton_id) do update set user_id = excluded.user_id;
insert into auth.sessions (id, user_id, created_at, updated_at, not_after)
values (
  '00000000-0000-4000-8000-000000009940',
  '00000000-0000-4000-8000-000000009910',
  now(), now(), now() + interval '1 hour'
);
insert into public.platforms (id, code, name)
values
  ('00000000-0000-4000-8000-000000009921', 'identity-p1', 'Identity Platform One'),
  ('00000000-0000-4000-8000-000000009922', 'identity-p2', 'Identity Platform Two');
insert into public.platform_accounts (id, platform_id, user_id, status)
values
  ('00000000-0000-4000-8000-000000009931', '00000000-0000-4000-8000-000000009921', '00000000-0000-4000-8000-000000009911', 'active'),
  ('00000000-0000-4000-8000-000000009932', '00000000-0000-4000-8000-000000009922', '00000000-0000-4000-8000-000000009911', 'suspended');
insert into private.identity_lifecycle (user_id, state)
values ('00000000-0000-4000-8000-000000009912', 'deleting')
on conflict (user_id) do update set state = excluded.state;

set local role admin_executor;
do $$
begin
  if (
    select count(*)
    from private.admin_identity_accounts(
      row(
        '00000000-0000-4000-8000-000000009910'::uuid,
        '00000000-0000-4000-8000-000000009940'::uuid,
        '00000000-0000-4000-8000-000000009949'::uuid
      )::private.admin_context,
      array['00000000-0000-4000-8000-000000009911'::uuid],
      null
    )
  ) <> 1 then
    raise exception 'admin identity association lookup did not return the expected row';
  end if;
end
$$;
reset role;
select ok(true, 'admin executor can execute identity association lookup with an active Admin session');

select is(
  (
    select identity.account_count::bigint
    from private.admin_identity_accounts(
      row(
        '00000000-0000-4000-8000-000000009910'::uuid,
        '00000000-0000-4000-8000-000000009940'::uuid,
        '00000000-0000-4000-8000-000000009951'::uuid
      )::private.admin_context,
      array['00000000-0000-4000-8000-000000009911'::uuid],
      null
    ) identity
  ),
  2::bigint,
  'one Auth identity aggregates both platform accounts'
);
select is(
  (
    select jsonb_array_length(identity.accounts)
    from private.admin_identity_accounts(
      row(
        '00000000-0000-4000-8000-000000009910'::uuid,
        '00000000-0000-4000-8000-000000009940'::uuid,
        '00000000-0000-4000-8000-000000009952'::uuid
      )::private.admin_context,
      array['00000000-0000-4000-8000-000000009911'::uuid],
      '00000000-0000-4000-8000-000000009921'::uuid
    ) identity
  ),
  2,
  'platform scope filters identity membership without hiding its other account associations'
);
select is(
  (
    select jsonb_array_length(identity.accounts)
    from private.admin_identity_accounts(
      row(
        '00000000-0000-4000-8000-000000009910'::uuid,
        '00000000-0000-4000-8000-000000009940'::uuid,
        '00000000-0000-4000-8000-000000009953'::uuid
      )::private.admin_context,
      array['00000000-0000-4000-8000-000000009912'::uuid],
      null
    ) identity
  ),
  0,
  'global enrichment preserves an Auth identity with no platform account'
);
select ok(
  (
    select identity.identity_state = 'deleting'
    from private.admin_identity_accounts(
      row(
        '00000000-0000-4000-8000-000000009910'::uuid,
        '00000000-0000-4000-8000-000000009940'::uuid,
        '00000000-0000-4000-8000-000000009954'::uuid
      )::private.admin_context,
      array['00000000-0000-4000-8000-000000009912'::uuid],
      null
    ) identity
  ),
  'global identity enrichment exposes the AisenHub lifecycle state'
);
select is(
  (
    select count(*)::integer
    from private.admin_identity_accounts(
      row(
        '00000000-0000-4000-8000-000000009910'::uuid,
        '00000000-0000-4000-8000-000000009940'::uuid,
        '00000000-0000-4000-8000-000000009955'::uuid
      )::private.admin_context,
      array['00000000-0000-4000-8000-000000009912'::uuid],
      '00000000-0000-4000-8000-000000009921'::uuid
    )
  ),
  0,
  'platform scope excludes identities without an account in that platform'
);

select * from finish();

rollback;
