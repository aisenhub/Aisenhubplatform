-- Global Delete history anonymization is a domain operation. Keep the base
-- table hidden from executors while allowing the SECURITY DEFINER domain
-- function to update only through its fixed checkpoint logic.
grant update on table public.audit_logs to domain_owner;
create policy audit_logs_domain_owner_update on public.audit_logs
  for update to domain_owner using (true) with check (true);
