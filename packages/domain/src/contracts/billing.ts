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

/**
 * These values mirror the persisted billing state machines. Keep observation,
 * processing, and entitlement decisions separate: an unknown provider value
 * must never be coerced into a negative business result.
 */
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

export const BILLING_VERIFICATION_STATUSES = [
  'unverified',
  'verified',
  'rejected',
] as const;

export type BillingVerificationStatus =
  (typeof BILLING_VERIFICATION_STATUSES)[number];

export const BILLING_ENTITLEMENT_STATUSES = [
  'not_started',
  'blocked',
  'granted',
  'rejected',
] as const;

export type BillingEntitlementStatus =
  (typeof BILLING_ENTITLEMENT_STATUSES)[number];

export const BILLING_LINKAGE_STATUSES = [
  'unlinked',
  'linked',
  'ambiguous',
] as const;

export type BillingLinkageStatus = (typeof BILLING_LINKAGE_STATUSES)[number];

export const BILLING_RESOLUTION_STATUSES = ['open', 'resolved'] as const;

export type BillingResolutionStatus =
  (typeof BILLING_RESOLUTION_STATUSES)[number];

export const BILLING_WEBHOOK_PROCESSING_STATUSES = [
  'received',
  'queued',
  'processing',
  'processed',
  'retryable',
  'manual_review',
] as const;

export type BillingWebhookProcessingStatus =
  (typeof BILLING_WEBHOOK_PROCESSING_STATUSES)[number];

export const BILLING_JOB_STATES = [
  'pending',
  'processing',
  'retryable',
  'completed',
  'manual_review',
] as const;

export type BillingJobState = (typeof BILLING_JOB_STATES)[number];

/** State stored by billing_settlements.state. */
export const BILLING_SETTLEMENT_RECORD_STATES = [
  'retryable',
  'blocked',
  'review_required',
  'finalized',
] as const;

export type BillingSettlementRecordState =
  (typeof BILLING_SETTLEMENT_RECORD_STATES)[number];

export const BILLING_SETTLEMENT_KINDS = [
  'automatic',
  'manual',
  'correction',
] as const;

export type BillingSettlementKind = (typeof BILLING_SETTLEMENT_KINDS)[number];

export const BILLING_ERROR_CODES = [
  'INVALID_INPUT',
  'PROVIDER_NOT_PAID',
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_ORDER_NOT_FOUND',
  'PROVIDER_TIMEOUT',
  'PROVIDER_RATE_LIMITED',
  'PROVIDER_RESPONSE_INVALID',
  'CONTRACT_CONFLICT',
  'DUPLICATE_PAYMENT',
  'UNLINKED_ORDER',
  'PLAN_CONFLICT',
  'ALREADY_PERPETUAL',
  'ACCOUNT_NOT_ACTIVE',
  'PLAN_UNAVAILABLE',
  'FENCE_CONFLICT',
  'JOB_ORDER_CONFLICT',
  'RETRY_BUDGET_EXHAUSTED',
  'RESOURCE_NOT_FOUND',
] as const;

export type BillingErrorCode = (typeof BILLING_ERROR_CODES)[number];

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

const BILLING_CHECKOUT_STATUS_SET = new Set<string>(BILLING_CHECKOUT_STATUSES);
const BILLING_VERIFICATION_STATUS_SET = new Set<string>(
  BILLING_VERIFICATION_STATUSES,
);
const BILLING_ENTITLEMENT_STATUS_SET = new Set<string>(
  BILLING_ENTITLEMENT_STATUSES,
);
const BILLING_LINKAGE_STATUS_SET = new Set<string>(BILLING_LINKAGE_STATUSES);
const BILLING_RESOLUTION_STATUS_SET = new Set<string>(
  BILLING_RESOLUTION_STATUSES,
);
const BILLING_WEBHOOK_PROCESSING_STATUS_SET = new Set<string>(
  BILLING_WEBHOOK_PROCESSING_STATUSES,
);
const BILLING_JOB_STATE_SET = new Set<string>(BILLING_JOB_STATES);
const BILLING_SETTLEMENT_RECORD_STATE_SET = new Set<string>(
  BILLING_SETTLEMENT_RECORD_STATES,
);

export function isBillingCheckoutStatus(
  value: unknown,
): value is BillingCheckoutStatus {
  return typeof value === 'string' && BILLING_CHECKOUT_STATUS_SET.has(value);
}

export function isBillingVerificationStatus(
  value: unknown,
): value is BillingVerificationStatus {
  return (
    typeof value === 'string' && BILLING_VERIFICATION_STATUS_SET.has(value)
  );
}

export function isBillingEntitlementStatus(
  value: unknown,
): value is BillingEntitlementStatus {
  return typeof value === 'string' && BILLING_ENTITLEMENT_STATUS_SET.has(value);
}

export function isBillingLinkageStatus(
  value: unknown,
): value is BillingLinkageStatus {
  return typeof value === 'string' && BILLING_LINKAGE_STATUS_SET.has(value);
}

export function isBillingResolutionStatus(
  value: unknown,
): value is BillingResolutionStatus {
  return typeof value === 'string' && BILLING_RESOLUTION_STATUS_SET.has(value);
}

export function isBillingWebhookProcessingStatus(
  value: unknown,
): value is BillingWebhookProcessingStatus {
  return (
    typeof value === 'string' &&
    BILLING_WEBHOOK_PROCESSING_STATUS_SET.has(value)
  );
}

export function isBillingJobState(value: unknown): value is BillingJobState {
  return typeof value === 'string' && BILLING_JOB_STATE_SET.has(value);
}

export function isBillingSettlementRecordState(
  value: unknown,
): value is BillingSettlementRecordState {
  return (
    typeof value === 'string' && BILLING_SETTLEMENT_RECORD_STATE_SET.has(value)
  );
}

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

export type BillingOrderLinkageStatus = 'linked' | 'unlinked';

export const BILLING_ADMIN_ORDER_STATUSES = [
  'pending',
  'retryable',
  'manual_review',
  'finalized',
  'granted',
  'rejected',
  'unlinked',
] as const;

export type BillingAdminOrderStatus =
  (typeof BILLING_ADMIN_ORDER_STATUSES)[number];

/**
 * The order projection is intentionally a product of independent state
 * machines. Consumers must not infer settlement or entitlement from one
 * provider status field.
 */
export interface BillingOrderStatusProjectionDto {
  readonly provider_status: ProviderOrderStatus;
  readonly verification_status: BillingVerificationStatus;
  readonly entitlement_status: BillingEntitlementStatus;
  readonly linkage_status: BillingLinkageStatus;
  readonly resolution_status: BillingResolutionStatus;
  readonly settlement_state: BillingSettlementRecordState | null;
}

export const BILLING_JOB_ERROR_CLASSES = [
  'provider',
  'provider_contract',
  'billing_verification',
  'worker',
  'dead_letter',
] as const;

export type BillingJobErrorClass = (typeof BILLING_JOB_ERROR_CLASSES)[number];

export type BillingJobFailureState = 'retryable' | 'manual_review';

export interface BillingJobFailureClassification {
  readonly state: BillingJobFailureState;
  readonly error_class: BillingJobErrorClass;
  readonly error_code: string;
}

export const BILLING_REQUEUEABLE_ERROR_CODES = [
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_ORDER_NOT_FOUND',
  'PROVIDER_TIMEOUT',
  'PROVIDER_RATE_LIMITED',
  'PROVIDER_RESPONSE_INVALID',
  'RETRY_BUDGET_EXHAUSTED',
  'RATE_LIMITED',
] as const;

/**
 * Classify worker failures before they reach the fenced SQL write boundary.
 * Business conflicts and invalid provider contracts must be visible to an
 * operator; transient provider/worker faults may retry until SQL exhausts the
 * bounded retry cycle.
 */
export function classifyBillingJobFailure(
  value: unknown,
): BillingJobFailureClassification {
  const raw =
    typeof value === 'string'
      ? value
      : value instanceof Error
        ? value.message
        : 'WORKER_FAILURE';
  const errorCode = /^[A-Z0-9_.-]{1,128}$/u.test(raw) ? raw : 'WORKER_FAILURE';
  const normalized = errorCode.toUpperCase();

  if (
    normalized === 'PROVIDER_RESPONSE_INVALID' ||
    normalized === 'INVALID_PROVIDER_CONTRACT' ||
    normalized.includes('PROVIDER_CONTRACT')
  ) {
    return {
      state: 'manual_review',
      error_class: 'provider_contract',
      error_code: 'PROVIDER_RESPONSE_INVALID',
    };
  }
  if (
    normalized === 'DUPLICATE_PAYMENT' ||
    normalized === 'CONTRACT_CONFLICT' ||
    normalized === 'UNLINKED_ORDER' ||
    normalized === 'PLAN_CONFLICT' ||
    normalized === 'ACCOUNT_NOT_ACTIVE' ||
    normalized === 'PLAN_UNAVAILABLE' ||
    normalized === 'ALREADY_PERPETUAL' ||
    normalized === 'RESOURCE_NOT_FOUND'
  ) {
    return {
      state: 'manual_review',
      error_class: 'billing_verification',
      error_code: normalized,
    };
  }
  if (normalized.includes('FENCE_CONFLICT')) {
    return {
      state: 'retryable',
      error_class: 'worker',
      error_code: 'FENCE_CONFLICT',
    };
  }
  if (
    normalized === 'PROVIDER_RATE_LIMITED' ||
    normalized === 'RATE_LIMITED' ||
    normalized === 'HTTP_429'
  ) {
    return {
      state: 'retryable',
      error_class: 'provider',
      error_code: 'PROVIDER_RATE_LIMITED',
    };
  }
  if (
    normalized === 'PROVIDER_TIMEOUT' ||
    normalized === 'PROVIDER_UNAVAILABLE' ||
    normalized === 'PROVIDER_ORDER_NOT_FOUND'
  ) {
    return {
      state: 'retryable',
      error_class: 'provider',
      error_code: normalized as
        | 'PROVIDER_TIMEOUT'
        | 'PROVIDER_UNAVAILABLE'
        | 'PROVIDER_ORDER_NOT_FOUND',
    };
  }
  return {
    state: 'retryable',
    error_class: 'worker',
    error_code: normalized,
  };
}

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
