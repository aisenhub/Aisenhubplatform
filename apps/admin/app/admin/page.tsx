import Link from 'next/link';

import { ArrowUpRightIcon } from 'lucide-react';

import { AdminPageHeader } from '../../components/shell/admin-page-header';

const overviewLinks = [
  {
    title: '平台管理',
    description: '管理平台、Origin、账户状态和 API 密钥生命周期。',
    href: '/admin/platforms',
  },
  {
    title: '权益与套餐',
    description: '管理套餐、权益和兑换码批次；不直接修改权益投影。',
    href: '/admin/entitlements',
  },
  {
    title: '订阅操作',
    description: '在明确账户上下文中读取订阅并提交受控命令。',
    href: '/admin/subscriptions',
  },
  {
    title: '配置文件',
    description: '查看文件策略、状态和需要 worker 继续处理的任务。',
    href: '/admin/files',
  },
  {
    title: '运维任务',
    description: '跟踪删除任务的真实 checkpoint、重试和阻塞原因。',
    href: '/admin/deletion-jobs',
  },
  {
    title: '审计记录',
    description: '只读查看脱敏事件、请求 ID 和安全技术详情。',
    href: '/admin/audit',
  },
] as const;

export default function AdminHomePage() {
  return (
    <main className="shell wide-shell" data-test="admin-overview">
      <AdminPageHeader
        title="管理员总览"
        description="集中管理 Aisenhub 平台资源。所有敏感写操作仍由 Admin API、近期 MFA 和领域状态机共同约束。"
      />

      <section className="panel gap-5" aria-labelledby="overview-entry-heading">
        <div className="flex flex-col gap-1">
          <h2 id="overview-entry-heading">工作入口</h2>
          <p className="text-sm text-muted-foreground">
            从资源页开始操作；系统状态页将在具备真实数据源后启用。
          </p>
        </div>
        <ul className="grid gap-2 p-0 sm:grid-cols-2" role="list">
          {overviewLinks.map((item) => (
            <li key={item.href} className="list-none">
              <Link
                href={item.href}
                data-test={`overview-link-${item.href.split('/').pop()}`}
                className="group flex h-full items-start justify-between gap-4 rounded-lg border border-border/80 bg-background p-4 outline-none transition-colors hover:border-primary/40 hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-focus"
              >
                <span className="min-w-0">
                  <span className="block font-medium text-foreground">
                    {item.title}
                  </span>
                  <span className="mt-1 block text-sm leading-5 text-muted-foreground">
                    {item.description}
                  </span>
                </span>
                <ArrowUpRightIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
