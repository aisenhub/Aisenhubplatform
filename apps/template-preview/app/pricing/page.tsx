import Link from 'next/link';

import { Button } from '@kit/ui/button';

import { ConsumerShell } from '../../components/consumer-shell';
import { ReferenceApiCard } from '../../components/reference-api';

const plans = [
  {
    code: 'starter',
    name: 'Starter',
    description: '适合刚开始验证产品流程的小型项目。',
    features: ['基础页面模板', '标准 API 配置', '开发环境示例'],
  },
  {
    code: 'pro',
    name: 'Pro',
    description: '适合需要更多业务能力和自定义空间的项目。',
    features: ['完整页面模板', '可替换 API 适配层', '业务模块扩展位'],
  },
] as const;

export default function PricingPage() {
  return (
    <ConsumerShell
      title="套餐页面模板"
      description="公开展示套餐的页面结构。这里使用演示数据，不登录、不读取当前用户权益，也不执行购买或兑换。"
      actions={<span className="reference-mode-badge">静态示例</span>}
    >
      <section className="consumer-grid-two" aria-label="套餐示例列表">
        {plans.map((plan) => (
          <article key={plan.code} className="consumer-card">
            <div className="consumer-card-header">
              <div>
                <h2>{plan.name}</h2>
                <p className="consumer-card-meta">示例套餐</p>
              </div>
              <span className="consumer-code">{plan.code}</span>
            </div>
            <p className="consumer-card-description">{plan.description}</p>
            <ul className="consumer-feature-list">
              {plan.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <Button variant="outline" render={<Link href="/subscription" />}>
              查看动作示例
            </Button>
          </article>
        ))}
      </section>

      <ReferenceApiCard
        title="读取套餐列表"
        method="GET"
        path="/api/v1/plans"
        description="正式平台可以把套餐卡片的数据替换为自己的公开配置 API。"
        code={`const response = await fetch('/api/v1/plans', {
  headers: { Accept: 'application/json' },
});
const { data } = await response.json();`}
      />
    </ConsumerShell>
  );
}
