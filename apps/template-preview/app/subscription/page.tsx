import Link from 'next/link';

import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';

import { ConsumerShell } from '../../components/consumer-shell';
import { ReferenceApiCard } from '../../components/reference-api';

export default function SubscriptionPage() {
  return (
    <ConsumerShell
      title="套餐动作页面模板"
      description="这里展示选择套餐或发起业务动作时的页面结构。当前没有真实订阅、权益、兑换码或用户状态。"
      actions={<span className="reference-mode-badge">静态示例</span>}
    >
      <section className="consumer-stat-grid" aria-label="套餐摘要示例">
        <div className="consumer-stat">
          <span className="consumer-stat-label">当前方案</span>
          <span className="consumer-stat-value text-base">Starter</span>
          <span className="consumer-help">演示数据</span>
        </div>
        <div className="consumer-stat">
          <span className="consumer-stat-label">动作入口</span>
          <span className="consumer-stat-value text-base">选择方案</span>
          <span className="consumer-help">由平台业务 API 决定</span>
        </div>
        <div className="consumer-stat">
          <span className="consumer-stat-label">数据来源</span>
          <span className="consumer-stat-value text-base">本地示例</span>
          <span className="consumer-help">不会读取用户状态</span>
        </div>
      </section>

      <section className="consumer-card">
        <div className="consumer-card-header">
          <div>
            <h2>发起套餐动作</h2>
            <p className="consumer-card-description">
              如果你的平台需要购买、升级或兑换，可以在这里放置表单和结果反馈。
            </p>
          </div>
          <Button variant="outline" render={<Link href="/pricing" />}>
            返回套餐展示
          </Button>
        </div>
        <div className="consumer-form">
          <div className="consumer-field">
            <Label htmlFor="plan-code">方案代码</Label>
            <Input id="plan-code" defaultValue="pro" />
          </div>
          <div className="consumer-field">
            <Label htmlFor="action-code">业务动作参数</Label>
            <Input id="action-code" placeholder="按你的平台定义" />
          </div>
          <div className="consumer-actions">
            <Button type="button" disabled>
              接入 API 后提交
            </Button>
          </div>
        </div>
      </section>

      <ReferenceApiCard
        title="发起业务动作的 API 接入位置"
        method="POST"
        path="/api/v1/checkout"
        description="这是通用示例路径，不绑定 Aisenhub 的账户或订阅合同；正式项目请替换为自己的业务接口。"
        code={`await fetch('/api/v1/checkout', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ plan_code: 'pro' }),
});`}
      />
    </ConsumerShell>
  );
}
