begin;

select plan(29);

select has_function('private', 'file_list', array['private.account_context', 'uuid', 'integer'], 'account file list exists');
select has_function('private', 'file_read', array['private.account_context', 'uuid'], 'account file read exists');
select has_function('private', 'file_download_authorize', array['private.account_context', 'uuid'], 'account download authorization exists');
select has_function('private', 'file_download_event', array['private.account_context', 'uuid', 'text', 'text'], 'account download audit exists');
select has_function('private', 'admin_file_list', array['private.admin_context', 'uuid', 'integer'], 'admin file list exists');
select has_function('private', 'admin_file_read', array['private.admin_context', 'uuid'], 'admin file read exists');
select has_function('private', 'admin_file_download_authorize', array['private.admin_context', 'uuid'], 'admin download authorization exists');
select has_function('private', 'admin_file_download_event', array['private.admin_context', 'uuid', 'text', 'text'], 'admin download audit exists');

select ok((select prosecdef from pg_proc where oid = 'private.file_list(private.account_context, uuid, integer)'::regprocedure), 'account list is security definer');
select ok((select prosecdef from pg_proc where oid = 'private.file_download_authorize(private.account_context, uuid)'::regprocedure), 'account download authorization is security definer');
select ok((select prosecdef from pg_proc where oid = 'private.admin_file_download_authorize(private.admin_context, uuid)'::regprocedure), 'admin download authorization is security definer');
select ok((select array_to_string(proconfig, ',') like 'search_path=pg_catalog%' from pg_proc where oid = 'private.file_download_event(private.account_context, uuid, text, text)'::regprocedure), 'download audit pins search_path');

select ok(has_function_privilege('account_executor', 'private.file_list(private.account_context, uuid, integer)', 'execute'), 'account can list files');
select ok(has_function_privilege('account_executor', 'private.file_read(private.account_context, uuid)', 'execute'), 'account can read file state');
select ok(has_function_privilege('account_executor', 'private.file_download_authorize(private.account_context, uuid)', 'execute'), 'account can authorize download');
select ok(has_function_privilege('account_executor', 'private.file_download_event(private.account_context, uuid, text, text)', 'execute'), 'account can append download audit');
select ok(has_function_privilege('admin_executor', 'private.admin_file_list(private.admin_context, uuid, integer)', 'execute'), 'admin can list files');
select ok(has_function_privilege('admin_executor', 'private.admin_file_read(private.admin_context, uuid)', 'execute'), 'admin can read file state');
select ok(has_function_privilege('admin_executor', 'private.admin_file_download_authorize(private.admin_context, uuid)', 'execute'), 'admin can authorize download');
select ok(has_function_privilege('admin_executor', 'private.admin_file_download_event(private.admin_context, uuid, text, text)', 'execute'), 'admin can append download audit');

select ok(not has_function_privilege('account_executor', 'private.admin_file_download_authorize(private.admin_context, uuid)', 'execute'), 'account cannot use admin download authorization');
select ok(not has_function_privilege('admin_executor', 'private.file_download_authorize(private.account_context, uuid)', 'execute'), 'admin cannot use account download authorization');
select ok(not has_table_privilege('account_executor', 'public.platform_config_files', 'select'), 'account cannot select file table directly');
select ok(not has_table_privilege('admin_executor', 'public.platform_config_files', 'select'), 'admin cannot select file table directly');

select ok(exists (select 1 from pg_indexes where indexname = 'platform_config_files_account_status_idx'), 'account list has a bounded ordering index');
select ok(exists (select 1 from pg_proc where proname = 'file_download_event' and pg_get_functiondef(oid) like '%file.download_stream_completed%'), 'completed stream audit event is explicit');
select ok(exists (select 1 from pg_proc where proname = 'file_download_event' and pg_get_functiondef(oid) like '%file.download_failed%'), 'failed stream audit event is explicit');
select ok(not exists (select 1 from pg_proc where proname in ('file_list', 'file_read', 'file_download_authorize') and pg_get_functiondef(oid) like '%execute immediate%'), 'account file reads do not accept arbitrary SQL');
select ok(not exists (select 1 from pg_proc where proname like 'admin_file_%' and pg_get_functiondef(oid) like '%storage.objects%'), 'admin file domain functions do not read Storage metadata');

select * from finish();

rollback;
