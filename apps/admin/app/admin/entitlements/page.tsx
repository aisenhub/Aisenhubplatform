'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { AdminFilterInput } from '../components/admin-filter-input';
import { AdminNav } from '../components/admin-nav';
import {
  adminAuthSession,
  useAdminSessionSnapshot,
} from '../../_lib/auth-session';

type Plan = {
  plan_id: string;
  code: string;
  name: string;
  kind: 'free' | 'paid';
  status: 'active' | 'archived';
  is_default: boolean;
  description?: string | null;
  features?: Record<string, unknown>;
};

type Batch = {
  batch_id: string;
  plan_code?: string;
  name: string;
  quantity: number;
  status: string;
  expires_at?: string;
};

export default function EntitlementsPage() {
  const sessionSnapshot = useAdminSessionSnapshot();
  const [platformId, setPlatformId] = useState('');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [planFilter, setPlanFilter] = useState('');
  const [batchFilter, setBatchFilter] = useState('');
  const [status, setStatus] = useState('输入 Platform ID 后加载管理数据。');
  const [planCode, setPlanCode] = useState('pro');
  const [planName, setPlanName] = useState('Pro');
  const [planKind, setPlanKind] = useState<'free' | 'paid'>('paid');
  const [batchPlanId, setBatchPlanId] = useState('');
  const [batchName, setBatchName] = useState('Admin batch');
  const [batchQuantity, setBatchQuantity] = useState('1');
  const [batchCodes, setBatchCodes] = useState<string[]>([]);
  const [batchReceipt, setBatchReceipt] = useState('');

  useEffect(() => {
    if (
      !sessionSnapshot.resolved ||
      !['unauthenticated', 'expired'].includes(sessionSnapshot.state)
    )
      return;
    setPlans([]);
    setBatches([]);
    setBatchCodes([]);
    setBatchReceipt('');
    setStatus('会话已结束，计划与批次数据已清理。');
  }, [sessionSnapshot.resolved, sessionSnapshot.state]);

  const load = useCallback(async () => {
    if (!platformId) return;
    const epoch = adminAuthSession.getEpoch();
    setStatus('正在读取…');
    const [plansResponse, batchesResponse] = await Promise.all([
      adminAuthSession.request(
        `/api/v1/admin/api/v1/platforms/${platformId}/plans`,
        {
          cache: 'no-store',
        },
      ),
      adminAuthSession.request(
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
    if (!adminAuthSession.isCurrentEpoch(epoch)) return;
    setPlans(plansBody.data ?? []);
    setBatches(batchesBody.data ?? []);
    setBatchPlanId((current) => current || plansBody.data?.[0]?.plan_id || '');
    setStatus('已加载；所有写入仍由中央 Account API 和数据库领域函数执行。');
  }, [platformId]);

  useEffect(() => {
    void load();
  }, [load]);

  const visiblePlans = plans.filter((plan) =>
    `${plan.code} ${plan.name} ${plan.kind} ${plan.status}`
      .toLowerCase()
      .includes(planFilter.trim().toLowerCase()),
  );
  const visibleBatches = batches.filter((batch) =>
    `${batch.name} ${batch.plan_code ?? ''} ${batch.status}`
      .toLowerCase()
      .includes(batchFilter.trim().toLowerCase()),
  );

  async function createPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await adminAuthSession.request(
      `/api/v1/admin/api/v1/platforms/${platformId}/plans`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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

  async function updatePlan(
    plan: Plan,
    changes: {
      status?: 'active' | 'archived';
      make_default?: boolean;
      clear_default?: boolean;
    },
  ) {
    if (changes.status === 'archived' && plan.is_default) {
      setStatus('默认 Free 计划不能直接归档；请先切换或清空默认计划。');
      return;
    }
    if (
      changes.status === 'archived' &&
      !window.confirm(`确认归档 Plan ${plan.code}？历史权益不会被删除。`)
    )
      return;
    const response = await adminAuthSession.request(
      `/api/v1/admin/api/v1/platforms/${platformId}/plans`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          plan_id: plan.plan_id,
          code: plan.code,
          name: plan.name,
          description: plan.description ?? null,
          kind: plan.kind,
          features: plan.features ?? {},
          status: changes.status ?? plan.status,
          make_default: changes.make_default ?? false,
          clear_default: changes.clear_default ?? false,
        }),
      },
    );
    setStatus(
      response.ok
        ? `Plan ${plan.code} 已更新。`
        : 'Plan 更新失败，请确认约束和近期 MFA。',
    );
    if (response.ok) await load();
  }

  async function createBatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!platformId || !batchPlanId) return;
    const response = await adminAuthSession.request(
      '/api/v1/admin/api/v1/redemption-batches',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          platform_id: platformId,
          plan_id: batchPlanId,
          name: batchName,
          quantity: Number(batchQuantity),
          duration_value: 30,
          duration_unit: 'day',
          expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
          delivery_deadline: new Date(Date.now() + 10 * 60_000).toISOString(),
          creation_operation_id: crypto.randomUUID(),
        }),
      },
    );
    const payload = (await response.json().catch(() => null)) as {
      data?: { codes?: Array<{ code?: string }>; delivery_receipt?: string };
      error?: { code?: string };
    } | null;
    if (!response.ok) {
      setStatus(`批次创建失败：${payload?.error?.code ?? response.status}。`);
      return;
    }
    setBatchCodes(
      payload?.data?.codes
        ?.map((code) => code.code)
        .filter((code): code is string => Boolean(code)) ?? [],
    );
    setBatchReceipt(payload?.data?.delivery_receipt ?? '');
    await load();
    setStatus(
      '批次已创建为 pending_delivery；明文码仅在当前响应显示，先保存再确认交付。',
    );
  }

  async function confirmBatch(batchId: string) {
    if (!batchReceipt) {
      setStatus(
        '缺少本次响应中的 delivery receipt，不能确认或重新导出明文码。',
      );
      return;
    }
    if (!window.confirm('确认已安全保存本次明文兑换码，并激活该批次？')) return;
    const response = await adminAuthSession.request(
      `/api/v1/admin/api/v1/redemption-batches/${batchId}/confirm-delivery`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          platform_id: platformId,
          delivery_receipt: batchReceipt,
        }),
      },
    );
    if (!response.ok) {
      setStatus(`交付确认失败：${response.status}。明文码不会重新导出。`);
      return;
    }
    setBatchCodes([]);
    setBatchReceipt('');
    await load();
    setStatus('批次已确认交付；页面已清除本次明文码和 receipt。');
  }

  async function logout() {
    await adminAuthSession.logout();
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
          <AdminFilterInput
            id="plan-filter"
            label="筛选计划"
            value={planFilter}
            onChange={setPlanFilter}
            placeholder="code、name 或 status"
          />
          {visiblePlans.length === 0 ? (
            <p className="muted">暂无数据。</p>
          ) : (
            <ul className="data-list">
              {visiblePlans.map((plan) => (
                <li key={plan.plan_id}>
                  <strong>{plan.code}</strong>
                  <span>
                    {plan.kind} · {plan.status}
                    {plan.is_default ? ' · default Free' : ''}
                    {plan.status === 'active' && !plan.is_default ? (
                      <button
                        type="button"
                        onClick={() =>
                          void updatePlan(plan, { status: 'archived' })
                        }
                      >
                        归档
                      </button>
                    ) : null}{' '}
                    {plan.kind === 'free' && plan.status === 'active' ? (
                      <button
                        type="button"
                        onClick={() =>
                          void updatePlan(plan, { make_default: true })
                        }
                      >
                        设为默认 Free
                      </button>
                    ) : null}{' '}
                    {plan.is_default ? (
                      <button
                        type="button"
                        onClick={() =>
                          void updatePlan(plan, { clear_default: true })
                        }
                      >
                        清空默认
                      </button>
                    ) : null}
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
          <AdminFilterInput
            id="batch-filter"
            label="筛选批次"
            value={batchFilter}
            onChange={setBatchFilter}
            placeholder="name、plan 或 status"
          />
          {visibleBatches.length === 0 ? (
            <p className="muted">暂无批次。</p>
          ) : (
            <ul className="data-list">
              {visibleBatches.map((batch) => (
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
          <form onSubmit={createBatch} className="stack-form">
            <h3>创建一次性批次</h3>
            <label htmlFor="batch-plan">Plan</label>
            <select
              id="batch-plan"
              value={batchPlanId}
              onChange={(event) => setBatchPlanId(event.target.value)}
              required
            >
              <option value="">选择 Plan</option>
              {plans
                .filter((plan) => plan.status === 'active')
                .map((plan) => (
                  <option key={plan.plan_id} value={plan.plan_id}>
                    {plan.code} · {plan.kind}
                  </option>
                ))}
            </select>
            <input
              value={batchName}
              onChange={(event) => setBatchName(event.target.value)}
              aria-label="Batch name"
              placeholder="Batch name"
              required
            />
            <input
              type="number"
              min={1}
              max={1000}
              value={batchQuantity}
              onChange={(event) => setBatchQuantity(event.target.value)}
              aria-label="Batch quantity"
              required
            />
            <button type="submit" disabled={!platformId || !batchPlanId}>
              生成 pending 批次（需近期 MFA）
            </button>
          </form>
          {batchCodes.length > 0 ? (
            <div className="one-time-secret" role="status">
              <strong>仅本次响应显示的明文码</strong>
              <code>{batchCodes.join('\n')}</code>
              <p className="muted">
                请先使用受控方式保存，再确认交付；确认后页面会清除明文码。
              </p>
            </div>
          ) : null}
          {batches
            .filter((batch) => batch.status === 'pending_delivery')
            .map((batch) => (
              <button
                type="button"
                key={batch.batch_id}
                onClick={() => void confirmBatch(batch.batch_id)}
              >
                确认 {batch.name} 已保存并交付
              </button>
            ))}
        </div>
      </section>
      <button type="button" onClick={() => void logout()}>
        退出登录
      </button>
    </main>
  );
}
