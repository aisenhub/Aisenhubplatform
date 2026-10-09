import { describe, expect, it } from 'vitest';

import {
  adminGlobalUtilityNavigation,
  adminNavigationGroups,
  adminNavigationLabel,
  isAdminNavigationItemActive,
  parseAdminPlatformPath,
  platformNavigationGroups,
} from './admin-navigation';

describe('admin navigation model', () => {
  it('separates global and platform routes', () => {
    expect(parseAdminPlatformPath('/admin/platforms')).toBeNull();
    expect(parseAdminPlatformPath('/admin/billing')).toBeNull();
    expect(parseAdminPlatformPath('/admin/accounts')).toBeNull();
    expect(adminNavigationLabel('/admin/accounts')).toBe('统一用户');
    expect(
      parseAdminPlatformPath('/admin/platforms/platform-1/accounts'),
    ).toEqual({
      platformId: 'platform-1',
      encodedPlatformId: 'platform-1',
      prefix: '/admin/platforms/platform-1',
      suffix: '/accounts',
    });
  });

  it('uses the resource label for platform routes', () => {
    expect(
      adminNavigationLabel('/admin/platforms/platform-1/settings/origins'),
    ).toBe('接入地址');
    expect(
      adminNavigationLabel('/admin/platforms/platform-1/redemption-batches'),
    ).toBe('兑换码');
    expect(adminNavigationLabel('/admin/platforms/platform-1/billing')).toBe(
      '订单与计费',
    );
  });

  it('does not let settings shadow its nested routes', () => {
    const items = platformNavigationGroups('platform-1').flatMap(
      (group) => group.items,
    );
    const settings = items.find((item) => item.key === 'settings');
    const origins = items.find((item) => item.key === 'origins');

    expect(settings).toBeDefined();
    expect(origins).toBeDefined();
    expect(
      isAdminNavigationItemActive(
        '/admin/platforms/platform-1/settings/origins',
        settings!,
      ),
    ).toBe(false);
    expect(
      isAdminNavigationItemActive(
        '/admin/platforms/platform-1/settings/origins',
        origins!,
      ),
    ).toBe(true);
  });

  it('consolidates security navigation away from the MFA flow', () => {
    expect(adminNavigationLabel('/admin/security')).toBe('安全与账户');
    expect(adminNavigationLabel('/admin/mfa')).toBe('管理员控制台');
  });

  it('exposes the global Consumer Lab without platform context', () => {
    expect(adminNavigationLabel('/admin/consumer-lab')).toBe('Consumer Lab');
    expect(parseAdminPlatformPath('/admin/consumer-lab')).toBeNull();
  });

  it('verifies refined navigation groups for dual-scope IA', () => {
    const globalLabels = adminNavigationGroups.map((g) => g.label);
    expect(globalLabels).toEqual(['工作台', '商业中心', '系统治理', '设置']);

    const platformGroups = platformNavigationGroups('p1');
    const platformLabels = platformGroups.map((g) => g.label);
    expect(platformLabels).toEqual([
      '平台运营',
      '商业化',
      '资源与接入',
      '平台设置',
    ]);

    const utilityKeys = adminGlobalUtilityNavigation.map((i) => i.key);
    expect(utilityKeys).toEqual([
      'billing',
      'operations',
      'audit',
      'consumer-lab',
    ]);
  });
});
