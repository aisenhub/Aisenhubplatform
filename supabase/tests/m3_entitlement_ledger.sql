begin;

select plan(39);

select has_table('public', 'subscriptions', 'subscription projection exists');
select has_table('public', 'subscription_grants', 'immutable grant ledger exists');
select has_table('public', 'subscription_events', 'ordered subscription events exist');
select has_table('public', 'redemption_code_batches', 'redemption batches exist');
select has_table('public', 'redemption_codes', 'redemption codes exist');
select has_table('public', 'redemption_events', 'redemption events exist');
select has_function('private', 'entitlement_recompute', array['uuid', 'uuid'], 'recompute exists');
select has_function('private', 'entitlement_apply', array['uuid', 'uuid', 'uuid', 'text', 'uuid', 'integer', 'text', 'uuid', 'text', 'uuid'], 'apply exists');
select has_function('private', 'entitlement_read', array['private.account_context'], 'read exists');
select has_function('private', 'admin_entitlement_command', array['private.admin_context', 'uuid', 'uuid', 'text', 'uuid', 'uuid', 'integer', 'text', 'uuid', 'text'], 'admin command exists');
select has_function('private', 'admin_batch_create', array['private.admin_context', 'uuid', 'uuid', 'text', 'integer', 'integer', 'text', 'timestamptz', 'timestamptz', 'uuid', 'text', 'jsonb'], 'batch create exists');
select has_function('private', 'admin_batch_confirm', array['private.admin_context', 'uuid', 'uuid', 'text'], 'batch confirm exists');
select has_function('private', 'admin_batch_disable', array['private.admin_context', 'uuid', 'uuid'], 'batch disable exists');
select has_function('private', 'redeem_subscription_code', array['private.account_context', 'text', 'smallint', 'text'], 'redeem exists');
select has_function('private', 'admin_plan_upsert', array['private.admin_context', 'uuid', 'uuid', 'text', 'text', 'text', 'text', 'jsonb', 'text', 'boolean', 'boolean'], 'plan upsert exists');
select has_function('private', 'platform_key_verify_presented', array['uuid', 'text', 'integer'], 'presented key verifier exists');
select has_function('private', 'admin_plan_list', array['private.admin_context', 'uuid'], 'admin plan list exists');
select has_function('private', 'admin_batch_list', array['private.admin_context', 'uuid', 'integer'], 'admin batch list exists');
select has_function('private', 'admin_subscription_read', array['private.admin_context', 'uuid', 'uuid'], 'admin subscription read exists');
select has_function('private', 'admin_step_up_valid', array['uuid', 'uuid', 'uuid'], 'admin step-up verifier exists');
select ok(has_function_privilege('account_executor', 'private.entitlement_read(private.account_context)', 'execute'), 'account executor can read entitlement');
select ok(has_function_privilege('admin_executor', 'private.admin_entitlement_command(private.admin_context, uuid, uuid, text, uuid, uuid, integer, text, uuid, text)', 'execute'), 'admin executor can command entitlement');
select ok(has_function_privilege('admin_executor', 'private.admin_batch_create(private.admin_context, uuid, uuid, text, integer, integer, text, timestamptz, timestamptz, uuid, text, jsonb)', 'execute'), 'admin executor can create batches');
select ok(has_function_privilege('account_executor', 'private.redeem_subscription_code(private.account_context, text, smallint, text)', 'execute'), 'account executor can redeem code');
select ok(has_function_privilege('admin_executor', 'private.admin_plan_upsert(private.admin_context, uuid, uuid, text, text, text, text, jsonb, text, boolean, boolean)', 'execute'), 'admin executor can manage plans');
select ok(has_function_privilege('account_executor', 'private.platform_key_verify_presented(uuid, text, integer)', 'execute'), 'account executor can verify presented keys');
select ok(has_function_privilege('admin_executor', 'private.admin_plan_list(private.admin_context, uuid)', 'execute'), 'admin executor can list plans');
select ok(not has_table_privilege('admin_executor', 'public.subscription_grants', 'select'), 'admin executor cannot read grants directly');
select ok(not has_function_privilege('account_executor', 'private.entitlement_apply(uuid, uuid, uuid, text, uuid, integer, text, uuid, text, uuid)', 'execute'), 'account executor cannot call internal apply');
select ok(not has_table_privilege('account_executor', 'public.subscription_grants', 'select'), 'account executor cannot read grants directly');
select ok(not has_table_privilege('account_executor', 'public.redemption_codes', 'select'), 'account executor cannot read code table directly');
select ok(not has_table_privilege('admin_executor', 'public.plans', 'update'), 'admin executor cannot update plans directly');
select ok((select relforcerowsecurity from pg_class where oid = 'public.subscription_grants'::regclass), 'grant ledger forces RLS');
select ok(exists (select 1 from pg_constraint where conname = 'grant_redeemed_code_fk' and condeferrable), 'grant to redeemed code uses deferred composite FK');
select ok(exists (select 1 from pg_index where indexrelid = 'public.subscription_one_granted_event_per_grant'::regclass and indisunique), 'one granted event per grant');
select ok(exists (select 1 from pg_index where indexrelid = 'public.subscription_one_reversal_per_grant'::regclass and indisunique), 'one reversal event per grant');
select ok((select prosecdef from pg_proc where oid = 'private.entitlement_read(private.account_context)'::regprocedure), 'read is security definer');
select ok((select array_to_string(proconfig, ',') like 'search_path=pg_catalog%' from pg_proc where oid = 'private.entitlement_read(private.account_context)'::regprocedure), 'read pins search_path');
select ok(exists (select 1 from pg_policy where polrelid = 'public.subscriptions'::regclass and polname = 'subscriptions_domain_owner'), 'projection has domain owner policy');

select * from finish();

rollback;
