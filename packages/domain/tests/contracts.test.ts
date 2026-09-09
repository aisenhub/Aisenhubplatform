import { describe, expect, it } from 'vitest';

import {
  API_ERROR_CODES,
  failure,
  invalidRequest,
  isUuid,
  requireNonEmpty,
  requireUuid,
  success,
} from '../src/index.ts';
import type { EntitlementDto } from '../src/index.ts';

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

  it('keeps the stable API error vocabulary and entitlement null semantics', () => {
    expect(API_ERROR_CODES).toContain('RECENT_MFA_REQUIRED');
    expect(API_ERROR_CODES).toContain('ENTITLEMENT_PERPETUAL');
    expect(API_ERROR_CODES).toContain('STORAGE_UNAVAILABLE');

    const none: EntitlementDto = {
      effective_status: 'none',
      entitlement_kind: 'none',
      plan: null,
      features: {},
      started_at: null,
      current_period_end: null,
      evaluated_at: '2026-01-01T00:00:00Z',
      next_transition_at: null,
    };
    expect(
      JSON.parse(JSON.stringify({ data: none, request_id: 'request-1' })),
    ).toEqual({
      data: none,
      request_id: 'request-1',
    });
  });
});
