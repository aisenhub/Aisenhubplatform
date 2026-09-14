-- TASK-0306: project checkout progress from the immutable checkout snapshot and
-- the current billing facts. This is a read projection only: it never calls a
-- provider and it never mutates a checkout or entitlement.
create or replace function private.subscription_checkout_read_v2(
  p_ctx private.account_context,
  p_checkout_id uuid
)
returns table (
  checkout_id uuid,
  status text,
  product_code text,
  price_amount numeric,
  currency text,
  term_kind text,
  duration_value integer,
  duration_unit text,
  expires_at timestamptz,
  provider_display_name text,
  paid_at timestamptz,
  granted_at timestamptz,
  provider_status text,
  verification_status text,
  entitlement_status text,
  job_state text,
  status_reason text,
  next_action text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_account_id uuid;
begin
  select principal.platform_account_id into v_account_id
  from private.account_principal(p_ctx) principal
  where principal.authorization = 'allowed';

  return query
    with facts as (
      select
        c.id,
        c.status as stored_status,
        c.product_code,
        c.price_amount,
        c.currency,
        c.term_kind_snapshot,
        c.duration_value_snapshot,
        c.duration_unit_snapshot,
        c.expires_at,
        pa.name as provider_display_name,
        c.paid_at,
        c.granted_at,
        case
          when exists (
            select 1 from public.billing_orders o
            where o.checkout_intent_id = c.id and o.provider_status = 'paid'
          ) then 'paid'
          when exists (
            select 1 from public.billing_orders o
            where o.checkout_intent_id = c.id and o.provider_status = 'failed'
          ) then 'failed'
          when exists (
            select 1 from public.billing_orders o
            where o.checkout_intent_id = c.id and o.provider_status = 'pending'
          ) then 'pending'
          else 'unknown'
        end as projected_provider_status,
        case
          when exists (
            select 1 from public.billing_orders o
            where o.checkout_intent_id = c.id and o.verification_status = 'verified'
          ) then 'verified'
          when exists (
            select 1 from public.billing_orders o
            where o.checkout_intent_id = c.id and o.verification_status = 'rejected'
          ) then 'rejected'
          else 'unverified'
        end as projected_verification_status,
        case
          when exists (
            select 1 from public.billing_orders o
            where o.checkout_intent_id = c.id and o.entitlement_status = 'granted'
          ) then 'granted'
          when exists (
            select 1 from public.billing_orders o
            where o.checkout_intent_id = c.id and o.entitlement_status = 'blocked'
          ) then 'blocked'
          when exists (
            select 1 from public.billing_orders o
            where o.checkout_intent_id = c.id and o.entitlement_status = 'rejected'
          ) then 'rejected'
          else 'not_started'
        end as projected_entitlement_status,
        case
          when exists (
            select 1
            from public.billing_processing_jobs j
            join public.billing_orders o on o.id = j.billing_order_id
            where o.checkout_intent_id = c.id and j.state = 'manual_review'
          ) then 'manual_review'
          when exists (
            select 1
            from public.billing_processing_jobs j
            join public.billing_orders o on o.id = j.billing_order_id
            where o.checkout_intent_id = c.id and j.state = 'processing'
          ) then 'processing'
          when exists (
            select 1
            from public.billing_processing_jobs j
            join public.billing_orders o on o.id = j.billing_order_id
            where o.checkout_intent_id = c.id and j.state = 'retryable'
          ) then 'retryable'
          when exists (
            select 1
            from public.billing_processing_jobs j
            join public.billing_orders o on o.id = j.billing_order_id
            where o.checkout_intent_id = c.id and j.state = 'pending'
          ) then 'pending'
          when exists (
            select 1
            from public.billing_processing_jobs j
            join public.billing_orders o on o.id = j.billing_order_id
            where o.checkout_intent_id = c.id and j.state = 'completed'
          ) then 'completed'
          else null
        end as projected_job_state,
        exists (
          select 1
          from public.billing_settlements s
          join public.billing_orders o on o.id = s.billing_order_id
          where o.checkout_intent_id = c.id
            and s.state in ('blocked', 'review_required')
        ) as settlement_requires_review
      from public.billing_checkout_intents c
      left join public.billing_provider_accounts pa on pa.id = c.provider_account_id
      where c.platform_id = (p_ctx).platform_id
        and c.platform_account_id = v_account_id
        and c.id = p_checkout_id
    ), projected as (
      select facts.*,
        case
          when stored_status in ('granted', 'resolved', 'paid', 'verified') then stored_status
          when projected_entitlement_status = 'granted' then 'granted'
          when projected_entitlement_status in ('blocked', 'rejected')
            or projected_job_state = 'manual_review'
            or settlement_requires_review then 'review_required'
          when projected_provider_status = 'paid' then 'paid'
          when stored_status = 'expired' then 'expired'
          when expires_at <= clock_timestamp() then 'expired'
          else stored_status
        end as projected_status
      from facts
    )
    select id,
      projected_status,
      product_code,
      price_amount,
      currency,
      term_kind_snapshot,
      duration_value_snapshot,
      duration_unit_snapshot,
      expires_at,
      provider_display_name,
      paid_at,
      granted_at,
      projected_provider_status,
      projected_verification_status,
      projected_entitlement_status,
      projected_job_state,
      case projected_status
        when 'granted' then 'entitlement_granted'
        when 'resolved' then 'resolved'
        when 'review_required' then 'manual_review'
        when 'expired' then 'expired'
        when 'paid' then 'payment_observed'
        when 'verified' then 'verification_pending'
        else 'awaiting_payment'
      end,
      case projected_status
        when 'granted' then 'none'
        when 'resolved' then 'none'
        when 'review_required' then 'contact_support'
        when 'expired' then 'create_new_checkout'
        when 'paid' then 'wait'
        when 'verified' then 'wait'
        else 'pay_provider'
      end
    from projected;

  if not found then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
end;
$$;

alter function private.subscription_checkout_read_v2(private.account_context, uuid)
  owner to domain_owner;
revoke all on function private.subscription_checkout_read_v2(private.account_context, uuid)
  from public, anon, authenticated, admin_executor, job_executor, recovery_executor,
  billing_ingress;
grant execute on function private.subscription_checkout_read_v2(private.account_context, uuid)
  to account_executor;
