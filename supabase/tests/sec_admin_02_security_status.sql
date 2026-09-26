begin;

select plan(7);

select has_function(
  'private',
  'admin_security_status',
  array['private.admin_context', 'text'],
  'authoritative security status function exists'
);
select ok(
  has_function_privilege(
    'admin_executor',
    'private.admin_security_status(private.admin_context, text)',
    'execute'
  ),
  'Admin executor can call security status'
);
select ok(
  not has_function_privilege(
    'account_executor',
    'private.admin_security_status(private.admin_context, text)',
    'execute'
  )
    and not has_function_privilege(
      'job_executor',
      'private.admin_security_status(private.admin_context, text)',
      'execute'
    )
    and not has_function_privilege(
      'recovery_executor',
      'private.admin_security_status(private.admin_context, text)',
      'execute'
    )
    and not has_function_privilege(
      'authenticated',
      'private.admin_security_status(private.admin_context, text)',
      'execute'
    )
    and not has_function_privilege(
      'anon',
      'private.admin_security_status(private.admin_context, text)',
      'execute'
    ),
  'Non-admin runtime roles cannot call security status'
);
select ok(
  (
    select role_owner.rolname = 'domain_owner'
      and proc.prosecdef
      and array_to_string(proc.proconfig, ',') like 'search_path=pg_catalog%'
    from pg_proc proc
    join pg_roles role_owner on role_owner.oid = proc.proowner
    where proc.oid = 'private.admin_security_status(private.admin_context, text)'::regprocedure
  ),
  'Security status is pinned security definer owned by domain_owner'
);

set local role admin_executor;
do $$
declare
  error_message text;
begin
  begin
    perform 1 from private.admin_security_status(
      row(
        '00000000-0000-4000-8000-000000000001'::uuid,
        '00000000-0000-4000-8000-000000000002'::uuid,
        '00000000-0000-4000-8000-000000000003'::uuid
      )::private.admin_context,
      'aal1'
    );
    raise exception 'security status unexpectedly accepted non-admin context';
  exception when insufficient_privilege then
    get stacked diagnostics error_message = message_text;
    if error_message <> 'admin_required' then
      raise exception 'expected admin_required, received %', error_message;
    end if;
  end;
end
$$;
reset role;
select ok(true, 'Admin executor can execute the function but membership is enforced');

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values (
  '00000000-0000-4000-8000-000000009902', 'authenticated', 'authenticated',
  'sec-admin-02@example.invalid', 'not-a-real-password', now(), now()
);
insert into private.system_admin (user_id)
values ('00000000-0000-4000-8000-000000009902')
on conflict (singleton_id) do update set user_id = excluded.user_id;
insert into auth.sessions (id, user_id, created_at, updated_at, not_after)
values (
  '00000000-0000-4000-8000-000000009903',
  '00000000-0000-4000-8000-000000009902',
  now(), now(), now() + interval '1 hour'
);

set local role admin_executor;
do $$
declare
  status record;
begin
  select * into status from private.admin_security_status(
    row(
      '00000000-0000-4000-8000-000000009902'::uuid,
      '00000000-0000-4000-8000-000000009903'::uuid,
      '00000000-0000-4000-8000-000000009904'::uuid
    )::private.admin_context,
    'aal1'
  );
  if not found or status.current_aal <> 'aal1' or status.recent_mfa_expires_at is not null then
    raise exception 'active administrator status was not returned';
  end if;
end
$$;
reset role;
select ok(true, 'Active AAL1 administrator session receives authoritative status');

delete from auth.sessions where id = '00000000-0000-4000-8000-000000009903';
set local role admin_executor;
do $$
declare
  error_message text;
begin
  begin
    perform 1 from private.admin_security_status(
      row(
        '00000000-0000-4000-8000-000000009902'::uuid,
        '00000000-0000-4000-8000-000000009903'::uuid,
        '00000000-0000-4000-8000-000000009904'::uuid
      )::private.admin_context,
      'aal2'
    );
    raise exception 'revoked administrator session was accepted';
  exception when insufficient_privilege then
    get stacked diagnostics error_message = message_text;
    if error_message <> 'session_not_active' then
      raise exception 'expected session_not_active, received %', error_message;
    end if;
  end;
end
$$;
reset role;
select ok(true, 'Revoked session is rejected even for the current administrator');

select * from finish();
rollback;
