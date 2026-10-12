begin;

select plan(43);

select has_table('public','platform_commercial_offers','Commercial Offer table exists');
select has_table('public','platform_commercial_prices','Immutable commercial Price table exists');
select ok((select relforcerowsecurity from pg_class where oid='public.platform_commercial_offers'::regclass),'Offer table forces RLS');
select ok((select relforcerowsecurity from pg_class where oid='public.platform_commercial_prices'::regclass),'Price table forces RLS');
select ok(not has_table_privilege('admin_executor','public.platform_commercial_offers','select'),'Admin executor has no direct Offer table read');
select ok(not has_table_privilege('account_executor','public.platform_commercial_prices','select'),'Account executor has no direct Price table read');
select has_function('private','admin_commerce_summary',array['private.admin_context','uuid','timestamp with time zone','timestamp with time zone'],'Commerce summary exists');
select has_function('private','admin_commerce_entitlement_list',array['private.admin_context','uuid','timestamp with time zone','uuid','integer','text','text','uuid','text','timestamp with time zone','timestamp with time zone'],'Commerce entitlement list exists');
select has_function('private','admin_redemption_campaign_list_v2',array['private.admin_context','uuid','uuid','integer','text','text','uuid','uuid','timestamp with time zone','timestamp with time zone'],'Campaign list v2 exists');
select has_function('private','admin_redemption_campaign_codes_v2',array['private.admin_context','uuid','uuid','uuid','integer'],'Campaign code detail exists');
select ok(has_function_privilege('admin_executor','private.admin_commerce_summary(private.admin_context, uuid, timestamptz, timestamptz)','execute'),'Admin executor can read Commerce summary');
select ok(not has_function_privilege('account_executor','private.admin_commerce_summary(private.admin_context, uuid, timestamptz, timestamptz)','execute'),'Account executor cannot read Admin Commerce summary');
select ok((select prosecdef and array_to_string(proconfig,',') like 'search_path=pg_catalog%' from pg_proc where oid='private.admin_commerce_summary(private.admin_context, uuid, timestamptz, timestamptz)'::regprocedure),'Commerce summary is pinned security definer');
select has_column('public','billing_provider_products','commercial_price_id','Provider mapping can attribute a commercial Price');
select has_column('public','billing_checkout_intents','commercial_offer_id','Checkout can attribute a commercial Offer');
select has_column('public','billing_checkout_intents','commercial_price_id','Checkout can attribute an immutable Price');
select has_column('public','redemption_code_batches','commercial_offer_id','Redemption Campaign can attribute an Offer');

insert into auth.users(id,aud,role,email,encrypted_password,created_at,updated_at) values
 ('00000000-0000-4000-8000-000000010001','authenticated','authenticated','commerce-admin@example.invalid','x',now(),now()),
 ('00000000-0000-4000-8000-000000010002','authenticated','authenticated','commerce-billing@example.invalid','x',now(),now()),
 ('00000000-0000-4000-8000-000000010003','authenticated','authenticated','commerce-admin-grant@example.invalid','x',now(),now()),
 ('00000000-0000-4000-8000-000000010004','authenticated','authenticated','commerce-redeem@example.invalid','x',now(),now());
insert into auth.sessions(id,user_id,created_at,updated_at,not_after)
values('00000000-0000-4000-8000-000000010010','00000000-0000-4000-8000-000000010001',now(),now(),now()+interval '1 hour');
insert into private.system_admin(user_id) values('00000000-0000-4000-8000-000000010001')
on conflict(singleton_id) do update set user_id=excluded.user_id;

insert into public.platforms(id,code,name,status,allow_activation) values
 ('00000000-0000-4000-8000-000000010020','commerce-main','Commerce Main','active',true),
 ('00000000-0000-4000-8000-000000010021','commerce-other','Commerce Other','active',true);
insert into public.plans(id,platform_id,code,name,kind,status,features) values
 ('00000000-0000-4000-8000-000000010030','00000000-0000-4000-8000-000000010020','standard','Standard','paid','active','{}'::jsonb),
 ('00000000-0000-4000-8000-000000010031','00000000-0000-4000-8000-000000010020','premium','Premium','paid','active','{}'::jsonb);

insert into public.platform_commercial_offers(
 id,platform_id,plan_id,code,name,term_kind,duration_value,duration_unit,status,sort_order,recommended,legacy_product_code
) values
 ('00000000-0000-4000-8000-000000010040','00000000-0000-4000-8000-000000010020','00000000-0000-4000-8000-000000010030','standard-month','Standard Monthly','finite',1,'month','active',10,true,'monthly'),
 ('00000000-0000-4000-8000-000000010041','00000000-0000-4000-8000-000000010020','00000000-0000-4000-8000-000000010031','premium-year','Premium Yearly','finite',1,'year','active',20,false,null);
insert into public.platform_commercial_prices(id,platform_id,offer_id,version,amount,currency,status,effective_from) values
 ('00000000-0000-4000-8000-000000010050','00000000-0000-4000-8000-000000010020','00000000-0000-4000-8000-000000010040',1,19.90,'CNY','active',now()-interval '1 day'),
 ('00000000-0000-4000-8000-000000010051','00000000-0000-4000-8000-000000010020','00000000-0000-4000-8000-000000010041',1,199.00,'CNY','active',now()-interval '1 day');

select is((select count(distinct plan_id)::integer from public.platform_commercial_offers where platform_id='00000000-0000-4000-8000-000000010020'),2,'one platform can expose Offers for multiple paid Plans');
select throws_ok(
 $$update public.platform_commercial_prices set amount=29.90 where id='00000000-0000-4000-8000-000000010050'$$,
 'P0001','commercial_price_immutable','published Price amount is immutable'
);
select throws_ok(
 $$update public.platform_commercial_offers set plan_id='00000000-0000-4000-8000-000000010031' where id='00000000-0000-4000-8000-000000010040'$$,
 'P0001','commercial_offer_terms_immutable','Offer entitlement terms freeze once a Price exists'
);

insert into public.platform_accounts(id,platform_id,user_id,status,activated_at,created_at,updated_at) values
 ('00000000-0000-4000-8000-000000010060','00000000-0000-4000-8000-000000010020','00000000-0000-4000-8000-000000010002','active',now()-interval '30 days',now()-interval '30 days',now()-interval '1 minute'),
 ('00000000-0000-4000-8000-000000010061','00000000-0000-4000-8000-000000010020','00000000-0000-4000-8000-000000010003','active',now()-interval '20 days',now()-interval '20 days',now()-interval '2 minutes'),
 ('00000000-0000-4000-8000-000000010062','00000000-0000-4000-8000-000000010020','00000000-0000-4000-8000-000000010004','active',now()-interval '10 days',now()-interval '10 days',now()-interval '3 minutes');
insert into public.platform_profiles(platform_account_id,display_name) values
 ('00000000-0000-4000-8000-000000010060','Billing Buyer'),
 ('00000000-0000-4000-8000-000000010061','Complimentary User'),
 ('00000000-0000-4000-8000-000000010062','Campaign User');
insert into public.subscriptions(id,platform_id,platform_account_id,plan_id,status,started_at,current_period_end,next_transition_at,updated_at) values
 ('00000000-0000-4000-8000-000000010070','00000000-0000-4000-8000-000000010020','00000000-0000-4000-8000-000000010060','00000000-0000-4000-8000-000000010030','active',now()-interval '5 days',now()+interval '25 days',now()+interval '25 days',now()-interval '1 minute'),
 ('00000000-0000-4000-8000-000000010071','00000000-0000-4000-8000-000000010020','00000000-0000-4000-8000-000000010061','00000000-0000-4000-8000-000000010030','active',now()-interval '10 days',now()+interval '20 days',now()+interval '20 days',now()-interval '2 minutes'),
 ('00000000-0000-4000-8000-000000010072','00000000-0000-4000-8000-000000010020','00000000-0000-4000-8000-000000010062','00000000-0000-4000-8000-000000010031','active',now()-interval '3 days',now()+interval '27 days',now()+interval '27 days',now()-interval '3 minutes');

insert into public.billing_provider_accounts(id,provider,name,status,secret_reference)
values('00000000-0000-4000-8000-000000010080','afdian','Commerce Fixture','disabled','fixture://commerce');
insert into public.billing_checkout_intents(
 id,platform_id,platform_account_id,subscription_product_id,entitlement_plan_id,product_code,
 term_kind_snapshot,duration_value_snapshot,duration_unit_snapshot,price_amount,currency,price_version,
 idempotency_key_hash,request_hash,expires_at,status,paid_at,granted_at
) values(
 '00000000-0000-4000-8000-000000010081','00000000-0000-4000-8000-000000010020','00000000-0000-4000-8000-000000010060',
 (select id from public.subscription_products where code='monthly'),'00000000-0000-4000-8000-000000010030','monthly',
 'finite',1,'month',19.90,'CNY',1,decode(repeat('11',32),'hex'),decode(repeat('12',32),'hex'),now()+interval '1 hour','granted',now()-interval '4 days',now()-interval '4 days'
);
insert into public.billing_orders(
 id,provider_account_id,provider_order_no,checkout_intent_id,platform_id,platform_account_id,subscription_product_id,
 total_amount,currency,provider_status,verification_status,entitlement_status,linkage_status,resolution_status,
 resolved_at,resolution_reason,provider_paid_at,created_at,updated_at
) values
 ('00000000-0000-4000-8000-000000010082','00000000-0000-4000-8000-000000010080','commerce-success','00000000-0000-4000-8000-000000010081','00000000-0000-4000-8000-000000010020','00000000-0000-4000-8000-000000010060',(select id from public.subscription_products where code='monthly'),19.90,'CNY','paid','verified','granted','linked','resolved',now()-interval '4 days','settled successfully',now()-interval '4 days',now()-interval '4 days',now()-interval '4 days'),
 ('00000000-0000-4000-8000-000000010083','00000000-0000-4000-8000-000000010080','commerce-duplicate','00000000-0000-4000-8000-000000010081','00000000-0000-4000-8000-000000010020','00000000-0000-4000-8000-000000010060',(select id from public.subscription_products where code='monthly'),999.00,'CNY','paid','verified','granted','linked','resolved',now()-interval '3 days','duplicate payment closed',now()-interval '3 days',now()-interval '3 days',now()-interval '3 days');

insert into public.redemption_code_batches(
 id,platform_id,plan_id,name,quantity,duration_value,duration_unit,expires_at,status,delivery_deadline,delivered_at,delivery_session_id,delivery_receipt_hmac,creation_operation_id,commercial_offer_id
) values(
 '00000000-0000-4000-8000-000000010090','00000000-0000-4000-8000-000000010020','00000000-0000-4000-8000-000000010031','Partner Campaign',3,1,'year',now()+interval '90 days','active',now()+interval '1 day',now()-interval '1 day','00000000-0000-4000-8000-000000010091',repeat('a',64),'00000000-0000-4000-8000-000000010092','00000000-0000-4000-8000-000000010041'
);
insert into public.redemption_codes(id,platform_id,batch_id,plan_id,code_hmac,hmac_key_version,code_prefix,code_suffix,status,redeemed_by_platform_account_id,redeemed_at,created_at) values
 ('00000000-0000-4000-8000-000000010093','00000000-0000-4000-8000-000000010020','00000000-0000-4000-8000-000000010090','00000000-0000-4000-8000-000000010031',repeat('1',64),1,'AAA','1111','redeemed','00000000-0000-4000-8000-000000010062',now()-interval '2 days',now()-interval '6 days'),
 ('00000000-0000-4000-8000-000000010094','00000000-0000-4000-8000-000000010020','00000000-0000-4000-8000-000000010090','00000000-0000-4000-8000-000000010031',repeat('2',64),1,'BBB','2222','unused',null,null,now()-interval '5 days'),
 ('00000000-0000-4000-8000-000000010095','00000000-0000-4000-8000-000000010020','00000000-0000-4000-8000-000000010090','00000000-0000-4000-8000-000000010031',repeat('3',64),1,'CCC','3333','disabled',null,null,now()-interval '4 days');

insert into public.subscription_grants(id,platform_id,platform_account_id,plan_id,source,operation_id,starts_at,ends_at,created_by,reason) values
 ('00000000-0000-4000-8000-000000010100','00000000-0000-4000-8000-000000010020','00000000-0000-4000-8000-000000010060','00000000-0000-4000-8000-000000010030','admin','00000000-0000-4000-8000-000000010101',now()-interval '20 days',now()+interval '40 days','00000000-0000-4000-8000-000000010001','older complimentary grant'),
 ('00000000-0000-4000-8000-000000010102','00000000-0000-4000-8000-000000010020','00000000-0000-4000-8000-000000010061','00000000-0000-4000-8000-000000010030','admin','00000000-0000-4000-8000-000000010103',now()-interval '10 days',now()+interval '20 days','00000000-0000-4000-8000-000000010001','support compensation');
insert into public.subscription_grants(id,platform_id,platform_account_id,plan_id,source,operation_id,billing_order_id,starts_at,ends_at,reason) values
 ('00000000-0000-4000-8000-000000010104','00000000-0000-4000-8000-000000010020','00000000-0000-4000-8000-000000010060','00000000-0000-4000-8000-000000010030','billing_order','00000000-0000-4000-8000-000000010082','00000000-0000-4000-8000-000000010082',now()-interval '5 days',now()+interval '25 days','billing purchase');
insert into public.subscription_grants(id,platform_id,platform_account_id,plan_id,source,operation_id,redemption_code_id,starts_at,ends_at,reason) values
 ('00000000-0000-4000-8000-000000010105','00000000-0000-4000-8000-000000010020','00000000-0000-4000-8000-000000010062','00000000-0000-4000-8000-000000010031','redemption_code','00000000-0000-4000-8000-000000010093','00000000-0000-4000-8000-000000010093',now()-interval '3 days',now()+interval '27 days','campaign redemption');

insert into public.billing_settlements(id,billing_order_id,checkout_intent_id,platform_id,platform_account_id,settlement_kind,state,operation_id,grant_id,decision_reason,decision_code,created_at,updated_at) values
 ('00000000-0000-4000-8000-000000010110','00000000-0000-4000-8000-000000010082','00000000-0000-4000-8000-000000010081','00000000-0000-4000-8000-000000010020','00000000-0000-4000-8000-000000010060','automatic','finalized','00000000-0000-4000-8000-000000010082','00000000-0000-4000-8000-000000010104','billing_order_settlement','granted',now()-interval '4 days',now()-interval '4 days'),
 ('00000000-0000-4000-8000-000000010111','00000000-0000-4000-8000-000000010083','00000000-0000-4000-8000-000000010081','00000000-0000-4000-8000-000000010020','00000000-0000-4000-8000-000000010060','manual','finalized','00000000-0000-4000-8000-000000010083',null,'duplicate payment','duplicate_payment',now()-interval '3 days',now()-interval '3 days');

insert into private.billing_refund_observations(
 id,provider_account_id,provider_refund_id,provider_order_no,billing_order_id,status,refund_amount,currency,compensation_operation_id,compensated_at,observed_at
) values(
 '00000000-0000-4000-8000-000000010120','00000000-0000-4000-8000-000000010080','refund-1','commerce-success','00000000-0000-4000-8000-000000010082','compensated',5.00,'CNY','00000000-0000-4000-8000-000000010121',now()-interval '1 day',now()-interval '2 days'
);

set local role admin_executor;
create temporary table commerce_summary on commit drop as
select * from private.admin_commerce_summary(
 row('00000000-0000-4000-8000-000000010001','00000000-0000-4000-8000-000000010010','00000000-0000-4000-8000-000000010130')::private.admin_context,
 '00000000-0000-4000-8000-000000010020',now()-interval '30 days',now()+interval '1 minute'
);
create temporary table billing_entitlements on commit drop as
select * from private.admin_commerce_entitlement_list(
 row('00000000-0000-4000-8000-000000010001','00000000-0000-4000-8000-000000010010','00000000-0000-4000-8000-000000010131')::private.admin_context,
 '00000000-0000-4000-8000-000000010020',null,null,20,null,'active',null,'billing_order',null,null
);
create temporary table entitlement_page_one on commit drop as
select * from private.admin_commerce_entitlement_list(
 row('00000000-0000-4000-8000-000000010001','00000000-0000-4000-8000-000000010010','00000000-0000-4000-8000-000000010132')::private.admin_context,
 '00000000-0000-4000-8000-000000010020',null,null,1,null,'active',null,null,null,null
);
create temporary table entitlement_page_two on commit drop as
select * from private.admin_commerce_entitlement_list(
 row('00000000-0000-4000-8000-000000010001','00000000-0000-4000-8000-000000010010','00000000-0000-4000-8000-000000010133')::private.admin_context,
 '00000000-0000-4000-8000-000000010020',(select updated_at from entitlement_page_one),(select platform_account_id from entitlement_page_one),1,null,'active',null,null,null,null
);
create temporary table redemption_entitlements on commit drop as
select * from private.admin_commerce_entitlement_list(
 row('00000000-0000-4000-8000-000000010001','00000000-0000-4000-8000-000000010010','00000000-0000-4000-8000-000000010134')::private.admin_context,
 '00000000-0000-4000-8000-000000010020',null,null,20,null,'active',null,'redemption_code',null,null
);
create temporary table campaign_list on commit drop as
select * from private.admin_redemption_campaign_list_v2(
 row('00000000-0000-4000-8000-000000010001','00000000-0000-4000-8000-000000010010','00000000-0000-4000-8000-000000010135')::private.admin_context,
 '00000000-0000-4000-8000-000000010020',null,20,'Partner','active',null,'00000000-0000-4000-8000-000000010041',null,null
);
create temporary table campaign_codes on commit drop as
select * from private.admin_redemption_campaign_codes_v2(
 row('00000000-0000-4000-8000-000000010001','00000000-0000-4000-8000-000000010010','00000000-0000-4000-8000-000000010136')::private.admin_context,
 '00000000-0000-4000-8000-000000010020','00000000-0000-4000-8000-000000010090',null,20
);
set local role postgres;

select is((select active_paid_entitlement_accounts from commerce_summary),3::bigint,'Summary counts current effective paid entitlement accounts');
select is((select billing_grant_count from commerce_summary),1::bigint,'Summary separates Billing grants');
select is((select admin_grant_count from commerce_summary),2::bigint,'Summary separates complimentary Admin grants');
select is((select redemption_grant_count from commerce_summary),1::bigint,'Summary separates Redemption grants');
select is((select verified_gross_amount from commerce_summary),19.90::numeric,'Only verified linked granted finalized/granted Billing facts enter gross amount');
select is((select compensated_refund_amount from commerce_summary),5.00::numeric,'Only compensated refund observations reduce the verified amount');
select is((select net_verified_amount from commerce_summary),14.90::numeric,'Net verified amount is gross less compensated refunds');
select is((select amount_unknown_count from commerce_summary),0::bigint,'Known CNY success facts produce no unknown amount count');
select is((select refund_amount_unknown_count from commerce_summary),0::bigint,'Known compensated refund has no unknown refund amount');
select is((select expiring_paid_entitlement_accounts from commerce_summary),3::bigint,'Summary reports current paid entitlements expiring in 30 days');
select is((select platform_account_id from billing_entitlements),'00000000-0000-4000-8000-000000010060'::uuid,'Entitlement source filter returns the Billing account');
select ok((select entitlement_source='billing_order' and grant_id='00000000-0000-4000-8000-000000010104'::uuid from billing_entitlements),'Winning-grant source ignores an older overlapping Admin grant');
select is((select count(*)::integer from entitlement_page_one),1,'Entitlement list first cursor page is bounded');
select is((select platform_account_id from entitlement_page_two),'00000000-0000-4000-8000-000000010061'::uuid,'Entitlement cursor advances by updated_at/account id');
select ok((select entitlement_source='redemption_code' and redemption_batch_id='00000000-0000-4000-8000-000000010090'::uuid and commercial_offer_id='00000000-0000-4000-8000-000000010041'::uuid from redemption_entitlements),'Redemption entitlement preserves Campaign/Offer attribution');
select ok((select redeemed_count=1 and unused_count=1 and disabled_count=1 and redemption_rate=0.333333::numeric from campaign_list),'Campaign aggregates redeemed/unused/disabled counts and redemption rate');
select is((select batch_id from campaign_list),'00000000-0000-4000-8000-000000010090'::uuid,'Campaign filters apply server-side before pagination');
select is((select count(*)::integer from campaign_codes),3,'Campaign detail returns bounded code rows');
select is((select masked_code from campaign_codes where redemption_code_id='00000000-0000-4000-8000-000000010093'),'AAA••••1111','Campaign detail exposes only masked code material');
select ok(pg_get_functiondef('private.admin_redemption_campaign_codes_v2(private.admin_context, uuid, uuid, uuid, integer)'::regprocedure) not like '%code_hmac%','Campaign detail function never selects HMAC material');
select throws_ok(
 $$select * from private.admin_redemption_campaign_codes_v2(row('00000000-0000-4000-8000-000000010001','00000000-0000-4000-8000-000000010010','00000000-0000-4000-8000-000000010137')::private.admin_context,'00000000-0000-4000-8000-000000010021','00000000-0000-4000-8000-000000010090',null,20)$$,
 'P0002','resource_not_found','Campaign detail rejects cross-platform IDOR'
);
select throws_ok(
 $$select * from private.admin_commerce_summary(row('00000000-0000-4000-8000-000000010001','00000000-0000-4000-8000-000000010010','00000000-0000-4000-8000-000000010138')::private.admin_context,'00000000-0000-4000-8000-000000010020',now()-interval '367 days',now())$$,
 '22023','invalid_input','Commerce summary rejects unbounded reporting windows'
);
select throws_ok(
 $$select * from private.admin_commerce_entitlement_list(row('00000000-0000-4000-8000-000000010001','00000000-0000-4000-8000-000000010010','00000000-0000-4000-8000-000000010139')::private.admin_context,'00000000-0000-4000-8000-000000010020',now(),'00000000-0000-4000-8000-000000010062',20,null,null,null,null,null,null)$$,
 'P0002','resource_not_found','Entitlement cursor rejects a mismatched timestamp'
);

select * from finish();

rollback;
