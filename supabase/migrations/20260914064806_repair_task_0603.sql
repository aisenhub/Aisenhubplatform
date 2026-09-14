-- TASK-0603: expose a causal, read-only billing order timeline to Admin.
-- Each row keeps provider timestamps separate from locally observed/received
-- timestamps. Missing provider evidence stays NULL; the API never infers a
-- provider event time from a webhook receive time or a job update time.

create index if not exists billing_processing_jobs_order_timeline_idx
  on public.billing_processing_jobs (billing_order_id, created_at, id);

create index if not exists audit_logs_target_timeline_idx
  on public.audit_logs (target_type, target_id, created_at, id);

create or replace function private.admin_billing_order_read_v2(
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
  v_order public.billing_orders;
  v_timeline jsonb;
begin
  perform private.billing_admin_assert(p_ctx);

  select o.* into v_order
  from public.billing_orders o
  where o.id = p_order_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;

  select coalesce(jsonb_agg(t.item order by t.event_at, t.source, t.entity_id), '[]'::jsonb)
    into v_timeline
  from (
    select
      v_order.created_at as event_at,
      'billing_order'::text as source,
      v_order.id::text as entity_id,
      jsonb_build_object(
        'source', 'billing_order',
        'event_type', 'order.created',
        'event_at', v_order.created_at,
        'provider_event_at', v_order.provider_created_at,
        'received_at', null::timestamptz,
        'entity_id', v_order.id,
        'status', v_order.provider_status,
        'state', v_order.entitlement_status,
        'code', null::text,
        'request_id', null::uuid,
        'job_id', null::uuid,
        'actor_type', null::text,
        'actor_id', null::uuid,
        'details', jsonb_build_object(
          'verification_status', v_order.verification_status,
          'linkage_status', v_order.linkage_status,
          'resolution_status', v_order.resolution_status,
          'provider_paid_at', v_order.provider_paid_at
        )
      ) as item

    union all

    select c.created_at, 'checkout', c.id::text,
      jsonb_build_object(
        'source', 'checkout',
        'event_type', 'checkout.created',
        'event_at', c.created_at,
        'provider_event_at', null::timestamptz,
        'received_at', null::timestamptz,
        'entity_id', c.id,
        'status', c.status,
        'state', null::text,
        'code', null::text,
        'request_id', null::uuid,
        'job_id', null::uuid,
        'actor_type', null::text,
        'actor_id', null::uuid,
        'details', jsonb_build_object(
          'product_code', c.product_code,
          'price_amount', c.price_amount,
          'currency', c.currency,
          'paid_at', c.paid_at,
          'granted_at', c.granted_at
        )
      )
    from public.billing_checkout_intents c
    where c.id = v_order.checkout_intent_id

    union all

    select e.received_at, 'provider_webhook', e.id::text,
      jsonb_build_object(
        'source', 'provider_webhook',
        'event_type', 'webhook.received',
        'event_at', e.received_at,
        'provider_event_at', null::timestamptz,
        'received_at', e.received_at,
        'entity_id', e.id,
        'status', e.processing_status,
        'state', e.signature_status,
        'code', e.error_code,
        'request_id', null::uuid,
        'job_id', null::uuid,
        'actor_type', null::text,
        'actor_id', null::uuid,
        'details', jsonb_build_object(
          'provider_event_key', e.provider_event_key,
          'provider_order_no', e.provider_order_no,
          'signature_status', e.signature_status,
          'processed_at', e.processed_at
        )
      )
    from public.billing_webhook_events e
    where e.provider_account_id = v_order.provider_account_id
      and e.provider_order_no = v_order.provider_order_no

    union all

    select coalesce(j.updated_at, j.created_at), 'processing_job', j.id::text,
      jsonb_build_object(
        'source', 'processing_job',
        'event_type', 'job.' || j.job_kind,
        'event_at', coalesce(j.updated_at, j.created_at),
        'provider_event_at', null::timestamptz,
        'received_at', j.created_at,
        'entity_id', j.id,
        'status', j.state,
        'state', j.job_kind,
        'code', coalesce(j.error_code, j.last_error_code),
        'request_id', null::uuid,
        'job_id', j.id,
        'actor_type', 'job',
        'actor_id', null::uuid,
        'details', jsonb_build_object(
          'attempts', j.attempts,
          'retry_attempts', j.retry_attempts,
          'requeue_count', j.requeue_count,
          'fence', j.fence,
          'webhook_event_id', j.webhook_event_id,
          'dead_lettered_at', j.dead_lettered_at
        )
      )
    from public.billing_processing_jobs j
    where j.billing_order_id = v_order.id

    union all

    select o.observed_at, 'provider_observation', o.id::text,
      jsonb_build_object(
        'source', 'provider_observation',
        'event_type', 'provider.observed',
        'event_at', o.observed_at,
        'provider_event_at', null::timestamptz,
        'received_at', null::timestamptz,
        'entity_id', o.id,
        'status', o.provider_status,
        'state', o.source,
        'code', null::text,
        'request_id', null::uuid,
        'job_id', o.processing_job_id,
        'actor_type', 'job',
        'actor_id', null::uuid,
        'details', jsonb_build_object(
          'provider_contract_version', o.provider_contract_version
        )
      )
    from public.billing_order_observations o
    where o.billing_order_id = v_order.id

    union all

    select s.updated_at, 'settlement', s.id::text,
      jsonb_build_object(
        'source', 'settlement',
        'event_type', 'settlement.updated',
        'event_at', s.updated_at,
        'provider_event_at', null::timestamptz,
        'received_at', s.created_at,
        'entity_id', s.id,
        'status', s.state,
        'state', s.settlement_kind,
        'code', s.decision_code,
        'request_id', s.operation_id,
        'job_id', null::uuid,
        'actor_type', case when s.settlement_kind = 'manual' then 'admin' else 'system' end,
        'actor_id', null::uuid,
        'details', jsonb_build_object(
          'billing_order_id', s.billing_order_id,
          'checkout_intent_id', s.checkout_intent_id,
          'grant_id', s.grant_id,
          'decision_reason', s.decision_reason
        )
      )
    from public.billing_settlements s
    where s.billing_order_id = v_order.id

    union all

    select g.created_at, 'entitlement', g.id::text,
      jsonb_build_object(
        'source', 'entitlement',
        'event_type', 'grant.created',
        'event_at', g.created_at,
        'provider_event_at', null::timestamptz,
        'received_at', null::timestamptz,
        'entity_id', g.id,
        'status', g.source,
        'state', case when g.ends_at is null or g.ends_at > current_timestamp then 'active' else 'expired' end,
        'code', null::text,
        'request_id', g.operation_id,
        'job_id', null::uuid,
        'actor_type', case when g.source = 'admin' then 'admin' else 'system' end,
        'actor_id', g.created_by,
        'details', jsonb_build_object(
          'plan_id', g.plan_id,
          'billing_order_id', g.billing_order_id,
          'starts_at', g.starts_at,
          'ends_at', g.ends_at,
          'reason', g.reason
        )
      )
    from public.subscription_grants g
    where g.billing_order_id = v_order.id

    union all

    select e.created_at, 'entitlement', e.id::text,
      jsonb_build_object(
        'source', 'entitlement',
        'event_type', 'subscription.' || e.event_type,
        'event_at', e.created_at,
        'provider_event_at', null::timestamptz,
        'received_at', null::timestamptz,
        'entity_id', e.id,
        'status', e.event_type,
        'state', null::text,
        'code', null::text,
        'request_id', e.operation_id,
        'job_id', null::uuid,
        'actor_type', case when e.actor_user_id is null then 'system' else 'admin' end,
        'actor_id', e.actor_user_id,
        'details', jsonb_build_object(
          'sequence', e.sequence,
          'subscription_id', e.subscription_id,
          'grant_id', e.grant_id,
          'reason', e.reason
        )
      )
    from public.subscription_events e
    where e.platform_id = v_order.platform_id
      and e.platform_account_id = v_order.platform_account_id
      and e.grant_id in (
        select g.id from public.subscription_grants g
        where g.billing_order_id = v_order.id
      )

    union all

    select c.created_at, 'entitlement_correction', c.id::text,
      jsonb_build_object(
        'source', 'entitlement_correction',
        'event_type', 'grant.corrected',
        'event_at', c.created_at,
        'provider_event_at', null::timestamptz,
        'received_at', null::timestamptz,
        'entity_id', c.id,
        'status', 'applied',
        'state', null::text,
        'code', null::text,
        'request_id', c.operation_id,
        'job_id', null::uuid,
        'actor_type', 'admin',
        'actor_id', c.created_by,
        'details', jsonb_build_object(
          'original_grant_id', c.original_grant_id,
          'replacement_grant_id', c.replacement_grant_id,
          'expected_event_sequence', c.expected_event_sequence,
          'reason', c.reason
        )
      )
    from public.subscription_grant_corrections c
    where c.platform_id = v_order.platform_id
      and c.platform_account_id = v_order.platform_account_id
      and (
        c.original_grant_id in (
          select g.id from public.subscription_grants g
          where g.billing_order_id = v_order.id
        )
        or c.replacement_grant_id in (
          select g.id from public.subscription_grants g
          where g.billing_order_id = v_order.id
        )
      )

    union all

    select a.created_at, 'admin_audit', a.id::text,
      jsonb_build_object(
        'source', 'admin_audit',
        'event_type', a.event_type,
        'event_at', a.created_at,
        'provider_event_at', null::timestamptz,
        'received_at', null::timestamptz,
        'entity_id', a.id,
        'status', null::text,
        'state', a.actor_type,
        'code', null::text,
        'request_id', a.request_id,
        'job_id', null::uuid,
        'actor_type', a.actor_type,
        'actor_id', a.actor_user_id,
        'details', jsonb_strip_nulls(jsonb_build_object(
          'target_type', a.target_type,
          'target_id', a.target_id,
          'reason', nullif(a.metadata ->> 'reason', ''),
          'decision', nullif(a.metadata ->> 'decision', ''),
          'scope', nullif(a.metadata ->> 'scope', '')
        ))
      )
    from public.audit_logs a
    where a.target_type = 'billing_order'
      and a.target_id = v_order.id
  ) t;

  return query
    select o.id, pa.provider, o.provider_order_no, o.provider_user_id,
      o.external_plan_id, o.external_sku_ids, o.product_type,
      o.purchase_months, o.total_amount, o.show_amount, o.currency,
      o.provider_facts, o.platform_id, o.platform_account_id,
      o.checkout_intent_id, o.custom_order_id, o.provider_status,
      o.verification_status, o.verification_reason, o.entitlement_status,
      o.linkage_status, o.resolution_status, o.resolution_reason,
      s.id, s.state, s.settlement_kind, s.decision_code, s.grant_id,
      o.admin_version,
      (select count(*) from public.billing_processing_jobs j
       where j.billing_order_id = o.id
         and j.state in ('pending', 'processing', 'retryable', 'manual_review')),
      o.created_at, o.updated_at, v_timeline
    from public.billing_orders o
    join public.billing_provider_accounts pa on pa.id = o.provider_account_id
    left join public.billing_settlements s on s.billing_order_id = o.id
    where o.id = p_order_id;
end;
$$;

alter function private.admin_billing_order_read_v2(private.admin_context, uuid)
  owner to domain_owner;

revoke all on function private.admin_billing_order_read_v2(private.admin_context, uuid)
  from public, anon, authenticated, account_executor, job_executor,
    recovery_executor, billing_ingress;
grant execute on function private.admin_billing_order_read_v2(private.admin_context, uuid)
  to admin_executor;
