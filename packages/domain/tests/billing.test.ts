import { describe, expect, it } from 'vitest';

import {
  BILLING_CHECKOUT_STATUSES,
  BILLING_JOB_STATES,
  BILLING_SETTLEMENT_RECORD_STATES,
  BILLING_PRODUCT_SPECS,
  classifyBillingJobFailure,
  getBillingProductSpec,
  isBillingCheckoutStatus,
  isBillingJobState,
  isBillingSettlementRecordState,
  isBillingVerificationStatus,
  isFinalBillingSettlementState,
  isMoneyAmount,
  isProviderOrderStatus,
  isProviderOrderSnapshot,
  isSubscriptionProductDto,
  isSubscriptionProductList,
  toMoneyAmount,
} from '../src/index.ts';
import {
  FICTIONAL_PROVIDER_ADAPTER,
  FICTIONAL_PROVIDER_ORDER,
} from './fixtures/fictional-provider.ts';
import {
  formatRedemptionCode,
  generateRedemptionCodes,
  normalizeRedemptionCode,
  validateRedemptionCode,
} from '../src/redemption.ts';

describe('billing contract foundation', () => {
  it('keeps independent persisted state machines explicit and fail-closed', () => {
    expect(BILLING_CHECKOUT_STATUSES).toEqual([
      'pending',
      'expired',
      'paid',
      'verified',
      'granted',
      'review_required',
      'resolved',
    ]);
    expect(BILLING_JOB_STATES).toContain('manual_review');
    expect(BILLING_SETTLEMENT_RECORD_STATES).toEqual([
      'retryable',
      'blocked',
      'review_required',
      'finalized',
    ]);
    expect(isBillingCheckoutStatus('active')).toBe(false);
    expect(isBillingCheckoutStatus('paid')).toBe(true);
    expect(isBillingVerificationStatus('unknown')).toBe(false);
    expect(isBillingVerificationStatus('verified')).toBe(true);
    expect(isBillingJobState('failed')).toBe(false);
    expect(isBillingJobState('retryable')).toBe(true);
    expect(isBillingSettlementRecordState('granted')).toBe(false);
    expect(isBillingSettlementRecordState('finalized')).toBe(true);
    expect(isProviderOrderStatus('paid')).toBe(true);
    expect(isProviderOrderStatus('active')).toBe(false);
  });

  it('freezes the four product terms without embedding prices', () => {
    expect(BILLING_PRODUCT_SPECS).toEqual({
      free: {
        code: 'free',
        term_kind: 'free',
        duration_value: null,
        duration_unit: null,
        purchasable: false,
      },
      monthly: {
        code: 'monthly',
        term_kind: 'finite',
        duration_value: 1,
        duration_unit: 'month',
        purchasable: true,
      },
      yearly: {
        code: 'yearly',
        term_kind: 'finite',
        duration_value: 1,
        duration_unit: 'year',
        purchasable: true,
      },
      lifetime: {
        code: 'lifetime',
        term_kind: 'finite',
        duration_value: 99,
        duration_unit: 'year',
        purchasable: true,
      },
    });
    expect(getBillingProductSpec('unknown')).toBeNull();
  });

  it('validates the product DTO before consumers render or act on it', () => {
    const product = {
      code: 'monthly',
      name: 'Monthly',
      description: null,
      price: '19.90',
      currency: 'CNY',
      term: { kind: 'finite', duration_value: 1, duration_unit: 'month' },
      price_version: 1,
      recommended: false,
      enabled: true,
      purchasable: true,
      reason: 'ready',
    } as const;

    expect(isSubscriptionProductDto(product)).toBe(true);
    expect(isSubscriptionProductList([product])).toBe(true);
    expect(isSubscriptionProductDto({ ...product, price: '19.9' })).toBe(false);
    expect(
      isSubscriptionProductDto({
        ...product,
        term: { kind: 'finite', duration_value: 1, duration_unit: 'year' },
      }),
    ).toBe(false);
    expect(isSubscriptionProductList([product, { malformed: true }])).toBe(
      false,
    );
  });

  it('accepts fixed-point money strings and rejects floating-point ambiguity', () => {
    expect(isMoneyAmount('0.00')).toBe(true);
    expect(isMoneyAmount('9999999999999.99')).toBe(true);
    expect(isMoneyAmount('5')).toBe(false);
    expect(isMoneyAmount('5.0')).toBe(false);
    expect(isMoneyAmount('01.00')).toBe(false);
    expect(isMoneyAmount('-1.00')).toBe(false);
    expect(isMoneyAmount('1e2')).toBe(false);
  });

  it('keeps provider observations separate from settlement decisions', async () => {
    expect(isProviderOrderSnapshot(FICTIONAL_PROVIDER_ORDER)).toBe(true);
    expect(
      isProviderOrderSnapshot({
        ...FICTIONAL_PROVIDER_ORDER,
        total_amount: '19.9',
      }),
    ).toBe(false);
    expect(isFinalBillingSettlementState('pending')).toBe(false);
    expect(isFinalBillingSettlementState('manual_review')).toBe(false);
    expect(isFinalBillingSettlementState('granted')).toBe(true);

    const checkout = await FICTIONAL_PROVIDER_ADAPTER.createCheckout({
      contract_version: 1,
      checkout_id: '00000000-0000-4000-8000-000000000001',
      custom_order_id: 'AC_test_opaque_token_0001',
      external_product_id: 'fictional-yearly-plan',
      term_quantity: 1,
      term_unit: 'year',
      quantity: 1,
      amount: toMoneyAmount('19.90')!,
      currency: 'CNY',
    });
    expect(checkout.status).toBe('created');
    await expect(
      FICTIONAL_PROVIDER_ADAPTER.queryOrder({
        external_order_id: 'fictional-order-0001',
      }),
    ).resolves.toEqual({ status: 'found', order: FICTIONAL_PROVIDER_ORDER });
  });

  it('classifies transient, contract, and business job failures separately', () => {
    expect(classifyBillingJobFailure('PROVIDER_TIMEOUT')).toEqual({
      state: 'retryable',
      error_class: 'provider',
      error_code: 'PROVIDER_TIMEOUT',
    });
    expect(classifyBillingJobFailure('HTTP_429')).toEqual({
      state: 'retryable',
      error_class: 'provider',
      error_code: 'PROVIDER_RATE_LIMITED',
    });
    expect(classifyBillingJobFailure('PROVIDER_RESPONSE_INVALID')).toEqual({
      state: 'manual_review',
      error_class: 'provider_contract',
      error_code: 'PROVIDER_RESPONSE_INVALID',
    });
    expect(classifyBillingJobFailure('CONTRACT_CONFLICT')).toEqual({
      state: 'manual_review',
      error_class: 'billing_verification',
      error_code: 'CONTRACT_CONFLICT',
    });
  });

  it('normalizes and formats V2 codes without changing their HMAC material', () => {
    const code = 'ABCD-EFGH-JKMP-QRST';
    expect(normalizeRedemptionCode(code)).toBe('ABCDEFGHJKMPQRST');
    expect(formatRedemptionCode('abcdefghjkmpqrst')).toBe(code);
    expect(validateRedemptionCode('ABCD EFGH JKMP QRST')).toBe(true);
    expect(validateRedemptionCode('ABCD-I0GH-JKMP-QRST')).toBe(false);
    expect(validateRedemptionCode('ABCD-EFGH')).toBe(false);
    expect(() => normalizeRedemptionCode('ABCD/EFGH/JKMP/QRST')).toThrow(
      'INVALID_REDEMPTION_CODE',
    );
  });

  it('uses the 31-character default while retaining legacy length bounds', async () => {
    const [current] = await generateRedemptionCodes({
      platformId: '00000000-0000-4000-8000-000000000701',
      hmacSecret: 'a-local-test-secret-with-16-chars',
      hmacKeyVersion: 1,
      quantity: 1,
    });
    const [legacyShort] = await generateRedemptionCodes({
      platformId: '00000000-0000-4000-8000-000000000701',
      hmacSecret: 'a-local-test-secret-with-16-chars',
      hmacKeyVersion: 1,
      quantity: 1,
      length: 16,
    });
    const [legacyLong] = await generateRedemptionCodes({
      platformId: '00000000-0000-4000-8000-000000000701',
      hmacSecret: 'a-local-test-secret-with-16-chars',
      hmacKeyVersion: 1,
      quantity: 1,
      length: 128,
    });
    expect(current?.code).toHaveLength(31);
    expect(legacyShort?.code).toHaveLength(16);
    expect(legacyLong?.code).toHaveLength(128);
    expect(validateRedemptionCode(legacyShort?.code)).toBe(true);
    expect(validateRedemptionCode(legacyLong?.code)).toBe(true);
  });
});
