-- BILL-10: release the initial Afdian price catalog.
-- Provider plan/SKU mappings stay disabled until real staging IDs are verified.

update public.subscription_products
set price_amount = case code
      when 'monthly' then 9.90
      when 'yearly' then 39.90
      when 'lifetime' then 49.90
      else price_amount
    end,
    price_version = price_version + 1,
    recommended = (code = 'yearly'),
    description = case code
      when 'monthly' then '按月订阅'
      when 'yearly' then '按年订阅'
      when 'lifetime' then '一次性购买，权益期限为 99 年'
      else description
    end
where code in ('monthly', 'yearly', 'lifetime');

do $$
begin
  if exists (
    select 1
    from public.subscription_products
    where code = 'monthly' and price_amount <> 9.90
  ) then
    raise exception using errcode = 'P0001', message = 'afdian_price_release_failed';
  end if;
  if exists (
    select 1
    from public.subscription_products
    where code = 'yearly' and price_amount <> 39.90
  ) then
    raise exception using errcode = 'P0001', message = 'afdian_price_release_failed';
  end if;
  if exists (
    select 1
    from public.subscription_products
    where code = 'lifetime' and price_amount <> 49.90
  ) then
    raise exception using errcode = 'P0001', message = 'afdian_price_release_failed';
  end if;
end;
$$;
