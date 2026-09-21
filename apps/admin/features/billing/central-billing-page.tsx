'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { StatusBadge, type StatusTone } from '@kit/ui/status-badge';

import { AdminPageHeader } from '../../components/shell/admin-page-header';
import { AdminRecentMfaPanel } from '../security/admin-recent-mfa-panel';
import {
  adminAuthSession,
  sessionErrorMessage,
} from '../../app/_lib/auth-session';
import {
  readApiPayload,
  resourceError,
  type ResourceError,
} from '../resources/admin-resource-utils';

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
  timeline: BillingTimelineEvent[];
};

type BillingTimelineEvent = {
  source: string;
  event_type: string;
  event_at: string;
  provider_event_at: string | null;
  received_at: string | null;
  status: string | null;
  state: string | null;
  code: string | null;
  details: Record<string, unknown>;
};

type BillingMetrics = {
  observed_at: string;
  pending_count: number;
  processing_count: number;
  retryable_count: number;
  completed_count: number;
  manual_review_count: number;
  duplicate_payment_count: number;
  oldest_pending_age_seconds: number | null;
  oldest_processing_age_seconds: number | null;
  expired_lease_count: number;
  retry_attempts_total: number;
  retry_budget_exhausted_count: number;
  refund_mismatch_count: number;
  discovery_last_success_at: string | null;
  processing_last_success_at: string | null;
  discovery_lag_seconds: number | null;
  processing_lag_seconds: number | null;
  scheduler_last_accepted_at: string | null;
  scheduler_last_completed_at: string | null;
  scheduler_failure_count: number;
  active_alert_count: number;
  pending_alert_delivery_count: number;
  alert_threshold_source: 'local_default' | 'configured';
  alerts: Array<{
    alert_id: string;
    alert_key: string;
    severity: 'warning' | 'high' | 'critical';
    status: 'active' | 'recovered';
    occurrence_count: number;
    delivery_status: 'pending' | 'delivered' | 'failed';
    delivery_attempts: number;
    last_delivery_error?: string | null;
    details: Record<string, unknown>;
  }>;
};

type BillingFilters = {
  query: string;
  status: string;
  platformId: string;
  platformAccountId: string;
  providerAccountId: string;
};

const EMPTY_BILLING_FILTERS: BillingFilters = {
  query: '',
  status: '',
  platformId: '',
  platformAccountId: '',
  providerAccountId: '',
};

type ResolutionDecision =
  | 'refund_confirmed'
  | 'closed_anomaly'
  | 'manual_correction';

function tone(value: string | null): StatusTone {
  if (value === 'granted' || value === 'finalized') return 'success';
  if (value === 'manual_review' || value === 'review_required')
    return 'warning';
  if (value === 'retryable' || value === 'pending') return 'info';
  if (value === 'rejected' || value === 'blocked') return 'danger';
  return 'unknown';
}

function alertSeverityTone(
  value: BillingMetrics['alerts'][number]['severity'],
): StatusTone {
  return value === 'critical'
    ? 'danger'
    : value === 'high'
      ? 'warning'
      : 'info';
}

function alertMetric(alert: BillingMetrics['alerts'][number]): string {
  const metric = alert.details.metric;
  const value = alert.details.value;
  const threshold = alert.details.threshold;
  if (typeof metric !== 'string') return '需查看详情';
  return `${metric}${typeof value === 'number' ? ` = ${value}` : ''}${typeof threshold === 'number' ? `（阈值 ${threshold}）` : ''}`;
}

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString('zh-CN') : '—';
}

function timelineSourceLabel(source: string) {
  return (
    {
      billing_order: '订单',
      checkout: 'Checkout',
      provider_webhook: 'Provider Webhook',
      processing_job: '后台任务',
      provider_observation: 'Provider 观测',
      settlement: '中央结算',
      entitlement: '权益账本',
      entitlement_correction: '权益修正',
      admin_audit: '后台审计',
    }[source] ?? source
  );
}

function timelineSummary(event: BillingTimelineEvent) {
  const summary = [event.status, event.state, event.code].filter(Boolean);
  const reason = event.details.reason;
  if (typeof reason === 'string' && reason) summary.push(`原因：${reason}`);
  const health = event.details.health ?? event.details.job_health;
  if (health === 'lost') summary.unshift('失联');
  else if (health === 'active') summary.unshift('租约有效');
  const attempts = event.details.attempts;
  const maxAttempts = event.details.max_attempts;
  if (typeof attempts === 'number') {
    summary.push(
      `尝试 ${attempts}${typeof maxAttempts === 'number' ? `/${maxAttempts}` : ''}`,
    );
  }
  const nextAttemptAt = event.details.next_attempt_at;
  if (typeof nextAttemptAt === 'string')
    summary.push(`下次尝试：${formatDate(nextAttemptAt)}`);
  const ownerFingerprint = event.details.lease_owner_fingerprint;
  if (typeof ownerFingerprint === 'string')
    summary.push(`Owner：${ownerFingerprint}`);
  const hashPrefix = event.details.payload_hash_prefix;
  if (typeof hashPrefix === 'string') summary.push(`Hash：${hashPrefix}…`);
  return summary.join(' · ') || '—';
}

export function CentralBillingPage() {
  const [orders, setOrders] = useState<BillingOrder[]>([]);
  const [metrics, setMetrics] = useState<BillingMetrics | null>(null);
  const [selected, setSelected] = useState<BillingOrderDetail | null>(null);
  const [reason, setReason] = useState('管理员确认后重新查询 Provider 订单');
  const [decision, setDecision] =
    useState<ResolutionDecision>('closed_anomaly');
  const [state, setState] = useState<'loading' | 'success' | 'error'>(
    'loading',
  );
  const [error, setError] = useState<ResourceError | null>(null);
  const [actionError, setActionError] = useState<ResourceError | null>(null);
  const [busy, setBusy] = useState(false);
  const [needsMfa, setNeedsMfa] = useState(false);
  const [draftFilters, setDraftFilters] = useState<BillingFilters>(
    EMPTY_BILLING_FILTERS,
  );
  const [filters, setFilters] = useState<BillingFilters>(EMPTY_BILLING_FILTERS);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const cursorRef = useRef<string | null>(null);
  const requeryOperationRef = useRef<{
    orderId: string;
    operationId: string;
  } | null>(null);
  const resolveOperationRef = useRef<{
    orderId: string;
    operationId: string;
  } | null>(null);

  const load = useCallback(
    async ({ append = false }: { append?: boolean } = {}) => {
      if (append && !cursorRef.current) return;
      if (append) setLoadingMore(true);
      else {
        setState('loading');
        setError(null);
        cursorRef.current = null;
        setNextCursor(null);
      }
      const params = new URLSearchParams({ limit: '50' });
      if (filters.query) params.set('q', filters.query);
      if (filters.status) params.set('status', filters.status);
      if (filters.platformId) params.set('platform_id', filters.platformId);
      if (filters.platformAccountId)
        params.set('platform_account_id', filters.platformAccountId);
      if (filters.providerAccountId)
        params.set('provider_account_id', filters.providerAccountId);
      if (append && cursorRef.current) params.set('cursor', cursorRef.current);
      try {
        const [ordersResponse, metricsResponse] = await Promise.all([
          adminAuthSession.request(
            `/api/v1/admin/api/v1/billing/orders?${params.toString()}`,
            { cache: 'no-store' },
          ),
          append
            ? Promise.resolve(null)
            : adminAuthSession.request('/api/v1/admin/api/v1/billing/metrics', {
                cache: 'no-store',
              }),
        ]);
        const ordersPayload =
          await readApiPayload<BillingOrder[]>(ordersResponse);
        const metricsPayload = metricsResponse
          ? await readApiPayload<BillingMetrics>(metricsResponse)
          : null;
        if (!ordersResponse.ok || !Array.isArray(ordersPayload?.data)) {
          setError(
            resourceError(ordersResponse, ordersPayload, 'Billing 订单'),
          );
          setState('error');
          return;
        }
        setOrders((current) =>
          append ? [...current, ...ordersPayload.data!] : ordersPayload.data!,
        );
        cursorRef.current = ordersPayload.next_cursor ?? null;
        setNextCursor(cursorRef.current);
        if (metricsPayload) setMetrics(metricsPayload.data ?? null);
        setState('success');
      } catch (caught) {
        setError({
          title: 'Billing 读取失败',
          description: sessionErrorMessage(caught),
          requestId: null,
          technicalDetail: null,
        });
        setState('error');
      } finally {
        if (append) setLoadingMore(false);
      }
    },
    [filters],
  );

  useEffect(() => {
    void load();
  }, [load]);

  function applyFilters() {
    setFilters({
      query: draftFilters.query.trim(),
      status: draftFilters.status,
      platformId: draftFilters.platformId.trim(),
      platformAccountId: draftFilters.platformAccountId.trim(),
      providerAccountId: draftFilters.providerAccountId.trim(),
    });
  }

  function clearFilters() {
    setDraftFilters(EMPTY_BILLING_FILTERS);
    setFilters(EMPTY_BILLING_FILTERS);
  }

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
    const operationId =
      requeryOperationRef.current?.orderId === selected.order_id
        ? requeryOperationRef.current.operationId
        : crypto.randomUUID();
    requeryOperationRef.current = {
      orderId: selected.order_id,
      operationId,
    };
    try {
      const response = await adminAuthSession.request(
        `/api/v1/admin/api/v1/billing/orders/${selected.order_id}/requery`,
        {
          method: 'POST',
          headers: { 'If-Match': `W/"${selected.admin_version}"` },
          body: JSON.stringify({ operation_id: operationId, reason }),
        },
      );
      const payload = await readApiPayload(response);
      if (!response.ok) {
        if (response.status === 403) setNeedsMfa(true);
        if ([400, 409, 412].includes(response.status))
          requeryOperationRef.current = null;
        setActionError(resourceError(response, payload, '订单重查'));
        return;
      }
      requeryOperationRef.current = null;
      await Promise.all([load(), inspect(selected.order_id)]);
    } catch (caught) {
      setActionError({
        title: '订单重查结果未知',
        description: `${sessionErrorMessage(caught)} 再次点击将沿用同一个操作标识查询结果，不会自动创建新任务。`,
        requestId: null,
        technicalDetail: null,
      });
    } finally {
      setBusy(false);
    }
  }

  async function resolve() {
    if (!selected) return;
    setBusy(true);
    setActionError(null);
    const operationId =
      resolveOperationRef.current?.orderId === selected.order_id
        ? resolveOperationRef.current.operationId
        : crypto.randomUUID();
    resolveOperationRef.current = {
      orderId: selected.order_id,
      operationId,
    };
    try {
      const response = await adminAuthSession.request(
        `/api/v1/admin/api/v1/billing/orders/${selected.order_id}/resolve`,
        {
          method: 'POST',
          headers: { 'If-Match': `W/"${selected.admin_version}"` },
          body: JSON.stringify({
            operation_id: operationId,
            decision,
            reason,
          }),
        },
      );
      const payload = await readApiPayload(response);
      if (!response.ok) {
        if (response.status === 403) setNeedsMfa(true);
        if ([400, 409, 412].includes(response.status))
          resolveOperationRef.current = null;
        setActionError(resourceError(response, payload, '订单结案'));
        return;
      }
      resolveOperationRef.current = null;
      await Promise.all([load(), inspect(selected.order_id)]);
    } catch (caught) {
      setActionError({
        title: '订单结案结果未知',
        description: `${sessionErrorMessage(caught)} 再次点击将沿用同一个操作标识查询结果，不会重复结案。`,
        requestId: null,
        technicalDetail: null,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      className="shell wide-shell space-y-6"
      data-test="central-billing-page"
    >
      <AdminPageHeader
        title="Billing"
        description="查看 Provider 订单、结算状态、积压指标与人工处理原因。所有重查都经过近期 MFA、If-Match 和服务端幂等入口。"
        actions={<Button onClick={() => void load()}>刷新</Button>}
      />
      {needsMfa ? (
        <AdminRecentMfaPanel onVerified={() => setNeedsMfa(false)} />
      ) : null}
      {actionError ? (
        <Alert variant="destructive">
          <AlertTitle>{actionError.title}</AlertTitle>
          <AlertDescription>{actionError.description}</AlertDescription>
        </Alert>
      ) : null}
      {state === 'loading' ? (
        <div
          aria-busy="true"
          className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground"
        >
          正在读取 Billing 状态…
        </div>
      ) : state === 'error' ? (
        <Alert variant="destructive">
          <AlertTitle>{error?.title ?? 'Billing 读取失败'}</AlertTitle>
          <AlertDescription>
            {error?.description ?? '请稍后重试。'}
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <section
            className="rounded-xl border border-border bg-card p-4"
            aria-label="Billing 订单筛选"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold">筛选订单</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  搜索与筛选在服务端执行，分页游标会绑定订单时间和
                  ID，避免同一时间创建的订单漏读。
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={clearFilters}>
                  清除
                </Button>
                <Button onClick={applyFilters}>应用筛选</Button>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <label className="grid gap-1 text-sm">
                <span>Provider 订单号</span>
                <Input
                  aria-label="Provider 订单号"
                  onChange={(event) =>
                    setDraftFilters((current) => ({
                      ...current,
                      query: event.target.value,
                    }))
                  }
                  placeholder="输入订单号"
                  value={draftFilters.query}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span>状态</span>
                <select
                  aria-label="Billing 状态"
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  onChange={(event) =>
                    setDraftFilters((current) => ({
                      ...current,
                      status: event.target.value,
                    }))
                  }
                  value={draftFilters.status}
                >
                  <option value="">全部状态</option>
                  <option value="pending">待处理</option>
                  <option value="retryable">可重试</option>
                  <option value="manual_review">人工审核</option>
                  <option value="finalized">已结算</option>
                  <option value="granted">已发放</option>
                  <option value="rejected">已拒绝</option>
                  <option value="unlinked">未关联</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span>平台 ID</span>
                <Input
                  aria-label="平台 ID"
                  onChange={(event) =>
                    setDraftFilters((current) => ({
                      ...current,
                      platformId: event.target.value,
                    }))
                  }
                  placeholder="UUID"
                  value={draftFilters.platformId}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span>平台账号 ID</span>
                <Input
                  aria-label="平台账号 ID"
                  onChange={(event) =>
                    setDraftFilters((current) => ({
                      ...current,
                      platformAccountId: event.target.value,
                    }))
                  }
                  placeholder="UUID"
                  value={draftFilters.platformAccountId}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span>Provider 账号 ID</span>
                <Input
                  aria-label="Provider 账号 ID"
                  onChange={(event) =>
                    setDraftFilters((current) => ({
                      ...current,
                      providerAccountId: event.target.value,
                    }))
                  }
                  placeholder="UUID"
                  value={draftFilters.providerAccountId}
                />
              </label>
            </div>
          </section>
          <section
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
            aria-label="Billing 指标"
          >
            {[
              ['待处理', metrics?.pending_count ?? 0],
              ['处理中', metrics?.processing_count ?? 0],
              ['可重试', metrics?.retryable_count ?? 0],
              ['人工审核', metrics?.manual_review_count ?? 0],
              ['重复支付', metrics?.duplicate_payment_count ?? 0],
              ['租约过期', metrics?.expired_lease_count ?? 0],
              ['退款待补偿', metrics?.refund_mismatch_count ?? 0],
              ['告警未送达', metrics?.pending_alert_delivery_count ?? 0],
              [
                '最老积压秒数',
                Math.round(metrics?.oldest_pending_age_seconds ?? 0),
              ],
            ].map(([label, value]) => (
              <div
                className="rounded-xl border border-border bg-card p-4"
                key={String(label)}
              >
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-2 text-2xl font-semibold">{value}</p>
              </div>
            ))}
          </section>
          <section
            className="grid gap-6 lg:grid-cols-[1fr_1fr]"
            aria-label="Billing 运行观测"
          >
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">运行观测</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    最近观测：{formatDate(metrics?.observed_at)} · 阈值来源：
                    {metrics?.alert_threshold_source === 'configured'
                      ? '已配置'
                      : '本地默认值'}
                  </p>
                </div>
                <StatusBadge
                  label={`${metrics?.active_alert_count ?? 0} 个活跃告警`}
                  tone={
                    (metrics?.active_alert_count ?? 0) > 0
                      ? 'warning'
                      : 'success'
                  }
                />
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">处理中最久</dt>
                  <dd className="mt-1 font-medium">
                    {Math.round(metrics?.oldest_processing_age_seconds ?? 0)} 秒
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">重试总次数</dt>
                  <dd className="mt-1 font-medium">
                    {metrics?.retry_attempts_total ?? 0}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Discovery 延迟</dt>
                  <dd className="mt-1 font-medium">
                    {Math.round(metrics?.discovery_lag_seconds ?? 0)} 秒
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Processing 延迟</dt>
                  <dd className="mt-1 font-medium">
                    {Math.round(metrics?.processing_lag_seconds ?? 0)} 秒
                  </dd>
                </div>
              </dl>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="font-semibold">调度器健康</h2>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">最近接受</dt>
                  <dd className="mt-1 font-medium">
                    {formatDate(metrics?.scheduler_last_accepted_at)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">最近完成</dt>
                  <dd className="mt-1 font-medium">
                    {formatDate(metrics?.scheduler_last_completed_at)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">调度失败次数</dt>
                  <dd className="mt-1 font-medium">
                    {metrics?.scheduler_failure_count ?? 0}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">自动补偿</dt>
                  <dd className="mt-1 font-medium">不自动退款或撤销权益</dd>
                </div>
              </dl>
            </div>
          </section>
          <section
            className="rounded-xl border border-border bg-card"
            aria-label="Billing 告警"
          >
            <div className="border-b border-border p-4">
              <h2 className="font-semibold">告警与送达</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                告警会去重并记录恢复；“待送达”表示接收器未配置或最近投递失败。
              </p>
            </div>
            {metrics?.alerts.length ? (
              <div className="divide-y divide-border">
                {metrics.alerts.map((alert) => (
                  <div
                    className="flex flex-wrap items-start justify-between gap-3 p-4"
                    key={alert.alert_id}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="text-xs">{alert.alert_key}</code>
                        <StatusBadge
                          label={alert.severity}
                          tone={alertSeverityTone(alert.severity)}
                        />
                        <StatusBadge
                          label={
                            alert.delivery_status === 'delivered'
                              ? '已送达'
                              : alert.delivery_status === 'failed'
                                ? '送达失败'
                                : '待送达'
                          }
                          tone={
                            alert.delivery_status === 'delivered'
                              ? 'success'
                              : 'warning'
                          }
                        />
                      </div>
                      <p className="mt-2 text-sm">{alertMetric(alert)}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      发生 {alert.occurrence_count} 次 · 投递{' '}
                      {alert.delivery_attempts} 次
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="p-4 text-sm text-muted-foreground">
                当前没有活跃告警。
              </p>
            )}
          </section>
          <section className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="border-b border-border p-4">
                <h2 className="font-semibold">订单队列</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Provider 事实只作为观察，最终权益状态以中央结算结果为准。
                </p>
              </div>
              <div className="divide-y divide-border">
                {orders.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">
                    {Object.values(filters).some(Boolean)
                      ? '没有匹配当前筛选条件的订单。'
                      : '暂无订单。'}
                  </p>
                ) : null}
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
                        label={
                          order.decision_code ??
                          order.settlement_state ??
                          order.entitlement_status
                        }
                        tone={tone(
                          order.settlement_state ?? order.entitlement_status,
                        )}
                      />
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {order.provider} · {formatDate(order.created_at)}
                    </span>
                  </button>
                ))}
              </div>
              {nextCursor ? (
                <div className="border-t border-border p-4">
                  <Button
                    className="w-full"
                    disabled={loadingMore}
                    onClick={() => void load({ append: true })}
                    variant="outline"
                  >
                    {loadingMore ? '正在加载更多…' : '加载更多订单'}
                  </Button>
                </div>
              ) : null}
            </div>
            <aside
              className="rounded-xl border border-border bg-card p-5"
              aria-label="订单详情"
            >
              {selected ? (
                <>
                  <p className="text-sm text-muted-foreground">订单详情</p>
                  <h2 className="mt-1 font-semibold">
                    {selected.provider_order_no}
                  </h2>
                  <dl className="mt-4 grid gap-3 text-sm">
                    <div>
                      <dt className="text-muted-foreground">验证</dt>
                      <dd>
                        {selected.verification_status} ·{' '}
                        {selected.verification_reason ?? '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">结算</dt>
                      <dd>
                        {selected.settlement_kind ?? '—'} /{' '}
                        {selected.settlement_state ?? '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Provider 金额</dt>
                      <dd>
                        {selected.total_amount ?? '—'} {selected.currency ?? ''}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">人工版本</dt>
                      <dd>{selected.admin_version}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">待处理任务</dt>
                      <dd>{selected.open_job_count}</dd>
                    </div>
                  </dl>
                  <section className="mt-6" aria-label="订单证据时间线">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold">证据时间线</h3>
                      <span className="text-xs text-muted-foreground">
                        {selected.timeline.length} 条
                      </span>
                    </div>
                    {selected.timeline.length === 0 ? (
                      <p className="mt-3 text-sm text-muted-foreground">
                        暂无可用历史证据。
                      </p>
                    ) : (
                      <ol className="mt-3 space-y-3 border-l border-border pl-4">
                        {selected.timeline.map((event, index) => (
                          <li
                            className="relative"
                            key={`${event.event_type}-${event.event_at}-${index}`}
                          >
                            <span className="absolute -left-[1.28rem] top-1.5 h-2 w-2 rounded-full bg-primary" />
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="font-medium">
                                {timelineSourceLabel(event.source)}
                              </span>
                              <code>{event.event_type}</code>
                              <time className="text-muted-foreground">
                                {formatDate(event.event_at)}
                              </time>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {timelineSummary(event)}
                            </p>
                            {event.provider_event_at || event.received_at ? (
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                {event.provider_event_at
                                  ? `Provider 时间：${formatDate(event.provider_event_at)}`
                                  : null}
                                {event.provider_event_at && event.received_at
                                  ? ' · '
                                  : null}
                                {event.received_at
                                  ? `接收时间：${formatDate(event.received_at)}`
                                  : null}
                              </p>
                            ) : null}
                          </li>
                        ))}
                      </ol>
                    )}
                  </section>
                  <label
                    className="mt-5 block text-sm font-medium"
                    htmlFor="billing-reason"
                  >
                    操作原因
                  </label>
                  <Input
                    className="mt-2"
                    id="billing-reason"
                    onChange={(event) => setReason(event.target.value)}
                    value={reason}
                  />
                  <Button
                    className="mt-4 w-full"
                    disabled={busy}
                    onClick={() => void requery()}
                  >
                    请求 Provider 重查
                  </Button>
                  <label
                    className="mt-4 block text-sm font-medium"
                    htmlFor="billing-decision"
                  >
                    结案动作
                  </label>
                  <select
                    className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    id="billing-decision"
                    onChange={(event) =>
                      setDecision(event.target.value as ResolutionDecision)
                    }
                    value={decision}
                  >
                    <option value="closed_anomaly">关闭异常</option>
                    <option value="refund_confirmed">外部退款已确认</option>
                    <option value="manual_correction">人工修正</option>
                  </select>
                  <Button
                    className="mt-2 w-full"
                    disabled={busy || selected.resolution_status === 'resolved'}
                    onClick={() => void resolve()}
                  >
                    {selected.resolution_status === 'resolved'
                      ? '订单已结案'
                      : '提交受控结案'}
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  选择一个订单查看 Provider facts、结算和人工处理信息。
                </p>
              )}
            </aside>
          </section>
        </>
      )}
    </main>
  );
}
