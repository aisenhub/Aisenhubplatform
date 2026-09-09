begin;

select plan(17);

select ok(to_regclass('storage.buckets') is not null, 'Storage buckets catalog exists');
select ok(exists (select 1 from storage.buckets where id = 'platform-config-files' and public = false and file_size_limit = 1048576), 'private bounded file bucket exists');
select has_function('private', 'file_upload_state', array['private.account_context', 'uuid'], 'file upload state exists');
select has_function('private', 'file_receive_claim', array['private.account_context', 'uuid', 'text', 'integer'], 'bounded receive claim exists');
select has_function('private', 'file_write_attempt_mark_unknown', array['private.account_context', 'uuid', 'uuid', 'text'], 'unknown result recorder exists');
select has_function('private', 'file_write_attempt_finalize', array['private.account_context', 'uuid', 'uuid', 'bigint', 'text', 'text'], 'trusted finalize exists');

select ok((select prosecdef from pg_proc where oid = 'private.file_upload_state(private.account_context, uuid)'::regprocedure), 'state function is security definer');
select ok((select prosecdef from pg_proc where oid = 'private.file_write_attempt_mark_unknown(private.account_context, uuid, uuid, text)'::regprocedure), 'unknown recorder is security definer');
select ok((select prosecdef from pg_proc where oid = 'private.file_write_attempt_finalize(private.account_context, uuid, uuid, bigint, text, text)'::regprocedure), 'finalize is security definer');
select ok((select array_to_string(proconfig, ',') like 'search_path=pg_catalog%' from pg_proc where oid = 'private.file_write_attempt_finalize(private.account_context, uuid, uuid, bigint, text, text)'::regprocedure), 'finalize pins search_path');

select ok(has_function_privilege('account_executor', 'private.file_upload_state(private.account_context, uuid)', 'execute'), 'account can query upload state through wrapper');
select ok(has_function_privilege('account_executor', 'private.file_write_attempt_mark_unknown(private.account_context, uuid, uuid, text)', 'execute'), 'account can retain unknown result through wrapper');
select ok(has_function_privilege('account_executor', 'private.file_write_attempt_finalize(private.account_context, uuid, uuid, bigint, text, text)', 'execute'), 'account can finalize through wrapper');
select ok(not has_table_privilege('account_executor', 'storage.objects', 'insert'), 'account cannot write Storage metadata directly');
select ok(not has_table_privilege('account_executor', 'public.platform_config_files', 'update'), 'account cannot update file state directly');
select ok(exists (select 1 from pg_indexes where indexname = 'file_write_attempts_unsettled_idx'), 'unsettled attempts retain a uniqueness guard');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.platform_config_files'::regclass and pg_get_constraintdef(oid) like '%storage_bucket%'), 'file bucket is constrained');

select * from finish();

rollback;
