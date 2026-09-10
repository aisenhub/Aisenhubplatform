import type { ReactNode } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { AsyncState } from '@kit/ui/async-state';
import { Button } from '@kit/ui/button';
import type { StatusTone } from '@kit/ui/status-badge';
import { StatusBadge } from '@kit/ui/status-badge';
import { SupportErrorId } from '@kit/ui/support-error-id';

export type ConsumerError = {
  title: string;
  description: string;
  requestId: string | null;
  technicalDetail: string | null;
};

export type ConsumerRemoteState = 'loading' | 'success' | 'error' | 'access';

type ErrorPayload = {
  error?: { code?: string; message?: string };
  request_id?: string;
};

const messages: Record<string, string> = {
  UNAUTHORIZED: '请登录后继续。',
  SESSION_REVOKED: '登录已失效，请重新登录。',
  ACCOUNT_SUSPENDED: '当前账户已暂停，暂时无法完成此操作。',
  ACCOUNT_CLOSED: '当前账户已关闭，无法继续使用此功能。',
  GLOBAL_DELETE_PENDING: '全局删除请求正在处理中，请以服务端状态为准。',
  PRECONDITION_FAILED: '资料在其他位置发生了变化，请重新加载后再保存。',
  PRECONDITION_REQUIRED: '页面版本已过期，请重新加载后再保存。',
  RECENT_MFA_REQUIRED: '这项操作需要先完成近期认证。',
  QUOTA_EXCEEDED: '已达到文件额度，请检查预算后重试。',
  INVALID_CODE: '兑换码无效，请检查输入。',
  CODE_ALREADY_REDEEMED: '兑换码已使用。',
  CODE_EXPIRED: '兑换码已过期。',
};

export async function errorFromResponse(
  response: Response,
  resource: string,
): Promise<ConsumerError> {
  const payload = (await response
    .json()
    .catch(() => null)) as ErrorPayload | null;
  const code = payload?.error?.code ?? 'AUTHORIZATION_UNAVAILABLE';
  const access = response.status === 401 || code === 'UNAUTHORIZED';
  return {
    title: access ? '需要登录' : `${resource}暂时不可用`,
    description:
      messages[code] ??
      (response.status >= 500
        ? '服务暂时不可用，请稍后重试。'
        : '请检查输入或稍后重试。'),
    requestId: payload?.request_id ?? response.headers.get('x-request-id'),
    technicalDetail: code,
  };
}

export function errorFromException(
  resource: string,
  error: unknown,
): ConsumerError {
  const description =
    error instanceof Error && error.message
      ? error.message.includes('会话已恢复')
        ? '会话已恢复，请重新提交这次操作。'
        : error.message.includes('登录已过期')
          ? '登录已过期，请重新登录。'
          : '网络暂时不可用，请稍后重试。'
      : '网络暂时不可用，请稍后重试。';
  return {
    title: `${resource}暂时不可用`,
    description,
    requestId: null,
    technicalDetail: null,
  };
}

export function ConsumerRemoteStateView({
  state,
  error,
  onRetry,
  empty,
}: {
  state: ConsumerRemoteState;
  error?: ConsumerError | null;
  onRetry?: () => void;
  empty?: ReactNode;
}) {
  if (state === 'loading') return <AsyncState state="loading" />;
  if (state === 'access')
    return (
      <AsyncState
        state="access"
        title={error?.title ?? '需要登录'}
        description={error?.description ?? '请登录后继续。'}
        requestId={error?.requestId}
        technicalDetail={error?.technicalDetail}
      />
    );
  if (state === 'error')
    return (
      <AsyncState
        state="error"
        title={error?.title}
        description={error?.description}
        requestId={error?.requestId}
        technicalDetail={error?.technicalDetail}
        onRetry={onRetry}
      />
    );
  return empty ?? null;
}

export function ConsumerNotice({
  title,
  description,
  tone = 'info',
  requestId,
  technicalDetail,
  action,
}: {
  title: string;
  description: string;
  tone?: 'info' | 'warning' | 'danger' | 'success';
  requestId?: string | null;
  technicalDetail?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Alert
      variant={tone === 'danger' ? 'destructive' : 'default'}
      className={`consumer-notice consumer-notice-${tone}`}
      data-test="consumer-notice"
    >
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        {description}
        {action ? <div className="mt-3">{action}</div> : null}
        <SupportErrorId
          requestId={requestId}
          technicalDetail={technicalDetail}
        />
      </AlertDescription>
    </Alert>
  );
}

export function ConsumerStatus({
  children,
  busy = false,
}: {
  children: ReactNode;
  busy?: boolean;
}) {
  return (
    <p
      className="consumer-status"
      role="status"
      aria-live="polite"
      aria-busy={busy}
    >
      {children}
    </p>
  );
}

export function ConsumerStatusBadge({
  label,
  rawValue,
  tone,
}: {
  label: string;
  rawValue?: string | null;
  tone: StatusTone;
}) {
  return <StatusBadge label={label} rawValue={rawValue} tone={tone} />;
}

export function ConsumerEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="consumer-empty" data-test="consumer-empty">
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  );
}

export function RetryButton({
  onClick,
  label = '重试',
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick}>
      {label}
    </Button>
  );
}
