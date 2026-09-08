export default function AdminHomePage() {
  return (
    <main className="shell">
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
        <strong>继续到平台运维</strong>
        <span>平台、Origin、账户状态和 Key 生命周期均经 Admin API。</span>
        <a className="link" href="/admin/platforms">
          打开 M2 Platform Operations
        </a>
      </div>
    </main>
  );
}
