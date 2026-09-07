import postgres from 'postgres';

const databaseUrl = process.env.SUPABASE_DB_URL;
const localUrl = process.env.SUPABASE_LOCAL_URL;
const anonKey = process.env.SUPABASE_LOCAL_ANON_KEY;

if (!databaseUrl || !localUrl || !anonKey) {
  throw new Error(
    'SUPABASE_DB_URL, SUPABASE_LOCAL_URL and SUPABASE_LOCAL_ANON_KEY are required',
  );
}

const sql = postgres(databaseUrl, {
  max: 1,
  prepare: false,
  onnotice: () => undefined,
});

const platformId = crypto.randomUUID();
const accountId = crypto.randomUUID();
const requestId = crypto.randomUUID();
const leaseResourceId = crypto.randomUUID();
const hash = Buffer.alloc(32, 0x11);
const differentHash = Buffer.alloc(32, 0x22);
const rateHash = Buffer.alloc(32, 0x33);
const windowStartedAt = new Date();
const actorScope = `user:${accountId}`;
let authUserId;
let authAccessToken;

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

try {
  await sql`
    insert into public.platforms (id, code, name)
    values (${platformId}, 't09-platform', 'T09 Platform')
  `;
  await sql`
    insert into public.platform_accounts (id, platform_id, status, anonymized_at)
    values (${accountId}, ${platformId}, 'closed', now())
  `;

  const [firstClaim] = await sql`
    select * from private.idempotency_claim(
      ${platformId}, ${accountId}, 't09-operation', ${actorScope},
      't09-key', ${hash}::bytea
    )
  `;
  assert(
    firstClaim.outcome === 'pending',
    'first idempotency claim is pending',
  );

  const [sameClaim] = await sql`
    select * from private.idempotency_claim(
      ${platformId}, ${accountId}, 't09-operation', ${actorScope},
      't09-key', ${hash}::bytea
    )
  `;
  assert(
    sameClaim.outcome === 'pending',
    'same idempotency claim stays pending',
  );

  const [conflictClaim] = await sql`
    select * from private.idempotency_claim(
      ${platformId}, ${accountId}, 't09-operation', ${actorScope},
      't09-key', ${differentHash}::bytea
    )
  `;
  assert(
    conflictClaim.outcome === 'conflict',
    'different idempotency hash conflicts',
  );

  const [finalized] = await sql`
    select private.idempotency_finalize(
      ${platformId}, ${accountId}, 't09-operation', ${actorScope},
      't09-key', ${hash}::bytea, 200, '{"ok": true}'::jsonb
    ) as finalized
  `;
  assert(
    finalized.finalized === true,
    'idempotency finalization succeeds once',
  );

  const [replay] = await sql`
    select * from private.idempotency_claim(
      ${platformId}, ${accountId}, 't09-operation', ${actorScope},
      't09-key', ${hash}::bytea
    )
  `;
  assert(
    replay.outcome === 'completed' && replay.response_status === 200,
    'completed idempotency replays',
  );

  const [audit] = await sql`
    select private.audit_append(
      ${requestId}, 'system', null, ${platformId}, ${accountId},
      't09.test', 'platform_account', ${accountId}, null, null,
      '{"source": "test"}'::jsonb
    ) as id
  `;
  assert(audit.id, 'audit append returns an id');

  const [directAccess] = await sql`
    select
      has_table_privilege('account_executor', 'private.idempotency_keys', 'select') as can_read_idempotency,
      has_table_privilege('account_executor', 'public.audit_logs', 'update') as can_update_audit
  `;
  assert(
    !directAccess.can_read_idempotency && !directAccess.can_update_audit,
    'runtime roles have no direct audit/idempotency DML',
  );

  const [lease] = await sql`
    select * from private.job_lease_claim('t09', ${leaseResourceId}, 'worker-a', 60)
  `;
  assert(
    lease.claimed === true && String(lease.fencing_token) === '1',
    'first lease claim succeeds',
  );
  const [blockedLease] = await sql`
    select * from private.job_lease_claim('t09', ${leaseResourceId}, 'worker-b', 60)
  `;
  assert(
    blockedLease.claimed === false,
    'active lease excludes another worker',
  );
  const [released] = await sql`
    select coalesce(private.job_lease_release('t09', ${leaseResourceId}, 'worker-a', 1), false) as released
  `;
  assert(released.released === true, 'matching lease owner and fence release');
  const [reclaimed] = await sql`
    select * from private.job_lease_claim('t09', ${leaseResourceId}, 'worker-b', 60)
  `;
  assert(
    reclaimed.claimed === true && String(reclaimed.fencing_token) === '2',
    'released lease increments fence',
  );

  const [limitOne] = await sql`
    select * from private.rate_limit_consume(${rateHash}::bytea, ${windowStartedAt}, 60, 2)
  `;
  const [limitTwo] = await sql`
    select * from private.rate_limit_consume(${rateHash}::bytea, ${windowStartedAt}, 60, 2)
  `;
  const [limitThree] = await sql`
    select * from private.rate_limit_consume(${rateHash}::bytea, ${windowStartedAt}, 60, 2)
  `;
  assert(
    limitOne.allowed && limitTwo.allowed && !limitThree.allowed,
    'rate limit fails closed at the fixed window limit',
  );

  const signupResponse = await fetch(`${localUrl}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: `t09-${crypto.randomUUID()}@example.test`,
      password: 'T09-only-local-probe-password-123!',
    }),
  });
  const signup = await signupResponse.json();
  assert(
    signupResponse.ok && signup.user?.id,
    'local Auth signup creates a test identity',
  );
  authUserId = signup.user.id;
  authAccessToken = signup.access_token;
  await sql`
    insert into private.identity_lifecycle (user_id, state)
    values (${authUserId}, 'deleting')
  `;
  const [blockedSession] = await sql`
    select * from private.check_user_session(${authUserId}, ${crypto.randomUUID()})
  `;
  assert(
    blockedSession.active === false &&
      blockedSession.reason === 'identity_deleting',
    'deleting gate blocks session helper',
  );

  const [unknownSession] = await sql`
    select * from private.check_user_session(${crypto.randomUUID()}, ${crypto.randomUUID()})
  `;
  assert(
    unknownSession.active === false &&
      unknownSession.reason === 'user_not_found',
    'unknown session is denied',
  );

  console.log(
    JSON.stringify({
      idempotency: 'PASS',
      auditAppendOnly: 'PASS',
      jobLeaseFence: 'PASS',
      rateLimit: 'PASS',
      identityGate: 'PASS',
      sessionHelper: 'PASS',
    }),
  );
} finally {
  await sql`reset role`;
  await sql`delete from public.audit_logs where request_id = ${requestId}`;
  await sql`delete from private.idempotency_keys where platform_id = ${platformId}`;
  await sql`delete from private.rate_limit_windows where key_hash = ${rateHash}`;
  await sql`delete from private.job_leases where job_kind = 't09' and resource_id = ${leaseResourceId}`;
  if (authUserId) {
    await sql`delete from private.identity_lifecycle where user_id = ${authUserId}`;
    if (authAccessToken) {
      await fetch(`${localUrl}/auth/v1/logout`, {
        method: 'POST',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${authAccessToken}`,
        },
      });
    }
  }
  await sql`delete from public.platform_accounts where id = ${accountId}`;
  await sql`delete from public.platforms where id = ${platformId}`;
  await sql.end({ timeout: 5 });
}
