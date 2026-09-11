import { Button } from '@kit/ui/button';

import { ConsumerShell } from '../../components/consumer-shell';
import { ReferenceApiCard } from '../../components/reference-api';

const resources = [
  { name: 'example.config', type: '配置示例', status: '可用', size: '2 KB' },
  { name: 'README.md', type: '说明文档', status: '可用', size: '6 KB' },
] as const;

export default function FilesPage() {
  return (
    <ConsumerShell
      title="资源列表页面模板"
      description="这是文件、素材或其他业务资源的列表参考。列表内容是静态演示数据，不访问 Storage、不上传、不下载，也不绑定用户账户。"
      actions={<span className="reference-mode-badge">本地演示</span>}
    >
      <section className="consumer-card">
        <div className="consumer-card-header">
          <div>
            <h2>资源列表</h2>
            <p className="consumer-card-description">可替换为你的文件、项目、素材或业务对象。</p>
          </div>
          <Button type="button" disabled>
            接入 API 后上传
          </Button>
        </div>
        <div className="consumer-data-list">
          {resources.map((resource) => (
            <div className="consumer-row" key={resource.name}>
              <div>
                <div className="consumer-row-title">{resource.name}</div>
                <span className="consumer-row-meta">
                  {resource.type} · {resource.size}
                </span>
              </div>
              <div className="consumer-row-actions">
                <span className="reference-status-badge">{resource.status}</span>
                <Button type="button" variant="outline" size="sm" disabled>
                  下载
                </Button>
                <Button type="button" variant="ghost" size="sm" disabled>
                  删除
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <ReferenceApiCard
        title="资源列表 API 接入位置"
        method="GET"
        path="/api/v1/resources"
        description="列表、上传、下载和删除都可以按这个页面结构接入自己的后端；当前页面不会发起请求。"
        code={`const response = await fetch('/api/v1/resources');
const { items } = await response.json();

// 上传/下载/删除按你的业务权限与存储方案实现。`}
      />
    </ConsumerShell>
  );
}
