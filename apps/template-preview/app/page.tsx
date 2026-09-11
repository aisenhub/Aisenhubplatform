import Link from 'next/link';

import { Button } from '@kit/ui/button';

import { ConsumerShell } from '../components/consumer-shell';
import { ReferenceApiCard } from '../components/reference-api';

const entryPoints = [
  {
    href: '/account',
    title: '设置页模板',
    description: '展示表单、偏好设置和保存反馈的页面结构。',
  },
  {
    href: '/subscription',
    title: '套餐页模板',
    description: '展示套餐卡片、选择方案和业务动作入口。',
  },
  {
    href: '/files',
    title: '资源页模板',
    description: '展示列表、空状态、操作按钮和资源状态。',
  },
] as const;

export default function TemplatePreviewPage() {
  return (
    <ConsumerShell
      title="跨平台页面参考模板"
      description="这里是给产品开发者使用的公开样板。页面展示结构、交互位置和 API 接入方式，不登录、不读取用户状态，也不连接真实业务数据。"
      actions={<span className="reference-mode-badge">参考模式</span>}
    >
      <section className="consumer-card consumer-card-muted" data-test="reference-hero">
        <div className="consumer-card-header">
          <div>
            <h2>先复制页面结构，再接入你的业务</h2>
            <p className="consumer-card-description">
              你可以把这些页面当作起始模板，替换品牌、文案和数据模型；真正的登录、权限和用户数据由各个平台自己决定。
            </p>
          </div>
          <span className="hidden text-5xl font-semibold text-primary/20 sm:block" aria-hidden="true">
            UI
          </span>
        </div>
        <div className="consumer-actions">
          <Button render={<Link href="/pricing" />}>查看页面示例</Button>
          <Button variant="outline" render={<Link href="/files" />}>
            查看资源页
          </Button>
        </div>
      </section>

      <section className="consumer-grid-two" aria-label="页面模板入口">
        {entryPoints.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="consumer-card group outline-none transition-colors hover:border-primary/45 focus-visible:ring-2 focus-visible:ring-focus"
          >
            <span className="text-lg font-semibold text-foreground">{item.title}</span>
            <span className="consumer-card-description">{item.description}</span>
            <span className="consumer-inline-link">打开示例 →</span>
          </Link>
        ))}
      </section>

      <ReferenceApiCard
        title="公开配置的 API 接入位置"
        method="GET"
        path="/api/v1/plans"
        description="这是一个接入示意，页面当前不会自动调用；开发具体平台时替换为你的 API 地址和响应类型。"
        code={`const response = await fetch('/api/v1/plans');
const plans = await response.json();

// 业务平台自行决定：是否登录、如何授权、如何保存数据。`}
      />
    </ConsumerShell>
  );
}
