import type {
  BillingCheckoutProgressDto,
  BillingCheckoutStatus,
} from './billing.ts';

export type {
  BillingCheckoutProgressDto,
  BillingCheckoutStatus,
} from './billing.ts';

export type ApiErrorCode =
  | 'INVALID_INPUT'
  | 'UPLOAD_SIZE_MISMATCH'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNAUTHORIZED'
  | 'PLATFORM_CREDENTIAL_INVALID'
  | 'SESSION_REVOKED'
  | 'PLATFORM_DISABLED'
  | 'ACCOUNT_SUSPENDED'
  | 'ACCOUNT_CLOSED'
  | 'ADMIN_REQUIRED'
  | 'MFA_REQUIRED'
  | 'RECENT_MFA_REQUIRED'
  | 'GLOBAL_DELETE_PENDING'
  | 'ACCOUNT_NOT_ACTIVATED'
  | 'ACTIVATION_DISABLED'
  | 'PURCHASES_PAUSED'
  | 'PLAN_CONFLICT'
  | 'ENTITLEMENT_PERPETUAL'
  | 'ENTITLEMENT_SUSPENDED'
  | 'IDEMPOTENCY_CONFLICT'
  | 'OPERATION_IN_PROGRESS'
  | 'FILE_BUSY'
  | 'FILE_CONTENT_CONFLICT'
  | 'FILE_NOT_DOWNLOADABLE'
  | 'REPLACEMENT_CAPACITY_REQUIRED'
  | 'CONFIG_SLOT_LIMIT_EXCEEDED'
  | 'PLATFORM_STORAGE_QUOTA_EXCEEDED'
  | 'VERSION_NOT_READY'
  | 'SUBMISSION_PENDING'
  | 'QUOTA_EXCEEDED'
  | 'CHECKOUT_UNAVAILABLE'
  | 'RESOURCE_NOT_FOUND'
  | 'INVALID_CODE'
  | 'CODE_EXPIRED'
  | 'UPLOAD_INTENT_EXPIRED'
  | 'CODE_DISABLED'
  | 'CODE_ALREADY_REDEEMED'
  | 'PRECONDITION_FAILED'
  | 'PRECONDITION_REQUIRED'
  | 'RATE_LIMITED'
  | 'AUTHORIZATION_UNAVAILABLE'
  | 'STORAGE_UNAVAILABLE';

export interface ApiError {
  readonly code: ApiErrorCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, string>>;
}

export interface ApiResponse<T> {
  readonly data: T;
  readonly request_id: string;
}

export interface ApiErrorResponse {
  readonly error: ApiError;
  readonly request_id: string;
}

export interface LogoutResultDto {
  readonly authenticated: false;
  readonly remote_revocation: 'confirmed' | 'not_required' | 'unavailable';
}

export interface Page<T> {
  readonly data: readonly T[];
  readonly next_cursor: string | null;
  readonly request_id: string;
}

export type ETag = string;

export interface AccountPrincipalDto {
  readonly user_id: string;
  readonly platform_id: string;
  readonly platform_account_id: string | null;
  readonly platform_status: 'active' | 'disabled';
  readonly account_status: 'active' | 'suspended' | 'closed' | 'not_activated';
}

export interface PlanDto {
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly kind: 'free' | 'paid';
  readonly features: Readonly<Record<string, unknown>>;
}

export type CommerceOfferReason =
  | 'ready'
  | 'platform_disabled'
  | 'purchases_paused'
  | 'plan_unavailable'
  | 'price_unavailable'
  | 'provider_mapping_unavailable';

export interface CommerceOfferDto {
  readonly offer_id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly plan: {
    readonly id: string;
    readonly code: string;
    readonly name: string;
  };
  readonly term: {
    readonly kind: 'finite';
    readonly duration_value: number;
    readonly duration_unit: 'day' | 'month' | 'year';
  };
  readonly price: {
    readonly id: string | null;
    readonly amount: string | null;
    readonly currency: 'CNY';
    readonly version: number | null;
  };
  readonly recommended: boolean;
  readonly purchasable: boolean;
  readonly reason: CommerceOfferReason;
}

export interface SubscriptionCheckoutDto {
  readonly checkout_id: string;
  readonly status: BillingCheckoutStatus;
  readonly offer_id: string;
  readonly offer_code: string;
  readonly plan_id: string;
  readonly plan_name: string;
  readonly price_version: number;
  readonly price: string;
  readonly currency: 'CNY';
  readonly term: {
    readonly kind: 'finite';
    readonly duration_value: number;
    readonly duration_unit: 'day' | 'month' | 'year';
  };
  readonly expires_at: string;
  readonly provider_display_name: string | null;
  readonly payment_url: string | null;
  readonly paid_at: string | null;
  readonly granted_at: string | null;
  readonly progress: BillingCheckoutProgressDto;
}

export interface EntitlementDto {
  readonly effective_status: 'active' | 'none' | 'suspended';
  readonly entitlement_kind: 'free' | 'term' | 'perpetual' | 'none';
  readonly plan: PlanDto | null;
  /** The concrete catalog product currently supplying this entitlement. */
  readonly subscription_product: {
    readonly code: 'free' | 'monthly' | 'yearly' | 'lifetime';
    readonly name: string;
  } | null;
  readonly features: Readonly<Record<string, unknown>>;
  readonly started_at: string | null;
  readonly current_period_end: string | null;
  readonly evaluated_at: string;
  readonly next_transition_at: string | null;
}

export interface ProfileDto {
  readonly display_name: string | null;
  readonly avatar_url: string | null;
  readonly bio: string | null;
  readonly locale: string | null;
  readonly timezone: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly row_version: number;
}

export interface PreferencesDto {
  readonly preferences: Readonly<Record<string, unknown>>;
  readonly row_version: number;
}

export interface UploadIntentDto {
  readonly file_id: string;
  readonly upload_path: string;
  readonly expires_at: string;
}

export interface ConfigFileDto {
  readonly file_id: string;
  readonly status: string;
  readonly write_outcome: string;
  readonly size: number;
  readonly content_type: string;
  readonly created_at: string;
  readonly reserved_bytes: number;
  readonly reserved_count: number;
  readonly actual_size_bytes: number | null;
  readonly original_name: string | null;
  readonly updated_at: string;
  readonly cancel_requested_at: string | null;
}

export interface ConfigFileListDto {
  readonly items: readonly ConfigFileDto[];
  readonly next_cursor: string | null;
}

export interface DeleteRequestDto {
  readonly request_id: string;
  readonly state: 'pending_admin';
}

export interface RecentAuthProofDto {
  readonly proof_id: string;
  readonly expires_at: string;
}

export interface AccountSqlContext {
  readonly user_id: string;
  readonly session_id: string;
  readonly platform_id: string;
  readonly platform_key_id: string;
  readonly request_id: string;
}

export interface AdminSqlContext {
  readonly admin_user_id: string;
  readonly session_id: string;
  readonly request_id: string;
}

export interface JobSqlContext {
  readonly job_id: string;
  readonly lease_owner: string;
  readonly fencing_token: bigint;
  readonly request_id: string;
}

export interface NoStoreHeaders {
  readonly 'Cache-Control': 'no-store';
  readonly 'X-Request-Id': string;
}

export const API_ERROR_CODES: readonly ApiErrorCode[] = [
  'INVALID_INPUT',
  'UPLOAD_SIZE_MISMATCH',
  'PAYLOAD_TOO_LARGE',
  'UNAUTHORIZED',
  'PLATFORM_CREDENTIAL_INVALID',
  'SESSION_REVOKED',
  'PLATFORM_DISABLED',
  'ACCOUNT_SUSPENDED',
  'ACCOUNT_CLOSED',
  'ADMIN_REQUIRED',
  'MFA_REQUIRED',
  'RECENT_MFA_REQUIRED',
  'GLOBAL_DELETE_PENDING',
  'ACCOUNT_NOT_ACTIVATED',
  'ACTIVATION_DISABLED',
  'PURCHASES_PAUSED',
  'PLAN_CONFLICT',
  'ENTITLEMENT_PERPETUAL',
  'ENTITLEMENT_SUSPENDED',
  'IDEMPOTENCY_CONFLICT',
  'OPERATION_IN_PROGRESS',
  'FILE_BUSY',
  'FILE_CONTENT_CONFLICT',
  'FILE_NOT_DOWNLOADABLE',
  'REPLACEMENT_CAPACITY_REQUIRED',
  'CONFIG_SLOT_LIMIT_EXCEEDED',
  'PLATFORM_STORAGE_QUOTA_EXCEEDED',
  'VERSION_NOT_READY',
  'SUBMISSION_PENDING',
  'QUOTA_EXCEEDED',
  'CHECKOUT_UNAVAILABLE',
  'RESOURCE_NOT_FOUND',
  'INVALID_CODE',
  'CODE_EXPIRED',
  'UPLOAD_INTENT_EXPIRED',
  'CODE_DISABLED',
  'CODE_ALREADY_REDEEMED',
  'PRECONDITION_FAILED',
  'PRECONDITION_REQUIRED',
  'RATE_LIMITED',
  'AUTHORIZATION_UNAVAILABLE',
  'STORAGE_UNAVAILABLE',
];
