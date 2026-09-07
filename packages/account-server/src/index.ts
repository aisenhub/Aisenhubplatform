import type {
  AuthSession,
  RecentAuthProof,
  SessionVerifier,
} from '@kit/account-auth';
import { createHmac, randomBytes } from 'node:crypto';

export interface Membership {
  readonly userId: string;
  readonly role: 'admin' | 'support';
  readonly active: boolean;
}

export interface AdminAuthorization {
  readonly session: AuthSession;
  readonly membership: Membership;
  readonly proof?: RecentAuthProof;
}

export type AuthorizationFailure =
  | 'UNAUTHORIZED'
  | 'ADMIN_REQUIRED'
  | 'AAL2_REQUIRED'
  | 'RECENT_MFA_REQUIRED';

export interface AuthorizationResult<T> {
  readonly ok: true;
  readonly value: T;
}

export interface AuthorizationError {
  readonly ok: false;
  readonly code: AuthorizationFailure;
}

export type AuthorizationOutcome<T> =
  | AuthorizationResult<T>
  | AuthorizationError;

export async function authorizeAdminRequest(input: {
  readonly accessToken: string;
  readonly verifier: SessionVerifier;
  readonly lookupMembership: (userId: string) => Promise<Membership | null>;
  readonly proof: RecentAuthProof | null;
  readonly sensitive: boolean;
  readonly now?: Date;
}): Promise<AuthorizationOutcome<AdminAuthorization>> {
  const sessionResult = await input.verifier.verifySession({
    accessToken: input.accessToken,
    now: input.now,
  });
  if (!sessionResult.ok) return { ok: false, code: 'UNAUTHORIZED' };
  const session = sessionResult.session;
  if (session.aal !== 'aal2') return { ok: false, code: 'AAL2_REQUIRED' };
  const membership = await input.lookupMembership(session.userId);
  if (!membership || !membership.active || membership.role !== 'admin')
    return { ok: false, code: 'ADMIN_REQUIRED' };
  if (input.sensitive) {
    const proofResult = input.verifier.verifyRecentAuth({
      proof: input.proof,
      session,
      now: input.now,
    });
    if (!proofResult.ok) return { ok: false, code: 'RECENT_MFA_REQUIRED' };
    return {
      ok: true,
      value: { session, membership, proof: proofResult.proof },
    };
  }
  return { ok: true, value: { session, membership } };
}

export async function authorizeAccountRequest(input: {
  readonly accessToken: string;
  readonly verifier: SessionVerifier;
  readonly expectedUserId?: string;
  readonly proof?: RecentAuthProof | null;
  readonly requiresRecentAuth?: boolean;
  readonly now?: Date;
}): Promise<AuthorizationOutcome<AuthSession>> {
  const result = await input.verifier.verifySession({
    accessToken: input.accessToken,
    expectedUserId: input.expectedUserId,
    now: input.now,
  });
  if (!result.ok) return { ok: false, code: 'UNAUTHORIZED' };
  if (input.requiresRecentAuth) {
    const proof = input.verifier.verifyRecentAuth({
      proof: input.proof ?? null,
      session: result.session,
      now: input.now,
    });
    if (!proof.ok) return { ok: false, code: 'RECENT_MFA_REQUIRED' };
  }
  return { ok: true, value: result.session };
}

export interface PlatformKeyMaterial {
  readonly keyId: string;
  readonly version: number;
  readonly presentedKey: string;
  readonly keyHmac: string;
  readonly keyPrefix: string;
  readonly keySuffix: string;
}

export function generatePlatformKeyMaterial(input: {
  readonly hmacSecret: string;
  readonly version: number;
  readonly platformId: string;
  readonly keyId?: string;
}): PlatformKeyMaterial {
  if (!input.hmacSecret || input.version < 1 || !input.platformId)
    throw new Error('INVALID_KEY_INPUT');
  const keyId = input.keyId ?? crypto.randomUUID();
  const raw = randomBytes(32).toString('base64url');
  const presentedKey = `phk_v${input.version}_${keyId}_${raw}`;
  const keyHmac = createHmac('sha256', input.hmacSecret)
    .update(`${input.version}:platform:${input.platformId}:${presentedKey}`)
    .digest('hex');
  return {
    keyId,
    version: input.version,
    presentedKey,
    keyHmac,
    keyPrefix: presentedKey.slice(0, 12),
    keySuffix: presentedKey.slice(-8),
  };
}

export function normalizeOrigin(value: string): string {
  const url = new URL(value);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('INVALID_ORIGIN');
  return url.origin;
}

export function validateCallbackUrl(value: string, origin: string): string {
  const normalizedOrigin = normalizeOrigin(origin);
  const callback = new URL(value);
  if (
    callback.origin !== normalizedOrigin ||
    callback.protocol !== new URL(normalizedOrigin).protocol
  )
    throw new Error('ORIGIN_MISMATCH');
  return callback.toString();
}
