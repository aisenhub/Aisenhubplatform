'use client';

import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  CreditCard,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { AsyncState } from '@kit/ui/async-state';
import { Button } from '@kit/ui/button';
import { StatusBadge } from '@kit/ui/status-badge';
import { SupportErrorId } from '@kit/ui/support-error-id';

import { AdminPageHeader } from '../../components/shell/admin-page-header';
import {
  adminAuthSession,
  sessionErrorMessage,
} from '../../app/_lib/auth-session';
import {
  formatUtc,
  readApiPayload,
  resourceError,
  statusLabel,
  statusTone,
  type ResourceError,
  type ResourceLoadState,
} from '../resources/admin-resource-utils';
import {
  auditActionLabel,
  auditActorLabel,
  auditTargetTypeLabel,
  buildAttentionItems,
  countFailureSignals,
  deriveSystemHealth,
  platformStats,
  recentChangedPlatforms,
  type AttentionItem,
  type AttentionSeverity,
  type OverviewAuditEntry,
  type OverviewBillingMetrics,
  type OverviewDeletionJob,
  type OverviewPlatform,
  type OverviewTone,
} from './admin-overview-model';

type SourceState<T> = {
  data: T[];
  state: ResourceLoadState;
  error: ResourceError | null;
  refreshError: ResourceError | null;
};

const initialSource = <T,>(): SourceState<T> => ({
  data: [],
  state: 'loading',
  error: null,
  refreshError: null,
});

function caughtError(title: string, error: unknown): ResourceError {
  return {
    title,
    description: sessionErrorMessage(error),
    requestId: null,
    technicalDetail: null,
  };
}

function auditOutcome(value: string | null | undefined) {
  switch (value?.toLowerCase()) {
    case 'success':
    case 'confirmed':
      return { label: '成功', tone: 'success' as const };
    case 'failed':
    case 'rejected':
    case 'revoked':
      return { label: '失败', tone: 'danger' as const };
    case 'pending':
    case 'accepted':
    case 'running':
      return { label: '处理中', tone: 'info' as const };
    case 'unknown':
    case 'unknown_outcome':
      return { label: '结果未确认', tone: 'unknown' as const };
    default:
      return { label: value ?? '未提供', tone: 'neutral' as const };
  }
}

function attentionTone(severity: AttentionSeverity) {
  return severity === 'critical'
    ? ('danger' as const)
    : severity === 'warning'
      ? ('warning' as const)
      : ('info' as const);
}

function platformCount(value: number, saturated: boolean) {
  return saturated ? `≥${value}` : `${value}`;
}

export function AdminOverviewPage() {
  const [platforms, setPlatforms] =
    useState<SourceState<OverviewPlatform>>(initialSource);
  const [jobs, setJobs] =
    useState<SourceState<OverviewDeletionJob>>(initialSource);
  const [billing, setBilling] =
    useState<SourceState<OverviewBillingMetrics>>(initialSource);
  const [audit, setAudit] =
    useState<SourceState<OverviewAuditEntry>>(initialSource);
  const [refreshing, setRefreshing] = useState(false);
  const platformGeneration = useRef(0);
  const jobGeneration = useRef(0);
  const billingGeneration = useRef(0);
  const auditGeneration = useRef(0);

  const loadPlatforms = useCallback(async (background: boolean) => {
    const generation = ++platformGeneration.current;
    const epoch = adminAuthSession.getEpoch();
    if (!background) {
      setPlatforms((current) => ({
        ...current,
        state: 'loading',
        error: null,
      }));
    } else {
      setPlatforms((current) => ({ ...current, refreshError: null }));
    }
    try {
      const response = await adminAuthSession.request(
        '/api/v1/admin/api/v1/platforms?limit=100',
        { cache: 'no-store' },
      );
      const payload = await readApiPayload<OverviewPlatform[]>(response);
      if (
        generation !== platformGeneration.current ||
        !adminAuthSession.isCurrentEpoch(epoch)
      )
        return;
      if (!response.ok || !Array.isArray(payload?.data)) {
        const nextError = resourceError(response, payload, '平台列表');
        setPlatforms((current) =>
          background
            ? { ...current, refreshError: nextError }
            : { ...current, state: 'error', error: nextError },
        );
        return;
      }
      setPlatforms({
        data: payload.data,
        state: 'success',
        error: null,
        refreshError: null,
      });
    } catch (caught) {
      if (
        generation !== platformGeneration.current ||
        !adminAuthSession.isCurrentEpoch(epoch)
      )
        return;
      const nextError = caughtError('平台列表读取失败', caught);
      setPlatforms((current) =>
        background
          ? { ...current, refreshError: nextError }
          : { ...current, state: 'error', error: nextError },
      );
    }
  }, []);

  const loadJobs = useCallback(async (background: boolean) => {
    const generation = ++jobGeneration.current;
    const epoch = adminAuthSession.getEpoch();
    if (!background) {
      setJobs((current) => ({ ...current, state: 'loading', error: null }));
    } else setJobs((current) => ({ ...current, refreshError: null }));
    try {
      const response = await adminAuthSession.request(
        '/api/v1/admin/api/v1/deletion-jobs?limit=100',
        { cache: 'no-store' },
      );
      const payload = await readApiPayload<OverviewDeletionJob[]>(response);
      if (
        generation !== jobGeneration.current ||
        !adminAuthSession.isCurrentEpoch(epoch)
      )
        return;
      if (!response.ok || !Array.isArray(payload?.data)) {
        const nextError = resourceError(response, payload, '删除任务');
        setJobs((current) =>
          background
            ? { ...current, refreshError: nextError }
            : { ...current, state: 'error', error: nextError },
        );
        return;
      }
      setJobs({
        data: payload.data,
        state: 'success',
        error: null,
        refreshError: null,
      });
    } catch (caught) {
      if (
        generation !== jobGeneration.current ||
        !adminAuthSession.isCurrentEpoch(epoch)
      )
        return;
      const nextError = caughtError('删除任务读取失败', caught);
      setJobs((current) =>
        background
          ? { ...current, refreshError: nextError }
          : { ...current, state: 'error', error: nextError },
      );
    }
  }, []);

  const loadBilling = useCallback(async (background: boolean) => {
    const generation = ++billingGeneration.current;
    const epoch = adminAuthSession.getEpoch();
    if (!background) {
      setBilling((current) => ({ ...current, state: 'loading', error: null }));
    } else setBilling((current) => ({ ...current, refreshError: null }));
    try {
      const response = await adminAuthSession.request(
        '/api/v1/admin/api/v1/billing/metrics',
        { cache: 'no-store' },
      );
      const payload = await readApiPayload<OverviewBillingMetrics>(response);
      if (
        generation !== billingGeneration.current ||
        !adminAuthSession.isCurrentEpoch(epoch)
      )
        return;
      if (!response.ok || !payload?.data) {
        const nextError = resourceError(response, payload, '计费观测');
        setBilling((current) =>
          background
            ? { ...current, refreshError: nextError }
            : { ...current, state: 'error', error: nextError },
        );
        return;
      }
      setBilling({
        data: [payload.data],
        state: 'success',
        error: null,
        refreshError: null,
      });
    } catch (caught) {
      if (
        generation !== billingGeneration.current ||
        !adminAuthSession.isCurrentEpoch(epoch)
      )
        return;
      const nextError = caughtError('计费观测读取失败', caught);
      setBilling((current) =>
        background
          ? { ...current, refreshError: nextError }
          : { ...current, state: 'error', error: nextError },
      );
    }
  }, []);

  const loadAudit = useCallback(async (background: boolean) => {
    const generation = ++auditGeneration.current;
    const epoch = adminAuthSession.getEpoch();
    if (!background) {
      setAudit((current) => ({ ...current, state: 'loading', error: null }));
    } else setAudit((current) => ({ ...current, refreshError: null }));
    try {
      const response = await adminAuthSession.request(
        '/api/v1/admin/api/v1/audit?limit=8',
        { cache: 'no-store' },
      );
      const payload = await readApiPayload<OverviewAuditEntry[]>(response);
      if (
        generation !== auditGeneration.current ||
        !adminAuthSession.isCurrentEpoch(epoch)
      )
        return;
      if (!response.ok || !Array.isArray(payload?.data)) {
        const nextError = resourceError(response, payload, '最近审计活动');
        setAudit((current) =>
          background
            ? { ...current, refreshError: nextError }
            : { ...current, state: 'error', error: nextError },
        );
        return;
      }
      setAudit({
        data: payload.data,
        state: 'success',
        error: null,
        refreshError: null,
      });
    } catch (caught) {
      if (
        generation !== auditGeneration.current ||
        !adminAuthSession.isCurrentEpoch(epoch)
      )
        return;
      const nextError = caughtError('最近审计活动读取失败', caught);
      setAudit((current) =>
        background
          ? { ...current, refreshError: nextError }
          : { ...current, state: 'error', error: nextError },
      );
    }
  }, []);

  const loadAll = useCallback(
    async (background: boolean) => {
      if (background) setRefreshing(true);
      await Promise.all([
        loadPlatforms(background),
        loadJobs(background),
        loadBilling(background),
        loadAudit(background),
      ]);
      if (background) setRefreshing(false);
    },
    [loadAudit, loadBilling, loadJobs, loadPlatforms],
  );

  useEffect(() => {
    void loadAll(false);
  }, [loadAll]);

  const billingMetrics = billing.data[0] ?? null;
  const attentionItems = useMemo(
    () => buildAttentionItems(jobs.data, billingMetrics),
    [billingMetrics, jobs.data],
  );
  const failures = useMemo(
    () => countFailureSignals(jobs.data, billingMetrics),
    [billingMetrics, jobs.data],
  );
  const health = useMemo(
    () =>
      deriveSystemHealth(
        [platforms.state, jobs.state, billing.state, audit.state],
        attentionItems.length,
      ),
    [
      attentionItems.length,
      audit.state,
      billing.state,
      jobs.state,
      platforms.state,
    ],
  );
  const stats = useMemo(() => platformStats(platforms.data), [platforms.data]);
  const recentPlatforms = useMemo(
    () => recentChangedPlatforms(audit.data, platforms.data),
    [audit.data, platforms.data],
  );
  const platformSaturated = platforms.data.length >= 100;
  const attentionReady =
    jobs.state === 'success' && billing.state === 'success';
  const billingCritical =
    billingMetrics?.alerts.some(
      (alert) => alert.status === 'active' && alert.severity === 'critical',
    ) ?? false;

  return (
    <main className="shell wide-shell" data-test="admin-overview">
      <AdminPageHeader
        title="概览"
        description="优先查看异常、待处理事项和最近变更，再进入具体管理范围。"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadAll(true)}
            disabled={refreshing}
            data-test="overview-refresh"
          >
            {refreshing ? '刷新中…' : '刷新'}
          </Button>
        }
      />

      <SourceRefreshErrors
        sources={[platforms, jobs, billing, audit]}
        onRetry={() => void loadAll(true)}
      />

      <div className="admin-overview-summary" aria-label="管理员概览关键状态">
        <SummaryCard
          label="系统状态"
          value={health.label}
          description={health.description}
          tone={health.tone}
        />
        <SummaryCard
          label="待处理事项"
          value={attentionReady ? `${attentionItems.length}` : '—'}
          description={
            attentionReady
              ? '删除任务、计费告警与人工复核'
              : '正在确认删除任务和计费观测'
          }
          tone={
            attentionReady
              ? attentionItems.length > 0
                ? 'warning'
                : 'success'
              : 'neutral'
          }
        />
        <SummaryCard
          label="失败 / 阻塞"
          value={attentionReady ? `${failures}` : '—'}
          description={
            attentionReady
              ? '当前需要人工介入的处理异常'
              : '数据未确认前不判断为无异常'
          }
          tone={
            attentionReady ? (failures > 0 ? 'danger' : 'success') : 'neutral'
          }
        />
        <SummaryCard
          label="计费告警"
          value={
            billing.state === 'success'
              ? `${billingMetrics?.active_alert_count ?? 0}`
              : '—'
          }
          description={
            billing.state !== 'success'
              ? billing.state === 'loading'
                ? '正在读取计费观测'
                : '计费观测暂不可用'
              : (billingMetrics?.active_alert_count ?? 0) > 0
                ? '活动告警需要进入计费管理检查'
                : '当前没有活动计费告警'
          }
          tone={
            billing.state !== 'success'
              ? 'neutral'
              : (billingMetrics?.active_alert_count ?? 0) === 0
                ? 'success'
                : billingCritical
                  ? 'danger'
                  : 'warning'
          }
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.75fr)]">
        <section className="panel gap-4" data-test="overview-attention">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2>需要关注</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                这里只放需要管理员判断或处理的异常，不重复普通导航。
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              <Link
                href="/admin/operations"
                className="text-primary underline-offset-4 hover:underline"
              >
                运维中心
              </Link>
              <Link
                href="/admin/billing"
                className="text-primary underline-offset-4 hover:underline"
              >
                计费管理
              </Link>
              <Link
                href="/admin/accounts"
                className="text-primary underline-offset-4 hover:underline"
              >
                统一用户
              </Link>
            </div>
          </div>

          <AttentionState
            jobs={jobs}
            billing={billing}
            items={attentionItems}
            onRetry={() =>
              void Promise.all([loadJobs(false), loadBilling(false)])
            }
          />
        </section>

        <section className="panel gap-4" data-test="overview-platform-summary">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2>平台概况</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                快速确认平台启用状态和激活策略。
              </p>
            </div>
            <Link
              href="/admin/platforms"
              className="text-sm text-primary underline-offset-4 hover:underline"
            >
              查看平台
            </Link>
          </div>

          <SourceStateView
            state={platforms}
            resource="平台列表"
            onRetry={() => void loadPlatforms(false)}
          />

          {platforms.state === 'success' ? (
            <div className="grid grid-cols-2 gap-3">
              <MetricBlock
                label="目录平台"
                value={platformCount(stats.total, platformSaturated)}
              />
              <MetricBlock
                label="活跃"
                value={platformCount(stats.active, platformSaturated)}
              />
              <MetricBlock
                label="停用"
                value={platformCount(stats.disabled, platformSaturated)}
              />
              <MetricBlock
                label="暂停新激活"
                value={platformCount(stats.activationPaused, platformSaturated)}
              />
            </div>
          ) : null}

          {platforms.state === 'success' ? (
            <div className="border-t border-border pt-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3>最近变更的平台</h3>
                <span className="text-xs text-muted-foreground">
                  来自最近审计活动
                </span>
              </div>
              {recentPlatforms.length ? (
                <div className="grid gap-2">
                  {recentPlatforms.map((platform) => (
                    <Link
                      key={platform.platform_id}
                      href={`/admin/platforms/${encodeURIComponent(platform.platform_id)}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 px-3 py-2 hover:border-primary/40"
                      data-test={`overview-recent-platform-${platform.platform_id}`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {platform.name}
                        </span>
                        <span className="block truncate font-mono text-xs text-muted-foreground">
                          {platform.code}
                        </span>
                      </span>
                      <StatusBadge
                        label={statusLabel(platform.status)}
                        tone={statusTone(platform.status)}
                        rawValue={platform.status}
                      />
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  最近审计活动里没有平台级变更。
                </p>
              )}
            </div>
          ) : null}
        </section>
      </div>

      <section className="panel gap-4" data-test="overview-recent-audit">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2>最近活动</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              关注最近的管理动作、目标和结果；完整检索请进入审计页。
            </p>
          </div>
          <Link
            href="/admin/audit"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            查看全部审计
          </Link>
        </div>

        <SourceStateView
          state={audit}
          resource="最近审计活动"
          onRetry={() => void loadAudit(false)}
        />

        {audit.state === 'success' && audit.data.length === 0 ? (
          <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-muted/20 p-4">
            <Activity
              className="mt-0.5 size-5 text-muted-foreground"
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-medium">暂无最近操作记录</p>
              <p className="mt-1 text-xs text-muted-foreground">
                新的管理员操作会在这里按时间倒序出现。
              </p>
            </div>
          </div>
        ) : null}

        {audit.data.length ? (
          <div className="divide-y divide-border rounded-lg border border-border/70">
            {audit.data.map((entry, index) => {
              const outcome = auditOutcome(entry.outcome);
              const key =
                entry.id ?? entry.request_id ?? `${entry.action}-${index}`;
              return (
                <div
                  key={key}
                  className="grid gap-3 bg-card px-4 py-3 first:rounded-t-lg last:rounded-b-lg sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <Activity
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {auditActionLabel(entry.action)}
                      </p>
                      <p className="mt-1 break-all text-xs text-muted-foreground">
                        {auditActorLabel(entry)} ·{' '}
                        {auditTargetTypeLabel(entry.target_type)}
                        {entry.target_id ? ` ${entry.target_id}` : ''} ·{' '}
                        {formatUtc(entry.created_at)}
                      </p>
                    </div>
                  </div>
                  <StatusBadge
                    label={outcome.label}
                    tone={outcome.tone}
                    rawValue={entry.outcome}
                  />
                </div>
              );
            })}
          </div>
        ) : null}
      </section>
    </main>
  );
}

function AttentionState({
  jobs,
  billing,
  items,
  onRetry,
}: {
  jobs: SourceState<OverviewDeletionJob>;
  billing: SourceState<OverviewBillingMetrics>;
  items: AttentionItem[];
  onRetry: () => void;
}) {
  const loading =
    (jobs.state === 'loading' || billing.state === 'loading') &&
    items.length === 0;
  if (loading) return <AsyncState state="loading" />;

  const errors = [jobs.error, billing.error].filter(
    (error): error is ResourceError => Boolean(error),
  );
  if (errors.length) {
    return (
      <Alert variant="destructive">
        <AlertTitle>部分关注信号暂不可用</AlertTitle>
        <AlertDescription>
          页面不会把读取失败当作“没有异常”。
          <div className="mt-3 grid gap-2">
            {errors.map((error) => (
              <span key={error.title}>
                {error.title}：{error.description}
                <SupportErrorId
                  requestId={error.requestId}
                  technicalDetail={error.technicalDetail}
                />
              </span>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={onRetry}
            >
              重试
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  if (
    !items.length &&
    jobs.state === 'success' &&
    billing.state === 'success'
  ) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-muted/20 p-4">
        <CheckCircle2
          className="mt-0.5 size-5 text-success"
          aria-hidden="true"
        />
        <div>
          <p className="text-sm font-medium">当前没有需要处理的事项</p>
          <p className="mt-1 text-xs text-muted-foreground">
            删除任务和计费观测当前没有需要人工介入的信号。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      {items.slice(0, 6).map((item) => (
        <AttentionRow key={item.key} item={item} />
      ))}
      {items.length > 6 ? (
        <p className="pt-1 text-xs text-muted-foreground">
          还有 {items.length - 6} 项未展开，请进入对应管理页继续处理。
        </p>
      ) : null}
    </div>
  );
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const Icon =
    item.severity === 'critical'
      ? AlertTriangle
      : item.severity === 'warning'
        ? Clock3
        : CreditCard;
  return (
    <Link
      href={item.href}
      className="grid gap-3 rounded-lg border border-border/70 bg-card p-3 hover:border-primary/40 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"
      data-test={`overview-attention-${item.key}`}
    >
      <span className="grid size-9 place-items-center rounded-lg bg-muted">
        <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{item.title}</span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
          {item.description}
        </span>
      </span>
      <span className="flex items-center justify-between gap-2 sm:justify-end">
        <StatusBadge
          label={item.badge}
          tone={attentionTone(item.severity)}
          rawValue={item.severity}
        />
        <ArrowRight
          className="size-4 text-muted-foreground"
          aria-hidden="true"
        />
      </span>
    </Link>
  );
}

function SourceRefreshErrors({
  sources,
  onRetry,
}: {
  sources: Array<SourceState<unknown>>;
  onRetry: () => void;
}) {
  const errors = sources
    .map((source) => source.refreshError)
    .filter((value): value is ResourceError => Boolean(value));
  if (!errors.length) return null;
  return (
    <Alert variant="destructive" data-test="overview-partial-error">
      <AlertTitle>部分数据源刷新失败</AlertTitle>
      <AlertDescription>
        已知数据仍保留，并标记为可能过期；本页不会把旧值当作当前健康状态。
        <div className="mt-3 grid gap-2">
          {errors.map((error, index) => (
            <span key={`${error.title}-${index}`}>
              {error.title}：{error.description}
              <SupportErrorId
                requestId={error.requestId}
                technicalDetail={error.technicalDetail}
              />
            </span>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={onRetry}
            data-test="overview-partial-retry"
          >
            重试刷新
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}

function SourceStateView<T>({
  state,
  resource,
  onRetry,
}: {
  state: SourceState<T>;
  resource: string;
  onRetry: () => void;
}) {
  if (state.state === 'loading' && state.data.length === 0)
    return <AsyncState state="loading" />;
  if (state.state === 'error' && state.error)
    return (
      <AsyncState
        state="error"
        title={state.error.title}
        description={state.error.description}
        requestId={state.error.requestId}
        technicalDetail={state.error.technicalDetail}
        onRetry={onRetry}
      />
    );
  return state.data.length === 0 && state.state !== 'success' ? (
    <p className="text-sm text-muted-foreground">{resource}暂无可展示数据。</p>
  ) : null;
}

function SummaryCard({
  label,
  value,
  description,
  tone,
}: {
  label: string;
  value: string;
  description: string;
  tone: OverviewTone;
}) {
  const toneClass =
    tone === 'danger'
      ? 'text-destructive'
      : tone === 'warning'
        ? 'text-warning-foreground'
        : tone === 'info'
          ? 'text-info-foreground'
          : tone === 'success'
            ? 'text-success'
            : 'text-foreground';
  return (
    <section className="grid gap-2 bg-card">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-semibold ${toneClass}`}>{value}</p>
      <p className="text-xs leading-5 text-muted-foreground">{description}</p>
    </section>
  );
}

function MetricBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
