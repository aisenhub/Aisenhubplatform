begin;

select plan(21);

select has_function(
  'private','commerce_offers_list',array['uuid','uuid'],
  'Offer-aware consumer catalog wrapper exists'
);
select has_function(
  'private','subscription_checkout_create_v2',
  array['private.account_context','uuid','text','uuid','text','smallint','bytea'],
  'Offer-aware checkout create wrapper exists'
);
select ok(
  has_function_privilege(
    'account_executor',
    'private.subscription_checkout_create_v2(private.account_context, uuid, text, uuid, text, smallint, bytea)',
    'execute'
  ),
  'account executor can create Offer-aware Checkouts'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'private.subscription_checkout_create_v2(private.account_context, uuid, text, uuid, text, smallint, bytea)',
    'execute'
  ),
  'authenticated cannot bypass the account executor boundary'
);

insert into auth.users(id,aud,role,email,encrypted_password,created_at,updated_at)
values(
  '00000000-0000-4000-8000-000000011001','authenticated','authenticated',
  'commerce-api@example.invalid','x',now(),now()
);
insert into auth.sessions(id,user_id,created_at,updated_at,not_after)
values(
  '00000000-0000-4000-8000-000000011002',
  '00000000-0000-4000-8000-000000011001',now(),now(),now()+interval '1 hour'
);
insert into public.platforms(id,code,name,status,allow_activation)
values('00000000-0000-4000-8000-000000011010','commerce-api','Commerce API','active',true);
insert into public.plans(id,platform_id,code,name,kind,status,features)
values(
  '00000000-0000-4000-8000-000000011011',
  '00000000-0000-4000-8000-000000011010','pro-7d','Pro 7 days','paid','active','{}'::jsonb
);
insert into public.platform_accounts(id,platform_id,user_id,status,activated_at)
values(
  '00000000-0000-4000-8000-000000011012',
  '00000000-0000-4000-8000-000000011010',
  '00000000-0000-4000-8000-000000011001','active',now()
);
insert into private.platform_api_keys(
  id,platform_id,name,key_hmac,hmac_key_version,key_prefix,key_suffix,creation_operation_id
) values(
  '00000000-0000-4000-8000-000000011013',
  '00000000-0000-4000-8000-000000011010','Commerce API key',repeat('c',64),1,
  'commerce-api','fixture','00000000-0000-4000-8000-000000011014'
);
insert into public.platform_commercial_offers(
  id,platform_id,plan_id,code,name,term_kind,duration_value,duration_unit,status,sort_order,recommended
) values(
  '00000000-0000-4000-8000-000000011020',
  '00000000-0000-4000-8000-000000011010',
  '00000000-0000-4000-8000-000000011011',
  'pro-7d','Pro 7 days','finite',7,'day','active',10,true
);
insert into public.platform_commercial_prices(
  id,platform_id,offer_id,version,amount,currency,status,effective_from
) values(
  '00000000-0000-4000-8000-000000011021',
  '00000000-0000-4000-8000-000000011010',
  '00000000-0000-4000-8000-000000011020',1,49.90,'CNY','active',now()-interval '1 minute'
);
insert into public.billing_provider_accounts(id,provider,name,status,secret_reference)
values(
  '00000000-0000-4000-8000-000000011030','afdian','Commerce API Provider','active','fixture://commerce-api'
);
insert into public.billing_provider_products(
  id,provider_account_id,subscription_product_id,platform_id,commercial_price_id,
  external_plan_id,product_type,external_sku_ids,sku_count,purchase_months,
  expected_show_amount,expected_total_amount,currency,price_version,mapping_version,
  validation_status,published,enabled
) values(
  '00000000-0000-4000-8000-000000011031',
  '00000000-0000-4000-8000-000000011030',null,
  '00000000-0000-4000-8000-000000011010',
  '00000000-0000-4000-8000-000000011021',
  'afdian-pro-7d','plan','{}'::text[],0,null,49.90,49.90,'CNY',1,1,
  'verified',true,true
);

set local role account_executor;
create temporary table commerce_catalog on commit drop as
select * from private.commerce_offers_list(
  '00000000-0000-4000-8000-000000011010',
  '00000000-0000-4000-8000-000000011013'
);
create temporary table offer_checkout on commit drop as
select * from private.subscription_checkout_create_v2(
  row(
    '00000000-0000-4000-8000-000000011001',
    '00000000-0000-4000-8000-000000011002',
    '00000000-0000-4000-8000-000000011010',
    '00000000-0000-4000-8000-000000011013',
    '00000000-0000-4000-8000-000000011040'
  )::private.account_context,
  '00000000-0000-4000-8000-000000011041'::uuid,null::text,
  '00000000-0000-4000-8000-000000011020'::uuid,'offer-checkout-1'::text,1::smallint,
  decode(repeat('ab',32),'hex')
);
create temporary table offer_checkout_replay on commit drop as
select * from private.subscription_checkout_create_v2(
  row(
    '00000000-0000-4000-8000-000000011001',
    '00000000-0000-4000-8000-000000011002',
    '00000000-0000-4000-8000-000000011010',
    '00000000-0000-4000-8000-000000011013',
    '00000000-0000-4000-8000-000000011042'
  )::private.account_context,
  '00000000-0000-4000-8000-000000011043'::uuid,null::text,
  '00000000-0000-4000-8000-000000011020'::uuid,'offer-checkout-1'::text,1::smallint,
  decode(repeat('cd',32),'hex')
);
set local role postgres;

select is((select count(*)::integer from commerce_catalog),1,'Offer catalog returns the active Offer');
select ok((select purchasable and reason='ready' from commerce_catalog),'Offer is purchasable only with active Price and verified Mapping');
select is((select price_amount from commerce_catalog),49.90::numeric,'Offer catalog price is server-side Price fact');
select is((select duration_unit from commerce_catalog),'day','Offer catalog supports finite day terms');
select is((select checkout_id from offer_checkout),'00000000-0000-4000-8000-000000011041'::uuid,'Offer checkout creates the requested durable Checkout id');
select is((select product_code from offer_checkout),null::text,'Non-legacy Offer Checkout has no fake product_code');
select is((select offer_id from offer_checkout),'00000000-0000-4000-8000-000000011020'::uuid,'Checkout snapshots the Offer id');
select is((select plan_id from offer_checkout),'00000000-0000-4000-8000-000000011011'::uuid,'Checkout snapshots the entitlement Plan');
select is((select price_amount from offer_checkout),49.90::numeric,'Checkout price comes from immutable server Price');
select is((select duration_unit from offer_checkout),'day','Checkout snapshots the Offer term rather than legacy product term');
select is((select checkout_id from offer_checkout_replay),'00000000-0000-4000-8000-000000011041'::uuid,'same Idempotency-Key replays the original Checkout');
select is((select count(*)::integer from public.billing_checkout_intents where platform_id='00000000-0000-4000-8000-000000011010'),1,'idempotent replay does not create a second Checkout');
select ok((select commercial_price_id='00000000-0000-4000-8000-000000011021'::uuid and offer_code_snapshot='pro-7d' from public.billing_checkout_intents where id='00000000-0000-4000-8000-000000011041'),'Checkout persists immutable commercial Price and Offer code attribution');
select ok((select provider_product_id='00000000-0000-4000-8000-000000011031'::uuid and provider_price_version_snapshot=1 from public.billing_checkout_intents where id='00000000-0000-4000-8000-000000011041'),'Checkout freezes the verified Provider Mapping snapshot');
select throws_ok(
  $$update public.billing_checkout_intents set price_amount=59.90 where id='00000000-0000-4000-8000-000000011041'$$,
  'P0001','checkout_snapshot_immutable','commercial Checkout snapshot is immutable after creation'
);
select throws_ok(
  $$select * from private.subscription_checkout_create_v2(
    row(
      '00000000-0000-4000-8000-000000011001',
      '00000000-0000-4000-8000-000000011002',
      '00000000-0000-4000-8000-000000011010',
      '00000000-0000-4000-8000-000000011013',
      '00000000-0000-4000-8000-000000011044'
    )::private.account_context,
    '00000000-0000-4000-8000-000000011045'::uuid,'monthly'::text,
    '00000000-0000-4000-8000-000000011020'::uuid,'offer-checkout-conflict'::text,1::smallint,
    decode(repeat('ef',32),'hex')
  )$$,
  '22023','invalid_input','checkout rejects product_code and offer_id together'
);
select throws_ok(
  $$select * from private.subscription_checkout_create_v2(
    row(
      '00000000-0000-4000-8000-000000011001',
      '00000000-0000-4000-8000-000000011002',
      '00000000-0000-4000-8000-000000011010',
      '00000000-0000-4000-8000-000000011013',
      '00000000-0000-4000-8000-000000011046'
    )::private.account_context,
    '00000000-0000-4000-8000-000000011047'::uuid,null::text,null::uuid,'offer-checkout-missing'::text,1::smallint,
    decode(repeat('12',32),'hex')
  )$$,
  '22023','invalid_input','checkout requires exactly one catalog selector'
);

select * from finish();
rollback;
