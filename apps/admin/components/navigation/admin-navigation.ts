import {
  Activity,
  Boxes,
  FileKey2,
  LayoutDashboard,
  LockKeyhole,
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
      {
        label: '安全总览',
        href: '/admin/security',
        description: '查看 Admin session 与认证器摘要',
        icon: LockKeyhole,
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
