import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import postgres from 'postgres';

const directUrl = process.env.SUPABASE_DB_URL;
const poolerHost = process.env.SUPABASE_POOLER_HOST ?? '127.0.0.1';
const poolerPort = process.env.SUPABASE_POOLER_PORT ?? '54329';
const poolerTenant = process.env.SUPABASE_POOLER_TENANT ?? 'pooler-dev';
const apiUrl = process.env.SUPABASE_LOCAL_URL;
const anonKey = process.env.SUPABASE_LOCAL_ANON_KEY;
const denoCommand =
  process.env.DENO_BIN ??
  (process.platform === 'win32'
    ? 'D:\\APP\\Codex\\Deno\\bin\\deno.exe'
    : 'deno');
const denoCache =
  process.env.DENO_DIR ??
  (process.platform === 'win32' ? 'E:\\AppData\\deno\\cache' : undefined);

if (!directUrl || !apiUrl || !anonKey) {
  console.error('NOT_RUN: local DB URL, API URL and anon key are required.');
  process.exit(2);
}

const roleSuffix = randomBytes(4).toString('hex');
const ownerRole = `spike_owner_t05_${roleSuffix}`;
const accountRole = `spike_account_executor_t05_${roleSuffix}`;
const adminRole = `spike_admin_executor_t05_${roleSuffix}`;
const jobRole = `spike_job_executor_t05_${roleSuffix}`;
const accountPassword = randomBytes(24).toString('base64url');
const adminPassword = randomBytes(24).toString('base64url');
const jobPassword = randomBytes(24).toString('base64url');
const quoteIdentifier = (value) => `"${value.replaceAll('"', '""')}"`;
const accountIdentifier = quoteIdentifier(accountRole);
const adminIdentifier = quoteIdentifier(adminRole);
const jobIdentifier = quoteIdentifier(jobRole);
const ownerIdentifier = quoteIdentifier(ownerRole);

const bootstrap = postgres(directUrl, { prepare: false, max: 1 });
try {
  await bootstrap.unsafe(`
    DROP SCHEMA IF EXISTS spike_private CASCADE;
    DO $$
    DECLARE role_name text;
    BEGIN
      FOR role_name IN
        SELECT rolname FROM pg_roles WHERE rolname LIKE 'spike\\_%\\_t05\\_%' ESCAPE '\\'
      LOOP
        EXECUTE format('DROP ROLE IF EXISTS %I', role_name);
      END LOOP;
    END $$;
    DROP ROLE IF EXISTS ${accountIdentifier};
    DROP ROLE IF EXISTS ${adminIdentifier};
    DROP ROLE IF EXISTS ${jobIdentifier};
    DROP ROLE IF EXISTS ${ownerIdentifier};
    CREATE ROLE ${ownerIdentifier} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
    CREATE ROLE ${accountIdentifier} LOGIN PASSWORD '${accountPassword.replaceAll("'", "''")}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
    CREATE ROLE ${adminIdentifier} LOGIN PASSWORD '${adminPassword.replaceAll("'", "''")}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
    CREATE ROLE ${jobIdentifier} LOGIN PASSWORD '${jobPassword.replaceAll("'", "''")}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
    GRANT ${ownerIdentifier} TO postgres;
    CREATE SCHEMA spike_private AUTHORIZATION ${ownerIdentifier};
    SET ROLE ${ownerIdentifier};
    CREATE TABLE spike_private.records (id integer PRIMARY KEY, value text NOT NULL);
    INSERT INTO spike_private.records (id, value) VALUES (1, 'edge-visible');
    ALTER TABLE spike_private.records ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON SCHEMA spike_private FROM PUBLIC, anon, authenticated;
    REVOKE ALL ON TABLE spike_private.records FROM PUBLIC, anon, authenticated;
    GRANT USAGE ON SCHEMA spike_private TO ${ownerIdentifier};
    GRANT SELECT ON spike_private.records TO ${ownerIdentifier};
    CREATE OR REPLACE FUNCTION spike_private.read_record(p_id integer)
    RETURNS text
    LANGUAGE sql
    SECURITY DEFINER
    SET search_path = spike_private, pg_temp
    AS $$ SELECT value FROM spike_private.records WHERE id = p_id $$;
    RESET ROLE;
    ALTER FUNCTION spike_private.read_record(integer) OWNER TO ${ownerIdentifier};
    REVOKE ALL ON FUNCTION spike_private.read_record(integer) FROM PUBLIC;
    GRANT USAGE ON SCHEMA spike_private TO ${accountIdentifier};
    GRANT EXECUTE ON FUNCTION spike_private.read_record(integer) TO ${accountIdentifier};
  `);
} finally {
  await bootstrap.end({ timeout: 2 });
}

const poolerUrl = `postgres://${accountRole}.${poolerTenant}:${encodeURIComponent(accountPassword)}@${poolerHost}:${poolerPort}/postgres`;
const account = postgres(poolerUrl, { prepare: false, max: 1 });
let accountRead = false;
let accountDmlRejected = false;
try {
  const rows = await account`select spike_private.read_record(1) as value`;
  accountRead = rows[0]?.value === 'edge-visible';
  try {
    await account.unsafe('select * from spike_private.records');
  } catch (error) {
    accountDmlRejected = error?.code === '42501';
  }
} finally {
  await account.end({ timeout: 2 });
}

const admin = postgres(
  `postgres://${adminRole}.${poolerTenant}:${encodeURIComponent(adminPassword)}@${poolerHost}:${poolerPort}/postgres`,
  { prepare: false, max: 1 },
);
let adminFunctionRejected = false;
try {
  await admin`select spike_private.read_record(1)`;
} catch (error) {
  adminFunctionRejected = error?.code === '42501';
} finally {
  await admin.end({ timeout: 2 });
}

const job = postgres(
  `postgres://${jobRole}.${poolerTenant}:${encodeURIComponent(jobPassword)}@${poolerHost}:${poolerPort}/postgres`,
  { prepare: false, max: 1 },
);
let jobFunctionRejected = false;
try {
  await job`select spike_private.read_record(1)`;
} catch (error) {
  jobFunctionRejected = error?.code === '42501';
} finally {
  await job.end({ timeout: 2 });
}

const browserResponse = await fetch(`${apiUrl}/rest/v1/records`, {
  headers: { apikey: anonKey },
});
const browserDataApiRejected = [401, 404, 406].includes(browserResponse.status);

const catalog = postgres(directUrl, { prepare: false, max: 1 });
let authColumns = [];
let executorAuthGrants = 0;
try {
  authColumns = await catalog`
    select column_name
    from information_schema.columns
    where table_schema = 'auth' and table_name = 'sessions'
    order by ordinal_position
  `;
  const grants = await catalog`
    select count(*)::int as count
    from information_schema.role_table_grants
    where grantee = ${accountRole} and table_schema = 'auth'
  `;
  executorAuthGrants = grants[0]?.count ?? 0;
} finally {
  await catalog.end({ timeout: 2 });
}

if (
  !accountRead ||
  !accountDmlRejected ||
  !adminFunctionRejected ||
  !jobFunctionRejected ||
  !browserDataApiRejected ||
  executorAuthGrants !== 0
) {
  console.error(
    JSON.stringify({
      accountRead,
      accountDmlRejected,
      adminFunctionRejected,
      jobFunctionRejected,
      browserDataApiRejected,
      executorAuthGrants,
    }),
  );
  process.exit(1);
}

const denoEnv = {
  ...process.env,
  SUPABASE_POOLER_URL: poolerUrl,
  ...(denoCache ? { DENO_DIR: denoCache } : {}),
};
const denoResult = spawnSync(
  denoCommand,
  ['run', '--allow-net', '--allow-env', 'tests/spikes/sql/edge-pooler.ts'],
  {
    cwd: process.cwd(),
    env: denoEnv,
    stdio: 'inherit',
  },
);
if (denoResult.error?.code === 'ENOENT') {
  console.error('NOT_RUN: Deno runtime is not available.');
  process.exit(2);
}
if (denoResult.status !== 0) process.exit(denoResult.status ?? 1);

const cleanup = postgres(directUrl, { prepare: false, max: 1 });
try {
  await cleanup.unsafe(`
    DROP SCHEMA IF EXISTS spike_private CASCADE;
    DROP ROLE IF EXISTS ${accountIdentifier};
    DROP ROLE IF EXISTS ${adminIdentifier};
    DROP ROLE IF EXISTS ${jobIdentifier};
    DROP ROLE IF EXISTS ${ownerIdentifier};
  `);
} finally {
  await cleanup.end({ timeout: 2 });
}

console.log(
  JSON.stringify({
    nodePooler: 'PASS',
    edgePooler: 'PASS',
    allowedFunction: 'account executor only',
    directTableDml: 'REJECTED',
    unauthorizedFunctions: 'REJECTED',
    browserDataApi: 'REJECTED',
    authSessionColumnsObserved: authColumns.map((row) => row.column_name),
    accountExecutorAuthSchemaGrants: executorAuthGrants,
    preparedStatements: false,
    cleanup: 'PASS',
  }),
);
