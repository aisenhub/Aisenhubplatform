import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { Textarea } from '@kit/ui/textarea';

import { ConsumerShell } from '../../components/consumer-shell';
import { ReferenceApiCard } from '../../components/reference-api';

export default function SettingsPage() {
  return (
    <ConsumerShell
      title="设置页面模板"
      description="这是表单布局和反馈位置的参考，不代表平台必须提供账户中心，也不会读取或保存当前用户信息。"
      actions={<span className="reference-mode-badge">本地演示</span>}
    >
      <section className="consumer-notice consumer-notice-info" role="note">
        <strong>此页面只展示 UI 结构</strong>
        <p>输入框中的内容是示例值。接入具体平台时，再由平台决定字段、权限和 API。</p>
      </section>

      <div className="consumer-grid-two">
        <section className="consumer-card">
          <div>
            <h2>基础设置</h2>
            <p className="consumer-card-description">适合放置项目名称、简介等普通设置。</p>
          </div>
          <div className="consumer-form">
            <div className="consumer-field">
              <Label htmlFor="project-name">项目名称</Label>
              <Input id="project-name" defaultValue="示例项目" />
            </div>
            <div className="consumer-field">
              <Label htmlFor="project-description">项目简介</Label>
              <Textarea id="project-description" defaultValue="这是一个平台页面参考。" rows={5} />
            </div>
            <div className="consumer-actions">
              <Button type="button" disabled>
                接入 API 后保存
              </Button>
            </div>
          </div>
        </section>

        <section className="consumer-card">
          <div>
            <h2>偏好设置</h2>
            <p className="consumer-card-description">适合放置显示、通知或业务偏好。</p>
          </div>
          <div className="consumer-form">
            <div className="consumer-field">
              <Label htmlFor="display-mode">显示模式</Label>
              <select id="display-mode" defaultValue="system">
                <option value="system">跟随系统</option>
                <option value="light">浅色</option>
                <option value="dark">深色</option>
              </select>
            </div>
            <div className="consumer-field">
              <Label htmlFor="preference-json">偏好 JSON 示例</Label>
              <Textarea
                id="preference-json"
                defaultValue={'{\n  "density": "comfortable"\n}'}
                rows={5}
                spellCheck={false}
              />
            </div>
            <div className="consumer-actions">
              <Button type="button" variant="outline" disabled>
                接入 API 后保存
              </Button>
            </div>
          </div>
        </section>
      </div>

      <ReferenceApiCard
        title="保存设置的 API 接入位置"
        method="PATCH"
        path="/api/v1/settings"
        description="页面只展示请求形状；正式项目中由你决定是否需要认证、版本号、幂等或权限校验。"
        code={`await fetch('/api/v1/settings', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name, description }),
});`}
      />
    </ConsumerShell>
  );
}
