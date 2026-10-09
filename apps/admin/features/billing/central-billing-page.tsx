'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { Button } from '@kit/ui/button';
import { StatusBadge, type StatusTone } from '@kit/ui/status-badge';

import { AdminPageHeader } from '../../components/shell/admin-page-header';
import {
  adminAuthSession,
  sessionErrorMessage,
} from '../../app/_lib/auth-session';
import {
  readApiPayload,
  resourceError,
  type ResourceError,
} from '../resources/admin-resource-utils';
import { BillingOrderWorkspace } from './billing-order-workspace';
import {
  billingFiltersFromSearchParams,
  billingFiltersToSearchParams,
  formatDate,
  type BillingFilters,
  type BillingMetrics,
  type BillingPlatformOption,
} from './billing-types';

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

function hrefWithFilters(
  pathname: string,
  filters: BillingFilters,
  selectedOrderId?: string | null,
): string {
  const encoded = billingFiltersToSearchParams(
    filters,
    selectedOrderId,
  ).toString();
  return encoded ? `${pathname}?${encoded}` : pathname;
}

export function CentralBillingPage() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const filters = useMemo(
    () => billingFiltersFromSearchParams(searchParams),
    // searchParams is an immutable Next wrapper; the serialized value is the
    // deterministic dependency for browser back/forward navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchKey],
  );
  const selectedOrderId = searchParams.get('selected');

  const [metrics, setMetrics] = useState<BillingMetrics | null>(null);
  const [metricsError, setMetricsError] = useState<ResourceError | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [platforms, setPlatforms] = useState<BillingPlatformOption[]>([]);
  const [platformsError, setPlatformsError] = useState<ResourceError | null>(
    null,
  );

  const loadMetrics = useCallback(async () => {
    setMetricsLoading(true);
    setMetricsError(null);
    try {
      const response = await adminAuthSession.request(
        '/api/v1/admin/api/v1/billing/metrics',
        { cache: 'no-store' },
      );
      const payload = await readApiPayload<BillingMetrics>(response);
      if (!response.ok || !payload?.data) {
        setMetricsError(resourceError(response, payload, 'Billing 运行观测'));
        return;
      }
      setMetrics(payload.data);
    } catch (caught) {
      setMetricsError({
        title: 'Billing 运行观测读取失败',
        description: sessionErrorMessage(caught),
        requestId: null,
        technicalDetail: null,
      });
    } finally {
      setMetricsLoading(false);
    }
  }, []);

  const loadPlatforms = useCallback(async () => {
    setPlatformsError(null);
    try {
      const response = await adminAuthSession.request(
        '/api/v1/admin/api/v1/platforms?limit=100',
        { cache: 'no-store' },
      );
      const payload = await readApiPayload<BillingPlatformOption[]>(response);
      if (!response.ok || !Array.isArray(payload?.data)) {
        setPlatformsError(
          resourceError(response, payload, 'Billing 平台筛选列表'),
        );
        return;
      }
      setPlatforms(payload.data);
    } catch (caught) {
      setPlatformsError({
        title: 'Billing 平台筛选列表读取失败',
        description: sessionErrorMessage(caught),
        requestId: null,
        technicalDetail: null,
      });
    }
  }, []);

  useEffect(() => {
    void Promise.all([loadMetrics(), loadPlatforms()]);
  }, [loadMetrics, loadPlatforms]);

  function updateFilters(next: BillingFilters) {
    router.replace(hrefWithFilters(pathname, next));
  }

  function updateSelected(orderId: string | null) {
    router.replace(hrefWithFilters(pathname, filters, orderId));
  }

  return (
    <main
      className="shell wide-shell space-y-6"
      data-test="central-billing-page"
    >
      <AdminPageHeader
        title="全网订单中心"
        description="跨平台查看 Provider 订单、结算证据与人工处理。订单操作由服务端 AAL2 + 近期 MFA、If-Match 与 operation_id 共同保护。"
        actions={
          <Button variant="outline" onClick={() => void loadMetrics()}>
            刷新运行观测
          </Button>
        }
      />

      {platformsError ? (
        <Alert variant="destructive">
          <AlertTitle>{platformsError.title}</AlertTitle>
          <AlertDescription>
            {platformsError.description} 订单仍可按当前 URL 平台 ID
            查询，但平台名称选择器暂不完整。
          </AlertDescription>
        </Alert>
      ) : null}

      {metricsError ? (
        <Alert variant="destructive">
          <AlertTitle>{metricsError.title}</AlertTitle>
          <AlertDescription>{metricsError.description}</AlertDescription>
        </Alert>
      ) : null}

      <section
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Billing 指标"
      >
        {metricsLoading ? (
          <div className="col-span-full rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
            正在读取中央 Billing 运行观测…
          </div>
        ) : metrics ? (
          [
            ['待处理', metrics.pending_count],
            ['处理中', metrics.processing_count],
            ['可重试', metrics.retryable_count],
            ['人工审核', metrics.manual_review_count],
            ['重复支付', metrics.duplicate_payment_count],
            ['租约过期', metrics.expired_lease_count],
            ['退款待补偿', metrics.refund_mismatch_count],
            ['告警未送达', metrics.pending_alert_delivery_count],
          ].map(([label, value]) => (
            <div
              className="rounded-xl border border-border bg-card p-4"
              key={String(label)}
            >
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="mt-2 text-2xl font-semibold">{value}</p>
            </div>
          ))
        ) : (
          <div className="col-span-full rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
            运行观测当前不可确认；订单工作台不会用 0 伪装健康状态。
          </div>
        )}
      </section>

      {metrics ? (
        <>
          <section
            className="grid gap-6 lg:grid-cols-[1fr_1fr]"
            aria-label="Billing 运行观测"
          >
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">运行观测</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    最近观测：{formatDate(metrics.observed_at)} · 阈值来源：
                    {metrics.alert_threshold_source === 'configured'
                      ? '已配置'
                      : '本地默认值'}
                  </p>
                </div>
                <StatusBadge
                  label={`${metrics.active_alert_count} 个活跃告警`}
                  tone={metrics.active_alert_count > 0 ? 'warning' : 'success'}
                />
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">处理中最久</dt>
                  <dd className="mt-1 font-medium">
                    {Math.round(metrics.oldest_processing_age_seconds ?? 0)} 秒
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">重试总次数</dt>
                  <dd className="mt-1 font-medium">
                    {metrics.retry_attempts_total}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Discovery 延迟</dt>
                  <dd className="mt-1 font-medium">
                    {Math.round(metrics.discovery_lag_seconds ?? 0)} 秒
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Processing 延迟</dt>
                  <dd className="mt-1 font-medium">
                    {Math.round(metrics.processing_lag_seconds ?? 0)} 秒
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
                    {formatDate(metrics.scheduler_last_accepted_at)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">最近完成</dt>
                  <dd className="mt-1 font-medium">
                    {formatDate(metrics.scheduler_last_completed_at)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">调度失败次数</dt>
                  <dd className="mt-1 font-medium">
                    {metrics.scheduler_failure_count}
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
            {metrics.alerts.length ? (
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
        </>
      ) : null}

      <BillingOrderWorkspace
        filters={filters}
        onFiltersChange={updateFilters}
        onSelectedOrderChange={updateSelected}
        platforms={platforms}
        selectedOrderId={selectedOrderId}
      />
    </main>
  );
}
