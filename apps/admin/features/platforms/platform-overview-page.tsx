'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, ArrowUpRight, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { AsyncState } from '@kit/ui/async-state';
import { Button, buttonVariants } from '@kit/ui/button';
import { ResourceId } from '@kit/ui/resource-id';
import { StatusBadge, type StatusTone } from '@kit/ui/status-badge';
import { SupportErrorId } from '@kit/ui/support-error-id';

import {
  adminAuthSession,
  sessionErrorMessage,
} from '../../app/_lib/auth-session';
import { usePlatformContext } from '../../components/platform-context/platform-workspace';
import { platformStatus } from '../../components/platform-context/platform-types';
import { AdminPageHeader } from '../../components/shell/admin-page-header';
import { AdminWorkspaceSection } from '../../components/workspace/admin-workspace';
import {
  readApiPayload,
  resourceError,
  type ResourceError,
  type ResourceLoadState,
} from '../resources/admin-resource-utils';
import {
  comparisonLabel,
  comparisonTone,
  metricNumber,
  PLATFORM_OVERVIEW_PERIODS,
  platformOverviewPeriod,
  type PlatformOverviewMetrics,
} from './platform-overview-model';
import { CommerceSummaryPanel } from '../billing/commerce-summary-panel';

const quickLinks = [
  ['accounts', '平台账户', '查找账户、查看状态与管理访问。'],
  ['billing', '订单与计费', '查看当前平台订单与处理异常。'],
  ['plans', '平台套餐', '管理免费与付费套餐。'],
  ['subscriptions', '平台订阅', '查看账户的订阅与权益。'],
  ['files', '配置资源', '审核配置、管理 Gallery 可见性与查看 Storage 状态。'],
  ['feedback', '用户反馈', '处理用户反馈、图片附件与跟进状态。'],
  ['settings', '平台设置', '调整运行状态与激活策略。'],
] as const;

function caughtOverviewError(error: unknown): ResourceError {
  return {
    title: '平台运营摘要读取失败',
    description: sessionErrorMessage(error),
    requestId: null,
    technicalDetail: null,
  };
}

function MetricCard({
  label,
  value,
  description,
  href,
  tone = 'neutral',
  test,
}: {
  label: string;
  value: number | string;
  description: string;
  href?: string;
  tone?: StatusTone;
  test?: string;
}) {
  const body = (
    <>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <strong className="mt-2 block text-2xl font-semibold tabular-nums text-foreground">
        {value}
      </strong>
      <span className="mt-2 block text-xs text-muted-foreground">
        {tone === 'neutral' ? (
          description
        ) : (
          <StatusBadge label={description} tone={tone} />
        )}
      </span>
    </>
  );
  return href ? (
    <Link
      href={href}
      className="block border-b border-border/70 py-3 transition-colors last:border-b-0 hover:text-primary xl:border-b-0"
      data-test={test}
    >
      {body}
    </Link>
  ) : (
    <div
      className="border-b border-border/70 py-3 last:border-b-0 xl:border-b-0"
      data-test={test}
    >
      {body}
    </div>
  );
}

export function PlatformOverviewPage() {
  const { platform, reload } = usePlatformContext();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const period = platformOverviewPeriod(searchParams.get('days'));
  const status = platformStatus(platform.status);
  const [metrics, setMetrics] = useState<PlatformOverviewMetrics | null>(null);
  const [state, setState] = useState<ResourceLoadState>('loading');
  const [error, setError] = useState<ResourceError | null>(null);
  const [refreshError, setRefreshError] = useState<ResourceError | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const generationRef = useRef(0);

  const load = useCallback(
    async (background = false) => {
      const generation = ++generationRef.current;
      const epoch = adminAuthSession.getEpoch();
      if (background) {
        setRefreshing(true);
        setRefreshError(null);
      } else {
        setState('loading');
        setError(null);
      }
      try {
        const response = await adminAuthSession.request(
          `/api/v1/admin/api/v1/platforms/${encodeURIComponent(platform.platform_id)}/overview?days=${period}`,
          { cache: 'no-store' },
        );
        const payload = await readApiPayload<PlatformOverviewMetrics>(response);
        if (
          generation !== generationRef.current ||
          !adminAuthSession.isCurrentEpoch(epoch)
        )
          return;
        if (!response.ok || !payload?.data) {
          const nextError = resourceError(response, payload, '平台运营摘要');
          if (background) setRefreshError(nextError);
          else {
            setMetrics(null);
            setError(nextError);
            setState('error');
          }
          return;
        }
        setMetrics(payload.data);
        setState('success');
        setError(null);
      } catch (caught) {
        if (
          generation !== generationRef.current ||
          !adminAuthSession.isCurrentEpoch(epoch)
        )
          return;
        const nextError = caughtOverviewError(caught);
        if (background) setRefreshError(nextError);
        else {
          setMetrics(null);
          setError(nextError);
          setState('error');
        }
      } finally {
        if (generation === generationRef.current) setRefreshing(false);
      }
    },
    [period, platform.platform_id],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  function setPeriod(days: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (days === 30) params.delete('days');
    else params.set('days', String(days));
    router.replace(`${pathname}${params.toString() ? `?${params}` : ''}`);
  }

  const base = `/admin/platforms/${encodeURIComponent(platform.platform_id)}`;

  return (
    <section className="grid gap-5" data-test="platform-overview">
      <AdminPageHeader
        title="运营概览"
        description={`查看 ${platform.name} 的用户变化、商业摘要与需要关注的事项。所有数字均来自服务端权威聚合。`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="flex items-center rounded-md border border-border bg-background p-0.5"
              aria-label="统计周期"
            >
              {PLATFORM_OVERVIEW_PERIODS.map((days) => (
                <Button
                  key={days}
                  type="button"
                  size="sm"
                  variant={period === days ? 'secondary' : 'ghost'}
                  aria-pressed={period === days}
                  onClick={() => setPeriod(days)}
                  data-test={`platform-overview-period-${days}`}
                >
                  {days} 天
                </Button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                reload();
                void load(true);
              }}
              disabled={refreshing}
              data-test="platform-overview-refresh"
            >
              <RefreshCw
                className={`mr-1.5 size-3.5 ${refreshing ? 'animate-spin' : ''}`}
              />
              {refreshing ? '刷新中…' : '刷新'}
            </Button>
          </div>
        }
      />

      {refreshError ? (
        <Alert
          variant="destructive"
          data-test="platform-overview-refresh-error"
        >
          <AlertTitle>{refreshError.title}</AlertTitle>
          <AlertDescription className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
            <span>
              已知数据可能已过期。{refreshError.description}{' '}
              <SupportErrorId
                requestId={refreshError.requestId}
                technicalDetail={refreshError.technicalDetail}
              />
            </span>
            <Button variant="outline" size="sm" onClick={() => void load(true)}>
              重试刷新
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {state === 'loading' ? (
        <div className="py-8" data-test="platform-overview-loading">
          <AsyncState state="loading" />
        </div>
      ) : null}

      {state === 'error' && error ? (
        <Alert variant="destructive" data-test="platform-overview-error">
          <AlertTitle>{error.title}</AlertTitle>
          <AlertDescription className="grid gap-3">
            <span>{error.description}</span>
            <SupportErrorId
              requestId={error.requestId}
              technicalDetail={error.technicalDetail}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => void load(false)}
            >
              重试读取
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {state === 'success' && metrics ? (
        <>
          <AdminWorkspaceSection
            title="需要关注"
            titleId="platform-attention-title"
            description="只展示当前有权威事实的数据源；尚未建设的领域不会显示假 0。"
          >
            <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="已暂停账户"
                value={metricNumber(metrics.suspended_accounts)}
                description="进入账户列表处理"
                tone={
                  metricNumber(metrics.suspended_accounts) > 0
                    ? 'warning'
                    : 'neutral'
                }
                href={`${base}/accounts?q=suspended`}
              />
              <MetricCard
                label={`${period} 天异常订单`}
                value={metricNumber(metrics.attention_orders)}
                description={comparisonLabel(
                  metrics.attention_orders,
                  metrics.previous_attention_orders,
                )}
                tone={
                  metricNumber(metrics.attention_orders) > 0
                    ? comparisonTone(
                        metrics.attention_orders,
                        metrics.previous_attention_orders,
                        true,
                      )
                    : 'neutral'
                }
                href={`${base}/billing`}
                test="platform-overview-attention-orders"
              />
              <MetricCard
                label="待审核配置"
                value={metricNumber(metrics.pending_config_reviews)}
                description="进入配置资源审核队列"
                tone={
                  metricNumber(metrics.pending_config_reviews) > 0
                    ? 'warning'
                    : 'neutral'
                }
                href={`${base}/files#config-reviews`}
                test="platform-overview-pending-config-reviews"
              />
              <MetricCard
                label="待处理反馈"
                value={metricNumber(metrics.pending_feedback)}
                description="新反馈与处理中"
                tone={
                  metricNumber(metrics.pending_feedback) > 0
                    ? 'warning'
                    : 'neutral'
                }
                href={`${base}/feedback`}
                test="platform-overview-pending-feedback"
              />
            </div>
          </AdminWorkspaceSection>

          <AdminWorkspaceSection
            title="关键运行指标"
            titleId="platform-key-metrics"
            description="账户、付费与订单摘要用于定位工作区，不替代对应业务域的权威详情。"
          >
            <div
              className="grid gap-x-6 gap-y-2 sm:grid-cols-2 xl:grid-cols-4"
              aria-label="关键指标"
            >
              <MetricCard
                label="平台账户总量"
                value={metricNumber(metrics.total_accounts)}
                description="包含已关闭墓碑"
                href={`${base}/accounts`}
                test="platform-overview-total-accounts"
              />
              <MetricCard
                label="活跃账户"
                value={metricNumber(metrics.active_accounts)}
                description={`${metricNumber(metrics.suspended_accounts)} 个已暂停`}
                href={`${base}/accounts?q=active`}
              />
              <MetricCard
                label="当前有效付费账户"
                value={metricNumber(metrics.active_paid_accounts)}
                description="active paid Plan 投影"
                href={`${base}/subscriptions`}
                test="platform-overview-paid-accounts"
              />
              <MetricCard
                label={`${period} 天订单`}
                value={metricNumber(metrics.orders)}
                description={comparisonLabel(
                  metrics.orders,
                  metrics.previous_orders,
                )}
                tone={comparisonTone(metrics.orders, metrics.previous_orders)}
                href={`${base}/billing`}
                test="platform-overview-orders"
              />
            </div>
          </AdminWorkspaceSection>

          <AdminWorkspaceSection
            title="用户变化"
            titleId="platform-growth-title"
            description={`当前 ${period} 天与紧邻的上一 ${period} 天比较；净变化 = 新增 − 关闭。`}
          >
            <div className="grid gap-x-6 gap-y-2 sm:grid-cols-3">
              <MetricCard
                label="新增账户"
                value={metricNumber(metrics.new_accounts)}
                description={comparisonLabel(
                  metrics.new_accounts,
                  metrics.previous_new_accounts,
                )}
                tone={comparisonTone(
                  metrics.new_accounts,
                  metrics.previous_new_accounts,
                )}
                href={`${base}/accounts`}
                test="platform-overview-new-accounts"
              />
              <MetricCard
                label="关闭账户"
                value={metricNumber(metrics.period_closed_accounts)}
                description={comparisonLabel(
                  metrics.period_closed_accounts,
                  metrics.previous_closed_accounts,
                )}
                tone={comparisonTone(
                  metrics.period_closed_accounts,
                  metrics.previous_closed_accounts,
                  true,
                )}
                href={`${base}/accounts?q=closed`}
              />
              <MetricCard
                label="净变化"
                value={metricNumber(metrics.net_accounts)}
                description={comparisonLabel(
                  metrics.net_accounts,
                  metrics.previous_net_accounts,
                )}
                tone={comparisonTone(
                  metrics.net_accounts,
                  metrics.previous_net_accounts,
                )}
                href={`${base}/accounts`}
                test="platform-overview-net-accounts"
              />
            </div>
          </AdminWorkspaceSection>
        </>
      ) : null}

      <CommerceSummaryPanel
        platformId={platform.platform_id}
        title="商业摘要"
      />

      <AdminWorkspaceSection
        title="平台上下文"
        titleId="platform-context-summary"
        description="平台状态、激活策略与标识用于确认当前工作范围；配置变更继续进入平台设置。"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <strong>{platform.name}</strong>
            <StatusBadge
              label={status.label}
              tone={status.tone}
              rawValue={platform.status}
            />
            <StatusBadge
              label={platform.allow_activation ? '允许激活' : '禁止激活'}
              tone={platform.allow_activation ? 'success' : 'warning'}
            />
            <Link
              href={`${base}/settings`}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              平台设置
            </Link>
          </div>
        }
      >
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <span className="text-xs text-muted-foreground">Platform Code</span>
            <div className="mt-1 font-mono">{platform.code}</div>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Platform ID</span>
            <div className="mt-1">
              <ResourceId value={platform.platform_id} />
            </div>
          </div>
        </div>
      </AdminWorkspaceSection>

      <AdminWorkspaceSection
        title="快捷入口"
        titleId="platform-quick-links"
        description={`以下操作均属于 ${platform.name}，切换入口不会改变当前 Platform scope。`}
      >
        <div className="admin-task-links">
          {quickLinks.map(([href, title, description]) => (
            <Link
              key={href}
              href={`${base}/${href}`}
              className="admin-task-link"
              data-test={`platform-quick-link-${href}`}
            >
              <span>
                <span className="block text-sm font-medium">{title}</span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {description}
                </span>
              </span>
              <ArrowUpRight
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            </Link>
          ))}
        </div>
      </AdminWorkspaceSection>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <AlertTriangle
          className="mt-0.5 size-3.5 shrink-0"
          aria-hidden="true"
        />
        <span>
          本页不展示收入、MRR 或
          ARR；这些口径需要在商业治理域冻结后再接入。用户指标来自平台账户，商业指标来自订单与订阅权威投影。
        </span>
      </p>
    </section>
  );
}
