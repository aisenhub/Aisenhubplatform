export const BILLING_PRODUCT_CODES = [
  'free',
  'monthly',
  'yearly',
  'lifetime',
] as const;
export type BillingProductCode = (typeof BILLING_PRODUCT_CODES)[number];

export const BILLING_CHECKOUT_STATUSES = [
  'pending',
  'expired',
  'paid',
  'verified',
  'granted',
  'review_required',
  'resolved',
] as const;
export type BillingCheckoutStatus = (typeof BILLING_CHECKOUT_STATUSES)[number];

export type SubscriptionProductReason =
  | 'ready'
  | 'free_plan_source'
  | 'free_plan_not_configured'
  | 'paid_plan_not_configured'
  | 'paid_plan_unavailable'
  | 'product_disabled'
  | 'provider_mapping_unavailable'
  | 'lifetime_already_purchased'
  | 'purchases_paused'
  | 'platform_disabled';

const SUBSCRIPTION_PRODUCT_REASONS = new Set<string>([
  'ready',
  'free_plan_source',
  'free_plan_not_configured',
  'paid_plan_not_configured',
  'paid_plan_unavailable',
  'product_disabled',
  'provider_mapping_unavailable',
  'lifetime_already_purchased',
  'purchases_paused',
  'platform_disabled',
]);
const BILLING_CHECKOUT_STATUS_SET = new Set<string>(BILLING_CHECKOUT_STATUSES);
const MONEY_AMOUNT = /^(?:0|[1-9][0-9]{0,12})\.[0-9]{2}$/u;

export interface SubscriptionProductDto {
  readonly code: BillingProductCode;
  readonly name: string;
  readonly description: string | null;
  readonly price: string;
  readonly currency: 'CNY';
  readonly term: {
    readonly kind: 'free' | 'finite';
    readonly duration_value: number | null;
    readonly duration_unit: 'month' | 'year' | null;
  };
  readonly price_version: number;
  readonly recommended: boolean;
  readonly enabled: boolean;
  readonly purchasable: boolean;
  readonly reason: SubscriptionProductReason;
}

export interface SubscriptionCheckoutDto {
  readonly checkout_id: string;
  readonly status: BillingCheckoutStatus;
  readonly product_code: Exclude<BillingProductCode, 'free'>;
  readonly price: string;
  readonly currency: 'CNY';
  readonly term: {
    readonly kind: 'finite';
    readonly duration_value: number;
    readonly duration_unit: 'month' | 'year';
  };
  readonly expires_at: string;
  readonly provider_display_name: string | null;
  readonly payment_url: string | null;
  readonly paid_at: string | null;
  readonly granted_at: string | null;
  readonly progress: Readonly<Record<string, unknown>>;
}

export interface EntitlementDto {
  readonly effective_status: 'active' | 'none' | 'suspended';
  readonly entitlement_kind: 'free' | 'term' | 'perpetual' | 'none';
  readonly plan: {
    readonly code: string;
    readonly name: string;
    readonly description?: string | null;
    readonly kind?: string;
    readonly features?: Readonly<Record<string, unknown>>;
  } | null;
  readonly subscription_product: {
    readonly code: BillingProductCode;
    readonly name: string;
  } | null;
  readonly features: Readonly<Record<string, unknown>>;
  readonly started_at: string | null;
  readonly current_period_end: string | null;
  readonly evaluated_at: string;
  readonly next_transition_at: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isBillingProductCode(
  value: unknown,
): value is BillingProductCode {
  return (
    typeof value === 'string' &&
    (BILLING_PRODUCT_CODES as readonly string[]).includes(value)
  );
}

export function isBillingCheckoutStatus(
  value: unknown,
): value is BillingCheckoutStatus {
  return typeof value === 'string' && BILLING_CHECKOUT_STATUS_SET.has(value);
}

export function isMoneyAmount(value: unknown): value is string {
  return typeof value === 'string' && MONEY_AMOUNT.test(value);
}

export function isSubscriptionProductList(
  value: unknown,
): value is readonly SubscriptionProductDto[] {
  if (!Array.isArray(value)) return false;
  return value.every((item) => {
    if (!isRecord(item) || !isRecord(item.term)) return false;
    const term = item.term;
    return (
      isBillingProductCode(item.code) &&
      typeof item.name === 'string' &&
      item.name.length > 0 &&
      (typeof item.description === 'string' || item.description === null) &&
      isMoneyAmount(item.price) &&
      item.currency === 'CNY' &&
      (term.kind === 'free' || term.kind === 'finite') &&
      (typeof term.duration_value === 'number' ||
        term.duration_value === null) &&
      (term.duration_unit === 'month' ||
        term.duration_unit === 'year' ||
        term.duration_unit === null) &&
      typeof item.price_version === 'number' &&
      Number.isSafeInteger(item.price_version) &&
      item.price_version > 0 &&
      typeof item.recommended === 'boolean' &&
      typeof item.enabled === 'boolean' &&
      typeof item.purchasable === 'boolean' &&
      typeof item.reason === 'string' &&
      SUBSCRIPTION_PRODUCT_REASONS.has(item.reason)
    );
  });
}
