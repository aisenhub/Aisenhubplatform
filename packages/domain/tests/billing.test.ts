import { describe, expect, it } from 'vitest';

import {
  BILLING_PRODUCT_SPECS,
  getBillingProductSpec,
  isFinalBillingSettlementState,
  isMoneyAmount,
  isProviderOrderSnapshot,
  toMoneyAmount,
} from '../src/index.ts';
import {
  FICTIONAL_PROVIDER_ADAPTER,
  FICTIONAL_PROVIDER_ORDER,
} from './fixtures/fictional-provider.ts';
import {
  formatRedemptionCode,
  normalizeRedemptionCode,
  validateRedemptionCode,
} from '../src/redemption.ts';

describe('billing contract foundation', () => {
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
});
