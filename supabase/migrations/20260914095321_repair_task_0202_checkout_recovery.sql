-- TASK-0202: expose durable Checkout recovery by the same scoped
-- Idempotency-Key used to create it.  This is a query-only recovery path;
-- it never creates a new Checkout or reissues a payment link for a terminal
-- intent.
create or replace function private.subscription_checkout_read_by_idempotency(
  p_ctx private.account_context,
  p_idempotency_key text
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
  v_checkout_id uuid;
  v_key_hash bytea;
begin
  if p_idempotency_key is null
     or length(p_idempotency_key) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  select principal.platform_account_id into v_account_id
  from private.account_principal(p_ctx) principal
  where principal.authorization = 'allowed';
  if v_account_id is null then
    raise exception using errcode = '42501', message = 'account_not_activated';
  end if;

  v_key_hash := extensions.digest(convert_to(p_idempotency_key, 'utf8'), 'sha256');
  select c.id into v_checkout_id
  from public.billing_checkout_intents c
  where c.platform_id = (p_ctx).platform_id
    and c.platform_account_id = v_account_id
    and c.idempotency_key_hash = v_key_hash;
  if not found then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;

  return query
    select r.checkout_id, r.status, r.product_code, r.price_amount, r.currency,
      r.term_kind, r.duration_value, r.duration_unit, r.expires_at,
      r.provider_display_name, r.paid_at, r.granted_at, r.provider_status,
      r.verification_status, r.entitlement_status, r.job_state,
      r.status_reason, r.next_action
    from private.subscription_checkout_read_v2(p_ctx, v_checkout_id) r;
end;
$$;

alter function private.subscription_checkout_read_by_idempotency(private.account_context, text)
  owner to domain_owner;
revoke all on function private.subscription_checkout_read_by_idempotency(private.account_context, text)
  from public, anon, authenticated, admin_executor, job_executor, recovery_executor,
  billing_ingress;
grant execute on function private.subscription_checkout_read_by_idempotency(private.account_context, text)
  to account_executor;
