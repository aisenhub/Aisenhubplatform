import type { DomainError } from './errors.ts';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function requireUuid(
  value: string,
  field: string,
): DomainError | undefined {
  if (!isUuid(value)) {
    return {
      code: 'invalid_request',
      status: 400,
      message: `${field} must be a UUID`,
      details: { field },
    };
  }

  return undefined;
}

export function requireNonEmpty(
  value: string,
  field: string,
): DomainError | undefined {
  if (value.trim().length === 0) {
    return {
      code: 'invalid_request',
      status: 400,
      message: `${field} must not be empty`,
      details: { field },
    };
  }

  return undefined;
}
