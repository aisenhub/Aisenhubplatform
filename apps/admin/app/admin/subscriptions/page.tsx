'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';

type Subscription = {
  status?: string;
  plan_code?: string | null;
  current_period_end?: string | null;
  [key: string]: unknown;
};

function csrfToken(): string {
  return (
    document.cookie
      .split('; ')
      .find((entry) => entry.startsWith('aisenhub-csrf='))
      ?.split('=')[1] ?? ''
  );
}

function mutationHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Origin: window.location.origin,
    'X-CSRF-Token': csrfToken(),
  };
}

function requestCode(response: Response, payload: unknown): string {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const error = (payload as { error?: { code?: string } }).error;
    if (error?.code) return error.code;
  }
  return `HTTP_${response.status}`;
}

export default function AdminSubscriptionsPage() {
  const [platformId, setPlatformId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [command, setCommand] = useState('pause');
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState('输入 Platform Account ID 后读取订阅。');
  const [busy, setBusy] = useState(false);

  async function load(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!platformId || !accountId) return;
    setBusy(true);
    setStatus('正在读取订阅投影…');
    try {
      const response = await fetch(
        `/api/v1/admin/api/v1/subscriptions/${encodeURIComponent(accountId)}?platform_id=${encodeURIComponent(platformId)}`,
        { cache: 'no-store' },
      );
      const payload = (await response.json().catch(() => null)) as {
        data?: Subscription;
      } | null;
      if (!response.ok) {
        setStatus(`读取失败：${requestCode(response, payload)}。`);
        setSubscription(null);
        return;
      }
      setSubscription(payload?.data ?? null);
      setStatus('订阅投影已刷新；页面不直接编辑 Projection。');
    } catch {
      setStatus('读取失败：AUTHORIZATION_UNAVAILABLE。');
    } finally {
      setBusy(false);
    }
  }

  async function applyCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!platformId || !accountId || !reason.trim()) {
      setStatus(
        '平台范围、账户 ID 和敏感订阅动作原因均为必填；原因不要包含个人信息。',
      );
      return;
    }
    if (!window.confirm(`确认对账户 ${accountId} 执行 ${command}？`)) return;
    setBusy(true);
    const operationId = crypto.randomUUID();
    setStatus(`正在提交 ${command}…`);
    try {
      const response = await fetch(
        `/api/v1/admin/api/v1/subscriptions/${encodeURIComponent(accountId)}/commands?platform_id=${encodeURIComponent(platformId)}`,
        {
          method: 'POST',
          headers: mutationHeaders(),
          body: JSON.stringify({
            action: command,
            operation_id: operationId,
            reason: reason.trim(),
          }),
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setStatus(
          response.status === 409
            ? '订阅发生并发冲突（409），请刷新后重新确认当前状态。'
            : `提交失败：${requestCode(response, payload)}。MFA 过期时请重新验证。`,
        );
        return;
      }
      setStatus(`操作已完成（operation_id: ${operationId}）。`);
      await load();
    } catch {
      setStatus(
        `网络失败；请使用相同 operation_id ${operationId} 重试，不要生成第二次业务操作。`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell wide-shell">
      <p className="eyebrow">Aisenhub Admin · M3</p>
      <h1>Subscription operations</h1>
      <p className="muted">
        只通过 Admin API 读取投影和提交受控 command；没有直接 PATCH Projection
        的入口。敏感动作需要近期 MFA proof。
      </p>
      <form className="panel stack-form" onSubmit={load}>
        <label htmlFor="platform-id">Platform ID</label>
        <input
          id="platform-id"
          value={platformId}
          onChange={(event) => setPlatformId(event.target.value)}
          placeholder="UUID"
          required
        />
        <label htmlFor="account-id">Platform Account ID</label>
        <div className="inline-form">
          <input
            id="account-id"
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
            placeholder="UUID"
            required
          />
          <button type="submit" disabled={busy || !platformId || !accountId}>
            读取
          </button>
        </div>
        <span className="muted" role="status">
          {status}
        </span>
      </form>
      <section className="grid-two">
        <div className="panel">
          <h2>当前投影</h2>
          {subscription ? (
            <dl className="detail-list">
              <div>
                <dt>状态</dt>
                <dd>{subscription.status ?? 'unknown'}</dd>
              </div>
              <div>
                <dt>计划</dt>
                <dd>{subscription.plan_code ?? 'free / null'}</dd>
              </div>
              <div>
                <dt>周期结束</dt>
                <dd>{subscription.current_period_end ?? 'perpetual / null'}</dd>
              </div>
            </dl>
          ) : (
            <p className="muted">尚未读取账户订阅。</p>
          )}
        </div>
        <form className="panel stack-form" onSubmit={applyCommand}>
          <h2>提交订阅命令</h2>
          <label htmlFor="command">Command</label>
          <select
            id="command"
            value={command}
            onChange={(event) => setCommand(event.target.value)}
          >
            <option value="pause">pause</option>
            <option value="resume">resume</option>
            <option value="grant">grant</option>
            <option value="revoke">revoke</option>
            <option value="correct">correct</option>
          </select>
          <label htmlFor="reason">Reason（必填，勿含个人信息）</label>
          <textarea
            id="reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            minLength={3}
            maxLength={500}
            required
          />
          <button type="submit" disabled={busy || !platformId || !accountId}>
            确认并提交（需近期 MFA）
          </button>
        </form>
      </section>
      <a className="link" href="/admin">
        返回控制中心
      </a>
    </main>
  );
}
