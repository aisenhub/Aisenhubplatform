begin;

select plan(19);

select has_function('private', 'profile_get', array['private.account_context'], 'profile_get exists');
select has_function('private', 'profile_patch', array['private.account_context', 'bigint', 'jsonb'], 'profile_patch exists');
select has_function('private', 'preferences_get', array['private.account_context'], 'preferences_get exists');
select has_function('private', 'preferences_patch', array['private.account_context', 'bigint', 'jsonb'], 'preferences_patch exists');
select has_function('private', 'public_plans_list', array['uuid', 'uuid'], 'public_plans_list exists');

select ok(has_function_privilege('account_executor', 'private.profile_get(private.account_context)', 'execute'), 'account executor can read profile through wrapper');
select ok(has_function_privilege('account_executor', 'private.profile_patch(private.account_context, bigint, jsonb)', 'execute'), 'account executor can patch profile through wrapper');
select ok(has_function_privilege('account_executor', 'private.preferences_patch(private.account_context, bigint, jsonb)', 'execute'), 'account executor can patch preferences through wrapper');
select ok(has_function_privilege('account_executor', 'private.public_plans_list(uuid, uuid)', 'execute'), 'account executor can read public plans through wrapper');
select ok(not has_table_privilege('account_executor', 'public.platform_profiles', 'select'), 'account executor cannot read profile table directly');
select ok(not has_table_privilege('account_executor', 'public.plans', 'select'), 'account executor cannot read plan table directly');
select ok((select prosecdef from pg_proc where oid = 'private.profile_patch(private.account_context, bigint, jsonb)'::regprocedure), 'profile patch is security definer');
select ok((select prosecdef from pg_proc where oid = 'private.preferences_patch(private.account_context, bigint, jsonb)'::regprocedure), 'preferences patch is security definer');
select ok((select array_to_string(proconfig, ',') like 'search_path=pg_catalog%' from pg_proc where oid = 'private.profile_patch(private.account_context, bigint, jsonb)'::regprocedure), 'profile patch pins search_path');
select ok((select array_to_string(proconfig, ',') like 'search_path=pg_catalog%' from pg_proc where oid = 'private.preferences_patch(private.account_context, bigint, jsonb)'::regprocedure), 'preferences patch pins search_path');
select ok(exists (select 1 from pg_policy where polrelid = 'public.plans'::regclass and polname = 'plans_domain_owner'), 'plan domain-owner policy exists');
select ok(exists (select 1 from pg_trigger where tgrelid = 'public.platform_profiles'::regclass and tgname = 'platform_profiles_set_updated_at'), 'profile updated_at trigger remains');
select ok(exists (select 1 from pg_trigger where tgrelid = 'public.platform_preferences'::regclass and tgname = 'platform_preferences_set_updated_at'), 'preferences updated_at trigger remains');
select ok(exists (select 1 from pg_proc where proname = 'public_plans_list' and prosecdef), 'public plan read is internal security definer');

select * from finish();

rollback;
