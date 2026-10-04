'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

import { Button } from '@kit/ui/button';
import { ResourceId } from '@kit/ui/resource-id';
import { StatusBadge } from '@kit/ui/status-badge';

import { AdminPageHeader } from '../../../../components/shell/admin-page-header';
import { usePlatformContext } from '../../../../components/platform-context/platform-workspace';
import { platformStatus } from '../../../../components/platform-context/platform-types';

const quickLinks = [
  {
    href: 'accounts',
    title: '平台账户',
    description: '查找账户、查看状态与管理访问。',
  },
  {
    href: 'plans',
    title: '平台套餐',
    description: '管理免费与付费套餐。',
  },
  {
    href: 'subscriptions',
    title: '平台订阅',
    description: '查看账户的订阅与权益。',
  },
  {
    href: 'settings',
    title: '平台设置',
    description: '调整运行状态与激活策略。',
  },
] as const;

export default function PlatformOverviewPage() {
  const { platform, reload } = usePlatformContext();
  const status = platformStatus(platform.status);

  return (
    <section className="grid gap-5" data-test="platform-overview">
      <AdminPageHeader
        title="概览"
        description="查看平台运行状态，进入账户管理与接入配置。"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={reload}
            data-test="platform-overview-refresh"
          >
            刷新上下文
          </Button>
        }
      />

      <section className="grid gap-4 md:grid-cols-2" aria-label="平台状态">
        <div className="panel gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2>运行策略</h2>
            <StatusBadge
              label={status.label}
              tone={status.tone}
              rawValue={platform.status}
            />
          </div>
          <dl className="detail-list text-sm">
            <div>
              <dt>激活能力</dt>
              <dd>{platform.allow_activation ? '允许激活' : '已关闭'}</dd>
            </div>
            <div>
              <dt>平台 Code</dt>
              <dd className="font-mono">{platform.code}</dd>
            </div>
          </dl>
        </div>
        <div className="panel gap-3">
          <h2>平台标识</h2>
          <p className="text-sm text-muted-foreground">
            接入配置或排查问题时，可复制此标识。
          </p>
          <ResourceId
            value={platform.platform_id}
            label={platform.platform_id}
          />
        </div>
      </section>

      <section className="grid gap-4" aria-labelledby="platform-quick-links">
        <div>
          <h2 id="platform-quick-links">快捷入口</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            以下操作均属于 {platform.name}。
          </p>
        </div>
        <div className="panel admin-task-links">
          {quickLinks.map((item) => (
            <Link
              key={item.href}
              href={`/admin/platforms/${encodeURIComponent(platform.platform_id)}/${item.href}`}
              className="admin-task-link"
              data-test={`platform-quick-link-${item.href}`}
            >
              <span>
                <span className="block text-sm font-medium">{item.title}</span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {item.description}
                </span>
              </span>
              <ArrowUpRight
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            </Link>
          ))}
        </div>
      </section>
    </section>
  );
}
