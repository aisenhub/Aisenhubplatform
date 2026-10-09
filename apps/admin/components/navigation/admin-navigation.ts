import {
  Activity,
  Boxes,
  CreditCard,
  FileKey2,
  Files,
  FlaskConical,
  Globe2,
  KeyRound,
  LayoutDashboard,
  Package,
  Receipt,
  ScrollText,
  Settings2,
  ShieldCheck,
  Ticket,
  Users,
  type LucideIcon,
} from 'lucide-react';

export type AdminNavigationItem = {
  key: string;
  label: string;
  href: string;
  description: string;
  icon: LucideIcon;
  match?: 'exact' | 'prefix';
  aliases?: string[];
};

export type AdminNavigationGroup = {
  label: string;
  items: AdminNavigationItem[];
};

export const adminNavigationGroups: AdminNavigationGroup[] = [
  {
    label: '工作台',
    items: [
      {
        key: 'overview',
        label: '概览',
        href: '/admin',
        description: '查看需要关注的管理事项与最近活动',
        icon: LayoutDashboard,
        match: 'exact',
      },
      {
        key: 'platforms',
        label: '平台',
        href: '/admin/platforms',
        description: '进入平台目录与平台工作区',
        icon: Boxes,
      },
      {
        key: 'accounts',
        label: '统一用户',
        href: '/admin/accounts',
        description: '跨平台检索用户账户与身份状态透视',
        icon: Users,
      },
    ],
  },
  {
    label: '商业中心',
    items: [
      {
        key: 'billing',
        label: '计费管理',
        href: '/admin/billing/orders',
        aliases: ['/admin/billing'],
        description: '中央订单、结算、Provider 与人工处理',
        icon: CreditCard,
      },
    ],
  },
  {
    label: '系统治理',
    items: [
      {
        key: 'operations',
        label: '运维中心',
        href: '/admin/operations',
        description: '查看后台任务、检查点和可控重试',
        icon: Activity,
      },
      {
        key: 'audit',
        label: '审计记录',
        href: '/admin/audit',
        description: '只读查看脱敏审计事件',
        icon: ScrollText,
      },
      {
        key: 'consumer-lab',
        label: 'Consumer Lab',
        href: '/admin/consumer-lab',
        description: '查看公共 HTTP 合同与 Consumer Conformance Harness 边界',
        icon: FlaskConical,
      },
    ],
  },
  {
    label: '设置',
    items: [
      {
        key: 'security',
        label: '安全与账户',
        href: '/admin/security',
        description: '查看 Admin session、MFA 与认证器状态',
        icon: ShieldCheck,
      },
    ],
  },
];

export const adminNavigation = adminNavigationGroups.flatMap(
  (group) => group.items,
);

export const adminGlobalUtilityNavigation = adminNavigation.filter((item) =>
  ['billing', 'operations', 'audit', 'consumer-lab'].includes(item.key),
);

type PlatformNavigationDefinition = Omit<AdminNavigationItem, 'href'> & {
  suffix: string;
};

const platformNavigationDefinitions: Array<{
  label: string;
  items: PlatformNavigationDefinition[];
}> = [
  {
    label: '平台运营',
    items: [
      {
        key: 'platform-overview',
        label: '概览',
        suffix: '',
        description: '查看当前平台状态与快捷入口',
        icon: LayoutDashboard,
        match: 'exact',
      },
      {
        key: 'accounts',
        label: '账户',
        suffix: '/accounts',
        description: '管理当前平台账户',
        icon: Users,
      },
    ],
  },
  {
    label: '商业化',
    items: [
      {
        key: 'platform-billing',
        label: '订单与计费',
        suffix: '/billing',
        description: '查看当前平台的支付订单、结算状态与处理异常',
        icon: Receipt,
      },
      {
        key: 'plans',
        label: '套餐',
        suffix: '/plans',
        description: '管理当前平台套餐与默认计划',
        icon: Package,
      },
      {
        key: 'subscriptions',
        label: '订阅',
        suffix: '/subscriptions',
        description: '查看与管理账户订阅投影',
        icon: CreditCard,
      },
      {
        key: 'redemption',
        label: '兑换码',
        suffix: '/redemption-batches',
        description: '管理兑换批次与交付状态',
        icon: Ticket,
      },
    ],
  },
  {
    label: '资源与接入',
    items: [
      {
        key: 'files',
        label: '文件',
        suffix: '/files',
        description: '查看当前平台配置文件',
        icon: Files,
      },
      {
        key: 'origins',
        label: '接入地址',
        suffix: '/settings/origins',
        description: '管理浏览器 Origin allowlist',
        icon: Globe2,
      },
      {
        key: 'keys',
        label: '接入密钥',
        suffix: '/settings/keys',
        description: '管理服务端 Platform Key',
        icon: KeyRound,
      },
    ],
  },
  {
    label: '平台设置',
    items: [
      {
        key: 'settings',
        label: '基本设置',
        suffix: '/settings',
        description: '管理平台状态与基础策略',
        icon: Settings2,
        match: 'exact',
      },
    ],
  },
];

export type AdminPlatformRoute = {
  platformId: string;
  encodedPlatformId: string;
  prefix: string;
  suffix: string;
};

export function parseAdminPlatformPath(
  pathname: string,
): AdminPlatformRoute | null {
  const match = pathname.match(/^\/admin\/platforms\/([^/]+)(\/.*)?$/u);
  if (!match?.[1]) return null;

  let platformId = match[1];
  try {
    platformId = decodeURIComponent(match[1]);
  } catch {
    // Keep the encoded segment. The workspace will reject an unknown platform
    // rather than guessing a different context.
  }

  return {
    platformId,
    encodedPlatformId: match[1],
    prefix: `/admin/platforms/${match[1]}`,
    suffix: match[2] ?? '',
  };
}

export function platformNavigationGroups(
  platformId: string,
): AdminNavigationGroup[] {
  const prefix = `/admin/platforms/${encodeURIComponent(platformId)}`;
  return platformNavigationDefinitions.map((group) => ({
    label: group.label,
    items: group.items.map(({ suffix, ...item }) => ({
      ...item,
      href: `${prefix}${suffix}`,
    })),
  }));
}

export function isAdminNavigationItemActive(
  pathname: string,
  item: AdminNavigationItem,
): boolean {
  const candidates = [item.href, ...(item.aliases ?? [])];
  if (item.match === 'exact' || item.href === '/admin') {
    return candidates.includes(pathname);
  }

  return candidates.some(
    (candidate) =>
      pathname === candidate || pathname.startsWith(`${candidate}/`),
  );
}

export function mapAdminScopeRoute(
  pathname: string,
  targetPlatformId: string | null,
): string {
  const currentPlatform = parseAdminPlatformPath(pathname);

  if (targetPlatformId) {
    const targetPrefix = `/admin/platforms/${encodeURIComponent(targetPlatformId)}`;
    if (currentPlatform) {
      return `${targetPrefix}${currentPlatform.suffix}`;
    }
    if (
      pathname === '/admin/accounts' ||
      pathname.startsWith('/admin/accounts/')
    ) {
      return `${targetPrefix}/accounts`;
    }
    if (
      pathname === '/admin/billing' ||
      pathname === '/admin/billing/orders' ||
      pathname.startsWith('/admin/billing/orders/')
    ) {
      return `${targetPrefix}/billing`;
    }
    return targetPrefix;
  }

  if (!currentPlatform) return pathname;
  if (currentPlatform.suffix === '') return '/admin';
  if (currentPlatform.suffix === '/accounts') return '/admin/accounts';
  if (currentPlatform.suffix === '/billing') return '/admin/billing/orders';
  return '/admin/platforms';
}

export function adminNavigationLabel(pathname: string): string {
  const platformRoute = parseAdminPlatformPath(pathname);
  if (platformRoute) {
    const item = platformNavigationGroups(platformRoute.platformId)
      .flatMap((group) => group.items)
      .find((candidate) => isAdminNavigationItemActive(pathname, candidate));
    return item?.label ?? '平台工作区';
  }

  return (
    adminNavigation.find((item) => isAdminNavigationItemActive(pathname, item))
      ?.label ?? '管理员控制台'
  );
}

export const adminSystemItem = {
  label: '系统状态',
  description: '系统健康检查将在后续阶段启用',
  icon: FileKey2,
};
