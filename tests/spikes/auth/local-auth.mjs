import { createHmac, randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';

const apiUrl = process.env.SUPABASE_LOCAL_URL;
const anonKey = process.env.SUPABASE_LOCAL_ANON_KEY;

if (!apiUrl || !anonKey) {
  console.error(
    'NOT_RUN: SUPABASE_LOCAL_URL and SUPABASE_LOCAL_ANON_KEY are required.',
  );
  process.exit(2);
}

const baseHeaders = {
  apikey: anonKey,
  'content-type': 'application/json',
};

async function request(path, options = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: { ...baseHeaders, ...(options.headers ?? {}) },
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    // Empty 204 responses are expected for logout.
  }
  return { response, body };
}

function jwtPayload(token) {
  const encoded = token.split('.')[1];
  assert.ok(encoded, 'access token must be a JWT');
  return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
}

function decodeBase32(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = value
    .replace(/=+$/, '')
    .toUpperCase()
    .split('')
    .map((character) =>
      alphabet.indexOf(character).toString(2).padStart(5, '0'),
    )
    .join('');
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
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

const email = `auth-probe-${Date.now()}@example.test`;
const password = `Probe-${randomBytes(18).toString('base64url')}!`;
const signup = await request('/auth/v1/signup', {
  method: 'POST',
  body: JSON.stringify({ email, password }),
});
assert.equal(
  signup.response.status,
  200,
  `signup returned ${signup.response.status}`,
);
assert.ok(
  signup.body?.access_token,
  'signup must return an access token for local probe',
);
assert.ok(
  signup.body?.refresh_token,
  'signup must return a refresh token for local probe',
);

const firstAccessToken = signup.body.access_token;
const firstRefreshToken = signup.body.refresh_token;
const firstSessionId = jwtPayload(firstAccessToken).session_id;
assert.ok(firstSessionId, 'access token must contain session_id');

const firstUser = await request('/auth/v1/user', {
  headers: { Authorization: `Bearer ${firstAccessToken}` },
});
assert.equal(
  firstUser.response.status,
  200,
  'session must authenticate user lookup',
);

const refreshed = await request('/auth/v1/token?grant_type=refresh_token', {
  method: 'POST',
  body: JSON.stringify({ refresh_token: firstRefreshToken }),
});
assert.equal(refreshed.response.status, 200, 'refresh must succeed');
assert.ok(refreshed.body?.access_token, 'refresh must return access token');
assert.equal(
  jwtPayload(refreshed.body.access_token).session_id,
  firstSessionId,
);

const factors = await request('/auth/v1/factors', {
  method: 'POST',
  headers: { Authorization: `Bearer ${refreshed.body.access_token}` },
  body: JSON.stringify({
    factor_type: 'totp',
    friendly_name: 'local-auth-probe',
  }),
});
assert.equal(
  factors.response.status,
  200,
  `MFA enroll returned ${factors.response.status}: ${JSON.stringify({
    error: factors.body?.error,
    code: factors.body?.code,
    message: factors.body?.message,
  })}`,
);
assert.ok(
  factors.body?.id && factors.body?.totp?.secret,
  'MFA enroll must return factor and secret',
);

const challenge = await request(
  `/auth/v1/factors/${factors.body.id}/challenge`,
  {
    method: 'POST',
    headers: { Authorization: `Bearer ${refreshed.body.access_token}` },
  },
);
assert.equal(
  challenge.response.status,
  200,
  `MFA challenge returned ${challenge.response.status}`,
);

const verify = await request(`/auth/v1/factors/${factors.body.id}/verify`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${refreshed.body.access_token}` },
  body: JSON.stringify({
    challenge_id: challenge.body.id,
    code: totp(factors.body.totp.secret),
  }),
});
assert.equal(
  verify.response.status,
  200,
  `MFA verify returned ${verify.response.status}`,
);

const logout = await request('/auth/v1/logout', {
  method: 'POST',
  headers: { Authorization: `Bearer ${refreshed.body.access_token}` },
});
assert.equal(
  logout.response.status,
  204,
  'logout must revoke the refresh session',
);

const refreshAfterLogout = await request(
  '/auth/v1/token?grant_type=refresh_token',
  {
    method: 'POST',
    body: JSON.stringify({ refresh_token: refreshed.body.refresh_token }),
  },
);
assert.equal(
  refreshAfterLogout.response.status,
  400,
  'logout must reject refresh reuse',
);

const oldAccessAfterLogout = await request('/auth/v1/user', {
  headers: { Authorization: `Bearer ${refreshed.body.access_token}` },
});
const oldAccessRevokedImmediately =
  oldAccessAfterLogout.response.status === 401;

console.log(
  JSON.stringify({
    signup: 'PASS',
    refresh: 'PASS',
    sessionIdStableAcrossRefresh: true,
    mfaEnrollChallengeVerify: 'PASS',
    logoutRefreshRevoked: 'PASS',
    oldAccessRevokedImmediately,
  }),
);

if (!oldAccessRevokedImmediately) {
  console.error(
    'BLOCKED: local Auth accepts the already-issued access JWT after logout until its expiry.',
  );
  process.exit(3);
}
