import { AdminNav } from './components/admin-nav';

export default function AdminHomePage() {
  return (
    <main className="shell">
      <AdminNav />
      <p className="eyebrow">Aisenhub Admin</p>
      <h1>Admin control center</h1>
      <p className="muted">
        M3 的计划、权益和兑换批次通过中央 Account API 进入受控数据库领域函数。
      </p>
      <div className="panel">
        <strong>继续到权益控制台</strong>
        <span>需要有效管理员会话、AAL2 和敏感操作的近期认证证明。</span>
        <a className="link" href="/admin/entitlements">
          打开 M3 Entitlements
        </a>
      </div>
      <div className="panel">
        <strong>继续到文件运维</strong>
        <span>查看策略、文件状态并通过近期 MFA 证明代理下载。</span>
        <a className="link" href="/admin/files">
          打开 M4 File Operations
        </a>
      </div>
      <div className="panel">
        <strong>继续到删除任务</strong>
        <span>近期 MFA 批准 Global Delete，并查看可恢复 checkpoint。</span>
        <a className="link" href="/admin/deletion-jobs">
          打开 M4 Deletion Jobs
        </a>
      </div>
      <div className="panel">
        <strong>继续到平台运维</strong>
        <span>平台、Origin、账户状态和 Key 生命周期均经 Admin API。</span>
        <a className="link" href="/admin/platforms">
          打开 M2 Platform Operations
        </a>
      </div>
      <div className="panel">
        <strong>继续到订阅</strong>
        <span>
          读取订阅投影并提交带原因、operation_id 和近期 MFA 的受控命令。
        </span>
        <a className="link" href="/admin/subscriptions">
          打开 Subscription Operations
        </a>
      </div>
      <div className="panel">
        <strong>查看审计</strong>
        <span>只读筛选审计记录；后端尚未实现时明确显示 contract-only。</span>
        <a className="link" href="/admin/audit">
          打开 Audit Log
        </a>
      </div>
    </main>
  );
}
