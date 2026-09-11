export const BILLING_CONTRACT_VERSION = 1 as const;
export const PROVIDER_ADAPTER_CONTRACT_VERSION = 1 as const;
export const BILLING_CURRENCY = 'CNY' as const;

export const BILLING_PRODUCT_CODES = [
  'free',
  'monthly',
  'yearly',
  'lifetime',
] as const;

export type BillingProductCode = (typeof BILLING_PRODUCT_CODES)[number];

export type BillingTermKind = 'free' | 'finite';
export type BillingDurationUnit = 'month' | 'year';

export interface BillingProductSpec {
  readonly code: BillingProductCode;
  readonly term_kind: BillingTermKind;
  readonly duration_value: 1 | 99 | null;
  readonly duration_unit: BillingDurationUnit | null;
  readonly purchasable: boolean;
}

/**
 * The commercial catalog contract is deliberately independent from pricing.
 * Prices belong to a versioned catalog/provider mapping snapshot, not this
 * fixed term definition.
 */
export const BILLING_PRODUCT_SPECS: Readonly<
  Record<BillingProductCode, BillingProductSpec>
> = {
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
};

/** Monetary values are serialized decimal strings; floating point is not a contract. */
export type MoneyAmount = string & { readonly __money_amount: unique symbol };

const MONEY_AMOUNT = /^(?:0|[1-9][0-9]{0,12})\.[0-9]{2}$/u;
const CURRENCY_CODE = /^[A-Z]{3}$/u;
const PROVIDER_STATUS = new Set<ProviderOrderStatus>([
  'unknown',
  'pending',
  'paid',
  'failed',
]);

export function isBillingProductCode(
  value: unknown,
): value is BillingProductCode {
  return (
    typeof value === 'string' &&
    (BILLING_PRODUCT_CODES as readonly string[]).includes(value)
  );
}

export function getBillingProductSpec(
  value: string,
): BillingProductSpec | null {
  return isBillingProductCode(value) ? BILLING_PRODUCT_SPECS[value] : null;
}

export function isMoneyAmount(value: unknown): value is MoneyAmount {
  return typeof value === 'string' && MONEY_AMOUNT.test(value);
}

export function toMoneyAmount(value: string): MoneyAmount | null {
  return isMoneyAmount(value) ? value : null;
}

export type ProviderOrderStatus = 'unknown' | 'pending' | 'paid' | 'failed';

export interface ProviderSkuItemDto {
  readonly external_sku_id: string;
  readonly quantity: number;
}

/**
 * Provider data is an observation, not an entitlement decision. The central
 * ledger must validate this snapshot against the immutable checkout snapshot.
 */
export interface ProviderOrderSnapshotDto {
  readonly contract_version: typeof PROVIDER_ADAPTER_CONTRACT_VERSION;
  readonly provider: string;
  readonly external_order_id: string;
  readonly external_user_id: string | null;
  readonly external_plan_id: string | null;
  readonly custom_order_id: string | null;
  readonly status: ProviderOrderStatus;
  readonly term_quantity: number | null;
  readonly term_unit: BillingDurationUnit | null;
  readonly product_type: string | null;
  readonly sku_items: readonly ProviderSkuItemDto[];
  readonly total_amount: MoneyAmount;
  readonly display_amount: MoneyAmount;
  readonly currency: string;
  readonly observed_at: string;
}

export interface BillingCheckoutSnapshotDto {
  readonly contract_version: typeof BILLING_CONTRACT_VERSION;
  readonly checkout_id: string;
  readonly platform_id: string;
  readonly platform_account_id: string;
  readonly entitlement_plan_id: string;
  readonly product_code: Exclude<BillingProductCode, 'free'>;
  readonly term_kind: 'finite';
  readonly duration_value: 1 | 99;
  readonly duration_unit: BillingDurationUnit;
  readonly price_amount: MoneyAmount;
  readonly currency: string;
  readonly provider_mapping_version: number;
  readonly provider_product_id: string;
  readonly provider_sku_ids: readonly string[];
  readonly provider_sku_quantity: number;
  readonly custom_order_id: string;
}

export type BillingOperationSource =
  | 'checkout'
  | 'webhook'
  | 'query_order'
  | 'reconciliation'
  | 'correction';

export interface BillingOperationVersionDto {
  readonly operation_id: string;
  readonly source: BillingOperationSource;
  readonly contract_version: typeof BILLING_CONTRACT_VERSION;
  readonly provider_mapping_version: number | null;
}

/**
 * A missing Grant is not itself a final rejection. Retryable and manual states
 * remain actionable until an explicit final decision is recorded.
 */
export type BillingSettlementState =
  | 'pending'
  | 'retryable'
  | 'manual_review'
  | 'granted'
  | 'rejected';

export function isFinalBillingSettlementState(
  value: BillingSettlementState,
): value is 'granted' | 'rejected' {
  return value === 'granted' || value === 'rejected';
}

export interface ProviderCheckoutRequestDto {
  readonly contract_version: typeof PROVIDER_ADAPTER_CONTRACT_VERSION;
  readonly checkout_id: string;
  readonly custom_order_id: string;
  readonly external_product_id: string;
  readonly term_quantity: number;
  readonly term_unit: BillingDurationUnit;
  readonly quantity: number;
  readonly amount: MoneyAmount;
  readonly currency: string;
}

export interface ProviderCheckoutResultDto {
  readonly status: 'created' | 'already_exists' | 'temporarily_unavailable';
  readonly payment_url: string | null;
  readonly external_order_id: string | null;
}

export interface ProviderOrderQueryDto {
  readonly external_order_id: string;
}

export interface ProviderOrderResultDto {
  readonly status: 'found' | 'not_found' | 'temporarily_unavailable';
  readonly order: ProviderOrderSnapshotDto | null;
}

export interface BillingProviderAdapter {
  readonly provider: string;
  readonly contract_version: typeof PROVIDER_ADAPTER_CONTRACT_VERSION;
  createCheckout(
    input: ProviderCheckoutRequestDto,
  ): Promise<ProviderCheckoutResultDto>;
  queryOrder(input: ProviderOrderQueryDto): Promise<ProviderOrderResultDto>;
}

export function isProviderOrderSnapshot(
  value: unknown,
): value is ProviderOrderSnapshotDto {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const snapshot = value as Partial<ProviderOrderSnapshotDto>;
  const termQuantity = snapshot.term_quantity;
  if (
    snapshot.contract_version !== PROVIDER_ADAPTER_CONTRACT_VERSION ||
    typeof snapshot.provider !== 'string' ||
    snapshot.provider.length === 0 ||
    typeof snapshot.external_order_id !== 'string' ||
    snapshot.external_order_id.length === 0 ||
    (snapshot.external_user_id !== null &&
      typeof snapshot.external_user_id !== 'string') ||
    (snapshot.external_plan_id !== null &&
      typeof snapshot.external_plan_id !== 'string') ||
    (snapshot.custom_order_id !== null &&
      typeof snapshot.custom_order_id !== 'string') ||
    !PROVIDER_STATUS.has(snapshot.status as ProviderOrderStatus) ||
    termQuantity === undefined ||
    (termQuantity !== null &&
      (!Number.isSafeInteger(termQuantity) || termQuantity < 1)) ||
    (snapshot.term_unit !== null &&
      snapshot.term_unit !== 'month' &&
      snapshot.term_unit !== 'year') ||
    (snapshot.product_type !== null &&
      typeof snapshot.product_type !== 'string') ||
    !Array.isArray(snapshot.sku_items) ||
    !isMoneyAmount(snapshot.total_amount) ||
    !isMoneyAmount(snapshot.display_amount) ||
    typeof snapshot.currency !== 'string' ||
    !CURRENCY_CODE.test(snapshot.currency) ||
    typeof snapshot.observed_at !== 'string' ||
    Number.isNaN(Date.parse(snapshot.observed_at))
  )
    return false;

  return snapshot.sku_items.every(
    (item) =>
      Boolean(item) &&
      typeof item.external_sku_id === 'string' &&
      item.external_sku_id.length > 0 &&
      Number.isSafeInteger(item.quantity) &&
      item.quantity > 0,
  );
}
