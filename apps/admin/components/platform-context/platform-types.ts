export type PlatformStatus = 'active' | 'disabled' | string;

export type Platform = {
  platform_id: string;
  code: string;
  name: string;
  status: PlatformStatus;
  allow_activation: boolean;
};

export type PlatformResponse = {
  data?: Platform;
  error?: {
    code?: string;
    message?: string;
  };
  request_id?: string;
};

export type PlatformListResponse = {
  data?: Platform[];
  error?: {
    code?: string;
    message?: string;
  };
  request_id?: string;
};

export function platformStatus(status: string | null | undefined): {
  label: string;
  tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'unknown';
} {
  switch (status) {
    case 'active':
      return { label: '运行中', tone: 'success' };
    case 'disabled':
      return { label: '已停用', tone: 'danger' };
    case 'pending':
      return { label: '待处理', tone: 'warning' };
    default:
      return { label: status || '未知状态', tone: 'unknown' };
  }
}
