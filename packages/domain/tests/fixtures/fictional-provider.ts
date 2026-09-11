import type {
  BillingProviderAdapter,
  MoneyAmount,
  ProviderCheckoutRequestDto,
  ProviderCheckoutResultDto,
  ProviderOrderQueryDto,
  ProviderOrderResultDto,
  ProviderOrderSnapshotDto,
} from '../../src/index.ts';

const money = (value: string): MoneyAmount => value as MoneyAmount;

export const FICTIONAL_PROVIDER_ORDER: ProviderOrderSnapshotDto = {
  contract_version: 1,
  provider: 'fictional-provider',
  external_order_id: 'fictional-order-0001',
  external_user_id: 'fictional-user-0001',
  external_plan_id: 'fictional-yearly-plan',
  custom_order_id: 'AC_test_opaque_token_0001',
  status: 'paid',
  term_quantity: 1,
  term_unit: 'year',
  product_type: 'membership',
  sku_items: [{ external_sku_id: 'fictional-sku-yearly', quantity: 1 }],
  total_amount: money('19.90'),
  display_amount: money('19.90'),
  currency: 'CNY',
  observed_at: '2026-09-11T00:00:00.000Z',
};

export const FICTIONAL_PROVIDER_ADAPTER: BillingProviderAdapter = {
  provider: 'fictional-provider',
  contract_version: 1,
  async createCheckout(
    input: ProviderCheckoutRequestDto,
  ): Promise<ProviderCheckoutResultDto> {
    return {
      status: 'created',
      payment_url: `https://pay.example.invalid/${input.checkout_id}`,
      external_order_id: null,
    };
  },
  async queryOrder(
    input: ProviderOrderQueryDto,
  ): Promise<ProviderOrderResultDto> {
    return input.external_order_id ===
      FICTIONAL_PROVIDER_ORDER.external_order_id
      ? { status: 'found', order: FICTIONAL_PROVIDER_ORDER }
      : { status: 'not_found', order: null };
  },
};
