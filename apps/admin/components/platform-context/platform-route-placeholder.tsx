import Link from 'next/link';

import { Button } from '@kit/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@kit/ui/empty';

import { AdminPageHeader } from '../shell/admin-page-header';

type PlatformRoutePlaceholderProps = {
  title: string;
  description: string;
  platformId: string;
  nextPhase: string;
};

export function PlatformRoutePlaceholder({
  title,
  description,
  platformId,
  nextPhase,
}: PlatformRoutePlaceholderProps) {
  return (
    <section className="grid gap-5" data-test="platform-route-placeholder">
      <AdminPageHeader title={title} description={description} />
      <section className="panel gap-5">
        <Empty className="min-h-64 border-border/70 bg-card">
          <EmptyHeader>
            <EmptyTitle>真实资源面板即将接入</EmptyTitle>
            <EmptyDescription>
              当前入口不会渲染虚构行或临时统计。平台上下文已锁定为 URL 中的{' '}
              <code className="font-mono text-xs">{platformId}</code>，将在{' '}
              {nextPhase} 接入对应 API 和完整状态流。
            </EmptyDescription>
          </EmptyHeader>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={`/admin/platforms/${platformId}`} />}
          >
            返回平台概览
          </Button>
        </Empty>
      </section>
    </section>
  );
}
