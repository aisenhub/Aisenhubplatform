import type { StatusTone } from '@kit/ui/status-badge';

export type Account = {
  platform_account_id: string;
  user_id: string | null;
  status: string;
  activated_at?: string | null;
  suspended_at?: string | null;
  closed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  platform_id?: string;
  platform_code?: string;
  platform_name?: string;
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
