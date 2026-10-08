const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const ATTESTATION_VERSION = 'v1';
const ATTESTATION_PURPOSE = 'admin_recent_mfa';
const MAX_CLOCK_SKEW_MS = 5_000;

export const ADMIN_MFA_ATTESTATION_TTL_MS = 60_000;

export type AdminMfaAttestationClaims = {
  readonly factorId: string;
  readonly verifiedAt: string;
  readonly nonce: string;
};

type AttestationPayload = {
  readonly purpose: typeof ATTESTATION_PURPOSE;
  readonly user_id: string;
  readonly session_id: string;
  readonly factor_id: string;
  readonly verified_at: string;
  readonly expires_at: string;
  readonly nonce: string;
};

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function usableSecret(secret: string): boolean {
  return new TextEncoder().encode(secret).byteLength >= 32;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

function base64UrlDecode(value: string): Uint8Array | null {
  try {
    const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return Uint8Array.from(atob(padded), (character) =>
      character.charCodeAt(0),
    );
  } catch {
    return null;
  }
}

function encodePayload(payload: AttestationPayload): string {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
}

function decodePayload(value: string): AttestationPayload | null {
  const bytes = base64UrlDecode(value);
  if (!bytes) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return null;
    const candidate = parsed as Record<string, unknown>;
    if (
      candidate.purpose !== ATTESTATION_PURPOSE ||
      !isUuid(candidate.user_id) ||
      !isUuid(candidate.session_id) ||
      !isUuid(candidate.factor_id) ||
      !isUuid(candidate.nonce) ||
      typeof candidate.verified_at !== 'string' ||
      typeof candidate.expires_at !== 'string'
    )
      return null;
    return candidate as AttestationPayload;
  } catch {
    return null;
  }
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function createAdminMfaAttestation(input: {
  readonly secret: string;
  readonly userId: string;
  readonly sessionId: string;
  readonly factorId: string;
  readonly now?: number;
  readonly ttlMs?: number;
  readonly nonce?: string;
}): Promise<string> {
  const now = input.now ?? Date.now();
  const ttlMs = input.ttlMs ?? ADMIN_MFA_ATTESTATION_TTL_MS;
  const nonce = input.nonce ?? crypto.randomUUID();
  if (
    !usableSecret(input.secret) ||
    !isUuid(input.userId) ||
    !isUuid(input.sessionId) ||
    !isUuid(input.factorId) ||
    !isUuid(nonce) ||
    !Number.isFinite(now) ||
    !Number.isFinite(ttlMs) ||
    ttlMs <= 0 ||
    ttlMs > ADMIN_MFA_ATTESTATION_TTL_MS
  ) {
    throw new Error('INVALID_ADMIN_MFA_ATTESTATION_INPUT');
  }

  const payload: AttestationPayload = {
    purpose: ATTESTATION_PURPOSE,
    user_id: input.userId.toLowerCase(),
    session_id: input.sessionId.toLowerCase(),
    factor_id: input.factorId.toLowerCase(),
    verified_at: new Date(now).toISOString(),
    expires_at: new Date(now + ttlMs).toISOString(),
    nonce: nonce.toLowerCase(),
  };
  const encodedPayload = encodePayload(payload);
  const signedValue = `${ATTESTATION_VERSION}.${encodedPayload}`;
  const signature = await crypto.subtle.sign(
    'HMAC',
    await hmacKey(input.secret),
    new TextEncoder().encode(signedValue),
  );
  return `${signedValue}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export async function verifyAdminMfaAttestation(input: {
  readonly attestation: string;
  readonly secret: string;
  readonly expectedUserId: string;
  readonly expectedSessionId: string;
  readonly now?: number;
}): Promise<AdminMfaAttestationClaims | null> {
  if (!usableSecret(input.secret)) return null;
  const [version, encodedPayload, encodedSignature, ...extra] =
    input.attestation.split('.');
  if (
    version !== ATTESTATION_VERSION ||
    !encodedPayload ||
    !encodedSignature ||
    extra.length > 0
  )
    return null;

  const signature = base64UrlDecode(encodedSignature);
  if (!signature) return null;
  const signatureBuffer = new ArrayBuffer(signature.byteLength);
  new Uint8Array(signatureBuffer).set(signature);
  const signedValue = `${version}.${encodedPayload}`;
  const validSignature = await crypto.subtle.verify(
    'HMAC',
    await hmacKey(input.secret),
    signatureBuffer,
    new TextEncoder().encode(signedValue),
  );
  if (!validSignature) return null;

  const payload = decodePayload(encodedPayload);
  if (!payload) return null;
  const verifiedAt = Date.parse(payload.verified_at);
  const expiresAt = Date.parse(payload.expires_at);
  const now = input.now ?? Date.now();
  if (
    payload.user_id !== input.expectedUserId.toLowerCase() ||
    payload.session_id !== input.expectedSessionId.toLowerCase() ||
    !Number.isFinite(verifiedAt) ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= now ||
    verifiedAt > now + MAX_CLOCK_SKEW_MS ||
    expiresAt <= verifiedAt ||
    expiresAt - verifiedAt > ADMIN_MFA_ATTESTATION_TTL_MS
  )
    return null;

  return {
    factorId: payload.factor_id,
    verifiedAt: payload.verified_at,
    nonce: payload.nonce,
  };
}
