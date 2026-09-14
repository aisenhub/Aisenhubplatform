export type PlatformStatus = 'active' | 'disabled';

export type AccountStatus = 'active' | 'suspended' | 'closed';

export interface RequestContext {
  readonly requestId: string;
  readonly userId?: string;
  readonly sessionId?: string;
  readonly platformId?: string;
}

export interface Principal {
  readonly userId: string;
  readonly platformId: string;
  readonly platformStatus: PlatformStatus;
  readonly accountId?: string;
  readonly accountStatus?: AccountStatus;
  readonly authorization:
    | 'allowed'
    | 'not_activated'
    | 'suspended'
    | 'closed'
    | 'platform_disabled';
}

export type { DomainError, DomainErrorCode, DomainResult } from './errors.ts';
export { failure, invalidRequest, success } from './errors.ts';
export { isUuid, requireNonEmpty, requireUuid } from './validation.ts';
export type {
  AccountPrincipalDto,
  AccountSqlContext,
  ApiError,
  ApiErrorCode,
  ApiErrorResponse,
  ApiResponse,
  ConfigFileDto,
  ConfigFileListDto,
  DeleteRequestDto,
  ETag,
  EntitlementDto,
  JobSqlContext,
  AdminSqlContext,
  NoStoreHeaders,
  LogoutResultDto,
  Page,
  PlanDto,
  PreferencesDto,
  ProfileDto,
  RecentAuthProofDto,
  SubscriptionConfigDto,
  SubscriptionCheckoutDto,
  SubscriptionCheckoutStatus,
  SubscriptionProductDto,
  SubscriptionProductReason,
  UploadIntentDto,
} from './api.ts';
export {
  API_ERROR_CODES,
  SUBSCRIPTION_PRODUCT_REASONS,
  isSubscriptionProductDto,
  isSubscriptionProductList,
  isSubscriptionProductReason,
} from './api.ts';
export {
  BILLING_CONTRACT_VERSION,
  BILLING_CURRENCY,
  BILLING_ADMIN_ORDER_STATUSES,
  BILLING_CHECKOUT_STATUSES,
  BILLING_CHECKOUT_NEXT_ACTIONS,
  BILLING_CHECKOUT_PROGRESS_REASONS,
  BILLING_ENTITLEMENT_STATUSES,
  BILLING_ERROR_CODES,
  BILLING_JOB_STATES,
  BILLING_JOB_ERROR_CLASSES,
  BILLING_LINKAGE_STATUSES,
  BILLING_REQUEUEABLE_ERROR_CODES,
  BILLING_PRODUCT_CODES,
  BILLING_PRODUCT_SPECS,
  PROVIDER_ADAPTER_CONTRACT_VERSION,
  BILLING_RESOLUTION_STATUSES,
  BILLING_SETTLEMENT_KINDS,
  BILLING_SETTLEMENT_RECORD_STATES,
  BILLING_VERIFICATION_STATUSES,
  BILLING_WEBHOOK_PROCESSING_STATUSES,
  getBillingProductSpec,
  classifyBillingJobFailure,
  isBillingProductCode,
  isBillingCheckoutStatus,
  isBillingEntitlementStatus,
  isBillingJobState,
  isBillingLinkageStatus,
  isBillingResolutionStatus,
  isBillingSettlementRecordState,
  isBillingVerificationStatus,
  isBillingWebhookProcessingStatus,
  isFinalBillingSettlementState,
  isMoneyAmount,
  isProviderOrderSnapshot,
  isProviderOrderStatus,
  toMoneyAmount,
} from './billing.ts';
export type {
  BillingCheckoutSnapshotDto,
  BillingCheckoutNextAction,
  BillingCheckoutProgressDto,
  BillingCheckoutProgressReason,
  BillingJobErrorClass,
  BillingJobFailureClassification,
  BillingJobFailureState,
  BillingAdminOrderStatus,
  BillingCheckoutStatus,
  BillingOrderLinkageStatus,
  BillingOrderStatusProjectionDto,
  BillingDurationUnit,
  BillingEntitlementStatus,
  BillingErrorCode,
  BillingJobState,
  BillingOperationSource,
  BillingOperationVersionDto,
  BillingProductCode,
  BillingProductSpec,
  BillingProviderAdapter,
  BillingResolutionStatus,
  BillingSettlementKind,
  BillingSettlementRecordState,
  BillingSettlementState,
  BillingTermKind,
  BillingVerificationStatus,
  BillingWebhookProcessingStatus,
  MoneyAmount,
  ProviderCheckoutRequestDto,
  ProviderCheckoutResultDto,
  ProviderOrderQueryDto,
  ProviderOrderResultDto,
  ProviderOrderSnapshotDto,
  ProviderOrderStatus,
  ProviderSkuItemDto,
} from './billing.ts';
