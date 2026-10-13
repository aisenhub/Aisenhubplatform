begin;

select plan(42);

select ok(to_regclass('public.subscription_products') is null,'fixed subscription_products table is removed');
select ok(to_regclass('public.platform_subscription_config') is null,'fixed-product platform subscription config is removed');
select ok(not exists(select 1 from information_schema.columns where table_schema='public' and table_name='platform_commercial_offers' and column_name='legacy_product_code'),'Offer legacy_product_code is removed');
select ok(not exists(select 1 from information_schema.columns where table_schema='public' and table_name='billing_provider_products' and column_name='subscription_product_id'),'Provider Mapping fixed product target is removed');
select ok(not exists(select 1 from information_schema.columns where table_schema='public' and table_name='billing_checkout_intents' and column_name='subscription_product_id'),'Checkout fixed product id is removed');
select ok(not exists(select 1 from information_schema.columns where table_schema='public' and table_name='billing_checkout_intents' and column_name='product_code'),'Checkout product_code is removed');
select ok(not exists(select 1 from information_schema.columns where table_schema='public' and table_name='redemption_code_batches' and column_name='model_version'),'Redemption fixed-product model version is removed');
select ok(not exists(select 1 from information_schema.columns where table_schema='public' and table_name='redemption_code_batches' and column_name='product_code'),'Redemption product_code is removed');
select ok(to_regprocedure('private.admin_plan_upsert(private.admin_context,uuid,uuid,text,text,text,text,jsonb,text,boolean,boolean)') is null,'legacy Plan write function is removed');
select ok(to_regprocedure('private.admin_commercial_price_publish(private.admin_context,uuid,uuid,uuid,text)') is null,'legacy Price publish function is removed');
select ok(to_regprocedure('private.subscription_checkout_create_v2(private.account_context,uuid,text,uuid,text,smallint,bytea)') is null,'legacy hybrid Checkout function is removed');
select ok(to_regprocedure('private.admin_commercial_price_command(private.admin_context,uuid,uuid,text,uuid,text)') is not null,'canonical Price lifecycle command exists');
select ok(to_regprocedure('private.admin_commercial_mapping_command(private.admin_context,uuid,uuid,text,uuid,text)') is not null,'canonical Mapping lifecycle command exists');
select ok(to_regprocedure('private.admin_plan_command(private.admin_context,uuid,uuid,text,uuid,text)') is not null,'canonical Plan lifecycle command exists');

insert into auth.users(id,aud,role,email,encrypted_password,created_at,updated_at)
values('00000000-0000-4000-8000-000000012001','authenticated','authenticated','prelaunch-commerce-admin@example.invalid','x',now(),now());
insert into auth.sessions(id,user_id,created_at,updated_at,not_after)
values('00000000-0000-4000-8000-000000012002','00000000-0000-4000-8000-000000012001',now(),now(),now()+interval '1 hour');
insert into private.system_admin(user_id) values('00000000-0000-4000-8000-000000012001')
on conflict(singleton_id) do update set user_id=excluded.user_id;

insert into auth.users(id,aud,role,email,encrypted_password,created_at,updated_at)
values('00000000-0000-4000-8000-000000012003','authenticated','authenticated','prelaunch-commerce-account@example.invalid','x',now(),now());

insert into public.platforms(id,code,name,status,allow_activation)
values('00000000-0000-4000-8000-000000012010','prelaunch-commerce','Prelaunch Commerce','active',true);
insert into public.plans(id,platform_id,code,name,kind,status,features) values
 ('00000000-0000-4000-8000-000000012020','00000000-0000-4000-8000-000000012010','sale','Sale','paid','active','{}'::jsonb),
 ('00000000-0000-4000-8000-000000012021','00000000-0000-4000-8000-000000012010','grant','Grant','paid','active','{}'::jsonb),
 ('00000000-0000-4000-8000-000000012022','00000000-0000-4000-8000-000000012010','unused','Unused','paid','active','{}'::jsonb),
 ('00000000-0000-4000-8000-000000012023','00000000-0000-4000-8000-000000012010','free-a','Free A','free','active','{}'::jsonb),
 ('00000000-0000-4000-8000-000000012024','00000000-0000-4000-8000-000000012010','free-b','Free B','free','active','{}'::jsonb);
insert into public.platform_accounts(id,platform_id,user_id,status,activated_at)
values('00000000-0000-4000-8000-000000012030','00000000-0000-4000-8000-000000012010','00000000-0000-4000-8000-000000012003','active',now());
insert into public.subscription_grants(
 id,platform_id,platform_account_id,plan_id,source,operation_id,starts_at,ends_at,created_by,reason
) values(
 '00000000-0000-4000-8000-000000012031','00000000-0000-4000-8000-000000012010',
 '00000000-0000-4000-8000-000000012030','00000000-0000-4000-8000-000000012021','admin',
 '00000000-0000-4000-8000-000000012032',now(),now()+interval '30 days',
 '00000000-0000-4000-8000-000000012001','prelaunch grant fixture'
);

insert into public.platform_commercial_offers(
 id,platform_id,plan_id,code,name,duration_value,duration_unit,status,recommended
) values(
 '00000000-0000-4000-8000-000000012040','00000000-0000-4000-8000-000000012010',
 '00000000-0000-4000-8000-000000012020','sale-month','Sale Month',1,'month','draft',true
);
insert into public.platform_commercial_prices(
 id,platform_id,offer_id,version,amount,currency,status,effective_from
) values(
 '00000000-0000-4000-8000-000000012041','00000000-0000-4000-8000-000000012010',
 '00000000-0000-4000-8000-000000012040',1,29.90,'CNY','active',now()
);
insert into public.billing_provider_accounts(id,provider,name,status,secret_reference)
values('00000000-0000-4000-8000-000000012050','afdian','Prelaunch Provider','active','fixture://prelaunch-commerce');
insert into public.billing_provider_products(
 id,provider_account_id,platform_id,commercial_price_id,external_plan_id,product_type,
 external_sku_ids,sku_count,purchase_months,expected_show_amount,expected_total_amount,currency,
 price_version,mapping_version,validation_status,published,enabled
) values
 ('00000000-0000-4000-8000-000000012051','00000000-0000-4000-8000-000000012050',
  '00000000-0000-4000-8000-000000012010','00000000-0000-4000-8000-000000012041',
  'provider-plan-a','subscription','{}'::text[],0,1,29.90,29.90,'CNY',1,1,'verified',true,true),
 ('00000000-0000-4000-8000-000000012052','00000000-0000-4000-8000-000000012050',
  '00000000-0000-4000-8000-000000012010','00000000-0000-4000-8000-000000012041',
  'provider-plan-b','subscription','{}'::text[],0,1,29.90,29.90,'CNY',1,2,'verified',false,false),
 ('00000000-0000-4000-8000-000000012053','00000000-0000-4000-8000-000000012050',
  '00000000-0000-4000-8000-000000012010','00000000-0000-4000-8000-000000012041',
  'provider-plan-rejected','subscription','{}'::text[],0,1,29.90,29.90,'CNY',1,3,'rejected',false,false);

create temporary table activated_offer on commit drop as
select result.* from private.admin_commercial_offer_command(
 row('00000000-0000-4000-8000-000000012001','00000000-0000-4000-8000-000000012002','00000000-0000-4000-8000-000000012060')::private.admin_context,
 '00000000-0000-4000-8000-000000012010','00000000-0000-4000-8000-000000012040','activate',
 '00000000-0000-4000-8000-000000012061','activate sale offer'
) as result;
create temporary table activated_offer_replay on commit drop as
select result.* from private.admin_commercial_offer_command(
 row('00000000-0000-4000-8000-000000012001','00000000-0000-4000-8000-000000012002','00000000-0000-4000-8000-000000012062')::private.admin_context,
 '00000000-0000-4000-8000-000000012010','00000000-0000-4000-8000-000000012040','activate',
 '00000000-0000-4000-8000-000000012061','activate sale offer'
) as result;
select ok((select status from activated_offer)='active','Offer activation succeeds');
select ok((select status from activated_offer_replay)='active','same Offer operation id safely replays completed result');
select throws_ok(
 $$select private.admin_commercial_offer_command(
   row('00000000-0000-4000-8000-000000012001','00000000-0000-4000-8000-000000012002','00000000-0000-4000-8000-000000012063')::private.admin_context,
   '00000000-0000-4000-8000-000000012010','00000000-0000-4000-8000-000000012040','activate',
   '00000000-0000-4000-8000-000000012064','duplicate activation')$$,
 'P0001','commercial_offer_already_active','new operation id cannot record a no-op Offer activation'
);

select throws_ok(
 $$select private.admin_plan_command(
   row('00000000-0000-4000-8000-000000012001','00000000-0000-4000-8000-000000012002','00000000-0000-4000-8000-000000012065')::private.admin_context,
   '00000000-0000-4000-8000-000000012010','00000000-0000-4000-8000-000000012020','archive',
   '00000000-0000-4000-8000-000000012066','archive active offer plan')$$,
 'P0001','active_offer_exists','Plan archive blocks an active Offer'
);
select throws_ok(
 $$select private.admin_plan_command(
   row('00000000-0000-4000-8000-000000012001','00000000-0000-4000-8000-000000012002','00000000-0000-4000-8000-000000012067')::private.admin_context,
   '00000000-0000-4000-8000-000000012010','00000000-0000-4000-8000-000000012021','archive',
   '00000000-0000-4000-8000-000000012068','archive active grant plan')$$,
 'P0001','active_or_future_grant','Plan archive blocks current or future Grants'
);
create temporary table archived_plan on commit drop as
select result.* from private.admin_plan_command(
 row('00000000-0000-4000-8000-000000012001','00000000-0000-4000-8000-000000012002','00000000-0000-4000-8000-000000012069')::private.admin_context,
 '00000000-0000-4000-8000-000000012010','00000000-0000-4000-8000-000000012022','archive',
 '00000000-0000-4000-8000-000000012070','archive unused plan'
) as result;
create temporary table archived_plan_replay on commit drop as
select result.* from private.admin_plan_command(
 row('00000000-0000-4000-8000-000000012001','00000000-0000-4000-8000-000000012002','00000000-0000-4000-8000-000000012071')::private.admin_context,
 '00000000-0000-4000-8000-000000012010','00000000-0000-4000-8000-000000012022','archive',
 '00000000-0000-4000-8000-000000012070','archive unused plan'
) as result;
select ok((select status from archived_plan)='archived','unused Plan can be archived');
select ok((select status from archived_plan_replay)='archived','Plan lifecycle operation replay returns stored result');

create temporary table default_plan_set on commit drop as
select result.* from private.admin_plan_command(
 row('00000000-0000-4000-8000-000000012001','00000000-0000-4000-8000-000000012002','00000000-0000-4000-8000-000000012072')::private.admin_context,
 '00000000-0000-4000-8000-000000012010','00000000-0000-4000-8000-000000012023','make_default',
 '00000000-0000-4000-8000-000000012073','set default free'
) as result;
select ok((select default_plan_id from public.platforms where id='00000000-0000-4000-8000-000000012010')='00000000-0000-4000-8000-000000012023'::uuid,'make_default updates the platform default Plan');
select throws_ok(
 $$select private.admin_plan_command(
   row('00000000-0000-4000-8000-000000012001','00000000-0000-4000-8000-000000012002','00000000-0000-4000-8000-000000012074')::private.admin_context,
   '00000000-0000-4000-8000-000000012010','00000000-0000-4000-8000-000000012023','make_default',
   '00000000-0000-4000-8000-000000012075','repeat default')$$,
 'P0001','plan_already_default','new operation id cannot record a no-op default Plan change'
);
select throws_ok(
 $$select private.admin_plan_command(
   row('00000000-0000-4000-8000-000000012001','00000000-0000-4000-8000-000000012002','00000000-0000-4000-8000-000000012076')::private.admin_context,
   '00000000-0000-4000-8000-000000012010','00000000-0000-4000-8000-000000012024','clear_default',
   '00000000-0000-4000-8000-000000012077','clear wrong default')$$,
 'P0001','plan_is_not_default','clear_default rejects a Plan that is not current default'
);

create temporary table switched_mapping on commit drop as
select result.* from private.admin_commercial_mapping_command(
 row('00000000-0000-4000-8000-000000012001','00000000-0000-4000-8000-000000012002','00000000-0000-4000-8000-000000012080')::private.admin_context,
 '00000000-0000-4000-8000-000000012010','00000000-0000-4000-8000-000000012052','switch',
 '00000000-0000-4000-8000-000000012081','switch provider mapping'
) as result;
select ok((select published and enabled from switched_mapping),'atomic Mapping switch enables the target');
select ok(not (select enabled from public.billing_provider_products where id='00000000-0000-4000-8000-000000012051'),'atomic Mapping switch disables the previous current mapping');
select ok((select count(*) from public.billing_provider_products where provider_account_id='00000000-0000-4000-8000-000000012050' and commercial_price_id='00000000-0000-4000-8000-000000012041' and published and enabled)=1,'Mapping switch leaves exactly one current mapping');
create temporary table switched_mapping_replay on commit drop as
select result.* from private.admin_commercial_mapping_command(
 row('00000000-0000-4000-8000-000000012001','00000000-0000-4000-8000-000000012002','00000000-0000-4000-8000-000000012082')::private.admin_context,
 '00000000-0000-4000-8000-000000012010','00000000-0000-4000-8000-000000012052','switch',
 '00000000-0000-4000-8000-000000012081','switch provider mapping'
) as result;
select ok((select published and enabled from switched_mapping_replay),'same Mapping operation id replays the stored result');
select throws_ok(
 $$select private.admin_commercial_mapping_command(
   row('00000000-0000-4000-8000-000000012001','00000000-0000-4000-8000-000000012002','00000000-0000-4000-8000-000000012083')::private.admin_context,
   '00000000-0000-4000-8000-000000012010','00000000-0000-4000-8000-000000012052','switch',
   '00000000-0000-4000-8000-000000012081','different hash')$$,
 '23505','idempotency_conflict','same Mapping operation id with different request hash is rejected'
);
select throws_ok(
 $$select private.admin_commercial_mapping_command(
   row('00000000-0000-4000-8000-000000012001','00000000-0000-4000-8000-000000012002','00000000-0000-4000-8000-000000012084')::private.admin_context,
   '00000000-0000-4000-8000-000000012010','00000000-0000-4000-8000-000000012053','switch',
   '00000000-0000-4000-8000-000000012085','switch rejected mapping')$$,
 'P0001','provider_mapping_unavailable','invalid target Mapping fails before replacing current mapping'
);
select ok((select enabled from public.billing_provider_products where id='00000000-0000-4000-8000-000000012052'),'failed Mapping switch leaves prior current mapping enabled');

create temporary table created_price on commit drop as
select result.* from private.admin_commercial_price_create(
 row('00000000-0000-4000-8000-000000012001','00000000-0000-4000-8000-000000012002','00000000-0000-4000-8000-000000012090')::private.admin_context,
 '00000000-0000-4000-8000-000000012010','00000000-0000-4000-8000-000000012040',39.90,'CNY'
) as result;
select ok((select version from created_price)=2,'Price create allocates the next Offer-scoped version');
create temporary table published_price on commit drop as
select result.* from private.admin_commercial_price_command(
 row('00000000-0000-4000-8000-000000012001','00000000-0000-4000-8000-000000012002','00000000-0000-4000-8000-000000012091')::private.admin_context,
 '00000000-0000-4000-8000-000000012010',(select id from created_price),'publish',
 '00000000-0000-4000-8000-000000012092','publish v2'
) as result;
create temporary table published_price_replay on commit drop as
select result.* from private.admin_commercial_price_command(
 row('00000000-0000-4000-8000-000000012001','00000000-0000-4000-8000-000000012002','00000000-0000-4000-8000-000000012093')::private.admin_context,
 '00000000-0000-4000-8000-000000012010',(select id from created_price),'publish',
 '00000000-0000-4000-8000-000000012092','publish v2'
) as result;
select ok((select status from published_price)='active','Price publish activates the draft');
select ok((select status from published_price_replay)='active','same Price operation id replays the stored result');
select ok((select status from public.platform_commercial_prices where id='00000000-0000-4000-8000-000000012041')='retired','Price publish retires the previous active Price in the same transaction');
select throws_ok(
 $$select private.admin_commercial_price_command(
   row('00000000-0000-4000-8000-000000012001','00000000-0000-4000-8000-000000012002','00000000-0000-4000-8000-000000012094')::private.admin_context,
   '00000000-0000-4000-8000-000000012010',(select id from created_price),'publish',
   '00000000-0000-4000-8000-000000012092','different publish hash')$$,
 '23505','idempotency_conflict','same Price operation id with different request hash is rejected'
);
create temporary table retired_price on commit drop as
select result.* from private.admin_commercial_price_command(
 row('00000000-0000-4000-8000-000000012001','00000000-0000-4000-8000-000000012002','00000000-0000-4000-8000-000000012095')::private.admin_context,
 '00000000-0000-4000-8000-000000012010',(select id from created_price),'retire',
 '00000000-0000-4000-8000-000000012096','retire v2'
) as result;
select ok((select status from retired_price)='retired','Price supports an independent retire command');
select ok((select count(*) from public.platform_commercial_prices where offer_id='00000000-0000-4000-8000-000000012040' and status='active')=0,'retiring the current Price makes purchase readiness price-unavailable');

create temporary table campaign_created on commit drop as
select * from private.admin_redemption_campaign_create(
 row('00000000-0000-4000-8000-000000012001','00000000-0000-4000-8000-000000012002','00000000-0000-4000-8000-000000012100')::private.admin_context,
 '00000000-0000-4000-8000-000000012010',null,'00000000-0000-4000-8000-000000012021',
 'Manual duration campaign',1,14,'day',now()+interval '30 days',now()+interval '1 day',
 '00000000-0000-4000-8000-000000012101',repeat('a',64),
 jsonb_build_array(jsonb_build_object('code_hmac',repeat('b',64),'hmac_key_version',1,'code_prefix','PRE','code_suffix','POST'))
);
create temporary table campaign_replay on commit drop as
select * from private.admin_redemption_campaign_create(
 row('00000000-0000-4000-8000-000000012001','00000000-0000-4000-8000-000000012002','00000000-0000-4000-8000-000000012102')::private.admin_context,
 '00000000-0000-4000-8000-000000012010',null,'00000000-0000-4000-8000-000000012021',
 'Manual duration campaign',1,14,'day',(select expires_at from public.redemption_code_batches where id=(select batch_id from campaign_created)),
 (select delivery_deadline from public.redemption_code_batches where id=(select batch_id from campaign_created)),
 '00000000-0000-4000-8000-000000012101',repeat('a',64),
 jsonb_build_array(jsonb_build_object('code_hmac',repeat('b',64),'hmac_key_version',1,'code_prefix','PRE','code_suffix','POST'))
);
select ok((select creation_state from campaign_created)='created','canonical Redemption Campaign create succeeds');
select ok((select creation_state from campaign_replay)='replayed_existing','Redemption Campaign operation id safely replays identical request facts');
select throws_ok(
 $$select * from private.admin_redemption_campaign_create(
   row('00000000-0000-4000-8000-000000012001','00000000-0000-4000-8000-000000012002','00000000-0000-4000-8000-000000012103')::private.admin_context,
   '00000000-0000-4000-8000-000000012010',null,'00000000-0000-4000-8000-000000012021',
   'Manual duration campaign',1,14,'day',
   (select expires_at from public.redemption_code_batches where id=(select batch_id from campaign_created)),
   (select delivery_deadline from public.redemption_code_batches where id=(select batch_id from campaign_created)),
   '00000000-0000-4000-8000-000000012101',repeat('a',64),
   jsonb_build_array(jsonb_build_object('code_hmac',repeat('c',64),'hmac_key_version',1,'code_prefix','PRE','code_suffix','POST'))
 )$$,
 '23505','idempotency_conflict','Redemption Campaign operation id hashes code delivery facts and rejects changed codes'
);
select ok((select count(*) from public.redemption_code_batches where platform_id='00000000-0000-4000-8000-000000012010' and creation_operation_id='00000000-0000-4000-8000-000000012101')=1,'Redemption replay never creates a second batch');

select * from finish();
rollback;
