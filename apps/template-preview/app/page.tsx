import Link from 'next/link';

import { Button } from '@kit/ui/button';

import { ConsumerShell } from '../components/consumer-shell';

const entryPoints = [
  {
    href: '/account',
    title: '账户资料',
    description: '管理资料与偏好；保存前会校验服务端版本。',
  },
  {
    href: '/subscription',
    title: '订阅权益',
    description: '查看真实权益状态，使用稳定 intent 兑换。',
  },
  {
    href: '/files',
    title: '配置文件',
    description: '上传、下载和删除都遵守服务端状态机。',
  },
] as const;

export default function TemplatePreviewPage() {
  return (
    <ConsumerShell
      eyebrow="Consumer Preview"
      title="把账户任务做得清楚、可恢复"
      description="一个面向普通用户的轻量工作区。数据由同源 BFF 读取，敏感动作保留正式确认、认证和服务端结果。"
      actions={
        <Button size="sm" render={<Link href="/login" />}>
          登录
        </Button>
      }
    >
      <section
        className="consumer-card consumer-card-muted"
        data-test="consumer-hero"
      >
        <div className="consumer-card-header">
          <div>
            <p className="consumer-eyebrow">Your workspace</p>
            <h2 className="mt-2">从一个明确的下一步开始</h2>
            <p className="consumer-card-description">
              初始加载、空数据、恢复错误和异步操作会分别表达；技术详情只在需要支持时展开。
            </p>
          </div>
          <span
            className="hidden text-5xl font-semibold text-primary/20 sm:block"
            aria-hidden="true"
          >
            01
          </span>
        </div>
        <div className="consumer-actions">
          <Button render={<Link href="/account" />}>进入账户</Button>
          <Button variant="outline" render={<Link href="/pricing" />}>
            查看套餐
          </Button>
        </div>
      </section>

      <section className="consumer-grid-two" aria-label="功能入口">
        {entryPoints.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="consumer-card group outline-none transition-colors hover:border-primary/45 focus-visible:ring-2 focus-visible:ring-focus"
          >
            <span className="consumer-eyebrow">Workspace</span>
            <span className="text-lg font-semibold text-foreground">
              {item.title}
            </span>
            <span className="consumer-card-description">
              {item.description}
            </span>
            <span className="consumer-inline-link">打开 →</span>
          </Link>
        ))}
      </section>
    </ConsumerShell>
  );
}
