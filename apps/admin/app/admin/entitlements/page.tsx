'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { AdminNav } from '../components/admin-nav';

type Plan = {
  plan_id: string;
  code: string;
  name: string;
  kind: 'free' | 'paid';
  status: 'active' | 'archived';
  is_default: boolean;
};

type Batch = {
  batch_id: string;
  plan_code: string;
  name: string;
  quantity: number;
  status: string;
  expires_at: string;
};

function csrfToken(): string {
  return (
    document.cookie
      .split('; ')
      .find((entry) => entry.startsWith('aisenhub-csrf='))
      ?.split('=')[1] ?? ''
  );
}

export default function EntitlementsPage() {
  const [platformId, setPlatformId] = useState('');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [status, setStatus] = useState('输入 Platform ID 后加载管理数据。');
  const [planCode, setPlanCode] = useState('pro');
  const [planName, setPlanName] = useState('Pro');
  const [planKind, setPlanKind] = useState<'free' | 'paid'>('paid');

  const load = useCallback(async () => {
    if (!platformId) return;
    setStatus('正在读取…');
    const [plansResponse, batchesResponse] = await Promise.all([
      fetch(`/api/v1/admin/api/v1/platforms/${platformId}/plans`, {
        cache: 'no-store',
      }),
      fetch(
        `/api/v1/admin/api/v1/redemption-batches?platform_id=${encodeURIComponent(platformId)}`,
        {
          cache: 'no-store',
        },
      ),
    ]);
    if (!plansResponse.ok || !batchesResponse.ok) {
      setStatus('读取失败，请确认管理员会话和平台范围。');
      return;
    }
    const plansBody = (await plansResponse.json()) as { data: Plan[] };
    const batchesBody = (await batchesResponse.json()) as { data: Batch[] };
    setPlans(plansBody.data ?? []);
    setBatches(batchesBody.data ?? []);
    setStatus('已加载；所有写入仍由中央 Account API 和数据库领域函数执行。');
  }, [platformId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch(
      `/api/v1/admin/api/v1/platforms/${platformId}/plans`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: window.location.origin,
          'X-CSRF-Token': csrfToken(),
        },
        body: JSON.stringify({
          code: planCode,
          name: planName,
          kind: planKind,
          status: 'active',
          features: {},
          make_default: false,
          clear_default: false,
        }),
      },
    );
    setStatus(
      response.ok ? '计划已提交。' : '计划写入失败，请确认近期认证证明。',
    );
    if (response.ok) await load();
  }

  async function logout() {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: {
        Origin: window.location.origin,
        'X-CSRF-Token': csrfToken(),
      },
    });
    window.location.assign('/admin/login');
  }

  return (
    <main className="shell wide-shell">
      <AdminNav />
      <p className="eyebrow">Aisenhub Admin · M3</p>
      <h1>Entitlements console</h1>
      <p className="muted">
        计划、兑换批次和订阅动作都通过中央 Account API；页面不直连 Supabase
        表，也不计算权益。
      </p>
      <section className="panel">
        <label htmlFor="platform-id">Platform ID</label>
        <div className="inline-form">
          <input
            id="platform-id"
            value={platformId}
            onChange={(event) => setPlatformId(event.target.value)}
            placeholder="UUID"
          />
          <button type="button" onClick={() => void load()}>
            加载
          </button>
        </div>
        <p className="muted">{status}</p>
      </section>
      <section className="grid-two">
        <div className="panel">
          <h2>Plans</h2>
          {plans.length === 0 ? (
            <p className="muted">暂无数据。</p>
          ) : (
            <ul className="data-list">
              {plans.map((plan) => (
                <li key={plan.plan_id}>
                  <strong>{plan.code}</strong>
                  <span>
                    {plan.kind} · {plan.status}
                    {plan.is_default ? ' · default Free' : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={createPlan} className="stack-form">
            <h3>创建计划</h3>
            <input
              value={planCode}
              onChange={(event) => setPlanCode(event.target.value)}
              aria-label="Plan code"
              placeholder="code"
            />
            <input
              value={planName}
              onChange={(event) => setPlanName(event.target.value)}
              aria-label="Plan name"
              placeholder="name"
            />
            <select
              value={planKind}
              onChange={(event) =>
                setPlanKind(event.target.value as 'free' | 'paid')
              }
              aria-label="Plan kind"
            >
              <option value="paid">paid</option>
              <option value="free">free</option>
            </select>
            <button type="submit" disabled={!platformId}>
              创建计划
            </button>
          </form>
        </div>
        <div className="panel">
          <h2>Redemption batches</h2>
          {batches.length === 0 ? (
            <p className="muted">暂无批次。</p>
          ) : (
            <ul className="data-list">
              {batches.map((batch) => (
                <li key={batch.batch_id}>
                  <strong>{batch.name}</strong>
                  <span>
                    {batch.plan_code} · {batch.quantity} · {batch.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="muted">
            兑换码明文只在受控生成响应中出现；页面不会重新导出已生成码。
          </p>
        </div>
      </section>
      <button type="button" onClick={() => void logout()}>
        退出登录
      </button>
    </main>
  );
}
