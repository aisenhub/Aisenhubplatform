-- Run only after an immutable upload and a verified two-byte {} download.
do $complete$
declare v record; v_ctx private.account_context; v_admin uuid; v_admin_session uuid:=gen_random_uuid(); v_submission record;
begin
  select cv.*,a.user_id,s.id session_id,k.id key_id,w.id attempt_id into strict v
  from public.platform_config_versions cv
  join public.platform_accounts a on a.id=cv.platform_account_id
  join auth.sessions s on s.user_id=a.user_id
  join private.platform_api_keys k on k.platform_id=cv.platform_id
  join private.file_write_attempts w on w.file_id=cv.file_id and w.state='in_flight'
  join public.platforms p on p.id=cv.platform_id where p.code='prelaunch-seed-1';
  v_ctx:=row(v.user_id,v.session_id,v.platform_id,v.key_id,gen_random_uuid())::private.account_context;
  perform private.config_version_write_attempt_finalize(v_ctx,v.config_id,v.id,v.attempt_id,2,
    encode(extensions.digest('{}','sha256'),'hex'),'synthetic-storage-confirmed');
  perform private.config_version_activate(v_ctx,v.config_id,v.id);
  select * into v_submission from private.config_gallery_submission_create(v_ctx,v.config_id,v.id);
  select user_id into strict v_admin from private.system_admin;
  insert into auth.sessions(id,user_id,created_at,updated_at,not_after)
    values(v_admin_session,v_admin,now(),now(),now()+interval '1 minute');
  perform private.admin_config_gallery_review_v2(row(v_admin,v_admin_session,gen_random_uuid())::private.admin_context,
    v.platform_id,v_submission.submission_id,'approve','Synthetic fixture');
  delete from auth.sessions where id=v_admin_session;
  if not exists(select 1 from public.platform_config_gallery_entries where config_id=v.config_id and status='approved') then
    raise exception 'prelaunch_gallery_seed_incomplete';
  end if;
end;
$complete$;

select (select count(*) from public.platforms) platforms,
  (select count(*) from public.platform_accounts) accounts,
  (select count(*) from public.subscription_grants) grants,
  (select count(*) from public.platform_config_gallery_entries) gallery_entries;
