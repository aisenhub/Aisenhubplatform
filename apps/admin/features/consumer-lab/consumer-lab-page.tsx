import { AdminPageHeader } from '../../components/shell/admin-page-header';
import {
  accountContractSummary,
  adminContractSummary,
  type ContractSummary,
} from './contract-summary';

function ContractCard({ summary }: { summary: ContractSummary }) {
  return (
    <section className="panel gap-3">
      <div>
        <h2>{summary.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Canonical contract metadata，直接来自仓库根 contracts 目录。
        </p>
      </div>
      <dl className="detail-list text-sm">
        <div>
          <dt>Wire major</dt>
          <dd>{summary.major}</dd>
        </div>
        <div>
          <dt>Spec version</dt>
          <dd>{summary.version}</dd>
        </div>
        <div>
          <dt>Operations</dt>
          <dd>{summary.operations.length}</dd>
        </div>
        <div>
          <dt>Security schemes</dt>
          <dd>{summary.securitySchemes.join(', ') || 'none'}</dd>
        </div>
      </dl>
    </section>
  );
}

export function ConsumerLabPage() {
  return (
    <main className="shell wide-shell" data-test="consumer-lab-page">
      <AdminPageHeader
        title="Consumer Lab"
        description="浏览公共 HTTP 合同和本地 Consumer Conformance Harness 边界。这里不执行、保存或展示 Consumer Secret。"
      />

      <section className="panel gap-2" aria-labelledby="consumer-lab-purpose">
        <h2 id="consumer-lab-purpose">维护与诊断入口</h2>
        <p className="text-sm leading-6 text-muted-foreground">
          Consumer Lab 只负责可视化 canonical contract 和中央测试入口。外部
          Consumer 兼容性必须由独立 Harness 和真实 HTTP/E2E 证明；Admin 私有
          helper、数据库或特权 API 不能替代该证据。
        </p>
      </section>

      <section
        className="grid gap-4 lg:grid-cols-2"
        aria-label="Canonical contracts"
      >
        <ContractCard summary={accountContractSummary} />
        <ContractCard summary={adminContractSummary} />
      </section>

      <section className="panel gap-4" aria-labelledby="harness-heading">
        <div>
          <h2 id="harness-heading">Consumer Conformance Harness</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Harness 位于 <code>tests/consumer-harness</code>，是 Local/test-only
            的极薄 HTTP Consumer，不是 Starter App、SDK
            或生产部署目标。本页不会持久化或伪造最近一次测试结果。
          </p>
        </div>
        <div className="rounded-lg border border-border/70 bg-muted/30 p-4 font-mono text-sm">
          pnpm test:consumer-harness
        </div>
        <ul className="grid gap-2 text-sm leading-6 text-muted-foreground md:grid-cols-2">
          <li>Platform Key 只存在 Harness server/test process。</li>
          <li>用户 access/refresh token 只进入 HttpOnly Cookie。</li>
          <li>Mutation 使用精确 Origin + CSRF 双重校验。</li>
          <li>中央授权、合同或上游不可用时 fail closed。</li>
          <li>私有 Storage 只通过 Account API/BFF，不由浏览器直连。</li>
          <li>no-store、request_id、ETag/If-Match 和 binary 边界保持。</li>
        </ul>
      </section>

      <section
        className="panel gap-4"
        aria-labelledby="account-operations-heading"
      >
        <div>
          <h2 id="account-operations-heading">Account v1 operations</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            下表直接从 canonical Account OpenAPI
            构建；这里不维护第二套路由清单。
          </p>
        </div>
        <div
          className="max-w-full overflow-x-auto rounded-lg border border-border/70"
          tabIndex={0}
          aria-label="Account v1 operation table"
        >
          <table className="w-full min-w-[52rem] text-left text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 font-medium">Method</th>
                <th className="px-3 py-2 font-medium">Path</th>
                <th className="px-3 py-2 font-medium">Operation ID</th>
                <th className="px-3 py-2 font-medium">Security</th>
              </tr>
            </thead>
            <tbody>
              {accountContractSummary.operations.map((operation) => (
                <tr
                  key={`${operation.method}:${operation.path}`}
                  className="border-t border-border/60"
                >
                  <td className="px-3 py-2 font-mono">{operation.method}</td>
                  <td className="px-3 py-2 font-mono">{operation.path}</td>
                  <td className="px-3 py-2 font-mono">
                    {operation.operationId}
                  </td>
                  <td className="px-3 py-2">
                    {operation.security.join(', ') || 'none'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
