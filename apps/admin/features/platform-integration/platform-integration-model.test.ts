import { describe, expect, it } from 'vitest';

import { derivePlatformIntegrationState } from './platform-integration-model';

const platform = {
  platform_id: '11111111-1111-4111-8111-111111111111',
  code: 'demo',
  name: 'Demo',
  status: 'active',
  allow_activation: true,
};

describe('platform integration model', () => {
  it('marks only central authoritative facts as automatically complete', () => {
    const state = derivePlatformIntegrationState({
      platform,
      origins: [
        {
          status: 'active',
          oauth_callback_url: 'https://demo.test/auth/callback',
          password_reset_url: 'https://demo.test/auth/reset',
          email_confirmation_url: 'https://demo.test/auth/confirm',
        },
      ],
      keys: [
        { status: 'active', deployment_confirmed_at: '2026-10-11T00:00:00Z' },
      ],
      subscription: null,
    });

    expect(state.centralReady).toBe(true);
    expect(state.percentage).toBe(100);
    expect(
      state.externalSteps.every((step) => step.status === 'external'),
    ).toBe(true);
    expect(state.commerceStep.status).toBe('optional');
  });

  it('does not treat unreadable facts as incomplete or successful', () => {
    const state = derivePlatformIntegrationState({ platform });

    expect(state.centralReady).toBe(false);
    expect(state.hasUnknownCentralFacts).toBe(true);
    expect(
      state.centralSteps.find((step) => step.key === 'origins')?.status,
    ).toBe('unknown');
    expect(state.centralSteps.find((step) => step.key === 'key')?.status).toBe(
      'unknown',
    );
  });

  it('requires an active key deployment confirmation separately from key creation', () => {
    const state = derivePlatformIntegrationState({
      platform,
      origins: [],
      keys: [{ status: 'active', deployment_confirmed_at: null }],
      subscription: null,
    });

    expect(state.centralSteps.find((step) => step.key === 'key')?.status).toBe(
      'complete',
    );
    expect(
      state.centralSteps.find((step) => step.key === 'deployment')?.status,
    ).toBe('incomplete');
    expect(state.nextStep?.key).toBe('origins');
  });

  it('treats paid catalog setup as optional rather than universal readiness', () => {
    const state = derivePlatformIntegrationState({
      platform,
      origins: [],
      keys: [],
      subscription: {
        paid_plan_id: '22222222-2222-4222-8222-222222222222',
        paid_plan_status: 'active',
        monthly_enabled: true,
        yearly_enabled: false,
        lifetime_enabled: false,
      },
    });

    expect(state.commerceStep.status).toBe('complete');
    expect(state.totalCentralSteps).toBe(4);
  });

  it('uses Offer Price and Provider Mapping readiness as the authoritative commerce fact', () => {
    const ready = derivePlatformIntegrationState({
      platform,
      origins: [],
      keys: [],
      subscription: null,
      offers: [
        { status: 'active', price_status: 'active', mapping_status: 'ready' },
      ],
    });
    expect(ready.commerceStep.status).toBe('complete');

    const notReady = derivePlatformIntegrationState({
      platform,
      origins: [],
      keys: [],
      subscription: {
        paid_plan_id: '22222222-2222-4222-8222-222222222222',
        paid_plan_status: 'active',
        monthly_enabled: true,
        yearly_enabled: true,
        lifetime_enabled: true,
      },
      offers: [
        { status: 'active', price_status: 'active', mapping_status: 'missing' },
      ],
    });
    expect(notReady.commerceStep.status).toBe('optional');
  });
});
