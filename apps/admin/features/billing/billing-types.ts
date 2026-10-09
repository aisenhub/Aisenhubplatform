import type { StatusTone } from '@kit/ui/status-badge';

export type BillingOrder = {
  order_id: string;
  platform_id: string | null;
  platform_account_id: string | null;
  checkout_intent_id: string | null;
  provider: string;
  provider_order_no: string;
  provider_status: string;
  verification_status: string;
  entitlement_status: string;
  linkage_status: string;
  resolution_status: string;
  settlement_state: string | null;
  settlement_kind: string | null;
  decision_code: string | null;
  admin_version: number;
  created_at: string;
  updated_at: string;
};

export type BillingOrderDetail = BillingOrder & {
  provider_facts: Record<string, unknown>;
  verification_reason: string | null;
  resolution_reason: string | null;
  open_job_count: number;
  total_amount: string | null;
  show_amount: string | null;
  currency: string | null;
  timeline: BillingTimelineEvent[];
};

export type BillingTimelineEvent = {
  source: string;
  event_type: string;
  event_at: string;
  provider_event_at: string | null;
  received_at: string | null;
  status: string | null;
  state: string | null;
  code: string | null;
  details: Record<string, unknown>;
};

export type BillingMetrics = {
  observed_at: string;
  pending_count: number;
  processing_count: number;
  retryable_count: number;
  completed_count: number;
  manual_review_count: number;
  duplicate_payment_count: number;
  oldest_pending_age_seconds: number | null;
  oldest_processing_age_seconds: number | null;
  expired_lease_count: number;
  retry_attempts_total: number;
  retry_budget_exhausted_count: number;
  refund_mismatch_count: number;
  discovery_last_success_at: string | null;
  processing_last_success_at: string | null;
  discovery_lag_seconds: number | null;
  processing_lag_seconds: number | null;
  scheduler_last_accepted_at: string | null;
  scheduler_last_completed_at: string | null;
  scheduler_failure_count: number;
  active_alert_count: number;
  pending_alert_delivery_count: number;
  alert_threshold_source: 'local_default' | 'configured';
  alerts: Array<{
    alert_id: string;
    alert_key: string;
    severity: 'warning' | 'high' | 'critical';
    status: 'active' | 'recovered';
    occurrence_count: number;
    delivery_status: 'pending' | 'delivered' | 'failed';
    delivery_attempts: number;
    last_delivery_error?: string | null;
    details: Record<string, unknown>;
  }>;
};

export type BillingPlatformOption = {
  platform_id: string;
  code: string;
  name: string;
  status: string;
};

export type BillingFilters = {
  query: string;
  status: string;
  platformId: string;
  platformAccountId: string;
  providerAccountId: string;
};

export const EMPTY_BILLING_FILTERS: BillingFilters = {
  query: '',
  status: '',
  platformId: '',
  platformAccountId: '',
  providerAccountId: '',
};

export const BILLING_FILTER_STATUSES = [
  'pending',
  'retryable',
  'manual_review',
  'finalized',
  'granted',
  'rejected',
  'unlinked',
] as const;

type SearchParamsReader = {
  get(name: string): string | null;
};

export function billingFiltersFromSearchParams(
  searchParams: SearchParamsReader,
): BillingFilters {
  const status = searchParams.get('status') ?? '';
  return {
    query: searchParams.get('q') ?? '',
    status: (BILLING_FILTER_STATUSES as readonly string[]).includes(status)
      ? status
      : '',
    platformId: searchParams.get('platform') ?? '',
    platformAccountId: searchParams.get('platform_account') ?? '',
    providerAccountId: searchParams.get('provider_account') ?? '',
  };
}

export function billingFiltersToSearchParams(
  filters: BillingFilters,
  selectedOrderId?: string | null,
): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.query) params.set('q', filters.query);
  if (filters.status) params.set('status', filters.status);
  if (filters.platformId) params.set('platform', filters.platformId);
  if (filters.platformAccountId)
    params.set('platform_account', filters.platformAccountId);
  if (filters.providerAccountId)
    params.set('provider_account', filters.providerAccountId);
  if (selectedOrderId) params.set('selected', selectedOrderId);
  return params;
}

export function billingOrderApiSearchParams(input: {
  filters: BillingFilters;
  lockedPlatformId?: string;
  cursor?: string | null;
  limit?: number;
}): URLSearchParams {
  const params = new URLSearchParams({ limit: String(input.limit ?? 50) });
  const { filters } = input;
  if (filters.query) params.set('q', filters.query);
  if (filters.status) params.set('status', filters.status);
  const platformId = input.lockedPlatformId ?? filters.platformId;
  if (platformId) params.set('platform_id', platformId);
  if (filters.platformAccountId)
    params.set('platform_account_id', filters.platformAccountId);
  if (filters.providerAccountId)
    params.set('provider_account_id', filters.providerAccountId);
  if (input.cursor) params.set('cursor', input.cursor);
  return params;
}

export type ResolutionDecision =
  | 'refund_confirmed'
  | 'closed_anomaly'
  | 'manual_correction';

export function billingTone(value: string | null): StatusTone {
  if (value === 'granted' || value === 'finalized') return 'success';
  if (value === 'manual_review' || value === 'review_required')
    return 'warning';
  if (value === 'retryable' || value === 'pending') return 'info';
  if (value === 'rejected' || value === 'blocked') return 'danger';
  return 'unknown';
}

export function formatDate(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString('zh-CN') : '—';
}

export function timelineSourceLabel(source: string): string {
  return (
    {
      billing_order: '订单',
      checkout: 'Checkout',
      provider_webhook: 'Provider Webhook',
      processing_job: '后台任务',
      provider_observation: 'Provider 观测',
      settlement: '中央结算',
      entitlement: '权益账本',
      entitlement_correction: '权益修正',
      admin_audit: '后台审计',
    }[source] ?? source
  );
}

export function timelineSummary(event: BillingTimelineEvent): string {
  const summary = [event.status, event.state, event.code].filter(Boolean);
  const reason = event.details.reason;
  if (typeof reason === 'string' && reason) summary.push(`原因：${reason}`);
  const health = event.details.health ?? event.details.job_health;
  if (health === 'lost') summary.unshift('失联');
  else if (health === 'active') summary.unshift('租约有效');
  const attempts = event.details.attempts;
  const maxAttempts = event.details.max_attempts;
  if (typeof attempts === 'number') {
    summary.push(
      `尝试 ${attempts}${typeof maxAttempts === 'number' ? `/${maxAttempts}` : ''}`,
    );
  }
  const nextAttemptAt = event.details.next_attempt_at;
  if (typeof nextAttemptAt === 'string')
    summary.push(`下次尝试：${formatDate(nextAttemptAt)}`);
  const ownerFingerprint = event.details.lease_owner_fingerprint;
  if (typeof ownerFingerprint === 'string')
    summary.push(`Owner：${ownerFingerprint}`);
  const hashPrefix = event.details.payload_hash_prefix;
  if (typeof hashPrefix === 'string') summary.push(`Hash：${hashPrefix}…`);
  return summary.join(' · ') || '—';
}
