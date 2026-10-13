import { describe, expect, it } from 'vitest';

import {
  adminNavigationGroups,
  adminNavigationLabel,
  isAdminNavigationItemActive,
  mapAdminScopeRoute,
  parseAdminPlatformPath,
  platformNavigationGroups,
} from './admin-navigation';

describe('admin navigation model', () => {
  it('separates global and platform routes', () => {
    expect(parseAdminPlatformPath('/admin/platforms')).toBeNull();
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
      adminNavigationLabel('/admin/platforms/platform-1/settings/integration'),
    ).toBe('接入配置');
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
    const integration = items.find((item) => item.key === 'integration');

    expect(settings).toBeDefined();
    expect(integration).toBeDefined();
    expect(
      isAdminNavigationItemActive(
        '/admin/platforms/platform-1/settings/integration',
        settings!,
      ),
    ).toBe(false);
    expect(
      isAdminNavigationItemActive(
        '/admin/platforms/platform-1/settings/integration',
        integration!,
      ),
    ).toBe(true);
  });

  it('maps equivalent resources across Global and Platform lenses', () => {
    expect(mapAdminScopeRoute('/admin/accounts', 'platform-1')).toBe(
      '/admin/platforms/platform-1/accounts',
    );
    expect(mapAdminScopeRoute('/admin/billing/orders', 'platform-1')).toBe(
      '/admin/platforms/platform-1/billing',
    );
    expect(
      mapAdminScopeRoute('/admin/platforms/platform-1/accounts', null),
    ).toBe('/admin/accounts');
    expect(
      mapAdminScopeRoute('/admin/platforms/platform-1/billing', null),
    ).toBe('/admin/billing/orders');
    expect(
      mapAdminScopeRoute('/admin/platforms/platform-1/settings/keys', null),
    ).toBe('/admin/platforms');
    expect(
      mapAdminScopeRoute(
        '/admin/platforms/platform-1/settings/origins',
        'platform-2',
      ),
    ).toBe('/admin/platforms/platform-2/settings/origins');
  });

  it('drops platform-specific entity ids when switching workspace scope', () => {
    expect(
      mapAdminScopeRoute(
        '/admin/platforms/platform-1/accounts/account-1',
        'platform-2',
      ),
    ).toBe('/admin/platforms/platform-2/accounts');
    expect(
      mapAdminScopeRoute(
        '/admin/platforms/platform-1/config-resources/config-1',
        'platform-2',
      ),
    ).toBe('/admin/platforms/platform-2/files');
    expect(
      mapAdminScopeRoute(
        '/admin/platforms/platform-1/billing/orders/order-1',
        'platform-2',
      ),
    ).toBe('/admin/platforms/platform-2/billing');
  });

  it('uses the canonical Billing orders route', () => {
    expect(adminNavigationLabel('/admin/billing/orders')).toBe('计费管理');
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

    expect(
      platformGroups.flatMap((group) => group.items.map((item) => item.key)),
    ).toEqual([
      'platform-overview',
      'accounts',
      'platform-billing',
      'plans',
      'subscriptions',
      'redemption',
      'files',
      'feedback',
      'integration',
      'settings',
    ]);

    const platformKeys = platformGroups.flatMap((group) =>
      group.items.map((item) => item.key),
    );
    expect(platformKeys).not.toContain('billing');
    expect(platformKeys).not.toContain('audit');
    expect(platformKeys).not.toContain('consumer-lab');
    expect(platformKeys).not.toContain('platforms');
    expect(adminNavigationLabel('/admin/accounts/deletion-jobs')).toBe(
      '统一用户',
    );
  });
});
