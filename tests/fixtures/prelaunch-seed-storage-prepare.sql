-- Run after prelaunch-seed.sql; upload the exact bytes {} before completing.
do $prepare$
declare v record; v_ctx private.account_context;
begin
  select cv.*,a.user_id,s.id session_id,k.id key_id into strict v
  from public.platform_config_versions cv
  join public.platform_accounts a on a.id=cv.platform_account_id
  join auth.sessions s on s.user_id=a.user_id
  join private.platform_api_keys k on k.platform_id=cv.platform_id
  join public.platforms p on p.id=cv.platform_id where p.code='prelaunch-seed-1';
  v_ctx:=row(v.user_id,v.session_id,v.platform_id,v.key_id,gen_random_uuid())::private.account_context;
  perform private.config_version_receive_claim(v_ctx,v.config_id,v.id,'prelaunch-seed',15);
  perform private.config_version_prepare_store(v_ctx,v.config_id,v.id,2,
    encode(extensions.digest('{}','sha256'),'hex'),'prelaunch-seed-store');
end;
$prepare$;

select f.storage_bucket,f.storage_path from public.platform_config_files f
join public.platforms p on p.id=f.platform_id where p.code='prelaunch-seed-1';
