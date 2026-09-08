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
  | 'PLAN_CONFLICT'
  | 'ENTITLEMENT_PERPETUAL'
  | 'ENTITLEMENT_SUSPENDED'
  | 'IDEMPOTENCY_CONFLICT'
  | 'OPERATION_IN_PROGRESS'
  | 'FILE_BUSY'
  | 'FILE_CONTENT_CONFLICT'
  | 'REPLACEMENT_CAPACITY_REQUIRED'
  | 'QUOTA_EXCEEDED'
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

export interface RecentAuthProofDto {
  readonly proof_id: string;
  readonly expires_at: string;
}

export interface PlanDto {
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly kind: 'free' | 'paid';
  readonly features: Readonly<Record<string, unknown>>;
}

export interface EntitlementDto {
  readonly effective_status: 'active' | 'none' | 'suspended';
  readonly entitlement_kind: 'free' | 'term' | 'perpetual' | 'none';
  readonly plan: PlanDto | null;
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
  readonly size: number;
  readonly content_type: string;
  readonly created_at: string;
}

export interface DeleteRequestDto {
  readonly request_id: string;
  readonly state: 'pending_admin';
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
  'PLAN_CONFLICT',
  'ENTITLEMENT_PERPETUAL',
  'ENTITLEMENT_SUSPENDED',
  'IDEMPOTENCY_CONFLICT',
  'OPERATION_IN_PROGRESS',
  'FILE_BUSY',
  'FILE_CONTENT_CONFLICT',
  'REPLACEMENT_CAPACITY_REQUIRED',
  'QUOTA_EXCEEDED',
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
