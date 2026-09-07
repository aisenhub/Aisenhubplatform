import { describe, expect, it } from 'vitest';

import {
  failure,
  invalidRequest,
  isUuid,
  requireNonEmpty,
  requireUuid,
  success,
} from '../src/index.ts';

describe('domain contract boundary', () => {
  it('keeps results serializable and distinguishes success from business failure', () => {
    expect(success({ state: 'active' })).toEqual({
      ok: true,
      data: { state: 'active' },
    });
    expect(failure(invalidRequest('bad input'))).toEqual({
      ok: false,
      error: {
        code: 'invalid_request',
        status: 400,
        message: 'bad input',
      },
    });
  });

  it('validates UUID and non-empty boundary values without runtime-specific APIs', () => {
    expect(isUuid('00000000-0000-4000-8000-000000000000')).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(requireUuid('not-a-uuid', 'platform_id')?.code).toBe(
      'invalid_request',
    );
    expect(requireNonEmpty('   ', 'request_id')?.details).toEqual({
      field: 'request_id',
    });
    expect(requireNonEmpty('request-1', 'request_id')).toBeUndefined();
  });
});
