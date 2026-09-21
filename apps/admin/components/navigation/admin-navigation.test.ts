import { describe, expect, it } from 'vitest';

import {
  adminNavigationLabel,
  isAdminNavigationItemActive,
  parseAdminPlatformPath,
  platformNavigationGroups,
} from './admin-navigation';

describe('admin navigation model', () => {
  it('separates global and platform routes', () => {
    expect(parseAdminPlatformPath('/admin/platforms')).toBeNull();
    expect(parseAdminPlatformPath('/admin/billing')).toBeNull();
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
    ).toBe('Origins');
    expect(
      adminNavigationLabel('/admin/platforms/platform-1/redemption-batches'),
    ).toBe('兑换码');
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
});
