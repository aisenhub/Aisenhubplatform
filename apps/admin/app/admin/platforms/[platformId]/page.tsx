'use client';

import Link from 'next/link';

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
    description: '查看当前平台关联账户，并在后续阶段执行受控状态动作。',
  },
  {
    href: 'plans',
    title: '平台计划',
    description: '浏览这个平台的计划和权益配置。',
  },
  {
    href: 'subscriptions',
    title: '平台订阅',
    description: '沿着平台上下文查看订阅资源。',
  },
  {
    href: 'settings',
    title: '平台设置',
    description: '管理 Origin、平台 Key 和保留的兼容操作。',
  },
] as const;

export default function PlatformOverviewPage() {
  const { platform, reload } = usePlatformContext();
  const status = platformStatus(platform.status);

  return (
    <section className="grid gap-5" data-test="platform-overview">
      <AdminPageHeader
        title="平台概览"
        description="这里展示当前平台上下文的真实状态和下一步入口，不生成没有 API 来源的指标。"
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
          <h2>稳定标识</h2>
          <p className="text-sm text-muted-foreground">
            该 ID 同时用于工作区 URL、API
            请求和支持排查。复制时只复制标识，不包含任何密钥材料。
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
            进入资源页后，所有读取和动作都会继续绑定当前平台 ID。
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {quickLinks.map((item) => (
            <Link
              key={item.href}
              href={`/admin/platforms/${encodeURIComponent(platform.platform_id)}/${item.href}`}
              className="panel gap-2 transition-colors hover:border-primary/40 hover:bg-primary/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              data-test={`platform-quick-link-${item.href}`}
            >
              <span className="font-medium text-foreground">{item.title}</span>
              <span className="text-sm leading-6 text-muted-foreground">
                {item.description}
              </span>
              <span className="text-sm font-medium text-primary">打开 →</span>
            </Link>
          ))}
        </div>
      </section>
    </section>
  );
}
