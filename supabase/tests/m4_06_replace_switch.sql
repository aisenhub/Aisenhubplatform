begin;

select plan(9);

select has_function('private', 'file_write_attempt_finalize', array['private.account_context', 'uuid', 'uuid', 'bigint', 'text', 'text'], 'replacement finalize exists');
select ok((select prosecdef from pg_proc where oid = 'private.file_write_attempt_finalize(private.account_context, uuid, uuid, bigint, text, text)'::regprocedure), 'replacement finalize is security definer');
select ok((select array_to_string(proconfig, ',') like 'search_path=pg_catalog%' from pg_proc where oid = 'private.file_write_attempt_finalize(private.account_context, uuid, uuid, bigint, text, text)'::regprocedure), 'replacement finalize pins search_path');
select ok((select pg_get_function_result('private.file_write_attempt_finalize(private.account_context, uuid, uuid, bigint, text, text)'::regprocedure) like '%replace_outcome%'), 'replacement result exposes switch outcome');
select ok(has_function_privilege('account_executor', 'private.file_write_attempt_finalize(private.account_context, uuid, uuid, bigint, text, text)', 'execute'), 'account can finalize replacement');
select ok(not has_table_privilege('account_executor', 'public.platform_config_files', 'update'), 'account cannot switch rows directly');
select ok(exists (select 1 from pg_indexes where indexname = 'platform_config_files_live_replace_idx'), 'replacement target has a live unique guard');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.platform_config_files'::regclass and pg_get_constraintdef(oid) like '%storage_path%'), 'replacement keeps immutable path constraint');
select ok(not exists (select 1 from pg_proc where proname = 'file_write_attempt_finalize' and pg_get_functiondef(oid) like '%execute immediate%'), 'replacement does not accept arbitrary SQL');

select * from finish();

rollback;
