export type SessionState =
  | 'unauthenticated'
  | 'authenticating'
  | 'authenticated'
  | 'refreshing'
  | 'mfa_required'
  | 'expired';

export type SessionStepUp =
  | 'admin_mfa'
  | 'admin_recent_mfa'
  | 'consumer_recent_auth';

export interface SessionSnapshot {
  readonly state: SessionState;
  readonly resolved: boolean;
  readonly stepUp: SessionStepUp | null;
}

export type ReplayPolicy = 'never' | 'safe-read' | 'idempotent-mutation';

export const DEFAULT_RETURN_TO = '/';

function containsSensitiveReturnTo(value: string): boolean {
  try {
    const url = new URL(value, 'https://return-to.invalid');
    const sensitive =
      /(?:access|refresh)?_?token|csrf|proof|otp|secret|password|mutation|body|code_verifier|state/iu;
    return [...url.searchParams.keys()].some((key) => sensitive.test(key));
  } catch {
    return true;
  }
}

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
    hasControlCharacter ||
    containsSensitiveReturnTo(value)
  ) {
    return DEFAULT_RETURN_TO;
  }
  return value;
}

export function requireSafeReturnTo(value: string | null | undefined): string {
  const result = safeReturnTo(value);
  if (value !== undefined && value !== null && value !== result)
    throw new Error('INVALID_RETURN_TO');
  return result;
}
