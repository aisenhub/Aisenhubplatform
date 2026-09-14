-- RC-06 / TASK-0601
-- Keep the existing list wrapper for older clients and add a stable, bounded
-- query for the Admin UI. The cursor binds both sort keys so rows sharing a
-- created_at timestamp cannot be skipped or repeated between pages.

create index billing_orders_admin_cursor_idx
  on public.billing_orders(created_at desc, id desc);
create index billing_orders_admin_platform_cursor_idx
  on public.billing_orders(platform_id, platform_account_id, created_at desc, id desc);
create index billing_orders_admin_provider_cursor_idx
  on public.billing_orders(provider_account_id, created_at desc, id desc);

create or replace function private.admin_billing_order_list_v2(
  p_ctx private.admin_context,
  p_cursor timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 50,
  p_status text default null,
  p_platform_id uuid default null,
  p_platform_account_id uuid default null,
  p_provider_account_id uuid default null,
  p_query text default null
)
returns table (
  order_id uuid,
  provider text,
  provider_order_no text,
  platform_id uuid,
  platform_account_id uuid,
  checkout_intent_id uuid,
  provider_status text,
  verification_status text,
  entitlement_status text,
  linkage_status text,
  resolution_status text,
  settlement_state text,
  settlement_kind text,
  decision_code text,
  admin_version bigint,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
begin
  perform private.billing_admin_assert(p_ctx);
  if p_limit is null or p_limit not between 1 and 100
     or (p_cursor is null and p_cursor_id is not null)
     or (p_cursor is not null and p_cursor_id is null)
     or (p_status is not null and p_status not in (
       'pending', 'retryable', 'manual_review', 'finalized', 'granted',
       'rejected', 'unlinked'
     ))
     or (p_query is not null and length(p_query) > 128) then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  return query
    select o.id, pa.provider, o.provider_order_no, o.platform_id,
      o.platform_account_id, o.checkout_intent_id, o.provider_status,
      o.verification_status, o.entitlement_status, o.linkage_status,
      o.resolution_status, s.state, s.settlement_kind, s.decision_code,
      o.admin_version, o.created_at, o.updated_at
    from public.billing_orders o
    join public.billing_provider_accounts pa on pa.id = o.provider_account_id
    left join public.billing_settlements s on s.billing_order_id = o.id
    where (
        p_cursor is null
        or (o.created_at, o.id) < (p_cursor, p_cursor_id)
      )
      and (p_platform_id is null or o.platform_id = p_platform_id)
      and (
        p_platform_account_id is null
        or o.platform_account_id = p_platform_account_id
      )
      and (
        p_provider_account_id is null
        or o.provider_account_id = p_provider_account_id
      )
      and (
        p_query is null
        or o.provider_order_no ilike '%' || p_query || '%'
      )
      and (
        p_status is null
        or p_status = coalesce(s.state, o.entitlement_status)
        or (p_status = 'manual_review' and exists (
          select 1
          from public.billing_processing_jobs j
          where j.billing_order_id = o.id and j.state = 'manual_review'
        ))
        or (p_status = 'unlinked' and o.linkage_status = 'unlinked')
      )
    order by o.created_at desc, o.id desc
    limit p_limit;
end;
$$;

alter function private.admin_billing_order_list_v2(
  private.admin_context, timestamptz, uuid, integer, text, uuid, uuid, uuid, text
) owner to domain_owner;

revoke all on function private.admin_billing_order_list_v2(
  private.admin_context, timestamptz, uuid, integer, text, uuid, uuid, uuid, text
) from public, anon, authenticated, account_executor, job_executor,
  recovery_executor, billing_ingress;
grant execute on function private.admin_billing_order_list_v2(
  private.admin_context, timestamptz, uuid, integer, text, uuid, uuid, uuid, text
) to admin_executor;
