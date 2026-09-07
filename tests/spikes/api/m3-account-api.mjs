import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import postgres from 'postgres';

const databaseUrl = process.env.SUPABASE_DB_URL;
const authUrl = process.env.SUPABASE_LOCAL_URL;
const anonKey = process.env.SUPABASE_LOCAL_ANON_KEY;
const secretKey = process.env.SUPABASE_LOCAL_SECRET_KEY;
const apiUrl = process.env.M3_ACCOUNT_API_URL ?? 'http://127.0.0.1:8787';
const platformSecret = process.env.PLATFORM_KEY_HMAC_SECRET;
const redemptionSecret = process.env.REDEMPTION_HMAC_SECRET;
if (
  !databaseUrl ||
  !authUrl ||
  !anonKey ||
  !secretKey ||
  !platformSecret ||
  !redemptionSecret
)
  throw new Error('Local API probe variables are required');

const sql = postgres(databaseUrl, {
  max: 8,
  prepare: false,
  onnotice: () => undefined,
});
const platformId = crypto.randomUUID();
const keyId = crypto.randomUUID();
const freePlanId = crypto.randomUUID();
const paidPlanId = crypto.randomUUID();
const proofId = crypto.randomUUID();
const factorId = crypto.randomUUID();
const presentedKey = `phk_v1_${keyId}_m3-api-fixture`;
const keyHmac = createHmac('sha256', platformSecret)
  .update(`1:platform-key:${keyId}:${presentedKey}`)
  .digest('hex');
let user;
let admin;
const assertStatus = (response, expected, label) => {
  assert.equal(
    response.status,
    expected,
    `${label}: expected ${expected}, got ${response.status}`,
  );
};
async function signup(prefix) {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const response = await fetch(`${authUrl}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: anonKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        email: `${prefix}-${crypto.randomUUID()}@example.test`,
        password: 'M3-api-local-probe-password-123!',
      }),
    });
    const body = await response.json();
    if (response.ok && body.user?.id && body.access_token) {
      const [session] =
        await sql`select id from auth.sessions where user_id = ${body.user.id} order by created_at desc limit 1`;
      return {
        userId: body.user.id,
        sessionId: session.id,
        accessToken: body.access_token,
      };
    }
    if (response.status !== 502 || attempt === 5)
      throw new Error(`signup failed: ${response.status}`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('unreachable');
}
function jwtPayload(token) {
  return JSON.parse(
    Buffer.from(token.split('.')[1], 'base64url').toString('utf8'),
  );
}
async function authRequest(path, options = {}) {
  return fetch(`${authUrl}${path}`, {
    ...options,
    headers: {
      apikey: anonKey,
      'content-type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
}
function decodeBase32(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = value
    .replace(/=+$/u, '')
    .toUpperCase()
    .split('')
    .map((character) =>
      alphabet.indexOf(character).toString(2).padStart(5, '0'),
    )
    .join('');
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8)
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}
function totp(secret, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 1000 / 30);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', decodeBase32(secret))
    .update(counterBuffer)
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];
  return String(code % 1_000_000).padStart(6, '0');
}
async function elevateToAal2(account) {
  const factorResponse = await authRequest('/auth/v1/factors', {
    method: 'POST',
    headers: { Authorization: `Bearer ${account.accessToken}` },
    body: JSON.stringify({
      factor_type: 'totp',
      friendly_name: 'm3-api-probe',
    }),
  });
  const factor = await factorResponse.json();
  assertStatus(factorResponse, 200, 'MFA enroll');
  const challengeResponse = await authRequest(
    `/auth/v1/factors/${factor.id}/challenge`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${account.accessToken}` },
    },
  );
  const challenge = await challengeResponse.json();
  assertStatus(challengeResponse, 200, 'MFA challenge');
  const verifyResponse = await authRequest(
    `/auth/v1/factors/${factor.id}/verify`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${account.accessToken}` },
      body: JSON.stringify({
        challenge_id: challenge.id,
        code: totp(factor.totp.secret),
      }),
    },
  );
  const verify = await verifyResponse.json();
  assertStatus(verifyResponse, 200, 'MFA verify');
  assert.ok(verify.access_token, 'MFA verify returns elevated access token');
  account.accessToken = verify.access_token;
  account.factorId = factor.id;
  return account;
}
async function apiRequest(path, options = {}) {
  return fetch(`${apiUrl}${path}`, {
    ...options,
    headers: { ...(options.headers ?? {}) },
  });
}
async function json(response) {
  const value = await response.json();
  assert.ok(value.request_id, 'response includes request_id');
  return value;
}

try {
  user = await signup('m3-api-user');
  admin = await signup('m3-api-admin');
  assert.equal(jwtPayload(admin.accessToken).aal, 'aal1');
  await elevateToAal2(admin);
  const elevatedClaims = jwtPayload(admin.accessToken);
  assert.equal(elevatedClaims.aal, 'aal2');
  admin.sessionId = elevatedClaims.session_id;
  await sql`grant account_executor to postgres`;
  await sql`grant admin_executor to postgres`;
  await sql`insert into public.platforms (id, code, name) values (${platformId}, ${`m3-api-${platformId.slice(0, 8)}`}, 'M3 API Platform')`;
  await sql`insert into public.plans (id, platform_id, code, name, kind, features) values
    (${freePlanId}, ${platformId}, 'free', 'Free', 'free', ${sql.json({ quota: 1 })}),
    (${paidPlanId}, ${platformId}, 'pro', 'Pro', 'paid', ${sql.json({ quota: 10 })})`;
  await sql`update public.platforms set default_plan_id = ${freePlanId} where id = ${platformId}`;
  await sql`insert into private.platform_api_keys (id, platform_id, name, key_hmac, hmac_key_version, key_prefix, key_suffix, creation_operation_id) values (${keyId}, ${platformId}, 'M3 API key', ${keyHmac}, 1, 'phk_v1', 'xture', ${crypto.randomUUID()})`;
  await sql`insert into private.system_admin (user_id) values (${admin.userId})`;
  await sql`insert into private.admin_step_up (id, user_id, session_id, factor_id, verified_at, expires_at) values (${proofId}, ${admin.userId}, ${admin.sessionId}, ${factorId}, now(), now() + interval '4 minutes')`;
  const keyHeaders = { 'X-Platform-Key': presentedKey };
  const plansResponse = await apiRequest('/functions/v1/account-api/v1/plans', {
    headers: keyHeaders,
  });
  assertStatus(plansResponse, 200, 'public plans');
  const plans = await json(plansResponse);
  assert.equal(plans.data[0].code, 'free');

  const principalResponse = await apiRequest(
    '/functions/v1/account-api/v1/account/principal',
    { headers: { ...keyHeaders, Authorization: `Bearer ${user.accessToken}` } },
  );
  assertStatus(principalResponse, 200, 'principal before activation');
  assert.equal(
    (await json(principalResponse)).data.account_status,
    'not_activated',
  );

  const activateResponse = await apiRequest(
    '/functions/v1/account-api/v1/account/activate',
    {
      method: 'POST',
      headers: { ...keyHeaders, Authorization: `Bearer ${user.accessToken}` },
    },
  );
  assertStatus(activateResponse, 200, 'activate');
  const activated = await json(activateResponse);
  const accountId = activated.data.platform_account_id;

  const subscriptionResponse = await apiRequest(
    '/functions/v1/account-api/v1/subscription',
    { headers: { ...keyHeaders, Authorization: `Bearer ${user.accessToken}` } },
  );
  assertStatus(subscriptionResponse, 200, 'free subscription');
  assert.equal(
    (await json(subscriptionResponse)).data.entitlement_kind,
    'free',
  );

  const adminHeaders = { Authorization: `Bearer ${admin.accessToken}` };
  const adminPlansResponse = await apiRequest(
    `/functions/v1/account-api/admin/api/v1/platforms/${platformId}/plans`,
    { headers: adminHeaders },
  );
  assertStatus(adminPlansResponse, 200, 'admin plan list');
  assert.equal((await json(adminPlansResponse)).data.length, 2);

  const createPlanResponse = await apiRequest(
    `/functions/v1/account-api/admin/api/v1/platforms/${platformId}/plans`,
    {
      method: 'POST',
      headers: {
        ...adminHeaders,
        'Content-Type': 'application/json',
        'X-Recent-Auth-Proof': proofId,
      },
      body: JSON.stringify({
        code: 'starter',
        name: 'Starter',
        kind: 'paid',
        status: 'active',
        features: { quota: 3 },
        make_default: false,
        clear_default: false,
      }),
    },
  );
  assertStatus(createPlanResponse, 201, 'admin create plan');
  await json(createPlanResponse);

  const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
  const deliveryDeadline = new Date(Date.now() + 600_000).toISOString();
  const batchResponse = await apiRequest(
    '/functions/v1/account-api/admin/api/v1/redemption-batches',
    {
      method: 'POST',
      headers: {
        ...adminHeaders,
        'Content-Type': 'application/json',
        'X-Recent-Auth-Proof': proofId,
      },
      body: JSON.stringify({
        platform_id: platformId,
        plan_id: paidPlanId,
        name: 'M3 API batch',
        quantity: 1,
        duration_value: 30,
        duration_unit: 'day',
        expires_at: expiresAt,
        delivery_deadline: deliveryDeadline,
        creation_operation_id: crypto.randomUUID(),
      }),
    },
  );
  assertStatus(batchResponse, 201, 'admin create batch');
  const batch = await json(batchResponse);
  assert.equal(batch.data.codes.length, 1);
  assert.ok(batch.data.delivery_receipt);
  const batchId = batch.data.batch_id;

  const confirmResponse = await apiRequest(
    `/functions/v1/account-api/admin/api/v1/redemption-batches/${batchId}/confirm-delivery`,
    {
      method: 'POST',
      headers: {
        ...adminHeaders,
        'Content-Type': 'application/json',
        'X-Recent-Auth-Proof': proofId,
      },
      body: JSON.stringify({
        platform_id: platformId,
        delivery_receipt: batch.data.delivery_receipt,
      }),
    },
  );
  assertStatus(confirmResponse, 200, 'confirm delivery');
  await json(confirmResponse);
  const listedBatchesResponse = await apiRequest(
    `/functions/v1/account-api/admin/api/v1/redemption-batches?platform_id=${platformId}`,
    { headers: adminHeaders },
  );
  assertStatus(listedBatchesResponse, 200, 'admin batch list');
  assert.equal((await json(listedBatchesResponse)).data.length, 1);

  const redeemResponse = await apiRequest(
    '/functions/v1/account-api/v1/subscription/redeem',
    {
      method: 'POST',
      headers: {
        ...keyHeaders,
        Authorization: `Bearer ${user.accessToken}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': 'm3-api-redeem-1',
      },
      body: JSON.stringify({ code: batch.data.codes[0].code }),
    },
  );
  assertStatus(redeemResponse, 200, 'redeem');
  const redeemed = await json(redeemResponse);
  assert.equal(redeemed.data.plan.code, 'pro');

  const adminSubscriptionResponse = await apiRequest(
    `/functions/v1/account-api/admin/api/v1/subscriptions/${accountId}?platform_id=${platformId}`,
    { headers: adminHeaders },
  );
  assertStatus(adminSubscriptionResponse, 200, 'admin subscription read');
  assert.equal((await json(adminSubscriptionResponse)).data.plan_code, 'pro');

  const pauseResponse = await apiRequest(
    `/functions/v1/account-api/admin/api/v1/subscriptions/${accountId}/commands?platform_id=${platformId}`,
    {
      method: 'POST',
      headers: {
        ...adminHeaders,
        'Content-Type': 'application/json',
        'X-Recent-Auth-Proof': proofId,
      },
      body: JSON.stringify({
        action: 'pause',
        operation_id: crypto.randomUUID(),
        reason: 'M3 API pause',
      }),
    },
  );
  assertStatus(pauseResponse, 200, 'admin pause');
  await json(pauseResponse);
  const pausedResponse = await apiRequest(
    '/functions/v1/account-api/v1/subscription',
    { headers: { ...keyHeaders, Authorization: `Bearer ${user.accessToken}` } },
  );
  assertStatus(pausedResponse, 200, 'paused subscription');
  assert.equal((await json(pausedResponse)).data.effective_status, 'suspended');

  const resumeResponse = await apiRequest(
    `/functions/v1/account-api/admin/api/v1/subscriptions/${accountId}/commands?platform_id=${platformId}`,
    {
      method: 'POST',
      headers: {
        ...adminHeaders,
        'Content-Type': 'application/json',
        'X-Recent-Auth-Proof': proofId,
      },
      body: JSON.stringify({
        action: 'resume',
        operation_id: crypto.randomUUID(),
        reason: 'M3 API resume',
      }),
    },
  );
  assertStatus(resumeResponse, 200, 'admin resume');
  await json(resumeResponse);

  console.log(
    JSON.stringify({
      plans: 'PASS',
      principal: 'PASS',
      activation: 'PASS',
      subscription: 'PASS',
      adminPlan: 'PASS',
      batchDelivery: 'PASS',
      batchList: 'PASS',
      redemption: 'PASS',
      adminSubscription: 'PASS',
      pauseResume: 'PASS',
    }),
  );
} finally {
  await sql`delete from public.audit_logs where platform_id = ${platformId}`.catch(
    () => undefined,
  );
  await sql`delete from public.subscription_events where platform_id = ${platformId}`.catch(
    () => undefined,
  );
  await sql`delete from public.subscription_grants where platform_id = ${platformId}`.catch(
    () => undefined,
  );
  await sql`delete from public.subscriptions where platform_id = ${platformId}`.catch(
    () => undefined,
  );
  await sql`delete from public.redemption_events where platform_id = ${platformId}`.catch(
    () => undefined,
  );
  await sql`delete from public.redemption_codes where platform_id = ${platformId}`.catch(
    () => undefined,
  );
  await sql`delete from public.redemption_code_batches where platform_id = ${platformId}`.catch(
    () => undefined,
  );
  await sql`delete from private.admin_step_up where id = ${proofId}`.catch(
    () => undefined,
  );
  await sql`delete from private.platform_api_keys where platform_id = ${platformId}`.catch(
    () => undefined,
  );
  await sql`update public.platforms set default_plan_id = null where id = ${platformId}`.catch(
    () => undefined,
  );
  await sql`delete from public.plans where platform_id = ${platformId}`.catch(
    () => undefined,
  );
  await sql`delete from public.platform_accounts where platform_id = ${platformId}`.catch(
    () => undefined,
  );
  await sql`delete from public.platforms where id = ${platformId}`.catch(
    () => undefined,
  );
  await sql`delete from private.system_admin where user_id = ${admin?.userId}`.catch(
    () => undefined,
  );
  for (const account of [user, admin]) {
    if (!account?.userId) continue;
    await fetch(`${authUrl}/auth/v1/admin/users/${account.userId}`, {
      method: 'DELETE',
      headers: { apikey: secretKey, Authorization: `Bearer ${secretKey}` },
    }).catch(() => undefined);
  }
  await sql.end({ timeout: 2 });
}
