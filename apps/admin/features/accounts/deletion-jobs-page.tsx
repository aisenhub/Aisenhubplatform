'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { AsyncState } from '@kit/ui/async-state';
import { Button, buttonVariants } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { ResourceId } from '@kit/ui/resource-id';
import { ResourceInspector } from '@kit/ui/resource-inspector';
import { StatusBadge, type StatusTone } from '@kit/ui/status-badge';
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
  type ResourceError,
  type ResourceLoadState,
} from '../resources/admin-resource-utils';
import type { DeletionJob } from './account-types';
import {
  DeletionMutationDialog,
  type DeletionMutationIntent,
} from './deletion-mutation-dialog';

const JOB_LIST_PATH = '/api/v1/admin/api/v1/deletion-jobs?limit=100';

type InspectorState = 'idle' | 'loading' | 'success' | 'error';

function operationStatus(state: string): {
  label: string;
  tone: StatusTone;
  presentation: 'attention' | 'running' | 'completed' | 'blocked' | 'unknown';
} {
  switch (state.toLowerCase()) {
    case 'pending':
    case 'running':
      return { label: '处理中', tone: 'info', presentation: 'running' };
    case 'retry':
      return { label: '等待重试', tone: 'warning', presentation: 'attention' };
    case 'blocked':
      return { label: '已阻塞', tone: 'danger', presentation: 'blocked' };
    case 'completed':
    case 'complete':
      return { label: '已完成', tone: 'success', presentation: 'completed' };
    default:
      return { label: '结果未确认', tone: 'unknown', presentation: 'unknown' };
  }
}

function checkpointLabel(value: string): string {
  switch (value) {
    case 'created':
      return '已创建';
    case 'auth_revoked':
      return 'Auth 撤销中';
    case 'accounts_closed':
      return '账户关闭中';
    case 'storage_deleted':
      return 'Storage 清理中';
    case 'auth_deleted':
      return 'Auth 已删除';
    default:
      return value || '未知检查点';
  }
}

function caughtError(title: string, error: unknown): ResourceError {
  return {
    title,
    description: sessionErrorMessage(error),
    requestId: null,
    technicalDetail: null,
  };
}

export function DeletionJobsPage() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const requestedJobId = searchParams.get('job_id');
  const [draftQuery, setDraftQuery] = useState(query);
  const [jobs, setJobs] = useState<DeletionJob[]>([]);
  const [state, setState] = useState<ResourceLoadState>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<ResourceError | null>(null);
  const [refreshError, setRefreshError] = useState<ResourceError | null>(null);
  const [intent, setIntent] = useState<DeletionMutationIntent | null>(null);
  const [inspectorJobId, setInspectorJobId] = useState<string | null>(null);
  const [inspectedJob, setInspectedJob] = useState<DeletionJob | null>(null);
  const [inspectorState, setInspectorState] = useState<InspectorState>('idle');
  const [inspectorError, setInspectorError] = useState<ResourceError | null>(
    null,
  );
  const generationRef = useRef(0);
  const openedQueryJobRef = useRef<string | null>(null);

  useEffect(() => setDraftQuery(query), [query]);

  const load = useCallback(
    async (background = false): Promise<DeletionJob[] | undefined> => {
      const generation = ++generationRef.current;
      const epoch = adminAuthSession.getEpoch();
      setRefreshing(background);
      setRefreshError(null);
      if (!background) {
        setState('loading');
        setError(null);
      }
      try {
        const response = await adminAuthSession.request(JOB_LIST_PATH, {
          cache: 'no-store',
        });
        const payload = await readApiPayload<DeletionJob[]>(response);
        if (
          generation !== generationRef.current ||
          !adminAuthSession.isCurrentEpoch(epoch)
        )
          return;
        if (!response.ok || !Array.isArray(payload?.data)) {
          const nextError = resourceError(response, payload, '删除任务');
          if (background) setRefreshError(nextError);
          else {
            setError(nextError);
            setState('error');
          }
          return;
        }
        setJobs(payload.data);
        setState('success');
        return payload.data;
      } catch (caught) {
        if (
          generation !== generationRef.current ||
          !adminAuthSession.isCurrentEpoch(epoch)
        )
          return;
        const nextError = caughtError('删除任务读取失败', caught);
        if (background) setRefreshError(nextError);
        else {
          setError(nextError);
          setState('error');
        }
      } finally {
        if (generation === generationRef.current) setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const openInspector = useCallback(async (jobId: string) => {
    setInspectorJobId(jobId);
    setInspectedJob(null);
    setInspectorError(null);
    setInspectorState('loading');
    try {
      const response = await adminAuthSession.request(
        `/api/v1/admin/api/v1/deletion-jobs/${encodeURIComponent(jobId)}`,
        { cache: 'no-store' },
      );
      const payload = await readApiPayload<DeletionJob>(response);
      if (!response.ok || !payload?.data) {
        setInspectorError(resourceError(response, payload, '删除任务详情'));
        setInspectorState('error');
        return;
      }
      setInspectedJob(payload.data);
      setInspectorState('success');
    } catch (caught) {
      setInspectorError(caughtError('删除任务详情读取失败', caught));
      setInspectorState('error');
    }
  }, []);

  useEffect(() => {
    if (
      requestedJobId &&
      state === 'success' &&
      openedQueryJobRef.current !== requestedJobId
    ) {
      openedQueryJobRef.current = requestedJobId;
      void openInspector(requestedJobId);
    }
    if (!requestedJobId) openedQueryJobRef.current = null;
  }, [openInspector, requestedJobId, state]);

  const visibleJobs = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return jobs;
    return jobs.filter((job) =>
      [
        job.job_id,
        job.request_id,
        job.user_id,
        job.state,
        job.checkpoint,
        job.last_error_code,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalized),
    );
  }, [jobs, query]);

  const summary = useMemo(
    () =>
      jobs.reduce(
        (result, job) => {
          const presentation = operationStatus(job.state).presentation;
          if (presentation === 'attention' || presentation === 'blocked')
            result.attention += 1;
          if (presentation === 'running') result.running += 1;
          if (presentation === 'completed') result.completed += 1;
          return result;
        },
        { attention: 0, running: 0, completed: 0 },
      ),
    [jobs],
  );

  function applyQuery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    if (draftQuery.trim()) params.set('q', draftQuery.trim());
    else params.delete('q');
    params.delete('job_id');
    router.replace(`${pathname}${params.toString() ? `?${params}` : ''}`);
  }

  function openRetry(job: DeletionJob) {
    if (!['blocked', 'retry'].includes(job.state)) return;
    setIntent({
      kind: 'retry',
      jobId: job.job_id,
      idempotencyKey: crypto.randomUUID(),
      title: '重新排队删除任务',
      impact:
        '仅对服务端报告为 blocked/retry 的任务提交重试。worker 会重新获取租约并继续 checkpoint；页面不会改变任务状态，也不会自动重放不确定结果。',
    });
  }

  function closeInspector() {
    setInspectorJobId(null);
    setInspectedJob(null);
    setInspectorError(null);
    setInspectorState('idle');
    if (requestedJobId) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('job_id');
      router.replace(`${pathname}${params.toString() ? `?${params}` : ''}`);
    }
  }

  return (
    <main className="shell wide-shell" data-test="deletion-jobs-page">
      <AdminPageHeader
        title="统一用户 · 删除任务"
        description="跨用户查看 Global Delete 任务、检查阻塞原因并对明确可重试任务执行受控重试。"
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/accounts"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              返回统一用户
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void load(true)}
              disabled={refreshing}
              data-test="deletion-jobs-refresh"
            >
              {refreshing ? '刷新中…' : '刷新'}
            </Button>
          </div>
        }
      />

      <Alert>
        <AlertTitle>批准删除请求请从 Identity 详情进入</AlertTitle>
        <AlertDescription>
          这里不再接受手工粘贴 request UUID。先在统一用户中打开 live
          Identity，确认其权威 deletion request，再执行 recent-MFA
          保护的批准操作。
        </AlertDescription>
      </Alert>

      {refreshError ? (
        <Alert variant="destructive" data-test="deletion-jobs-refresh-error">
          <AlertTitle>刷新失败，仍保留已知任务</AlertTitle>
          <AlertDescription>
            {refreshError.description}
            <SupportErrorId
              requestId={refreshError.requestId}
              technicalDetail={refreshError.technicalDetail}
            />
          </AlertDescription>
        </Alert>
      ) : null}

      {state === 'error' && error ? (
        <AsyncState
          state="error"
          title={error.title}
          description={error.description}
          requestId={error.requestId}
          technicalDetail={error.technicalDetail}
          onRetry={() => void load(false)}
        />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          label="需要关注"
          value={state === 'success' ? `${summary.attention}` : '—'}
          description="blocked / retry"
          tone="warning"
        />
        <SummaryCard
          label="处理中"
          value={state === 'success' ? `${summary.running}` : '—'}
          description="pending / running"
          tone="info"
        />
        <SummaryCard
          label="最近完成"
          value={state === 'success' ? `${summary.completed}` : '—'}
          description="当前返回窗口内"
          tone="success"
        />
      </div>

      <section className="panel gap-4" data-test="deletion-jobs-list">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2>删除任务</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              当前读取服务端最新 100 条；筛选只作用于这组有界结果。历史 detached
              job 即使 Auth user 已删除，也仍可从这里按 Job ID / request ID
              追踪。
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            {refreshing ? '后台刷新中…' : '最多 100 条'}
          </span>
        </div>

        <form
          className="flex gap-2"
          onSubmit={applyQuery}
          data-test="deletion-jobs-filter-form"
        >
          <Label htmlFor="deletion-jobs-filter" className="sr-only">
            筛选删除任务
          </Label>
          <Input
            id="deletion-jobs-filter"
            type="search"
            className="min-w-0 flex-1"
            value={draftQuery}
            onChange={(event) => setDraftQuery(event.target.value)}
            placeholder="state、checkpoint、User ID、Job ID 或 request ID"
            data-test="deletion-jobs-filter"
          />
          <Button type="submit" variant="outline">
            查询
          </Button>
        </form>

        {state === 'loading' ? <AsyncState state="loading" /> : null}
        {state === 'success' && visibleJobs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/80 p-8 text-center text-sm text-muted-foreground">
            {query ? '当前有界结果没有匹配任务。' : '当前没有返回删除任务。'}
          </div>
        ) : null}
        {state === 'success' && visibleJobs.length > 0 ? (
          <div className="grid gap-2" data-test="deletion-jobs-rows">
            {visibleJobs.map((job) => {
              const status = operationStatus(job.state);
              const retryable = ['blocked', 'retry'].includes(job.state);
              return (
                <article
                  key={job.job_id}
                  className="grid gap-3 rounded-xl border border-border/70 bg-card p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
                  data-test={`deletion-job-row-${job.job_id}`}
                >
                  <button
                    type="button"
                    className="min-w-0 text-left"
                    onClick={() => void openInspector(job.job_id)}
                    data-test={`deletion-job-inspect-${job.job_id}`}
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <strong className="text-sm text-foreground">
                        {checkpointLabel(job.checkpoint)}
                      </strong>
                      <StatusBadge
                        label={status.label}
                        tone={status.tone}
                        rawValue={job.state}
                      />
                    </span>
                    <span className="mt-2 block break-all font-mono text-xs text-muted-foreground">
                      {job.job_id} · request {job.request_id}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      retry {job.retry_count}
                      {job.last_error_code
                        ? ` · ${job.last_error_code}`
                        : ''} ·
                      创建于 {formatUtc(job.created_at)}
                    </span>
                  </button>
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    {job.user_id ? (
                      <Link
                        href={`/admin/accounts/${encodeURIComponent(job.user_id)}`}
                        className={buttonVariants({
                          variant: 'ghost',
                          size: 'sm',
                        })}
                      >
                        查看 Identity
                      </Link>
                    ) : null}
                    {retryable ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openRetry(job)}
                        data-test={`deletion-job-retry-${job.job_id}`}
                      >
                        重试
                      </Button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </section>

      <DeletionMutationDialog
        intent={intent}
        onClose={() => setIntent(null)}
        onRefresh={async () => {
          const latest = await load(true);
          if (inspectorJobId) {
            const matched = latest?.find(
              (job) => job.job_id === inspectorJobId,
            );
            if (matched) setInspectedJob(matched);
            else await openInspector(inspectorJobId);
          }
        }}
      />

      <ResourceInspector
        open={Boolean(inspectorJobId)}
        onOpenChange={(open) => {
          if (!open) closeInspector();
        }}
        title={
          inspectedJob
            ? checkpointLabel(inspectedJob.checkpoint)
            : '删除任务详情'
        }
        description="查看当前状态、执行检查点和失败原因。"
      >
        {inspectorState === 'loading' ? <AsyncState state="loading" /> : null}
        {inspectorState === 'error' && inspectorError ? (
          <AsyncState
            state="error"
            title={inspectorError.title}
            description={inspectorError.description}
            requestId={inspectorError.requestId}
            technicalDetail={inspectorError.technicalDetail}
            onRetry={() => {
              if (inspectorJobId) void openInspector(inspectorJobId);
            }}
          />
        ) : null}
        {inspectorState === 'success' && inspectedJob ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge
                label={operationStatus(inspectedJob.state).label}
                tone={operationStatus(inspectedJob.state).tone}
                rawValue={inspectedJob.state}
              />
              <ResourceId value={inspectedJob.job_id} />
            </div>
            <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
              <p className="text-xs font-medium text-muted-foreground">
                当前 checkpoint
              </p>
              <p className="mt-1 font-medium text-foreground">
                {checkpointLabel(inspectedJob.checkpoint)}
              </p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                此处只展示管理决策所需状态。执行 lease / fence 仍由服务端 worker
                管理。
              </p>
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Detail label="Job ID" value={inspectedJob.job_id} mono />
              <Detail label="Request ID" value={inspectedJob.request_id} mono />
              <Detail
                label="User ID"
                value={inspectedJob.user_id ?? '已脱离 live Identity'}
                mono={Boolean(inspectedJob.user_id)}
              />
              <Detail label="Raw state" value={inspectedJob.state} mono />
              <Detail
                label="Raw checkpoint"
                value={inspectedJob.checkpoint}
                mono
              />
              <Detail
                label="Retry count"
                value={`${inspectedJob.retry_count}`}
              />
              <Detail
                label="Next attempt"
                value={formatUtc(inspectedJob.next_attempt_at)}
              />
              <Detail
                label="Created"
                value={formatUtc(inspectedJob.created_at)}
              />
              <Detail
                label="Completed"
                value={formatUtc(inspectedJob.completed_at)}
              />
              <Detail
                label="Last error code"
                value={inspectedJob.last_error_code ?? '—'}
                mono
              />
            </dl>
            <div className="flex flex-wrap gap-3 text-sm">
              <Link
                href={`/admin/audit?q=${encodeURIComponent(inspectedJob.request_id)}`}
                className="text-primary underline-offset-4 hover:underline"
              >
                按 Request ID 打开审计
              </Link>
              {inspectedJob.user_id ? (
                <Link
                  href={`/admin/accounts/${encodeURIComponent(inspectedJob.user_id)}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  打开 Identity 详情
                </Link>
              ) : null}
              {['blocked', 'retry'].includes(inspectedJob.state) ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => openRetry(inspectedJob)}
                  data-test="deletion-job-inspector-retry"
                >
                  重试任务
                </Button>
              ) : null}
            </div>
          </>
        ) : null}
      </ResourceInspector>
    </main>
  );
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
  tone: 'warning' | 'info' | 'success';
}) {
  return (
    <section className="panel gap-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`text-2xl font-semibold ${tone === 'warning' ? 'text-warning-foreground' : tone === 'success' ? 'text-success-foreground' : 'text-info-foreground'}`}
      >
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{description}</p>
    </section>
  );
}

function Detail({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border/70 bg-muted/20 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={`mt-1 break-all text-foreground ${mono ? 'font-mono text-xs' : ''}`}
      >
        {value}
      </dd>
      {mono && value !== '—' && value !== '已脱离 live Identity' ? (
        <ResourceId value={value} className="mt-2" />
      ) : null}
    </div>
  );
}
