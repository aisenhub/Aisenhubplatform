import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import postgres from 'postgres';

const directUrl = process.env.SUPABASE_DB_URL;
const poolerHost = process.env.SUPABASE_POOLER_HOST ?? '127.0.0.1';
const poolerPort = process.env.SUPABASE_POOLER_PORT ?? '54329';
const poolerTenant = process.env.SUPABASE_POOLER_TENANT ?? 'pooler-dev';

if (!directUrl) {
  console.error('NOT_RUN: SUPABASE_DB_URL is required.');
  process.exit(2);
}

const roleSuffix = randomBytes(4).toString('hex');
const role = `spike_txn_executor_t07_${roleSuffix}`;
const owner = `spike_txn_owner_t07_${roleSuffix}`;
const password = randomBytes(24).toString('base64url');
const quoteIdentifier = (value) => `"${value.replaceAll('"', '""')}"`;
const roleIdentifier = quoteIdentifier(role);
const ownerIdentifier = quoteIdentifier(owner);

const bootstrap = postgres(directUrl, { prepare: false, max: 1 });
try {
  await bootstrap.unsafe(`
    DROP SCHEMA IF EXISTS spike_txn CASCADE;
    CREATE ROLE ${ownerIdentifier} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
    CREATE ROLE ${roleIdentifier} LOGIN PASSWORD '${password.replaceAll("'", "''")}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
    GRANT ${ownerIdentifier} TO postgres;
    CREATE SCHEMA spike_txn AUTHORIZATION ${ownerIdentifier};
    SET ROLE ${ownerIdentifier};
    CREATE TABLE spike_txn.account_state (
      account_id text PRIMARY KEY,
      balance integer NOT NULL DEFAULT 0
    );
    CREATE TABLE spike_txn.idempotency (
      account_id text NOT NULL,
      idem_key text NOT NULL,
      request_hash text NOT NULL,
      result_balance integer NOT NULL,
      PRIMARY KEY (account_id, idem_key)
    );
    CREATE TABLE spike_txn.audit (
      account_id text NOT NULL,
      idem_key text NOT NULL,
      delta integer NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    INSERT INTO spike_txn.account_state (account_id) VALUES ('same-account'), ('idempotent'), ('lost-response'), ('account-a'), ('account-b');
    ALTER TABLE spike_txn.account_state ENABLE ROW LEVEL SECURITY;
    ALTER TABLE spike_txn.idempotency ENABLE ROW LEVEL SECURITY;
    ALTER TABLE spike_txn.audit ENABLE ROW LEVEL SECURITY;
    CREATE OR REPLACE FUNCTION spike_txn.apply_once(
      p_account_id text,
      p_idem_key text,
      p_request_hash text,
      p_delta integer,
      p_fail_after_audit boolean DEFAULT false
    ) RETURNS TABLE (applied boolean, balance integer)
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = spike_txn, pg_temp
    AS $$
    DECLARE
      current_balance integer;
      previous_result integer;
      previous_hash text;
    BEGIN
      SELECT s.balance INTO current_balance
      FROM spike_txn.account_state AS s
      WHERE s.account_id = p_account_id
      FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'account_not_found' USING ERRCODE = 'P0001';
      END IF;

      SELECT i.result_balance, i.request_hash
      INTO previous_result, previous_hash
      FROM spike_txn.idempotency AS i
      WHERE i.account_id = p_account_id AND i.idem_key = p_idem_key;
      IF FOUND THEN
        IF previous_hash <> p_request_hash THEN
          RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE = 'P0001';
        END IF;
        RETURN QUERY SELECT false, previous_result;
        RETURN;
      END IF;

      current_balance := current_balance + p_delta;
      INSERT INTO spike_txn.idempotency (account_id, idem_key, request_hash, result_balance)
      VALUES (p_account_id, p_idem_key, p_request_hash, current_balance);
      UPDATE spike_txn.account_state SET balance = current_balance WHERE account_id = p_account_id;
      INSERT INTO spike_txn.audit (account_id, idem_key, delta)
      VALUES (p_account_id, p_idem_key, p_delta);

      IF p_fail_after_audit THEN
        RAISE EXCEPTION 'injected_failure_after_audit' USING ERRCODE = 'P0001';
      END IF;

      RETURN QUERY SELECT true, current_balance;
    END;
    $$;
    RESET ROLE;
    ALTER FUNCTION spike_txn.apply_once(text, text, text, integer, boolean) OWNER TO ${ownerIdentifier};
    REVOKE ALL ON SCHEMA spike_txn FROM PUBLIC, anon, authenticated;
    REVOKE ALL ON ALL TABLES IN SCHEMA spike_txn FROM PUBLIC, anon, authenticated;
    REVOKE ALL ON FUNCTION spike_txn.apply_once(text, text, text, integer, boolean) FROM PUBLIC;
    GRANT USAGE ON SCHEMA spike_txn TO ${roleIdentifier};
    GRANT EXECUTE ON FUNCTION spike_txn.apply_once(text, text, text, integer, boolean) TO ${roleIdentifier};
  `);
} finally {
  await bootstrap.end({ timeout: 2 });
}

const poolerUrl = `postgres://${role}.${poolerTenant}:${encodeURIComponent(password)}@${poolerHost}:${poolerPort}/postgres`;
const clientA = postgres(poolerUrl, {
  prepare: false,
  max: 1,
  connect_timeout: 5,
});
const clientB = postgres(poolerUrl, {
  prepare: false,
  max: 1,
  connect_timeout: 5,
});

await clientA`set statement_timeout = '2000ms'`;
await clientA`set lock_timeout = '1000ms'`;
await clientB`set statement_timeout = '2000ms'`;
await clientB`set lock_timeout = '1000ms'`;

const apply = (client, accountId, key, hash, delta, fail = false) =>
  client`select * from spike_txn.apply_once(${accountId}, ${key}, ${hash}, ${delta}, ${fail})`;

const differentKeys = await Promise.all([
  apply(clientA, 'same-account', 'operation-a', 'hash-a', 1),
  apply(clientB, 'same-account', 'operation-b', 'hash-b', 1),
]);
assert.equal(differentKeys.filter((row) => row[0]?.applied).length, 2);

const sameKey = await Promise.all([
  apply(clientA, 'idempotent', 'same-key', 'same-hash', 5),
  apply(clientB, 'idempotent', 'same-key', 'same-hash', 5),
]);
assert.equal(sameKey.filter((row) => row[0]?.applied).length, 1);
assert.equal(sameKey[0][0].balance, 5);
assert.equal(sameKey[1][0].balance, 5);

await apply(clientA, 'idempotent', 'conflict-key', 'hash-one', 7);
let conflictCode;
try {
  await apply(clientB, 'idempotent', 'conflict-key', 'hash-two', 9);
} catch (error) {
  conflictCode = error.code;
}
assert.equal(conflictCode, 'P0001');

let rollbackCode;
try {
  await apply(
    clientA,
    'same-account',
    'rollback-key',
    'rollback-hash',
    99,
    true,
  );
} catch (error) {
  rollbackCode = error.code;
}
assert.equal(rollbackCode, 'P0001');

const firstLostResponse = await apply(
  clientA,
  'lost-response',
  'lost-key',
  'lost-hash',
  13,
);
assert.equal(firstLostResponse[0].applied, true);
const replayed = await apply(
  clientB,
  'lost-response',
  'lost-key',
  'lost-hash',
  13,
);
assert.equal(replayed[0].applied, false);
assert.equal(replayed[0].balance, 13);

await Promise.all([
  apply(clientA, 'account-a', 'independent-a', 'hash-a', 1),
  apply(clientB, 'account-b', 'independent-b', 'hash-b', 1),
]);

await clientA.end({ timeout: 2 });
await clientB.end({ timeout: 2 });

const verify = postgres(directUrl, { prepare: false, max: 1 });
let balances;
let auditCount;
let rollbackIdemCount;
try {
  balances = await verify`
    select account_id, balance from spike_txn.account_state
    where account_id in ('same-account', 'idempotent', 'lost-response', 'account-a', 'account-b')
    order by account_id
  `;
  auditCount = await verify`select count(*)::int as count from spike_txn.audit`;
  rollbackIdemCount = await verify`
    select count(*)::int as count from spike_txn.idempotency where idem_key = 'rollback-key'
  `;
} finally {
  await verify.end({ timeout: 2 });
}

const balanceMap = Object.fromEntries(
  balances.map((row) => [row.account_id, row.balance]),
);
assert.equal(balanceMap['same-account'], 2);
assert.equal(balanceMap.idempotent, 12);
assert.equal(balanceMap['lost-response'], 13);
assert.equal(balanceMap['account-a'], 1);
assert.equal(balanceMap['account-b'], 1);
assert.equal(rollbackIdemCount[0].count, 0);
assert.equal(auditCount[0].count, 7);

const cleanup = postgres(directUrl, { prepare: false, max: 1 });
try {
  await cleanup.unsafe(`
    DROP SCHEMA IF EXISTS spike_txn CASCADE;
    DROP ROLE IF EXISTS ${roleIdentifier};
    DROP ROLE IF EXISTS ${ownerIdentifier};
  `);
} finally {
  await cleanup.end({ timeout: 2 });
}

console.log(
  JSON.stringify({
    isolation: 'READ COMMITTED with row lock',
    lockTimeout: '1000ms',
    statementTimeout: '2000ms',
    sameAccountSerial: 'PASS',
    independentAccounts: 'PASS',
    sameKeySameHash: 'PASS',
    sameKeyDifferentHash: 'REJECTED',
    rollbackAfterAudit: 'PASS',
    lostResponseReplay: 'PASS',
    auditRows: auditCount[0].count,
    cleanup: 'PASS',
  }),
);
