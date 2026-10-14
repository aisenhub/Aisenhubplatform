-- Only run in an explicitly reset Local/test project with a restored operator.
-- Supply prelaunch.platform_hmac_secret in this transaction; no login credentials.
do $seed$
declare
  v_admin uuid; v_platform uuid; v_free uuid; v_paid uuid; v_key uuid;
  v_user uuid; v_account uuid; v_session uuid; v_owner uuid; v_owner_user uuid; v_owner_session uuid;
  v_offer uuid; v_price uuid; v_provider uuid; v_mapping uuid; v_checkout uuid; v_order uuid; v_job uuid;
  v_ctx private.account_context; v_config record; v_version record; v_settlement record;
  v_secret text := current_setting('prelaunch.platform_hmac_secret', true);
  v_suffix text; v_origin text;
begin
  select user_id into strict v_admin from private.system_admin;
  if coalesce(length(v_secret),0)<32 or exists(select 1 from public.platforms) then
    raise exception 'seed_requires_empty_test_project_and_ephemeral_secret';
  end if;
  for i in 1..2 loop
    v_platform:=gen_random_uuid(); v_free:=gen_random_uuid(); v_paid:=gen_random_uuid(); v_key:=gen_random_uuid();
    v_suffix:=i::text; v_origin:='http://localhost:'||(3110+i-1)::text;
    insert into public.platforms(id,code,name,status,allow_activation)
      values(v_platform,'prelaunch-seed-'||v_suffix,'Prelaunch Test '||v_suffix,'active',true);
    insert into public.platform_auth_origins(platform_id,environment,origin,oauth_callback_url,password_reset_url,email_confirmation_url)
      values(v_platform,'staging',v_origin,v_origin||'/callback',v_origin||'/reset',v_origin||'/confirm');
    insert into public.plans(id,platform_id,code,name,kind,status,features) values
      (v_free,v_platform,'free','Free','free','active','{"config_slot_limit":3}'),
      (v_paid,v_platform,'paid','Paid','paid','active','{"config_slot_limit":3}');
    update public.platforms set default_plan_id=v_free where id=v_platform;
    insert into public.platform_file_policies(platform_id,enabled,max_file_bytes,max_platform_total_bytes)
      values(v_platform,true,1048576,8388608);
    insert into private.platform_api_keys(id,platform_id,name,key_hmac,hmac_key_version,key_prefix,key_suffix,creation_operation_id)
      values(v_key,v_platform,'Prelaunch fixture',encode(extensions.hmac(
        '1:platform-key:'||v_key::text||':phk_v1_'||v_key::text||'_'||v_secret,v_secret,'sha256'),'hex'),
        1,'phk_v1',right(v_secret,8),gen_random_uuid());
    for j in 1..2 loop
      v_user:=gen_random_uuid(); v_account:=gen_random_uuid(); v_session:=gen_random_uuid();
      insert into auth.users(id,aud,role,email,encrypted_password,created_at,updated_at)
        values(v_user,'authenticated','authenticated','prelaunch-seed-'||v_suffix||'-'||j::text||'@example.invalid',null,now(),now());
      insert into auth.sessions(id,user_id,created_at,updated_at,not_after)
        values(v_session,v_user,now(),now(),now()+interval '1 hour');
      insert into public.platform_accounts(id,platform_id,user_id,status,activated_at)
        values(v_account,v_platform,v_user,'active',now());
      insert into public.platform_profiles(platform_account_id,display_name)
        values(v_account,'Synthetic Test '||j::text);
      if j=1 then v_owner:=v_account; v_owner_user:=v_user; v_owner_session:=v_session; end if;
    end loop;
    v_offer:=gen_random_uuid(); v_price:=gen_random_uuid(); v_provider:=gen_random_uuid(); v_mapping:=gen_random_uuid();
    insert into public.platform_commercial_offers(id,platform_id,plan_id,code,name,duration_value,duration_unit,status,recommended)
      values(v_offer,v_platform,v_paid,'monthly','Monthly',1,'month','active',true);
    insert into public.platform_commercial_prices(id,platform_id,offer_id,version,amount,currency,status,effective_from)
      values(v_price,v_platform,v_offer,1,19.90,'CNY','active',now());
    insert into public.billing_provider_accounts(id,provider,name,status,secret_reference)
      values(v_provider,'afdian','Synthetic fixture only','disabled','fixture://prelaunch');
    insert into public.billing_provider_products(id,provider_account_id,platform_id,commercial_price_id,external_plan_id,product_type,
      external_sku_ids,sku_count,purchase_months,expected_show_amount,expected_total_amount,currency,price_version,mapping_version,validation_status,published,enabled)
      values(v_mapping,v_provider,v_platform,v_price,'synthetic-plan-'||v_suffix,'subscription','{}',0,1,19.90,19.90,'CNY',1,1,'verified',true,true);
    insert into public.redemption_code_batches(platform_id,plan_id,name,quantity,duration_value,duration_unit,expires_at,status,
      delivery_deadline,created_by,creation_operation_id,commercial_offer_id)
      values(v_platform,v_paid,'Synthetic campaign',1,1,'month',now()+interval '30 days','pending_delivery',
        now()+interval '1 day',v_admin,gen_random_uuid(),v_offer);
    if i=1 then
      v_checkout:=gen_random_uuid(); v_order:=gen_random_uuid(); v_job:=gen_random_uuid();
      insert into public.billing_checkout_intents(id,platform_id,platform_account_id,entitlement_plan_id,
        provider_account_id,provider_product_id,term_kind_snapshot,duration_value_snapshot,duration_unit_snapshot,
        commercial_offer_id,commercial_price_id,offer_code_snapshot,price_amount,currency,price_version,mapping_version,
        custom_order_id,idempotency_key_hash,request_hash,expires_at)
        values(v_checkout,v_platform,v_owner,v_paid,v_provider,v_mapping,'finite',1,'month',v_offer,v_price,'monthly',19.90,'CNY',1,1,
          'prelaunch-'||v_checkout::text,extensions.digest(v_checkout::text,'sha256'),extensions.digest(v_order::text,'sha256'),now()+interval '1 hour');
      insert into public.billing_orders(id,provider_account_id,provider_order_no,checkout_intent_id,platform_id,platform_account_id,linkage_status)
        values(v_order,v_provider,'synthetic-order-'||v_order::text,v_checkout,v_platform,v_owner,'linked');
      insert into public.billing_processing_jobs(id,job_kind,billing_order_id,state,attempts,lease_owner,lease_until,fence)
        values(v_job,'order_verification',v_order,'processing',1,'prelaunch-seed',now()+interval '1 minute',1);
      select * into v_settlement from private.billing_order_verify_and_settle(
        row(gen_random_uuid(),'prelaunch-seed',1,gen_random_uuid())::private.job_context,v_job,v_order,1,
        jsonb_build_object('status','paid','provider_user_id','synthetic-user','external_plan_id','synthetic-plan-'||v_suffix,
          'product_type','subscription','sku_ids','[]'::jsonb,'purchase_months',1,'total_amount','19.90','show_amount','19.90',
          'currency','CNY','custom_order_id','prelaunch-'||v_checkout::text));
      if v_settlement.decision_code<>'granted' then raise exception 'synthetic_settlement_failed'; end if;
      v_ctx:=row(v_owner_user,v_owner_session,v_platform,v_key,gen_random_uuid())::private.account_context;
      select * into v_config from private.config_create(v_ctx,'Synthetic Config','Prelaunch fixture');
      select * into v_version from private.config_version_intent_create(v_ctx,v_config.config_id,'prelaunch.json',2,
        'application/json','prelaunch.config','1','Synthetic fixture','prelaunch-seed-version');
      perform private.feedback_create(v_ctx,'idea','Synthetic feedback','Prelaunch fixture',false,'{}','prelaunch-seed-feedback');
    end if;
    update public.platform_commerce_policy set purchases_paused=true where platform_id=v_platform;
  end loop;
  if (select count(*) from public.platforms)<>2 or (select count(*) from public.platform_accounts)<>4
     or (select count(*) from public.subscription_grants)<>1 or (select count(*) from public.platform_config_versions)<>1
     or (select count(*) from public.platform_feedback)<>1 or (select count(*) from public.redemption_code_batches)<>2 then
    raise exception 'prelaunch_seed_incomplete';
  end if;
end;
$seed$;
