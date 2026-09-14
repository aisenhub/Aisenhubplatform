-- TASK-0605: add bounded operational diagnostics to the v2 evidence timeline.
-- The v3 wrapper reuses the v2 aggregate so old readers keep their contract;
-- only safe, normalized Webhook/Job diagnostics are added here.

create or replace function private.admin_billing_order_read_v3(
  p_ctx private.admin_context,
  p_order_id uuid
)
returns table (
  order_id uuid,
  provider text,
  provider_order_no text,
  provider_user_id text,
  external_plan_id text,
  external_sku_ids text[],
  product_type text,
  purchase_months integer,
  total_amount numeric,
  show_amount numeric,
  currency text,
  provider_facts jsonb,
  platform_id uuid,
  platform_account_id uuid,
  checkout_intent_id uuid,
  custom_order_id text,
  provider_status text,
  verification_status text,
  verification_reason text,
  entitlement_status text,
  linkage_status text,
  resolution_status text,
  resolution_reason text,
  settlement_id uuid,
  settlement_state text,
  settlement_kind text,
  decision_code text,
  grant_id uuid,
  admin_version bigint,
  open_job_count bigint,
  created_at timestamptz,
  updated_at timestamptz,
  timeline jsonb
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_detail record;
  v_timeline jsonb;
begin
  perform private.billing_admin_assert(p_ctx);
  select * into v_detail
  from private.admin_billing_order_read_v2(p_ctx, p_order_id);
  if not found then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;

  select coalesce(jsonb_agg(
    case
      when item ->> 'source' = 'provider_webhook' then
        item || jsonb_build_object(
          'job_id', job.id,
          'details', coalesce(item -> 'details', '{}'::jsonb) ||
            jsonb_strip_nulls(jsonb_build_object(
              'payload_hash_prefix', case when webhook_event.payload_hash is null then null
                else left(encode(webhook_event.payload_hash, 'hex'), 16) end,
              'processing_job_id', job.id,
              'job_state', job.state,
              'job_health', case
                when job.state = 'processing' and job.lease_until <= current_timestamp then 'lost'
                when job.state = 'processing' then 'active'
                else 'idle'
              end
            ))
        )
      when item ->> 'source' = 'processing_job' then
        item || jsonb_build_object(
          'details', coalesce(item -> 'details', '{}'::jsonb) ||
            jsonb_strip_nulls(jsonb_build_object(
              'max_attempts', job.max_attempts,
              'next_attempt_at', job.next_attempt_at,
              'lease_until', job.lease_until,
              'lease_owner_fingerprint', case when job.lease_owner is null then null
                else left(encode(extensions.digest(convert_to(job.lease_owner, 'utf8'), 'sha256'), 'hex'), 12) end,
              'error_class', job.error_class,
              'last_error_class', job.last_error_class,
              'last_error_code', job.last_error_code,
              'last_requeue_at', job.last_requeue_at,
              'health', case
                when job.state = 'processing' and job.lease_until <= current_timestamp then 'lost'
                when job.state = 'processing' then 'active'
                else 'idle'
              end
            ))
        )
      else item
    end
    order by ordinal), '[]'::jsonb)
    into v_timeline
  from jsonb_array_elements(coalesce(v_detail.timeline, '[]'::jsonb))
    with ordinality as timeline_items(item, ordinal)
  left join public.billing_webhook_events webhook_event
    on item ->> 'source' = 'provider_webhook'
   and webhook_event.id = (item ->> 'entity_id')::uuid
  left join lateral (
    select j.*
    from public.billing_processing_jobs j
    where (item ->> 'source' = 'processing_job'
       and j.id = (item ->> 'job_id')::uuid)
       or (item ->> 'source' = 'provider_webhook'
       and j.webhook_event_id = (item ->> 'entity_id')::uuid)
    order by j.updated_at desc, j.id desc
    limit 1
  ) job on true;

  return query select
    v_detail.order_id, v_detail.provider, v_detail.provider_order_no,
    v_detail.provider_user_id, v_detail.external_plan_id,
    v_detail.external_sku_ids, v_detail.product_type,
    v_detail.purchase_months, v_detail.total_amount, v_detail.show_amount,
    v_detail.currency, v_detail.provider_facts, v_detail.platform_id,
    v_detail.platform_account_id, v_detail.checkout_intent_id,
    v_detail.custom_order_id, v_detail.provider_status,
    v_detail.verification_status, v_detail.verification_reason,
    v_detail.entitlement_status, v_detail.linkage_status,
    v_detail.resolution_status, v_detail.resolution_reason,
    v_detail.settlement_id, v_detail.settlement_state,
    v_detail.settlement_kind, v_detail.decision_code, v_detail.grant_id,
    v_detail.admin_version, v_detail.open_job_count, v_detail.created_at,
    v_detail.updated_at, v_timeline;
end;
$$;

alter function private.admin_billing_order_read_v3(private.admin_context, uuid)
  owner to domain_owner;

revoke all on function private.admin_billing_order_read_v3(private.admin_context, uuid)
  from public, anon, authenticated, account_executor, job_executor,
    recovery_executor, billing_ingress;
grant execute on function private.admin_billing_order_read_v3(private.admin_context, uuid)
  to admin_executor;
