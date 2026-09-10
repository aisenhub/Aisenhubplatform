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
const previousRedemptionSecret = process.env.REDEMPTION_HMAC_SECRET_PREVIOUS;
const rotationEnabled = process.env.M3_ROTATION_E2E === '1';
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
const rotationPlanId = crypto.randomUUID();
const rotationBatchId = crypto.randomUUID();
const rotationCodeId = crypto.randomUUID();
const presentedKey = `phk_v1_${keyId}_m3-api-fixture`;
const keyHmac = createHmac('sha256', platformSecret)
  .update(`1:platform-key:${keyId}:${presentedKey}`)
  .digest('hex');
let user;
let admin;
let rotationUser;
let proofId;
const [existingSystemAdmin] = await sql`
  select user_id from private.system_admin where singleton_id = 1
`;
if (existingSystemAdmin && process.env.M3_ALLOW_SYSTEM_ADMIN_SWAP !== '1')
  throw new Error(
    'M3 fixture found an existing system_admin; set M3_ALLOW_SYSTEM_ADMIN_SWAP=1 only for an isolated Local run',
  );
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

async function requestWithInjectedResponseLoss(path, options) {
  let firstRequestError;
  try {
    await apiRequest(path, options);
  } catch (error) {
    firstRequestError = error;
  }
  assert.ok(
    firstRequestError,
    'post-commit response loss must reach the client',
  );
  return apiRequest(path, options);
}
async function json(response) {
  const value = await response.json();
  assert.ok(value.request_id, 'response includes request_id');
  return value;
}

try {
  user = await signup('m3-api-user');
  admin = await signup('m3-api-admin');
  if (rotationEnabled) {
    if (!previousRedemptionSecret)
      throw new Error(
        'M3_ROTATION_E2E requires the previous redemption Secret',
      );
    rotationUser = await signup('m3-api-rotation');
  }
  assert.equal(jwtPayload(admin.accessToken).aal, 'aal1');
  await elevateToAal2(admin);
  const elevatedClaims = jwtPayload(admin.accessToken);
  assert.equal(elevatedClaims.aal, 'aal2');
  assert.equal(
    elevatedClaims.sub,
    admin.userId,
    'JWT subject matches Auth user',
  );
  admin.sessionId = elevatedClaims.session_id;
  const activeAdminResponse = await authRequest('/auth/v1/user', {
    headers: { Authorization: `Bearer ${admin.accessToken}` },
  });
  assertStatus(activeAdminResponse, 200, 'active elevated admin session');
  assert.equal((await activeAdminResponse.json()).id, admin.userId);
  await sql`grant account_executor to postgres`;
  await sql`grant admin_executor to postgres`;
  await sql`insert into public.platforms (id, code, name) values (${platformId}, ${`m3-api-${platformId.slice(0, 8)}`}, 'M3 API Platform')`;
  await sql`insert into public.plans (id, platform_id, code, name, kind, features) values
    (${freePlanId}, ${platformId}, 'free', 'Free', 'free', ${sql.json({ quota: 1 })}),
    (${paidPlanId}, ${platformId}, 'pro', 'Pro', 'paid', ${sql.json({ quota: 10 })})`;
  if (rotationEnabled) {
    await sql`insert into public.plans (id, platform_id, code, name, kind, features) values
      (${rotationPlanId}, ${platformId}, 'legacy-pro', 'Legacy Pro', 'paid', ${sql.json({ quota: 7 })})`;
  }
  await sql`update public.platforms set default_plan_id = ${freePlanId} where id = ${platformId}`;
  await sql`insert into private.platform_api_keys (id, platform_id, name, key_hmac, hmac_key_version, key_prefix, key_suffix, creation_operation_id) values (${keyId}, ${platformId}, 'M3 API key', ${keyHmac}, 1, 'phk_v1', 'xture', ${crypto.randomUUID()})`;
  if (rotationEnabled) {
    const rotationCode = 'ABCD23456789';
    const rotationCodeHmac = createHmac('sha256', previousRedemptionSecret)
      .update(`redeem:v1:platform:${platformId}:key:1:code:${rotationCode}`)
      .digest('hex');
    const rotationReceipt = createHmac('sha256', previousRedemptionSecret)
      .update(`delivery:v1:platform:${platformId}:receipt:legacy-rotation`)
      .digest('hex');
    await sql`insert into public.redemption_code_batches
      (id, platform_id, plan_id, name, quantity, duration_value, duration_unit,
       expires_at, status, delivery_deadline, delivered_at, delivery_session_id,
       delivery_receipt_hmac, created_by, creation_operation_id)
      values (${rotationBatchId}, ${platformId}, ${rotationPlanId}, 'Legacy rotation fixture', 1,
        30, 'day', now() + interval '30 days', 'active', now() + interval '1 day', now(),
        ${admin.sessionId}, ${rotationReceipt}, ${admin.userId}, ${crypto.randomUUID()})`;
    await sql`insert into public.redemption_codes
      (id, platform_id, batch_id, plan_id, code_hmac, hmac_key_version, code_prefix, code_suffix)
      values (${rotationCodeId}, ${platformId}, ${rotationBatchId}, ${rotationPlanId},
        ${rotationCodeHmac}, 1, 'ABCD', '6789')`;
  }
  await sql`insert into private.system_admin (user_id) values (${admin.userId}) on conflict (singleton_id) do update set user_id = excluded.user_id`;
  const recentProofResponse = await apiRequest(
    '/functions/v1/account-api/admin/api/v1/auth/recent-proof',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${admin.accessToken}`,
        'X-Mfa-Factor-Id': admin.factorId,
      },
    },
  );
  assertStatus(recentProofResponse, 201, 'issue recent authentication proof');
  proofId = (await json(recentProofResponse)).data.proof_id;
  assert.ok(proofId, 'recent authentication proof is returned');
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

  if (rotationEnabled) {
    const rotationActivateResponse = await apiRequest(
      '/functions/v1/account-api/v1/account/activate',
      {
        method: 'POST',
        headers: {
          ...keyHeaders,
          Authorization: `Bearer ${rotationUser.accessToken}`,
        },
      },
    );
    assertStatus(rotationActivateResponse, 200, 'rotation user activate');
    const rotationRedeemResponse = await apiRequest(
      '/functions/v1/account-api/v1/subscription/redeem',
      {
        method: 'POST',
        headers: {
          ...keyHeaders,
          Authorization: `Bearer ${rotationUser.accessToken}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': 'm3-api-old-secret-redeem-1',
        },
        body: JSON.stringify({ code: 'ABCD23456789' }),
      },
    );
    assertStatus(rotationRedeemResponse, 200, 'old Secret redeem');
    assert.equal(
      (await json(rotationRedeemResponse)).data.plan.code,
      'legacy-pro',
    );
  }

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
  assert.equal(
    (await json(adminPlansResponse)).data.length,
    2 + (rotationEnabled ? 1 : 0),
  );

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
  const creationOperationId = crypto.randomUUID();
  const batchRequest = {
    platform_id: platformId,
    plan_id: paidPlanId,
    name: 'M3 API batch',
    quantity: 1,
    duration_value: 30,
    duration_unit: 'day',
    expires_at: expiresAt,
    delivery_deadline: deliveryDeadline,
    creation_operation_id: creationOperationId,
  };
  const batchResponse = await apiRequest(
    '/functions/v1/account-api/admin/api/v1/redemption-batches',
    {
      method: 'POST',
      headers: {
        ...adminHeaders,
        'Content-Type': 'application/json',
        'X-Recent-Auth-Proof': proofId,
      },
      body: JSON.stringify(batchRequest),
    },
  );
  assertStatus(batchResponse, 201, 'admin create batch');
  const batch = await json(batchResponse);
  assert.equal(batch.data.creation_state, 'created');
  assert.equal(batch.data.codes.length, 1);
  assert.ok(batch.data.delivery_receipt);
  const batchId = batch.data.batch_id;

  const replayResponse = await apiRequest(
    '/functions/v1/account-api/admin/api/v1/redemption-batches',
    {
      method: 'POST',
      headers: {
        ...adminHeaders,
        'Content-Type': 'application/json',
        'X-Recent-Auth-Proof': proofId,
      },
      body: JSON.stringify(batchRequest),
    },
  );
  assertStatus(replayResponse, 200, 'admin replay batch create');
  const replay = await json(replayResponse);
  assert.equal(replay.data.creation_state, 'replayed_existing');
  assert.equal(replay.data.batch_id, batchId);
  assert.equal(replay.data.status, 'pending_delivery');
  assert.equal(replay.data.quantity, 1);
  assert.equal('codes' in replay.data, false);
  assert.equal('delivery_receipt' in replay.data, false);

  const conflictResponse = await apiRequest(
    '/functions/v1/account-api/admin/api/v1/redemption-batches',
    {
      method: 'POST',
      headers: {
        ...adminHeaders,
        'Content-Type': 'application/json',
        'X-Recent-Auth-Proof': proofId,
      },
      body: JSON.stringify({ ...batchRequest, name: 'M3 API batch changed' }),
    },
  );
  assertStatus(conflictResponse, 409, 'admin replay conflict');
  const conflict = await json(conflictResponse);
  assert.equal(conflict.error.code, 'IDEMPOTENCY_CONFLICT');

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
  assert.equal(
    (await json(listedBatchesResponse)).data.length,
    1 + (rotationEnabled ? 1 : 0),
  );

  const redeemPath = '/functions/v1/account-api/v1/subscription/redeem';
  const redeemOptions = {
    method: 'POST',
    headers: {
      ...keyHeaders,
      Authorization: `Bearer ${user.accessToken}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': 'm3-api-redeem-1',
    },
    body: JSON.stringify({ code: batch.data.codes[0].code }),
  };
  const responseLost = process.env.M3_POST_COMMIT_RESPONSE_LOSS === '1';
  const redeemResponse = responseLost
    ? await requestWithInjectedResponseLoss(redeemPath, redeemOptions)
    : await apiRequest(redeemPath, redeemOptions);
  assertStatus(redeemResponse, 200, 'redeem');
  const redeemed = await json(redeemResponse);
  assert.equal(redeemed.data.plan.code, 'pro');
  const responseLostRetry = await apiRequest(
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
  assertStatus(responseLostRetry, 200, 'response-lost retry');
  assert.equal((await json(responseLostRetry)).data.plan.code, 'pro');

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

  const logoutResponse = await authRequest('/auth/v1/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${user.accessToken}` },
  });
  assertStatus(logoutResponse, 204, 'user logout');
  const revokedSessionResponse = await apiRequest(
    '/functions/v1/account-api/v1/account/principal',
    { headers: { ...keyHeaders, Authorization: `Bearer ${user.accessToken}` } },
  );
  assertStatus(revokedSessionResponse, 401, 'revoked access token');
  assert.ok(
    ['SESSION_REVOKED', 'UNAUTHORIZED'].includes(
      (await json(revokedSessionResponse)).error.code,
    ),
    'a logout-revoked access token must not authorize a new request',
  );

  console.log(
    JSON.stringify({
      plans: 'PASS',
      principal: 'PASS',
      activation: 'PASS',
      subscription: 'PASS',
      adminPlan: 'PASS',
      batchDelivery: 'PASS',
      batchList: 'PASS',
      responseLostRetry: 'PASS',
      redemption: 'PASS',
      ...(responseLost ? { postCommitResponseLoss: 'PASS' } : {}),
      ...(rotationEnabled ? { dualSecretOldCode: 'PASS' } : {}),
      adminSubscription: 'PASS',
      pauseResume: 'PASS',
      recentAuthProof: 'PASS',
      revokedAccessToken: 'PASS',
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
  if (proofId)
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
  if (existingSystemAdmin)
    await sql`update private.system_admin set user_id = ${existingSystemAdmin.user_id} where singleton_id = 1`.catch(
      () => undefined,
    );
  else
    await sql`delete from private.system_admin where singleton_id = 1`.catch(
      () => undefined,
    );
  for (const account of [user, admin, rotationUser]) {
    if (!account?.userId) continue;
    await fetch(`${authUrl}/auth/v1/admin/users/${account.userId}`, {
      method: 'DELETE',
      headers: { apikey: secretKey, Authorization: `Bearer ${secretKey}` },
    }).catch(() => undefined);
  }
  await sql.end({ timeout: 2 });
}
