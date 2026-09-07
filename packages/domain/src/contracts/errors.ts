export type DomainErrorCode =
  | 'invalid_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'precondition_required'
  | 'precondition_failed'
  | 'temporarily_unavailable';

export interface DomainError {
  readonly code: DomainErrorCode;
  readonly status: 400 | 401 | 403 | 404 | 409 | 412 | 428 | 503;
  readonly message: string;
  readonly details?: Readonly<Record<string, string>>;
}

export type DomainResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: DomainError };

export function success<T>(data: T): DomainResult<T> {
  return { ok: true, data };
}

export function failure<T = never>(error: DomainError): DomainResult<T> {
  return { ok: false, error };
}

export function invalidRequest(
  message: string,
  details?: Readonly<Record<string, string>>,
): DomainError {
  return { code: 'invalid_request', status: 400, message, details };
}
