-- Forward fix: some later-created private functions retained PostgreSQL's
-- default PUBLIC EXECUTE grant. Keep all explicitly granted executor/owner
-- permissions; remove only browser/inherited public access.
revoke execute on all functions in schema private from public, anon, authenticated;

-- Per-schema ALTER DEFAULT PRIVILEGES cannot revoke the built-in global
-- PUBLIC default. Future private functions must explicitly revoke PUBLIC;
-- audit_private_execute_privileges.sql checks every function for regressions.
