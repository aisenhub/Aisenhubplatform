import { describe, expect, it } from 'vitest';

import {
  auditActionLabel,
  auditActorLabel,
  auditActorSecondary,
  auditOutcomeStatus,
  auditPlatformLabel,
  auditTargetLabel,
  auditTargetSecondary,
  auditTargetTypeLabel,
  type AdminAuditEntry,
} from './admin-audit-model';

describe('admin audit model', () => {
  it('translates known business codes while preserving unknown raw values', () => {
    expect(auditActionLabel('platform.updated')).toBe('更新平台设置');
    expect(auditTargetTypeLabel('platform_account')).toBe('平台账户');
    expect(auditActionLabel('custom.event')).toBe('custom.event');
    expect(auditTargetTypeLabel('custom_target')).toBe('custom_target');
  });

  it('prefers trusted readable actor identity without hiding useful secondary context', () => {
    const entry: AdminAuditEntry = {
      actor_type: 'user',
      actor_display_name: '测试用户',
      actor_email: 'user@example.invalid',
    };
    expect(auditActorLabel(entry)).toBe('测试用户');
    expect(auditActorSecondary(entry)).toBe('user@example.invalid');
    expect(auditActorLabel({ actor_type: 'system' })).toBe('系统');
    expect(auditActorLabel({ actor_type: 'admin' })).toBe('管理员');
  });

  it('uses authoritative platform display facts and keeps global scope explicit', () => {
    expect(
      auditPlatformLabel({
        platform_id: 'p-1',
        platform_name: '示例平台',
        platform_code: 'example',
      }),
    ).toBe('示例平台');
    expect(auditPlatformLabel({ platform_id: null })).toBe('全局范围');
    expect(auditPlatformLabel({ platform_id: 'p-2' })).toBe('未知平台');
    expect(
      auditTargetLabel({
        platform_id: 'p-1',
        platform_name: '示例平台',
        target_type: 'platform',
        target_id: 'p-1',
      }),
    ).toBe('示例平台');
    expect(
      auditTargetSecondary({
        platform_id: 'p-1',
        platform_name: '示例平台',
        target_type: 'platform',
        target_id: 'p-1',
      }),
    ).toBe('平台');
  });

  it('never invents success when an event did not record an outcome', () => {
    expect(auditOutcomeStatus(null)).toEqual({
      label: '未记录',
      tone: 'neutral',
    });
    expect(auditOutcomeStatus('success').label).toBe('成功');
    expect(auditOutcomeStatus('failed').tone).toBe('danger');
  });
});
