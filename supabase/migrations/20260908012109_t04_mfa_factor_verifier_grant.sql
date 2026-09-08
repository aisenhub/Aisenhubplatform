-- T04: the security-definer proof issuer validates that the asserted MFA
-- factor belongs to the current administrator. No runtime executor receives
-- direct access to Supabase Auth tables.
grant usage on schema auth to domain_owner;
grant select (id, user_id, status) on table auth.mfa_factors to domain_owner;
