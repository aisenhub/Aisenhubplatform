-- TASK-0701: connect the independent Provider page cursor to the durable local
-- order/processing queue. Provider I/O stays in the maintenance worker; this
-- migration only validates and persists the page result under job_executor.

create or replace function private.billing_reconciliation_page_target(
  p_ctx private.job_context,
  p_provider_account_id uuid default null
)
returns table (
  provider_account_id uuid,
  page_number integer,
  expected_version bigint,
  page_cursor text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_cursor public.billing_reconciliation_cursors;
  v_provider public.billing_provider_accounts;
  v_page integer;
begin
  if (p_ctx).job_id is null or (p_ctx).lease_owner is null
     or length((p_ctx).lease_owner) not between 1 and 128
     or (p_ctx).fencing_token is null or (p_ctx).fencing_token < 1
     or (p_ctx).request_id is null then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  select * into v_provider
  from public.billing_provider_accounts a
  where a.status = 'active'
    and (p_provider_account_id is null or a.id = p_provider_account_id)
  order by a.id
  limit 1;
  if not found then return; end if;

  select * into v_cursor
  from public.billing_reconciliation_cursors c
  where c.provider_account_id = v_provider.id and c.stream = 'discovery';

  if not found then
    return query select v_provider.id, 1, 0::bigint, null::text;
    return;
  end if;

  if v_cursor.page_cursor is null then
    v_page := 1;
  elsif v_cursor.page_cursor ~ '^[1-9][0-9]{0,8}$' then
    v_page := v_cursor.page_cursor::integer;
  else
    raise exception using errcode = 'P0001', message = 'reconciliation_cursor_invalid';
  end if;

  return query select v_provider.id, v_page, v_cursor.version, v_cursor.page_cursor;
end;
$$;

create or replace function private.billing_reconciliation_page_ingest(
  p_ctx private.job_context,
  p_provider_account_id uuid,
  p_page_number integer,
  p_expected_version bigint,
  p_next_page integer,
  p_orders jsonb
)
returns table (
  provider_account_id uuid,
  page_number integer,
  next_page integer,
  cursor_version bigint,
  discovered_count integer,
  queued_count integer
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_item jsonb;
  v_order_no text;
  v_order public.billing_orders;
  v_inserted boolean;
  v_discovered integer := 0;
  v_queued integer := 0;
  v_cursor record;
  v_current_page integer;
begin
  if (p_ctx).job_id is null or (p_ctx).lease_owner is null
     or length((p_ctx).lease_owner) not between 1 and 128
     or (p_ctx).fencing_token is null or (p_ctx).fencing_token < 1
     or (p_ctx).request_id is null or p_provider_account_id is null
     or p_page_number is null or p_page_number < 1 or p_page_number > 999999999
     or p_expected_version is null or p_expected_version < 0
     or (p_next_page is not null and (p_next_page < 1 or p_next_page > 999999999))
     or coalesce(jsonb_typeof(p_orders), '') <> 'array'
     or jsonb_array_length(p_orders) > 50 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  if not exists (
    select 1 from public.billing_provider_accounts a
    where a.id = p_provider_account_id and a.status = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'provider_account_unavailable';
  end if;

  for v_item in select value from jsonb_array_elements(p_orders)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception using errcode = 'P0001', message = 'provider_response_invalid';
    end if;
    v_order_no := nullif(btrim(v_item->>'out_trade_no'), '');
    if v_order_no is null or length(v_order_no) > 256 then
      raise exception using errcode = 'P0001', message = 'provider_response_invalid';
    end if;

    insert into public.billing_orders(provider_account_id, provider_order_no)
    values (p_provider_account_id, v_order_no)
    on conflict on constraint billing_orders_provider_account_id_provider_order_no_key do nothing
    returning * into v_order;
    v_inserted := found;
    if not v_inserted then
      select * into v_order
      from public.billing_orders o
      where o.provider_account_id = p_provider_account_id
        and o.provider_order_no = v_order_no;
    end if;
    if v_order.id is null then
      raise exception using errcode = 'P0001', message = 'order_target_unavailable';
    end if;
    v_discovered := v_discovered + 1;

    -- Repeated page scans are safe: only a newly discovered order or an order
    -- without an outstanding processing job receives a reconciliation job.
    if v_inserted or not exists (
      select 1 from public.billing_processing_jobs j
      where j.billing_order_id = v_order.id
        and j.state in ('pending', 'processing', 'retryable')
    ) and not exists (
      select 1 from public.billing_processing_jobs j
      where j.billing_order_id = v_order.id
        and j.job_kind = 'reconciliation'
        and j.state in ('completed', 'manual_review')
    ) then
      perform pg_advisory_xact_lock(
        hashtextextended('billing-reconciliation:' || v_order.id::text, 0)
      );
      if not exists (
        select 1 from public.billing_processing_jobs j
        where j.billing_order_id = v_order.id
          and j.state in ('pending', 'processing', 'retryable', 'completed', 'manual_review')
      ) then
        insert into public.billing_processing_jobs(job_kind, billing_order_id)
        values ('reconciliation', v_order.id);
        v_queued := v_queued + 1;
      end if;
    end if;
  end loop;

  -- This is a page-discovery operation, not an order-processing lease.  Keep
  -- it atomic with order/job insertion, but do not manufacture a processing
  -- job merely to satisfy the processing-stream cursor wrapper.
  select * into v_cursor
  from public.billing_reconciliation_cursors c
  where c.provider_account_id = p_provider_account_id and c.stream = 'discovery'
  for update;
  if not found then
    if p_expected_version <> 0 then
      raise exception using errcode = '40001', message = 'cursor_conflict';
    end if;
    insert into public.billing_reconciliation_cursors (
      provider_account_id, stream, version, page_cursor, head_scan_at,
      last_success_at, last_error_code
    ) values (
      p_provider_account_id, 'discovery', 1,
      case when p_next_page is null then null else p_next_page::text end,
      clock_timestamp(), clock_timestamp(), null
    ) returning * into v_cursor;
  else
    if v_cursor.version <> p_expected_version then
      raise exception using errcode = '40001', message = 'cursor_conflict';
    end if;
    if v_cursor.page_cursor is null then
      v_current_page := 1;
    elsif v_cursor.page_cursor ~ '^[1-9][0-9]{0,8}$' then
      v_current_page := v_cursor.page_cursor::integer;
    else
      raise exception using errcode = 'P0001', message = 'reconciliation_cursor_invalid';
    end if;
    if v_current_page <> p_page_number then
      raise exception using errcode = '40001', message = 'cursor_conflict';
    end if;
    update public.billing_reconciliation_cursors c
    set version = c.version + 1,
        page_cursor = case when p_next_page is null then null else p_next_page::text end,
        head_scan_at = clock_timestamp(),
        last_success_at = clock_timestamp(),
        last_error_code = null
    where c.id = v_cursor.id
    returning c.* into v_cursor;
  end if;

  return query select p_provider_account_id, p_page_number, p_next_page,
    v_cursor.version, v_discovered, v_queued;
end;
$$;

create or replace function private.billing_reconciliation_page_failure(
  p_ctx private.job_context,
  p_provider_account_id uuid,
  p_page_number integer,
  p_expected_version bigint,
  p_error_code text
)
returns table (
  provider_account_id uuid,
  page_number integer,
  cursor_version bigint,
  page_cursor text,
  last_error_code text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_cursor public.billing_reconciliation_cursors;
  v_page_cursor text := p_page_number::text;
  v_current_page integer;
begin
  if (p_ctx).job_id is null or (p_ctx).lease_owner is null
     or length((p_ctx).lease_owner) not between 1 and 128
     or (p_ctx).fencing_token is null or (p_ctx).fencing_token < 1
     or (p_ctx).request_id is null or p_provider_account_id is null
     or p_page_number is null or p_page_number < 1 or p_page_number > 999999999
     or p_expected_version is null or p_expected_version < 0
     or p_error_code is null or length(p_error_code) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if not exists (
    select 1 from public.billing_provider_accounts a
    where a.id = p_provider_account_id and a.status = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'provider_account_unavailable';
  end if;

  select * into v_cursor
  from public.billing_reconciliation_cursors c
  where c.provider_account_id = p_provider_account_id and c.stream = 'discovery'
  for update;
  if not found then
    if p_expected_version <> 0 then
      raise exception using errcode = '40001', message = 'cursor_conflict';
    end if;
    insert into public.billing_reconciliation_cursors (
      provider_account_id, stream, version, page_cursor, head_scan_at,
      last_error_code
    ) values (
      p_provider_account_id, 'discovery', 1, v_page_cursor, clock_timestamp(),
      p_error_code
    ) returning * into v_cursor;
  else
    if v_cursor.version <> p_expected_version then
      raise exception using errcode = '40001', message = 'cursor_conflict';
    end if;
    if v_cursor.page_cursor is null then
      v_current_page := 1;
    elsif v_cursor.page_cursor ~ '^[1-9][0-9]{0,8}$' then
      v_current_page := v_cursor.page_cursor::integer;
    else
      raise exception using errcode = 'P0001', message = 'reconciliation_cursor_invalid';
    end if;
    if v_current_page <> p_page_number then
      raise exception using errcode = '40001', message = 'cursor_conflict';
    end if;
    update public.billing_reconciliation_cursors c
    set version = c.version + 1,
        page_cursor = v_page_cursor,
        head_scan_at = clock_timestamp(),
        last_error_code = p_error_code
    where c.id = v_cursor.id
    returning c.* into v_cursor;
  end if;
  return query select p_provider_account_id, p_page_number, v_cursor.version,
    v_cursor.page_cursor, v_cursor.last_error_code;
end;
$$;

alter function private.billing_reconciliation_page_target(private.job_context, uuid)
  owner to domain_owner;
alter function private.billing_reconciliation_page_ingest(private.job_context, uuid, integer, bigint, integer, jsonb)
  owner to domain_owner;
alter function private.billing_reconciliation_page_failure(private.job_context, uuid, integer, bigint, text)
  owner to domain_owner;
revoke all on function private.billing_reconciliation_page_target(private.job_context, uuid)
  from public, anon, authenticated, account_executor, admin_executor,
    recovery_executor, billing_ingress;
revoke all on function private.billing_reconciliation_page_ingest(private.job_context, uuid, integer, bigint, integer, jsonb)
  from public, anon, authenticated, account_executor, admin_executor,
    recovery_executor, billing_ingress;
revoke all on function private.billing_reconciliation_page_failure(private.job_context, uuid, integer, bigint, text)
  from public, anon, authenticated, account_executor, admin_executor,
    recovery_executor, billing_ingress;
grant execute on function private.billing_reconciliation_page_target(private.job_context, uuid)
  to job_executor;
grant execute on function private.billing_reconciliation_page_ingest(private.job_context, uuid, integer, bigint, integer, jsonb)
  to job_executor;
grant execute on function private.billing_reconciliation_page_failure(private.job_context, uuid, integer, bigint, text)
  to job_executor;
