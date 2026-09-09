'use client';

import {
  AuthorizationUnavailableError,
  createAuthSessionManager,
  SessionExpiredError,
  SessionRetryRequiredError,
} from '@kit/account-auth-nextjs/browser';

export const adminAuthSession = createAuthSessionManager({
  scope: 'admin',
  loginUrl: '/api/auth/login',
  refreshUrl: '/api/auth/refresh',
  logoutUrl: '/api/auth/logout',
});

export function sessionErrorMessage(error: unknown): string {
  if (error instanceof SessionRetryRequiredError)
    return '会话已恢复，请重新提交这次操作。';
  if (error instanceof SessionExpiredError) return '登录已过期，请重新登录。';
  if (error instanceof AuthorizationUnavailableError)
    return '授权服务暂时不可用，请稍后重试。';
  return '网络暂时不可用，请稍后重试。';
}

export async function responseErrorCode(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => null)) as {
    error?: { code?: string };
  } | null;
  return payload?.error?.code ?? 'AUTHORIZATION_UNAVAILABLE';
}
