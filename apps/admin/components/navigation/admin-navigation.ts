import {
  Activity,
  Boxes,
  CircleDollarSign,
  FileKey2,
  FileText,
  LayoutDashboard,
  ScrollText,
  Settings2,
  ShieldCheck,
} from 'lucide-react';

export type AdminNavigationItem = {
  label: string;
  href: string;
  description: string;
  icon: typeof LayoutDashboard;
};

export const adminNavigationGroups: Array<{
  label: string;
  items: AdminNavigationItem[];
}> = [
  {
    label: '工作台',
    items: [
      {
        label: '概览',
        href: '/admin',
        description: '查看管理员工作台与快捷入口',
        icon: LayoutDashboard,
      },
      {
        label: '平台',
        href: '/admin/platforms',
        description: '管理平台、账户和平台密钥',
        icon: Boxes,
      },
    ],
  },
  {
    label: '资源',
    items: [
      {
        label: '权益与套餐',
        href: '/admin/entitlements',
        description: '管理套餐、权益和兑换码批次',
        icon: CircleDollarSign,
      },
      {
        label: '订阅',
        href: '/admin/subscriptions',
        description: '查看账户订阅并提交受控命令',
        icon: FileText,
      },
      {
        label: '配置文件',
        href: '/admin/files',
        description: '查看文件策略和配置文件状态',
        icon: FileKey2,
      },
    ],
  },
  {
    label: '运维与安全',
    items: [
      {
        label: '运维任务',
        href: '/admin/deletion-jobs',
        description: '跟踪删除任务和恢复检查点',
        icon: Activity,
      },
      {
        label: '审计记录',
        href: '/admin/audit',
        description: '只读查看脱敏审计事件',
        icon: ScrollText,
      },
      {
        label: '安全设置',
        href: '/admin/mfa',
        description: '管理 MFA 因子和当前安全验证',
        icon: ShieldCheck,
      },
    ],
  },
];

export const adminNavigation = adminNavigationGroups.flatMap(
  (group) => group.items,
);

export function adminNavigationLabel(pathname: string): string {
  return (
    adminNavigation.find(
      (item) =>
        pathname === item.href ||
        (item.href !== '/admin' && pathname.startsWith(`${item.href}/`)),
    )?.label ?? '管理员控制台'
  );
}

export const adminSystemItem = {
  label: '系统状态',
  description: '系统健康检查将在后续阶段启用',
  icon: Settings2,
};
