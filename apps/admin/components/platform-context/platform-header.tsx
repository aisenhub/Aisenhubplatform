'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { Button } from '@kit/ui/button';

import type { Platform } from './platform-types';

type PlatformHeaderProps = {
  platform: Platform;
  actions?: ReactNode;
};

export function PlatformHeader({ platform, actions }: PlatformHeaderProps) {
  const workspaceHref = `/admin/platforms/${encodeURIComponent(platform.platform_id)}`;

  if (platform.status !== 'disabled' && !actions) return null;

  return (
    <section
      className="platform-context-header grid gap-3"
      data-test="platform-context-header"
    >
      {actions ? <div className="flex justify-end gap-2">{actions}</div> : null}

      {platform.status === 'disabled' ? (
        <Alert data-test="platform-disabled-warning">
          <AlertTitle>平台已停用</AlertTitle>
          <AlertDescription>
            新的激活流程会继续受到服务端策略限制；当前工作区仍显示真实诊断和配置数据。
            <Button
              variant="link"
              size="sm"
              className="ml-1 px-0"
              nativeButton={false}
              render={<Link href={`${workspaceHref}/settings`} />}
            >
              查看平台设置
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
    </section>
  );
}
