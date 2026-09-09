export type AuthProvider = 'password' | 'google' | 'github' | 'oidc';

export interface AuthSession {
  readonly userId: string;
  readonly sessionId: string;
  readonly expiresAt: string;
  readonly aal: 'aal1' | 'aal2';
  readonly authenticatedAt: string;
}

export interface RecentAuthProof {
  readonly proofId: string;
  readonly userId: string;
  readonly sessionId: string;
  readonly factorId: string;
  readonly authenticatedAt: string;
  readonly expiresAt: string;
}

export type AuthIntent =
  | {
      readonly kind: 'password';
      readonly email: string;
      readonly returnTo: string;
    }
  | {
      readonly kind: 'provider';
      readonly provider: AuthProvider;
      readonly returnTo: string;
    }
  | {
      readonly kind: 'link_identity';
      readonly provider: AuthProvider;
      readonly returnTo: string;
    };

export interface AuthError {
  readonly code:
    | 'INVALID_RETURN_TO'
    | 'SESSION_MISSING'
    | 'SESSION_REVOKED'
    | 'SESSION_EXPIRED'
    | 'PROOF_MISSING'
    | 'PROOF_EXPIRED'
    | 'PROOF_SESSION_MISMATCH'
    | 'ADMIN_REQUIRED'
    | 'AAL2_REQUIRED';
  readonly message: string;
}

export interface SessionVerifier {
  readonly verifySession: (input: {
    readonly accessToken: string;
    readonly expectedUserId?: string;
    readonly now?: Date;
  }) => Promise<
    | { readonly ok: true; readonly session: AuthSession }
    | { readonly ok: false; readonly error: AuthError }
  >;
  readonly verifyRecentAuth: (input: {
    readonly proof: RecentAuthProof | null;
    readonly session: AuthSession;
    readonly now?: Date;
  }) =>
    | { readonly ok: true; readonly proof: RecentAuthProof }
    | { readonly ok: false; readonly error: AuthError };
}

export const DEFAULT_RETURN_TO = '/';

export function safeReturnTo(value: string | null | undefined): string {
  const hasControlCharacter =
    value !== undefined &&
    value !== null &&
    [...value].some((character) => (character.codePointAt(0) ?? 0) < 0x20);
  if (
    !value ||
    value.length > 2048 ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    hasControlCharacter
  ) {
    return DEFAULT_RETURN_TO;
  }
  return value;
}

export function requireSafeReturnTo(value: string | null | undefined): string {
  const result = safeReturnTo(value);
  if (value !== undefined && value !== null && value !== result) {
    throw new Error('INVALID_RETURN_TO');
  }
  return result;
}

export function createPasswordIntent(
  email: string,
  returnTo?: string,
): AuthIntent {
  return {
    kind: 'password',
    email: email.trim(),
    returnTo: requireSafeReturnTo(returnTo),
  };
}

export function createProviderIntent(
  provider: AuthProvider,
  returnTo?: string,
): AuthIntent {
  if (provider === 'password') throw new Error('INVALID_PROVIDER');
  return {
    kind: 'provider',
    provider,
    returnTo: requireSafeReturnTo(returnTo),
  };
}

export function createLinkIdentityIntent(
  provider: AuthProvider,
  returnTo?: string,
): AuthIntent {
  if (provider === 'password') throw new Error('INVALID_PROVIDER');
  return {
    kind: 'link_identity',
    provider,
    returnTo: requireSafeReturnTo(returnTo),
  };
}

export function createSessionVerifier(dependencies: {
  readonly lookup: (accessToken: string) => Promise<AuthSession | null>;
  readonly isRevoked?: (sessionId: string) => Promise<boolean>;
  readonly clock?: () => Date;
}): SessionVerifier {
  const clock = dependencies.clock ?? (() => new Date());
  return {
    async verifySession({ accessToken, expectedUserId, now = clock() }) {
      if (!accessToken)
        return {
          ok: false,
          error: {
            code: 'SESSION_MISSING',
            message: 'A user session is required.',
          },
        };
      const session = await dependencies.lookup(accessToken);
      if (!session)
        return {
          ok: false,
          error: {
            code: 'SESSION_REVOKED',
            message: 'The user session is not valid.',
          },
        };
      if (expectedUserId && expectedUserId !== session.userId)
        return {
          ok: false,
          error: {
            code: 'SESSION_REVOKED',
            message: 'The user session is not valid.',
          },
        };
      if (Date.parse(session.expiresAt) <= now.getTime())
        return {
          ok: false,
          error: {
            code: 'SESSION_EXPIRED',
            message: 'The user session has expired.',
          },
        };
      if (
        dependencies.isRevoked &&
        (await dependencies.isRevoked(session.sessionId))
      )
        return {
          ok: false,
          error: {
            code: 'SESSION_REVOKED',
            message: 'The user session is not valid.',
          },
        };
      return { ok: true, session };
    },
    verifyRecentAuth({ proof, session, now = clock() }) {
      if (!proof)
        return {
          ok: false,
          error: {
            code: 'PROOF_MISSING',
            message: 'Recent authentication is required.',
          },
        };
      if (
        proof.userId !== session.userId ||
        proof.sessionId !== session.sessionId
      )
        return {
          ok: false,
          error: {
            code: 'PROOF_SESSION_MISMATCH',
            message: 'Recent authentication is bound to another session.',
          },
        };
      if (Date.parse(proof.expiresAt) <= now.getTime())
        return {
          ok: false,
          error: {
            code: 'PROOF_EXPIRED',
            message: 'Recent authentication has expired.',
          },
        };
      if (Date.parse(proof.authenticatedAt) > now.getTime())
        return {
          ok: false,
          error: {
            code: 'PROOF_EXPIRED',
            message: 'Recent authentication is not valid yet.',
          },
        };
      if (
        Date.parse(proof.expiresAt) - Date.parse(proof.authenticatedAt) >
        5 * 60 * 1000
      )
        return {
          ok: false,
          error: {
            code: 'PROOF_EXPIRED',
            message: 'Recent authentication exceeds the five-minute limit.',
          },
        };
      return { ok: true, proof };
    },
  };
}
