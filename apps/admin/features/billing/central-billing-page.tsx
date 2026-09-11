'use client';

import { useCallback, useEffect, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { StatusBadge, type StatusTone } from '@kit/ui/status-badge';

import { AdminPageHeader } from '../../components/shell/admin-page-header';
import { AdminRecentMfaPanel } from '../security/admin-recent-mfa-panel';
import { adminAuthSession, sessionErrorMessage } from '../../app/_lib/auth-session';
import { readApiPayload, resourceError, type ResourceError } from '../resources/admin-resource-utils';

type BillingOrder = {
  order_id: string;
  provider: string;
  provider_order_no: string;
  provider_status: string;
  verification_status: string;
  entitlement_status: string;
  linkage_status: string;
  resolution_status: string;
  settlement_state: string | null;
  settlement_kind: string | null;
  decision_code: string | null;
  admin_version: number;
  created_at: string;
  updated_at: string;
};

type BillingOrderDetail = BillingOrder & {
  provider_facts: Record<string, unknown>;
  verification_reason: string | null;
  resolution_reason: string | null;
  open_job_count: number;
  total_amount: string | null;
  show_amount: string | null;
  currency: string | null;
};

type BillingMetrics = {
  pending_count: number;
  retryable_count: number;
  manual_review_count: number;
  duplicate_payment_count: number;
  oldest_pending_age_seconds: number;
  discovery_last_success_at: string | null;
  processing_last_success_at: string | null;
};

function tone(value: string | null): StatusTone {
  if (value === 'granted' || value === 'finalized') return 'success';
  if (value === 'manual_review' || value === 'review_required') return 'warning';
  if (value === 'retryable' || value === 'pending') return 'info';
  if (value === 'rejected' || value === 'blocked') return 'danger';
  return 'unknown';
}

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString('zh-CN') : '—';
}

export function CentralBillingPage() {
  const [orders, setOrders] = useState<BillingOrder[]>([]);
  const [metrics, setMetrics] = useState<BillingMetrics | null>(null);
  const [selected, setSelected] = useState<BillingOrderDetail | null>(null);
  const [reason, setReason] = useState('管理员确认后重新查询 Provider 订单');
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<ResourceError | null>(null);
  const [actionError, setActionError] = useState<ResourceError | null>(null);
  const [busy, setBusy] = useState(false);
  const [needsMfa, setNeedsMfa] = useState(false);

  const load = useCallback(async () => {
    setState('loading');
    setError(null);
    try {
      const [ordersResponse, metricsResponse] = await Promise.all([
        adminAuthSession.request('/api/v1/admin/api/v1/billing/orders?limit=50', { cache: 'no-store' }),
        adminAuthSession.request('/api/v1/admin/api/v1/billing/metrics', { cache: 'no-store' }),
      ]);
      const ordersPayload = await readApiPayload<BillingOrder[]>(ordersResponse);
      const metricsPayload = await readApiPayload<BillingMetrics>(metricsResponse);
      if (!ordersResponse.ok || !Array.isArray(ordersPayload?.data)) {
        setError(resourceError(ordersResponse, ordersPayload, 'Billing 订单'));
        setState('error');
        return;
      }
      setOrders(ordersPayload.data);
      setMetrics(metricsPayload?.data ?? null);
      setState('success');
    } catch (caught) {
      setError({
        title: 'Billing 读取失败',
        description: sessionErrorMessage(caught),
        requestId: null,
        technicalDetail: null,
      });
      setState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function inspect(orderId: string) {
    setActionError(null);
    try {
      const response = await adminAuthSession.request(
        `/api/v1/admin/api/v1/billing/orders/${orderId}`,
        { cache: 'no-store' },
      );
      const payload = await readApiPayload<BillingOrderDetail>(response);
      if (!response.ok || !payload?.data) {
        setActionError(resourceError(response, payload, 'Billing 订单详情'));
        return;
      }
      setSelected(payload.data);
    } catch (caught) {
      setActionError({
        title: '订单详情读取失败',
        description: sessionErrorMessage(caught),
        requestId: null,
        technicalDetail: null,
      });
    }
  }

  async function requery() {
    if (!selected) return;
    setBusy(true);
    setActionError(null);
    try {
      const response = await adminAuthSession.request(
        `/api/v1/admin/api/v1/billing/orders/${selected.order_id}/requery`,
        {
          method: 'POST',
          headers: { 'If-Match': `W/"${selected.admin_version}"` },
          body: JSON.stringify({ operation_id: crypto.randomUUID(), reason }),
        },
      );
      const payload = await readApiPayload(response);
      if (!response.ok) {
        if (response.status === 403) setNeedsMfa(true);
        setActionError(resourceError(response, payload, '订单重查'));
        return;
      }
      await Promise.all([load(), inspect(selected.order_id)]);
    } catch (caught) {
      setActionError({
        title: '订单重查失败',
        description: sessionErrorMessage(caught),
        requestId: null,
        technicalDetail: null,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell wide-shell space-y-6" data-test="central-billing-page">
      <AdminPageHeader
        title="中央 Billing"
        description="查看 Provider 订单、结算状态、积压指标与人工处理原因。所有重查都经过近期 MFA、If-Match 和服务端幂等入口。"
        actions={<Button onClick={() => void load()}>刷新</Button>}
      />
      {needsMfa ? <AdminRecentMfaPanel onVerified={() => setNeedsMfa(false)} /> : null}
      {actionError ? (
        <Alert variant="destructive">
          <AlertTitle>{actionError.title}</AlertTitle>
          <AlertDescription>{actionError.description}</AlertDescription>
        </Alert>
      ) : null}
      {state === 'loading' ? (
        <div aria-busy="true" className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">正在读取 Billing 状态…</div>
      ) : state === 'error' ? (
        <Alert variant="destructive">
          <AlertTitle>{error?.title ?? 'Billing 读取失败'}</AlertTitle>
          <AlertDescription>{error?.description ?? '请稍后重试。'}</AlertDescription>
        </Alert>
      ) : (
        <>
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Billing 指标">
          {[
            ['待处理', metrics?.pending_count ?? 0],
            ['可重试', metrics?.retryable_count ?? 0],
            ['人工审核', metrics?.manual_review_count ?? 0],
            ['重复支付', metrics?.duplicate_payment_count ?? 0],
            ['最老积压秒数', Math.round(metrics?.oldest_pending_age_seconds ?? 0)],
          ].map(([label, value]) => (
            <div className="rounded-xl border border-border bg-card p-4" key={String(label)}>
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="mt-2 text-2xl font-semibold">{value}</p>
            </div>
          ))}
        </section>
        <section className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="border-b border-border p-4">
              <h2 className="font-semibold">订单队列</h2>
              <p className="mt-1 text-sm text-muted-foreground">Provider 事实只作为观察，最终权益状态以中央结算结果为准。</p>
            </div>
            <div className="divide-y divide-border">
              {orders.length === 0 ? <p className="p-6 text-sm text-muted-foreground">暂无订单。</p> : null}
              {orders.map((order) => (
                <button
                  className="grid w-full gap-2 p-4 text-left transition hover:bg-muted/40"
                  key={order.order_id}
                  onClick={() => void inspect(order.order_id)}
                  type="button"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <code className="text-xs">{order.provider_order_no}</code>
                    <StatusBadge
                      label={order.decision_code ?? order.settlement_state ?? order.entitlement_status}
                      tone={tone(order.settlement_state ?? order.entitlement_status)}
                    />
                  </span>
                  <span className="text-xs text-muted-foreground">{order.provider} · {formatDate(order.created_at)}</span>
                </button>
              ))}
            </div>
          </div>
          <aside className="rounded-xl border border-border bg-card p-5" aria-label="订单详情">
            {selected ? (
              <>
                <p className="text-sm text-muted-foreground">订单详情</p>
                <h2 className="mt-1 font-semibold">{selected.provider_order_no}</h2>
                <dl className="mt-4 grid gap-3 text-sm">
                  <div><dt className="text-muted-foreground">验证</dt><dd>{selected.verification_status} · {selected.verification_reason ?? '—'}</dd></div>
                  <div><dt className="text-muted-foreground">结算</dt><dd>{selected.settlement_kind ?? '—'} / {selected.settlement_state ?? '—'}</dd></div>
                  <div><dt className="text-muted-foreground">Provider 金额</dt><dd>{selected.total_amount ?? '—'} {selected.currency ?? ''}</dd></div>
                  <div><dt className="text-muted-foreground">人工版本</dt><dd>{selected.admin_version}</dd></div>
                  <div><dt className="text-muted-foreground">待处理任务</dt><dd>{selected.open_job_count}</dd></div>
                </dl>
                <label className="mt-5 block text-sm font-medium" htmlFor="billing-reason">操作原因</label>
                <Input className="mt-2" id="billing-reason" onChange={(event) => setReason(event.target.value)} value={reason} />
                <Button className="mt-4 w-full" disabled={busy} onClick={() => void requery()}>请求 Provider 重查</Button>
              </>
            ) : <p className="text-sm text-muted-foreground">选择一个订单查看 Provider facts、结算和人工处理信息。</p>}
          </aside>
        </section>
        </>
      )}
    </main>
  );
}
