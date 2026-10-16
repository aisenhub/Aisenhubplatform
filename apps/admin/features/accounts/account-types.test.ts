import { describe, expect, it } from 'vitest';

import {
  accountActionLabel,
  accountIdentityEmailLabel,
  accountStatusLabel,
  accountTone,
  identityTone,
} from './account-types';

describe('account-types utilities', () => {
  it('maps global identity lifecycle states independently from platform accounts', () => {
    expect(identityTone('active')).toBe('success');
    expect(identityTone('deleting')).toBe('danger');
    expect(identityTone('other')).toBe('unknown');
  });

  it('correctly maps account statuses to tones', () => {
    expect(accountTone('active')).toBe('success');
    expect(accountTone('suspended')).toBe('warning');
    expect(accountTone('closed')).toBe('danger');
    expect(accountTone('pending')).toBe('info');
    expect(accountTone('invited')).toBe('info');
    expect(accountTone('other')).toBe('unknown');
    expect(accountTone(null)).toBe('unknown');
    expect(accountTone(undefined)).toBe('unknown');
  });

  it('correctly maps account statuses to localized labels', () => {
    expect(accountStatusLabel('active')).toBe('正常');
    expect(accountStatusLabel('suspended')).toBe('已暂停');
    expect(accountStatusLabel('closed')).toBe('已关闭');
    expect(accountStatusLabel('pending')).toBe('待激活');
    expect(accountStatusLabel('unknown_state')).toBe('unknown_state');
    expect(accountStatusLabel(null)).toBe('未知');
  });

  it('keeps Account 360 identity source failures distinct from missing email', () => {
    expect(
      accountIdentityEmailLabel({
        user_id: '00000000-0000-4000-8000-000000000001',
        email: null,
        source_state: 'unavailable',
      }),
    ).toBe('身份服务暂时不可用');
    expect(
      accountIdentityEmailLabel({
        user_id: '00000000-0000-4000-8000-000000000001',
        email: null,
        source_state: 'missing',
      }),
    ).toBe('Auth Identity 已不存在');
    expect(
      accountIdentityEmailLabel({
        user_id: null,
        email: null,
        source_state: 'not_applicable',
      }),
    ).toBe('已匿名化 / 不适用');
    expect(
      accountIdentityEmailLabel({
        user_id: '00000000-0000-4000-8000-000000000001',
        email: null,
        source_state: 'available',
      }),
    ).toBe('未设置邮箱');
  });

  it('correctly maps account actions to human-readable labels', () => {
    expect(accountActionLabel('suspend')).toBe('暂停账户');
    expect(accountActionLabel('restore')).toBe('恢复账户');
    expect(accountActionLabel('close')).toBe('关闭账户');
  });
});
