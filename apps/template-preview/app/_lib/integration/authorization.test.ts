import { describe, expect, it } from 'vitest';

import type { EntitlementDto } from './account-contract';
import { authorizeProtectedFeature } from './authorization';

function entitlement(
  overrides: Partial<EntitlementDto> = {},
): EntitlementDto {
  return {
    effective_status: 'active',
    entitlement_kind: 'term',
    plan: { code: 'pro', name: 'Pro' },
    subscription_product: { code: 'monthly', name: 'Monthly' },
    features: { advanced_config: true },
    started_at: '2026-10-01T00:00:00Z',
    current_period_end: '2026-11-01T00:00:00Z',
    evaluated_at: '2026-10-08T00:00:00Z',
    next_transition_at: null,
    ...overrides,
  };
}

describe('reference consumer protected feature authorization', () => {
  it('allows only an active entitlement with the requested feature', async () => {
    await expect(
      authorizeProtectedFeature({
        getSubscription: async () => entitlement(),
        feature: 'advanced_config',
      }),
    ).resolves.toMatchObject({ ok: true });
  });

  it('fails closed for suspended or missing feature access', async () => {
    await expect(
      authorizeProtectedFeature({
        getSubscription: async () => entitlement({ effective_status: 'suspended' }),
        feature: 'advanced_config',
      }),
    ).resolves.toEqual({
      ok: false,
      code: 'ACCOUNT_SUSPENDED',
      requestId: null,
    });
    await expect(
      authorizeProtectedFeature({
        getSubscription: async () => entitlement({ features: {} }),
        feature: 'advanced_config',
      }),
    ).resolves.toEqual({
      ok: false,
      code: 'ENTITLEMENT_REQUIRED',
      requestId: null,
    });
  });

  it('never converts upstream failure into free or authorized access', async () => {
    const failure = Object.assign(new Error('upstream unavailable'), {
      requestId: '00000000-0000-4000-8000-000000000001',
    });
    await expect(
      authorizeProtectedFeature({
        getSubscription: async () => {
          throw failure;
        },
        feature: 'advanced_config',
      }),
    ).resolves.toEqual({
      ok: false,
      code: 'AUTHORIZATION_UNAVAILABLE',
      requestId: '00000000-0000-4000-8000-000000000001',
    });
  });
});
