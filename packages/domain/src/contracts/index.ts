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
  UploadIntentDto,
} from './api.ts';
export { API_ERROR_CODES } from './api.ts';
export {
  BILLING_CONTRACT_VERSION,
  BILLING_CURRENCY,
  BILLING_PRODUCT_CODES,
  BILLING_PRODUCT_SPECS,
  PROVIDER_ADAPTER_CONTRACT_VERSION,
  getBillingProductSpec,
  isBillingProductCode,
  isFinalBillingSettlementState,
  isMoneyAmount,
  isProviderOrderSnapshot,
  toMoneyAmount,
} from './billing.ts';
export type {
  BillingCheckoutSnapshotDto,
  BillingDurationUnit,
  BillingOperationSource,
  BillingOperationVersionDto,
  BillingProductCode,
  BillingProductSpec,
  BillingProviderAdapter,
  BillingSettlementState,
  BillingTermKind,
  MoneyAmount,
  ProviderCheckoutRequestDto,
  ProviderCheckoutResultDto,
  ProviderOrderQueryDto,
  ProviderOrderResultDto,
  ProviderOrderSnapshotDto,
  ProviderOrderStatus,
  ProviderSkuItemDto,
} from './billing.ts';
