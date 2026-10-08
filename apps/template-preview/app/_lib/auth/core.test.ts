import { describe, expect, it } from 'vitest';

import { requireSafeReturnTo, safeReturnTo } from './core';

describe('reference consumer auth core', () => {
  it('accepts only local returnTo values without sensitive query material', () => {
    expect(safeReturnTo('/dashboard?tab=profile')).toBe(
      '/dashboard?tab=profile',
    );
    expect(safeReturnTo('https://evil.invalid')).toBe('/');
    expect(safeReturnTo('//evil.invalid')).toBe('/');
    expect(safeReturnTo('/update-password?access_token=secret')).toBe('/');
    expect(safeReturnTo('/reauth?code_verifier=secret')).toBe('/');
    expect(safeReturnTo('/callback?proof=secret')).toBe('/');
  });

  it('throws instead of silently accepting an unsafe explicit returnTo', () => {
    expect(() => requireSafeReturnTo('https://evil.invalid')).toThrow(
      'INVALID_RETURN_TO',
    );
    expect(() => requireSafeReturnTo('/callback?proof=secret')).toThrow(
      'INVALID_RETURN_TO',
    );
  });
});
