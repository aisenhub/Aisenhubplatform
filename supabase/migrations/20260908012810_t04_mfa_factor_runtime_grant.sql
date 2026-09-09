-- Local Supabase finishes provisioning its Auth schema after the historical
-- migrations are replayed during a reset. Apply the narrowly scoped grant as
-- a follow-up migration so the proof issuer can validate the verified factor.
grant usage on schema auth to domain_owner;
grant select (id, user_id, status) on table auth.mfa_factors to domain_owner;
