import type { StatusTone } from '@kit/ui/status-badge';

export type ApiErrorPayload = {
  error?: {
    code?: string;
    message?: string;
  };
  request_id?: string | null;
  next_cursor?: string | null;
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

export function isRecentMfaRequired(
  response: Response,
  payload: ApiErrorPayload | null,
): boolean {
  return (
    response.status === 403 && payload?.error?.code === 'RECENT_MFA_REQUIRED'
  );
}

export function apiErrorDescription(
  response: Response,
  payload: ApiErrorPayload | null,
  fallback: string,
): string {
  const code = payload?.error?.code;
  const serverMessage = payload?.error?.message?.trim();
  switch (code) {
    case 'MFA_REQUIRED':
      return '请前往 MFA 页面完成登录验证，然后重新确认本次操作。';
    case 'RECENT_MFA_REQUIRED':
      return '这项操作需要近期 MFA，请先完成验证。';
    case 'ADMIN_REQUIRED':
      return '当前账号不是系统管理员，请退出后切换账号。';
    case 'FORBIDDEN':
      return '当前操作被服务端策略拒绝，请确认操作范围。';
    case 'RATE_LIMITED':
      return '请求过于频繁，请稍后重试。';
    case 'IDEMPOTENCY_CONFLICT':
      return '这项操作与已有请求冲突，请检查当前状态后再决定是否重试。';
    case 'PRECONDITION_FAILED':
    case 'PRECONDITION_REQUIRED':
      return '当前数据已发生变化，请刷新后再提交。';
    case 'AUTHORIZATION_UNAVAILABLE':
    case 'STORAGE_UNAVAILABLE':
      return '服务暂时不可用，请稍后重试。';
    default:
      if (response.status === 401) return '登录已过期，请重新登录。';
      if (response.status === 403) return '当前操作被服务端策略拒绝。';
      if (response.status === 429) return '请求过于频繁，请稍后重试。';
      if (response.status >= 500) return '服务暂时不可用，请稍后重试。';
      if (response.status === 409)
        return '操作与当前服务端状态冲突，请刷新后确认再重试。';
      if (response.status === 412 || response.status === 428)
        return '当前数据已发生变化，请刷新后再提交。';
      if (
        serverMessage &&
        serverMessage !== code &&
        /[\u3400-\u9fff]/u.test(serverMessage)
      )
        return serverMessage;
      return fallback;
  }
}

export function resourceError(
  response: Response,
  payload: ApiErrorPayload | null,
  resourceName: string,
): ResourceError {
  const requestId =
    response.headers.get('x-request-id') ?? payload?.request_id ?? null;
  const technicalDetail = payload?.error?.code ?? `HTTP_${response.status}`;

  if (technicalDetail === 'MFA_REQUIRED') {
    return {
      title: '需要完成 MFA 登录验证',
      description: apiErrorDescription(response, payload, ''),
      requestId,
      technicalDetail,
    };
  }
  if (technicalDetail === 'RECENT_MFA_REQUIRED') {
    return {
      title: '需要近期 MFA 验证',
      description: apiErrorDescription(response, payload, ''),
      requestId,
      technicalDetail,
    };
  }
  if (technicalDetail === 'ADMIN_REQUIRED') {
    return {
      title: '当前账号不是系统管理员',
      description: apiErrorDescription(response, payload, ''),
      requestId,
      technicalDetail,
    };
  }

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
      title: '操作被拒绝',
      description: `服务端拒绝访问${resourceName}，请确认操作范围。`,
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
  const fallback = `读取${resourceName}失败，请稍后重试；页面不会把失败误显示为空列表。`;
  return {
    title: `${resourceName}暂时不可用`,
    description: apiErrorDescription(response, payload, fallback),
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
