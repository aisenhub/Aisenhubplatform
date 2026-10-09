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

export type AccountIntent = {
  accountId: string;
  action: 'suspend' | 'restore' | 'close';
  title: string;
  impact: string;
  reversible: boolean;
};

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
