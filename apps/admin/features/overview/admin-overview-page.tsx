'use client';

import Link from 'next/link';
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

type Platform = {
  platform_id: string;
  code: string;
  name: string;
  status: string;
  allow_activation: boolean;
};

type DeletionJob = {
  job_id: string;
  request_id: string;
  state: string;
  checkpoint: string;
  retry_count: number;
  last_error_code?: string | null;
  created_at?: string | null;
};

type AuditEntry = {
  id?: string | null;
  request_id?: string | null;
  action?: string | null;
  target_type?: string | null;
  target_id?: string | null;
  outcome?: string | null;
  created_at?: string | null;
};

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

export function AdminOverviewPage() {
  const [platforms, setPlatforms] =
    useState<SourceState<Platform>>(initialSource);
  const [jobs, setJobs] = useState<SourceState<DeletionJob>>(initialSource);
  const [audit, setAudit] = useState<SourceState<AuditEntry>>(initialSource);
  const [refreshing, setRefreshing] = useState(false);
  const platformGeneration = useRef(0);
  const jobGeneration = useRef(0);
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
      const payload = await readApiPayload<Platform[]>(response);
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
      const payload = await readApiPayload<DeletionJob[]>(response);
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

  const loadAudit = useCallback(async (background: boolean) => {
    const generation = ++auditGeneration.current;
    const epoch = adminAuthSession.getEpoch();
    if (!background) {
      setAudit((current) => ({ ...current, state: 'loading', error: null }));
    } else setAudit((current) => ({ ...current, refreshError: null }));
    try {
      const response = await adminAuthSession.request(
        '/api/v1/admin/api/v1/audit?limit=5',
        { cache: 'no-store' },
      );
      const payload = await readApiPayload<AuditEntry[]>(response);
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
        loadAudit(background),
      ]);
      if (background) setRefreshing(false);
    },
    [loadAudit, loadJobs, loadPlatforms],
  );

  useEffect(() => {
    void loadAll(false);
  }, [loadAll]);

  const disabledPlatforms = useMemo(
    () => platforms.data.filter((platform) => platform.status === 'disabled'),
    [platforms.data],
  );
  const attentionJobs = useMemo(
    () => jobs.data.filter((job) => ['blocked', 'retry'].includes(job.state)),
    [jobs.data],
  );
  const runningJobs = useMemo(
    () => jobs.data.filter((job) => ['pending', 'running'].includes(job.state)),
    [jobs.data],
  );

  return (
    <main className="shell wide-shell" data-test="admin-overview">
      <AdminPageHeader
        title="管理员总览"
        description="只聚合当前真实 API 能有界返回的数据；任何数据源失败都会保留为失败，不会显示成绿色健康或假指标。"
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
        sources={[platforms, jobs, audit]}
        onRetry={() => void loadAll(true)}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          label="停用平台"
          value={
            platforms.state === 'success' ? `${disabledPlatforms.length}` : '—'
          }
          description="当前返回窗口内；不代表全局总量"
          tone="danger"
        />
        <SummaryCard
          label="需关注的删除任务"
          value={jobs.state === 'success' ? `${attentionJobs.length}` : '—'}
          description="blocked / retry，最多 100 条结果"
          tone="warning"
        />
        <SummaryCard
          label="正在处理"
          value={jobs.state === 'success' ? `${runningJobs.length}` : '—'}
          description="pending / running，最多 100 条结果"
          tone="info"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
        <section
          className="panel gap-4"
          data-test="overview-platform-attention"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2>平台关注项</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                来自有界平台列表；不会把未返回的平台猜成正常。
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
          {platforms.state === 'success' && disabledPlatforms.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              当前返回窗口内没有停用平台。
            </p>
          ) : null}
          {disabledPlatforms.length ? (
            <div className="grid gap-2">
              {disabledPlatforms.slice(0, 8).map((platform) => (
                <Link
                  key={platform.platform_id}
                  href={`/admin/platforms/${encodeURIComponent(platform.platform_id)}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-card p-3 hover:border-primary/40"
                  data-test={`overview-disabled-platform-${platform.platform_id}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {platform.name}
                    </span>
                    <span className="mt-1 block truncate font-mono text-xs text-muted-foreground">
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
          ) : null}
        </section>

        <section className="panel gap-4" data-test="overview-file-boundary">
          <div>
            <h2>文件状态边界</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              全局 Admin 文件接口目前没有 status
              filter。本页不从一页文件数据计算 deleting/unknown 全局数量。
            </p>
          </div>
          <Link
            href="/admin/platforms"
            className="w-fit text-sm text-primary underline-offset-4 hover:underline"
          >
            进入平台 Files
          </Link>
        </section>
      </div>

      <section className="panel gap-4" data-test="overview-job-attention">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2>删除任务关注项</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Operations 使用同一 deletion-jobs
              API；本页只提供入口，不复制重试逻辑。
            </p>
          </div>
          <Link
            href="/admin/operations"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            打开 Operations
          </Link>
        </div>
        <SourceStateView
          state={jobs}
          resource="删除任务"
          onRetry={() => void loadJobs(false)}
        />
        {jobs.state === 'success' && attentionJobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            当前返回窗口内没有 blocked/retry 任务。
          </p>
        ) : null}
        {attentionJobs.length ? (
          <div className="grid gap-2">
            {attentionJobs.slice(0, 8).map((job) => (
              <Link
                key={job.job_id}
                href={`/admin/operations?job_id=${encodeURIComponent(job.job_id)}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-card p-3 hover:border-primary/40"
                data-test={`overview-job-${job.job_id}`}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    {job.checkpoint}
                  </span>
                  <span className="mt-1 block break-all font-mono text-xs text-muted-foreground">
                    {job.job_id}
                  </span>
                </span>
                <StatusBadge
                  label={job.state === 'blocked' ? '已阻塞' : '等待重试'}
                  tone={job.state === 'blocked' ? 'danger' : 'warning'}
                  rawValue={job.state}
                />
              </Link>
            ))}
          </div>
        ) : null}
      </section>

      <section className="panel gap-4" data-test="overview-recent-audit">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2>最近审计活动</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              仅展示审计 API 返回的最新 5 条；详情和技术 ID 在审计页查看。
            </p>
          </div>
          <Link
            href="/admin/audit"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            查看审计
          </Link>
        </div>
        <SourceStateView
          state={audit}
          resource="最近审计活动"
          onRetry={() => void loadAudit(false)}
        />
        {audit.state === 'success' && audit.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            当前没有返回审计事件。
          </p>
        ) : null}
        {audit.data.length ? (
          <div className="grid gap-2">
            {audit.data.map((entry, index) => {
              const outcome = auditOutcome(entry.outcome);
              const key =
                entry.id ?? entry.request_id ?? `${entry.action}-${index}`;
              return (
                <div
                  key={key}
                  className="grid gap-2 rounded-lg border border-border/70 bg-card p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {entry.action ?? '未命名动作'}
                    </p>
                    <p className="mt-1 break-all text-xs text-muted-foreground">
                      {entry.target_type ?? '未提供目标'}
                      {entry.target_id ? ` · ${entry.target_id}` : ''} ·{' '}
                      {formatUtc(entry.created_at)}
                    </p>
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

      <section className="panel gap-4">
        <div>
          <h2>快捷入口</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            进入真实资源页或安全边界；本页不提供第二套 mutation。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <QuickLink href="/admin/platforms" label="平台目录" />
          <QuickLink href="/admin/operations" label="Operations" />
          <QuickLink href="/admin/audit" label="审计记录" />
          <QuickLink href="/admin/security" label="安全总览" />
        </div>
      </section>
    </main>
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
  tone: 'danger' | 'warning' | 'info';
}) {
  return (
    <section className="panel gap-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`text-2xl font-semibold ${tone === 'danger' ? 'text-destructive' : tone === 'warning' ? 'text-warning-foreground' : 'text-info-foreground'}`}
      >
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{description}</p>
    </section>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      nativeButton={false}
      render={<Link href={href} />}
      data-test={`overview-link-${label}`}
    >
      {label}
    </Button>
  );
}
