'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { Button } from '@kit/ui/button';
import { ResourceId } from '@kit/ui/resource-id';
import { StatusBadge } from '@kit/ui/status-badge';

import { platformStatus, type Platform } from './platform-types';
import { PlatformNavigation } from './platform-navigation';
import { PlatformSwitcher } from './platform-switcher';

type PlatformHeaderProps = {
  platform: Platform;
  actions?: ReactNode;
};

export function PlatformHeader({ platform, actions }: PlatformHeaderProps) {
  const status = platformStatus(platform.status);
  const workspaceHref = `/admin/platforms/${encodeURIComponent(platform.platform_id)}`;

  return (
    <section className="grid gap-5" data-test="platform-context-header">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 space-y-3">
          <nav
            aria-label="面包屑"
            className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
          >
            <Link className="hover:text-foreground" href="/admin">
              管理员
            </Link>
            <span aria-hidden="true">/</span>
            <Link className="hover:text-foreground" href="/admin/platforms">
              平台目录
            </Link>
            <span aria-hidden="true">/</span>
            <span className="font-medium text-foreground">{platform.name}</span>
          </nav>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {platform.name}
            </h1>
            <StatusBadge
              label={status.label}
              tone={status.tone}
              rawValue={platform.status}
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
            <span className="font-mono text-foreground">{platform.code}</span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex min-w-0 items-center gap-2">
              <span className="shrink-0">平台 ID</span>
              <ResourceId value={platform.platform_id} />
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end xl:items-start">
          <PlatformSwitcher current={platform} />
          {actions ? (
            <div className="flex items-center gap-2">{actions}</div>
          ) : null}
        </div>
      </div>

      {platform.status === 'disabled' ? (
        <Alert data-test="platform-disabled-warning">
          <AlertTitle>平台已停用</AlertTitle>
          <AlertDescription>
            新的激活流程会继续受到服务端策略限制；当前工作区仍显示真实诊断和配置数据。
            <Button
              variant="link"
              size="sm"
              className="ml-1 px-0"
              render={<Link href={`${workspaceHref}/settings`} />}
            >
              查看平台设置
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <PlatformNavigation platformId={platform.platform_id} />
    </section>
  );
}
