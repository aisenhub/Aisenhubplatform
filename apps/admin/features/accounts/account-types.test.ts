import { describe, expect, it } from 'vitest';

import {
  accountActionLabel,
  accountStatusLabel,
  accountTone,
} from './account-types';

describe('account-types utilities', () => {
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

  it('correctly maps account actions to human-readable labels', () => {
    expect(accountActionLabel('suspend')).toBe('暂停账户');
    expect(accountActionLabel('restore')).toBe('恢复账户');
    expect(accountActionLabel('close')).toBe('关闭账户');
  });
});
