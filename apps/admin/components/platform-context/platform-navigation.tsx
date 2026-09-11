'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@kit/ui/utils';

type PlatformNavigationProps = {
  platformId: string;
};

const items = [
  { key: 'overview', label: '概览', suffix: '' },
  { key: 'accounts', label: '账户', suffix: '/accounts' },
  { key: 'plans', label: '计划', suffix: '/plans' },
  { key: 'subscriptions', label: '订阅', suffix: '/subscriptions' },
  {
    key: 'redemption-batches',
    label: '兑换批次',
    suffix: '/redemption-batches',
  },
  { key: 'files', label: '文件', suffix: '/files' },
  { key: 'settings', label: '设置', suffix: '/settings' },
  { key: 'origins', label: 'Origins', suffix: '/settings/origins' },
  { key: 'keys', label: 'Keys', suffix: '/settings/keys' },
] as const;

export function PlatformNavigation({ platformId }: PlatformNavigationProps) {
  const pathname = usePathname();
  const prefix = `/admin/platforms/${platformId}`;

  return (
    <nav
      aria-label="平台工作区"
      className="platform-navigation -mx-1 flex gap-1 overflow-x-auto px-1"
      data-test="platform-navigation"
    >
      {items.map((item) => {
        const href = `${prefix}${item.suffix}`;
        const active =
          item.key === 'overview'
            ? pathname === prefix
            : item.key === 'settings'
              ? pathname === href
              : pathname === href || pathname.startsWith(`${href}/`);

        return (
          <Link
            key={item.key}
            href={href}
            aria-current={active ? 'page' : undefined}
            data-test={`platform-nav-${item.key}`}
            className={cn(
              'shrink-0 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
              active && 'bg-primary/10 text-primary',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
