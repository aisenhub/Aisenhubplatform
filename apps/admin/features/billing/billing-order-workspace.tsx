'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { ResourceId } from '@kit/ui/resource-id';
import { StatusBadge } from '@kit/ui/status-badge';

import {
  adminAuthSession,
  sessionErrorMessage,
} from '../../app/_lib/auth-session';
import {
  readApiPayload,
  resourceError,
  type ResourceError,
} from '../resources/admin-resource-utils';
import {
  BILLING_FILTER_STATUSES,
  billingOrderApiSearchParams,
  billingTone,
  formatDate,
  timelineSourceLabel,
  timelineSummary,
  type BillingFilters,
  type BillingOrder,
  type BillingOrderDetail,
  type BillingPlatformOption,
  type ResolutionDecision,
} from './billing-types';

type BillingOrderWorkspaceProps = {
  platformId?: string;
  platforms?: BillingPlatformOption[];
  filters: BillingFilters;
  onFiltersChange: (filters: BillingFilters) => void;
  selectedOrderId?: string | null;
  onSelectedOrderChange?: (orderId: string | null) => void;
};

function trimFilters(filters: BillingFilters): BillingFilters {
  return {
    query: filters.query.trim(),
    status: filters.status,
    platformId: filters.platformId.trim(),
    platformAccountId: filters.platformAccountId.trim(),
    providerAccountId: filters.providerAccountId.trim(),
  };
}

export function BillingOrderWorkspace({
  platformId,
  platforms = [],
  filters,
  onFiltersChange,
  selectedOrderId = null,
  onSelectedOrderChange,
}: BillingOrderWorkspaceProps) {
  const [orders, setOrders] = useState<BillingOrder[]>([]);
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
  const [draftFilters, setDraftFilters] = useState<BillingFilters>(filters);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const cursorRef = useRef<string | null>(null);
  const loadGeneration = useRef(0);
  const requeryOperationRef = useRef<{
    orderId: string;
    operationId: string;
  } | null>(null);
  const resolveOperationRef = useRef<{
    orderId: string;
    operationId: string;
  } | null>(null);

  useEffect(() => {
    setDraftFilters(filters);
  }, [filters]);

  const effectiveFilters = useMemo(
    () => ({ ...filters, platformId: platformId ?? filters.platformId }),
    [filters, platformId],
  );

  const load = useCallback(
    async ({ append = false }: { append?: boolean } = {}) => {
      if (append && !cursorRef.current) return;
      const generation = append
        ? loadGeneration.current
        : ++loadGeneration.current;
      if (append) {
        setLoadingMore(true);
      } else {
        setState('loading');
        setError(null);
        cursorRef.current = null;
        setNextCursor(null);
      }
      const params = billingOrderApiSearchParams({
        filters: effectiveFilters,
        lockedPlatformId: platformId,
        cursor: append ? cursorRef.current : null,
      });
      try {
        const response = await adminAuthSession.request(
          `/api/v1/admin/api/v1/billing/orders?${params.toString()}`,
          { cache: 'no-store' },
        );
        const payload = await readApiPayload<BillingOrder[]>(response);
        if (generation !== loadGeneration.current) return;
        if (!response.ok || !Array.isArray(payload?.data)) {
          setError(resourceError(response, payload, 'Billing 订单'));
          setState('error');
          return;
        }
        if (
          platformId &&
          payload.data.some((order) => order.platform_id !== platformId)
        ) {
          setError({
            title: '订单作用域校验失败',
            description: '服务端返回了不属于当前平台的订单，页面已拒绝展示。',
            requestId: null,
            technicalDetail: 'PLATFORM_SCOPE_MISMATCH',
          });
          setState('error');
          return;
        }
        setOrders((current) =>
          append ? [...current, ...payload.data!] : payload.data!,
        );
        cursorRef.current = payload.next_cursor ?? null;
        setNextCursor(cursorRef.current);
        setState('success');
      } catch (caught) {
        if (generation !== loadGeneration.current) return;
        setError({
          title: platformId ? '当前平台 Billing 读取失败' : 'Billing 读取失败',
          description: sessionErrorMessage(caught),
          requestId: null,
          technicalDetail: null,
        });
        setState('error');
      } finally {
        if (append && generation === loadGeneration.current)
          setLoadingMore(false);
      }
    },
    [effectiveFilters, platformId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const inspect = useCallback(
    async (orderId: string) => {
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
        if (platformId && payload.data.platform_id !== platformId) {
          setSelected(null);
          setActionError({
            title: '订单不属于当前平台',
            description:
              '该深链订单属于其他平台，当前平台工作区不会显示其详情。',
            requestId: null,
            technicalDetail: 'PLATFORM_SCOPE_MISMATCH',
          });
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
    },
    [platformId],
  );

  useEffect(() => {
    if (!selectedOrderId) {
      setSelected(null);
      return;
    }
    if (selected?.order_id !== selectedOrderId) void inspect(selectedOrderId);
  }, [inspect, selected?.order_id, selectedOrderId]);

  function applyFilters() {
    onFiltersChange(trimFilters(draftFilters));
  }

  function clearFilters() {
    onFiltersChange({
      query: '',
      status: '',
      platformId: '',
      platformAccountId: '',
      providerAccountId: '',
    });
  }

  function chooseOrder(orderId: string) {
    onSelectedOrderChange?.(orderId);
    void inspect(orderId);
  }

  async function requery() {
    if (!selected) return;
    setBusy(true);
    setActionError(null);
    const operationId =
      requeryOperationRef.current?.orderId === selected.order_id
        ? requeryOperationRef.current.operationId
        : crypto.randomUUID();
    requeryOperationRef.current = { orderId: selected.order_id, operationId };
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
    resolveOperationRef.current = { orderId: selected.order_id, operationId };
    try {
      const response = await adminAuthSession.request(
        `/api/v1/admin/api/v1/billing/orders/${selected.order_id}/resolve`,
        {
          method: 'POST',
          headers: { 'If-Match': `W/"${selected.admin_version}"` },
          body: JSON.stringify({ operation_id: operationId, decision, reason }),
        },
      );
      const payload = await readApiPayload(response);
      if (!response.ok) {
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

  const platformById = useMemo(
    () =>
      new Map(platforms.map((platform) => [platform.platform_id, platform])),
    [platforms],
  );

  return (
    <section className="space-y-6" data-test="billing-order-workspace">
      {actionError ? (
        <Alert variant="destructive">
          <AlertTitle>{actionError.title}</AlertTitle>
          <AlertDescription>{actionError.description}</AlertDescription>
        </Alert>
      ) : null}

      <section
        className="rounded-xl border border-border bg-card p-4"
        aria-label="Billing 订单筛选"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">筛选订单</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {platformId
                ? '平台范围由当前 URL 工作区锁定；其余筛选在服务端执行。'
                : '筛选在服务端执行；平台使用已注册平台选择器，不需要手工填写 UUID。'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void load()}>
              刷新订单
            </Button>
            <Button variant="outline" onClick={clearFilters}>
              清除
            </Button>
            <Button onClick={applyFilters}>应用筛选</Button>
          </div>
        </div>
        <div
          className={`mt-4 grid gap-3 sm:grid-cols-2 ${platformId ? 'lg:grid-cols-4' : 'lg:grid-cols-5'}`}
        >
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
              {BILLING_FILTER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status === 'pending'
                    ? '待处理'
                    : status === 'retryable'
                      ? '可重试'
                      : status === 'manual_review'
                        ? '人工审核'
                        : status === 'finalized'
                          ? '已结算'
                          : status === 'granted'
                            ? '已发放'
                            : status === 'rejected'
                              ? '已拒绝'
                              : '未关联'}
                </option>
              ))}
            </select>
          </label>
          {!platformId ? (
            <label className="grid gap-1 text-sm">
              <span>平台</span>
              <select
                aria-label="Billing 平台"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    platformId: event.target.value,
                  }))
                }
                value={draftFilters.platformId}
              >
                <option value="">全部平台</option>
                {draftFilters.platformId &&
                !platformById.has(draftFilters.platformId) ? (
                  <option value={draftFilters.platformId}>
                    当前 URL 平台筛选
                  </option>
                ) : null}
                {platforms.map((platform) => (
                  <option
                    key={platform.platform_id}
                    value={platform.platform_id}
                  >
                    {platform.name} ({platform.code})
                  </option>
                ))}
              </select>
            </label>
          ) : null}
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

      {state === 'loading' ? (
        <div
          aria-busy="true"
          className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground"
        >
          正在读取订单…
        </div>
      ) : state === 'error' ? (
        <Alert variant="destructive">
          <AlertTitle>{error?.title ?? '订单读取失败'}</AlertTitle>
          <AlertDescription>
            {error?.description ?? '请稍后重试。'}
          </AlertDescription>
        </Alert>
      ) : (
        <section className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="border-b border-border p-4">
              <h2 className="font-semibold">
                {platformId ? '当前平台订单队列' : '全网订单队列'}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Provider 事实仅作为观察依据，最终权益状态以中央结算结果为准。
              </p>
            </div>
            <div className="divide-y divide-border">
              {orders.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">
                  {Object.values(effectiveFilters).some(Boolean)
                    ? '没有匹配当前筛选条件的订单。'
                    : '暂无订单。'}
                </p>
              ) : null}
              {orders.map((order) => {
                const platform = order.platform_id
                  ? platformById.get(order.platform_id)
                  : undefined;
                return (
                  <button
                    className="grid w-full gap-2 p-4 text-left transition hover:bg-muted/40"
                    key={order.order_id}
                    onClick={() => chooseOrder(order.order_id)}
                    type="button"
                    aria-pressed={selected?.order_id === order.order_id}
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <code className="text-xs">{order.provider_order_no}</code>
                      <StatusBadge
                        label={
                          order.decision_code ??
                          order.settlement_state ??
                          order.entitlement_status
                        }
                        tone={billingTone(
                          order.settlement_state ?? order.entitlement_status,
                        )}
                      />
                      {!platformId ? (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                          {platform
                            ? `${platform.name} · ${platform.code}`
                            : (order.platform_id ?? '未关联平台')}
                        </span>
                      ) : null}
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{order.provider}</span>
                      <span>·</span>
                      <span>{formatDate(order.created_at)}</span>
                      <span>·</span>
                      <span>
                        {order.platform_account_id
                          ? `Account ${order.platform_account_id.slice(0, 8)}…`
                          : '未关联平台账户'}
                      </span>
                    </span>
                  </button>
                );
              })}
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
            aria-label="订单详情与操作"
          >
            {selected ? (
              <>
                <p className="text-sm text-muted-foreground">订单详情</p>
                <h2 className="mt-1 font-semibold">
                  {selected.provider_order_no}
                </h2>
                <dl className="mt-4 grid gap-3 text-sm">
                  {!platformId ? (
                    <div>
                      <dt className="text-muted-foreground">平台</dt>
                      <dd className="mt-1">
                        {selected.platform_id &&
                        platformById.get(selected.platform_id) ? (
                          <Link
                            className="font-medium text-primary underline-offset-4 hover:underline"
                            href={`/admin/platforms/${selected.platform_id}/billing?selected=${selected.order_id}`}
                          >
                            {platformById.get(selected.platform_id)!.name}（
                            {platformById.get(selected.platform_id)!.code}）
                          </Link>
                        ) : selected.platform_id ? (
                          <ResourceId value={selected.platform_id} />
                        ) : (
                          '未关联平台'
                        )}
                      </dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="text-muted-foreground">平台账户</dt>
                    <dd className="mt-1">
                      {selected.platform_account_id ? (
                        <ResourceId value={selected.platform_account_id} />
                      ) : (
                        '未关联'
                      )}
                    </dd>
                  </div>
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
                    <dt className="text-muted-foreground">人工处理版本</dt>
                    <dd>{selected.admin_version}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">待处理后台任务</dt>
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

                <p className="mt-5 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                  Provider 重查与人工结案均由服务端校验近期
                  MFA；页面按钮本身不是权限边界。
                </p>
                <label
                  className="mt-4 block text-sm font-medium"
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
                  disabled={busy || !reason.trim()}
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
                  disabled={
                    busy ||
                    !reason.trim() ||
                    selected.resolution_status === 'resolved'
                  }
                  onClick={() => void resolve()}
                >
                  {selected.resolution_status === 'resolved'
                    ? '订单已结案'
                    : '提交受控结案'}
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                从左侧列表中选择一个订单，查看 Provider
                facts、结算、证据时间线与受控操作。
              </p>
            )}
          </aside>
        </section>
      )}
    </section>
  );
}
