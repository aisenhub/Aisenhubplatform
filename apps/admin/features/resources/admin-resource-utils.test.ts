import { describe, expect, it } from 'vitest';

import {
  apiErrorDescription,
  isRecentMfaRequired,
  resourceError,
} from './admin-resource-utils';

function failure(status: number, code?: string) {
  const response = new Response(null, {
    status,
    headers: { 'x-request-id': 'request-1' },
  });
  const payload = code ? { error: { code } } : null;
  return { response, payload };
}

describe('Admin security error semantics', () => {
  it.each([
    ['MFA_REQUIRED', '需要完成 MFA 登录验证'],
    ['RECENT_MFA_REQUIRED', '需要近期 MFA 验证'],
    ['ADMIN_REQUIRED', '当前账号不是系统管理员'],
    ['FORBIDDEN', '操作被拒绝'],
  ])('classifies 403 %s without guessing from status', (code, title) => {
    const { response, payload } = failure(403, code);
    expect(resourceError(response, payload, '订单').title).toBe(title);
    expect(isRecentMfaRequired(response, payload)).toBe(
      code === 'RECENT_MFA_REQUIRED',
    );
  });

  it('keeps server failures separate from session and policy errors', () => {
    const { response } = failure(503);
    const payload = { error: { message: '没有权限' } };
    expect(apiErrorDescription(response, payload, 'fallback')).toContain(
      '服务暂时不可用',
    );
    expect(resourceError(response, payload, '订单').title).toContain(
      '暂时不可用',
    );
  });
});
