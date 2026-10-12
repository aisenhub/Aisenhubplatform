import type { StatusTone } from '@kit/ui/status-badge';

export type Account = {
  platform_account_id: string;
  user_id: string | null;
  status: string;
  display_name?: string | null;
  avatar_url?: string | null;
  plan_id?: string | null;
  plan_code?: string | null;
  plan_name?: string | null;
  plan_kind?: string | null;
  subscription_status?: string | null;
  current_period_end?: string | null;
  tags?: string[];
  activated_at?: string | null;
  suspended_at?: string | null;
  closed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  platform_id?: string;
  platform_code?: string;
  platform_name?: string;
};

export type AccountIdentitySummary = {
  user_id: string | null;
  email: string | null;
};

export type AccountAdminNote = {
  id: string;
  body: string;
  created_by: string | null;
  created_at: string | null;
  redacted_at: string | null;
};

export type AccountGovernanceEvent = {
  id: string;
  action: string;
  reason: string;
  actor_admin_user_id: string | null;
  created_at: string | null;
};

export type AccountWorkbench = Account & {
  anonymized_at?: string | null;
  bio?: string | null;
  locale?: string | null;
  timezone?: string | null;
  subscription_started_at?: string | null;
  next_transition_at?: string | null;
  billing_order_count: number | string;
  billing_attention_count: number | string;
  billing_latest: Record<string, unknown>;
  config_active_count: number | string;
  config_published_count: number | string;
  config_pending_review_count: number | string;
  config_latest_updated_at: string | null;
  feedback_count: number | string;
  feedback_open_count: number | string;
  feedback_latest_submitted_at: string | null;
  tags: string[];
  notes: AccountAdminNote[];
  governance_events: AccountGovernanceEvent[];
  identity: AccountIdentitySummary;
};

export type GlobalIdentityAccount = {
  platform_id: string;
  platform_code: string;
  platform_name: string;
  platform_status: string;
  platform_account_id: string;
  status: string;
  activated_at: string | null;
  suspended_at: string | null;
  closed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type GlobalIdentity = {
  user_id: string;
  email: string | null;
  identity_state: string;
  created_at: string;
  last_sign_in_at: string | null;
  account_count: number | string;
  accounts: GlobalIdentityAccount[];
};

export type IdentityDeletionRequest = {
  request_id: string;
  state: 'pending_admin' | 'approved' | 'cancelled' | string;
  requested_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  cancelled_at: string | null;
};

export type IdentityDeletionJob = {
  job_id: string;
  state: 'pending' | 'running' | 'blocked' | 'retry' | 'completed' | string;
  checkpoint: string;
  retry_count: number;
  next_attempt_at: string | null;
  last_error_code: string | null;
  created_at: string | null;
  completed_at: string | null;
};

export type GlobalIdentityDetail = GlobalIdentity & {
  deletion: {
    request: IdentityDeletionRequest | null;
    job: IdentityDeletionJob | null;
  };
};

export type DeletionJob = {
  job_id: string;
  request_id: string;
  user_id?: string | null;
  state: string;
  checkpoint: string;
  fence?: number | null;
  retry_count: number;
  next_attempt_at?: string | null;
  last_error_code?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
};

export type AccountIntent = {
  accountId: string;
  action: 'suspend' | 'restore' | 'close';
  title: string;
  impact: string;
  reversible: boolean;
};

export function identityTone(state: string | null | undefined): StatusTone {
  switch (state?.toLowerCase()) {
    case 'active':
      return 'success';
    case 'deleting':
      return 'danger';
    default:
      return 'unknown';
  }
}

export function accountTone(status: string | null | undefined): StatusTone {
  switch (status?.toLowerCase()) {
    case 'active':
      return 'success';
    case 'suspended':
      return 'warning';
    case 'closed':
      return 'danger';
    case 'pending':
    case 'invited':
      return 'info';
    default:
      return 'unknown';
  }
}

export function accountStatusLabel(status: string | null | undefined): string {
  switch (status?.toLowerCase()) {
    case 'active':
      return '正常';
    case 'suspended':
      return '已暂停';
    case 'closed':
      return '已关闭';
    case 'pending':
      return '待激活';
    default:
      return status ?? '未知';
  }
}

export function accountActionLabel(action: AccountIntent['action']): string {
  switch (action) {
    case 'suspend':
      return '暂停账户';
    case 'restore':
      return '恢复账户';
    case 'close':
      return '关闭账户';
  }
}
