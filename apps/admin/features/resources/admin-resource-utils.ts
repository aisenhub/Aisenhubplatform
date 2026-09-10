import type { StatusTone } from '@kit/ui/status-badge';

export type ApiErrorPayload = {
  error?: {
    code?: string;
    message?: string;
  };
  request_id?: string;
};

export type ResourceError = {
  title: string;
  description: string;
  requestId: string | null;
  technicalDetail: string | null;
};

export type ResourceLoadState = 'loading' | 'success' | 'error';

export async function readApiPayload<T>(
  response: Response,
): Promise<(ApiErrorPayload & { data?: T }) | null> {
  return (await response.json().catch(() => null)) as
    | (ApiErrorPayload & { data?: T })
    | null;
}

export function resourceError(
  response: Response,
  payload: ApiErrorPayload | null,
  resourceName: string,
): ResourceError {
  const requestId =
    response.headers.get('x-request-id') ?? payload?.request_id ?? null;
  const technicalDetail = payload?.error?.code ?? `HTTP_${response.status}`;

  if (response.status === 401) {
    return {
      title: '管理员会话已结束',
      description: '请重新登录后再读取此资源。',
      requestId,
      technicalDetail,
    };
  }
  if (response.status === 403) {
    return {
      title: '没有访问权限',
      description: `当前管理员账号不能读取${resourceName}，请联系系统管理员确认授权。`,
      requestId,
      technicalDetail,
    };
  }
  if (response.status === 404) {
    return {
      title: `${resourceName}不存在`,
      description: `服务端没有找到当前平台范围内的${resourceName}。`,
      requestId,
      technicalDetail,
    };
  }
  return {
    title: `${resourceName}暂时不可用`,
    description:
      payload?.error?.message ??
      `读取${resourceName}失败，请稍后重试；页面不会把失败误显示为空列表。`,
    requestId,
    technicalDetail,
  };
}

export function caughtResourceError(
  resourceName: string,
  description = '网络暂时不可用，请稍后重试。',
): ResourceError {
  return {
    title: `${resourceName}读取失败`,
    description,
    requestId: null,
    technicalDetail: null,
  };
}

export function statusTone(value: string | null | undefined): StatusTone {
  switch (value) {
    case 'active':
    case 'enabled':
    case 'delivered':
      return 'success';
    case 'suspended':
    case 'pending_delivery':
    case 'pending':
    case 'paused':
      return 'warning';
    case 'closed':
    case 'archived':
    case 'disabled':
    case 'failed':
      return 'danger';
    case 'none':
      return 'neutral';
    default:
      return 'unknown';
  }
}

export function statusLabel(value: string | null | undefined): string {
  switch (value) {
    case 'active':
      return '活跃';
    case 'suspended':
      return '已暂停';
    case 'closed':
      return '已关闭';
    case 'archived':
      return '已归档';
    case 'pending_delivery':
      return '待交付';
    case 'disabled':
      return '已停用';
    case 'paused':
      return '已暂停';
    case 'none':
      return '无有效订阅';
    case 'delivered':
      return '已交付';
    default:
      return value || '未知状态';
  }
}

export function formatUtc(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZoneName: 'short',
  }).format(date);
}

export function resourcePath(platformId: string, suffix: string): string {
  return `/api/v1/admin/api/v1/platforms/${encodeURIComponent(platformId)}${suffix}`;
}

export function subscriptionsPath(
  platformId: string,
  accountId: string,
): string {
  return `/api/v1/admin/api/v1/subscriptions/${encodeURIComponent(accountId)}?platform_id=${encodeURIComponent(platformId)}`;
}
