-- BILL-09: bounded cleanup for ordinary seven-day idempotency caches.
-- Billing checkout intents remain the durable transaction binding; this
-- function never deletes billing_checkout_intents or billing_orders.

create or replace function private.idempotency_cleanup(
  p_ctx private.job_context,
  p_before timestamptz default null,
  p_limit integer default 100
)
returns table (user_deleted integer, admin_deleted integer)
language plpgsql
volatile
security definer
set search_path = pg_catalog, private
as $$
declare
  v_before timestamptz := coalesce(p_before, clock_timestamp());
  v_user_deleted integer := 0;
  v_admin_deleted integer := 0;
begin
  if (p_ctx).job_id is null
     or (p_ctx).lease_owner is null
     or length((p_ctx).lease_owner) not between 1 and 128
     or (p_ctx).fencing_token is null
     or (p_ctx).fencing_token < 1
     or (p_ctx).request_id is null
     or p_limit is null
     or p_limit not between 1 and 1000
     or v_before > clock_timestamp() then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  with candidates as (
    select ctid
    from private.idempotency_keys
    where expires_at <= v_before
    order by expires_at, created_at
    limit p_limit
  )
  delete from private.idempotency_keys i
  using candidates
  where i.ctid = candidates.ctid;
  get diagnostics v_user_deleted = row_count;

  with candidates as (
    select ctid
    from private.admin_idempotency
    where expires_at <= v_before
    order by expires_at, created_at
    limit p_limit
  )
  delete from private.admin_idempotency i
  using candidates
  where i.ctid = candidates.ctid;
  get diagnostics v_admin_deleted = row_count;

  return query select v_user_deleted, v_admin_deleted;
end;
$$;

alter function private.idempotency_cleanup(private.job_context, timestamptz, integer)
  owner to domain_owner;
revoke all on function private.idempotency_cleanup(private.job_context, timestamptz, integer)
  from public, anon, authenticated, account_executor, admin_executor,
    recovery_executor, billing_ingress;
grant execute on function private.idempotency_cleanup(private.job_context, timestamptz, integer)
  to job_executor;
