'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminFilterInput } from '../components/admin-filter-input';

type AuditEntry = {
  id?: string;
  action?: string;
  actor_id?: string | null;
  target_type?: string | null;
  target_id?: string | null;
  outcome?: string | null;
  created_at?: string | null;
};

export default function AdminAuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [filter, setFilter] = useState('');
  const [status, setStatus] = useState('正在读取审计日志…');

  const load = useCallback(async () => {
    setStatus('正在读取审计日志…');
    try {
      const response = await fetch('/api/v1/admin/api/v1/audit?limit=50', {
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => null)) as {
        data?: AuditEntry[];
        error?: { code?: string };
      } | null;
      if (!response.ok) {
        setEntries([]);
        setStatus(
          response.status === 404 || response.status === 501
            ? '审计查询尚未由后端实现（contract-only），未伪造空结果。'
            : `审计读取失败：${payload?.error?.code ?? `HTTP_${response.status}`}。`,
        );
        return;
      }
      setEntries(payload?.data ?? []);
      setStatus(`已读取 ${payload?.data?.length ?? 0} 条审计记录。`);
    } catch {
      setStatus('审计读取失败：AUTHORIZATION_UNAVAILABLE。');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleEntries = useMemo(
    () =>
      entries.filter((entry) =>
        `${entry.action ?? ''} ${entry.target_type ?? ''}`
          .toLowerCase()
          .includes(filter.trim().toLowerCase()),
      ),
    [entries, filter],
  );

  return (
    <main className="shell wide-shell">
      <p className="eyebrow">Aisenhub Admin · M2</p>
      <h1>Audit log</h1>
      <p className="muted">
        只读、脱敏、服务端分页的审计资源；页面不允许编辑、删除或重放审计记录。
      </p>
      <section className="panel">
        <div className="section-heading">
          <AdminFilterInput
            id="audit-filter"
            label="筛选 action / target"
            value={filter}
            onChange={setFilter}
            placeholder="例如 revoke、platform"
          />
          <button type="button" onClick={() => void load()}>
            刷新
          </button>
        </div>
        <p className="muted" role="status">
          {status}
        </p>
        {visibleEntries.length === 0 ? (
          <p className="muted">
            暂无可显示记录；若后端返回 contract-only，不将其解释为空数据。
          </p>
        ) : (
          <div
            className="data-table"
            role="table"
            aria-label="Audit log entries"
          >
            <div className="data-table-row data-table-head" role="row">
              <span>时间</span>
              <span>动作</span>
              <span>目标</span>
              <span>结果</span>
            </div>
            {visibleEntries.map((entry) => (
              <div className="data-table-row" role="row" key={entry.id}>
                <span>{entry.created_at ?? '—'}</span>
                <span>{entry.action ?? '—'}</span>
                <span>
                  {entry.target_type ?? '—'} {entry.target_id ?? ''}
                </span>
                <span>{entry.outcome ?? '—'}</span>
              </div>
            ))}
          </div>
        )}
      </section>
      <a className="link" href="/admin">
        返回控制中心
      </a>
    </main>
  );
}
