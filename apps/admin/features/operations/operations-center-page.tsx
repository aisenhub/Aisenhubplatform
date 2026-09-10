'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { SessionRetryRequiredError } from '@kit/account-auth-nextjs/browser';
import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { AsyncState } from '@kit/ui/async-state';
import { Button } from '@kit/ui/button';
import { ConfirmActionDialog } from '@kit/ui/confirm-action-dialog';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import type { MutationState } from '@kit/ui/mutation-state';
import { ResourceId } from '@kit/ui/resource-id';
import { ResourceInspector } from '@kit/ui/resource-inspector';
import { StatusBadge, type StatusTone } from '@kit/ui/status-badge';
import { SupportErrorId } from '@kit/ui/support-error-id';

import { AdminPageHeader } from '../../components/shell/admin-page-header';
import { AdminRecentMfaPanel } from '../security/admin-recent-mfa-panel';
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

const JOB_LIST_PATH = '/api/v1/admin/api/v1/deletion-jobs?limit=100';
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type DeletionJob = {
  job_id: string;
  request_id: string;
  user_id?: string | null;
  state: string;
  checkpoint: string;
  fence?: number | null;
  retry_count: number;
  next_attempt_at?: string | null;
  last_error_code?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
};

type OperationIntent =
  | {
      kind: 'start';
      requestId: string;
      idempotencyKey: string;
      title: string;
      impact: string;
    }
  | {
      kind: 'retry';
      job: DeletionJob;
      idempotencyKey: string;
      title: string;
      impact: string;
    };

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

export function OperationsCenterPage() {
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
  const [requestIdInput, setRequestIdInput] = useState('');
  const [requestIdError, setRequestIdError] = useState('');
  const [intent, setIntent] = useState<OperationIntent | null>(null);
  const [mutationState, setMutationState] =
    useState<MutationState>('confirm_required');
  const [mutationError, setMutationError] = useState<ResourceError | null>(
    null,
  );
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
  }, [requestedJobId, state]);

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
    router.replace(`${pathname}${params.toString() ? `?${params}` : ''}`);
  }

  function openStart() {
    const requestId = requestIdInput.trim();
    if (!UUID.test(requestId)) {
      setRequestIdError('请输入有效的 deletion request UUID。');
      return;
    }
    setRequestIdError('');
    setMutationError(null);
    setMutationState('confirm_required');
    setIntent({
      kind: 'start',
      requestId,
      idempotencyKey: crypto.randomUUID(),
      title: '批准并启动删除任务',
      impact:
        '服务端会把待审批 deletion request 置为 approved，并创建 worker 可继续处理的删除任务；Auth、Storage 和备份步骤不会在此页面内被假设为完成。',
    });
  }

  function openRetry(job: DeletionJob) {
    if (!['blocked', 'retry'].includes(job.state)) return;
    setMutationError(null);
    setMutationState('confirm_required');
    setIntent({
      kind: 'retry',
      job,
      idempotencyKey: crypto.randomUUID(),
      title: '重新排队删除任务',
      impact:
        '仅对服务端报告为 blocked/retry 的任务提交重试。worker 会重新获取租约并回报 checkpoint，页面不改变任务状态。',
    });
  }

  async function submitIntent() {
    if (!intent) return;
    setMutationState('pending');
    setMutationError(null);
    try {
      const isStart = intent.kind === 'start';
      const response = await adminAuthSession.request(
        isStart
          ? '/api/v1/admin/api/v1/deletion-jobs'
          : `/api/v1/admin/api/v1/deletion-jobs/${encodeURIComponent(intent.job.job_id)}/retry`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': intent.idempotencyKey,
          },
          body: JSON.stringify(isStart ? { request_id: intent.requestId } : {}),
        },
        { replay: 'never' },
      );
      const payload = await readApiPayload<DeletionJob>(response);
      if (!response.ok) {
        if (
          payload?.error?.code === 'RECENT_MFA_REQUIRED' ||
          payload?.error?.code === 'MFA_REQUIRED'
        ) {
          setMutationState('step_up_required');
          return;
        }
        setMutationState('failure');
        setMutationError(resourceError(response, payload, '删除任务操作'));
        return;
      }
      setMutationState(response.status === 202 ? 'accepted' : 'success');
      await load(true);
    } catch (caught) {
      if (caught instanceof SessionRetryRequiredError) {
        setMutationState('failure');
        setMutationError({
          title: '会话已恢复，请重新提交',
          description: '为避免重复提交，本次删除任务操作没有自动重放。',
          requestId: null,
          technicalDetail: 'SESSION_RECOVERY_REQUIRED',
        });
        return;
      }
      setMutationState('unknown_outcome');
      setMutationError({
        title: '删除任务结果待确认',
        description:
          '网络在服务端响应前中断。请先按 request ID 或 Job ID 检查权威状态，不要立即重新提交。',
        requestId: null,
        technicalDetail: null,
      });
    }
  }

  async function checkUnknown() {
    if (!intent) return;
    try {
      if (intent.kind === 'start') {
        const latestJobs = (await load(true)) ?? jobs;
        const matched = latestJobs.find(
          (job) => job.request_id === intent.requestId,
        );
        setMutationError({
          title: matched ? '已找到匹配删除任务' : '尚未找到匹配删除任务',
          description: matched
            ? '服务端列表已按 request ID 找到任务；页面不会再次提交原批准请求。'
            : '当前有界列表没有按 request ID 找到任务；页面不会按时间或状态猜测，也不会自动重发。',
          requestId: null,
          technicalDetail: matched?.job_id ?? 'UNKNOWN_OUTCOME',
        });
        if (matched) setMutationState('accepted');
        return;
      }
      const response = await adminAuthSession.request(
        `/api/v1/admin/api/v1/deletion-jobs/${encodeURIComponent(intent.job.job_id)}`,
        { cache: 'no-store' },
      );
      const payload = await readApiPayload<DeletionJob>(response);
      if (!response.ok || !payload?.data) {
        setMutationError(resourceError(response, payload, '删除任务状态'));
        return;
      }
      setInspectedJob(payload.data);
      await load(true);
      if (!['blocked', 'retry'].includes(payload.data.state)) {
        setMutationState('accepted');
        setMutationError({
          title: '任务状态已收敛',
          description:
            '服务端状态已离开可重试集合；页面没有重复提交原重试请求。',
          requestId: null,
          technicalDetail: payload.data.state,
        });
      } else {
        setMutationError({
          title: '当前状态仍不能证明原请求结果',
          description:
            '任务仍处于 blocked/retry；请保留原 intent 和 Idempotency-Key，联系支持流程确认后再决定下一步。',
          requestId: null,
          technicalDetail: 'UNKNOWN_OUTCOME',
        });
      }
    } catch (caught) {
      setMutationError(caughtError('删除任务状态检查失败', caught));
    }
  }

  async function openInspector(jobId: string) {
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
  }

  function closeInspector() {
    setInspectorJobId(null);
    setInspectedJob(null);
    if (requestedJobId) router.replace(pathname);
  }

  return (
    <main className="shell wide-shell" data-test="operations-page">
      <AdminPageHeader
        title="Operations"
        description="集中查看有界的 Global Delete 任务。状态、checkpoint 和重试资格均以服务端 worker 合同为准。"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load(true)}
            disabled={refreshing}
            data-test="operations-refresh"
          >
            {refreshing ? '刷新中…' : '刷新'}
          </Button>
        }
      />

      {refreshError ? (
        <Alert variant="destructive" data-test="operations-refresh-error">
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

      <section className="panel gap-4" data-test="operations-start-panel">
        <div>
          <h2>批准 deletion request</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            只提交真实 request ID；审批结果为异步受理，后续 checkpoint 由 worker
            回报。
          </p>
        </div>
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            openStart();
          }}
        >
          <div className="grid min-w-0 flex-1 gap-2">
            <Label htmlFor="operations-request-id">Deletion request ID</Label>
            <Input
              id="operations-request-id"
              value={requestIdInput}
              onChange={(event) => {
                setRequestIdInput(event.target.value);
                if (requestIdError) setRequestIdError('');
              }}
              placeholder="UUID"
              inputMode="text"
              aria-invalid={requestIdError ? true : undefined}
              data-test="operations-request-id"
            />
            {requestIdError ? (
              <p className="text-sm text-destructive" role="alert">
                {requestIdError}
              </p>
            ) : null}
          </div>
          <Button type="submit" data-test="operations-start-open">
            批准并启动
          </Button>
        </form>
      </section>

      <section className="panel gap-4" data-test="operations-list">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2>删除任务</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              当前只读取服务端返回的最新 100
              条；筛选不代表全局总量，也不跨平台拼接文件 attention。
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            {refreshing ? '后台刷新中…' : '最多 100 条'}
          </span>
        </div>
        <form
          className="flex gap-2"
          onSubmit={applyQuery}
          data-test="operations-filter-form"
        >
          <Label htmlFor="operations-filter" className="sr-only">
            筛选删除任务
          </Label>
          <Input
            id="operations-filter"
            type="search"
            value={draftQuery}
            onChange={(event) => setDraftQuery(event.target.value)}
            placeholder="state、checkpoint、Job ID 或 request ID"
            data-test="operations-filter"
          />
          <Button
            type="submit"
            variant="outline"
            data-test="operations-filter-submit"
          >
            查询
          </Button>
        </form>

        {state === 'loading' ? <AsyncState state="loading" /> : null}
        {state === 'success' && visibleJobs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/80 p-8 text-center text-sm text-muted-foreground">
            {query ? '当前有界结果没有匹配任务。' : '当前没有返回删除任务。'}
          </div>
        ) : null}
        {state === 'success' && visibleJobs.length ? (
          <div className="grid gap-2" data-test="operations-rows">
            {visibleJobs.map((job) => {
              const status = operationStatus(job.state);
              const retryable = ['blocked', 'retry'].includes(job.state);
              return (
                <article
                  key={job.job_id}
                  className="grid gap-3 rounded-xl border border-border/70 bg-card p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
                  data-test={`operation-row-${job.job_id}`}
                >
                  <button
                    type="button"
                    className="min-w-0 text-left"
                    onClick={() => void openInspector(job.job_id)}
                    data-test={`operation-inspect-${job.job_id}`}
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
                        : ''} ·{' '}
                      创建于 {formatUtc(job.created_at)}
                    </span>
                  </button>
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    {retryable ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openRetry(job)}
                        data-test={`operation-retry-${job.job_id}`}
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

      <section className="grid gap-3 rounded-xl border border-dashed border-border/80 bg-muted/20 p-4">
        <div>
          <h2 className="text-base">文件 attention 的边界</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            当前 Admin 文件接口没有全局 status filter；本页不把最多 100
            条结果冒充全局 deleting/unknown 总量。请进入具体平台的 Files
            页面查看服务端范围内的文件状态。
          </p>
        </div>
        <Link
          href="/admin/platforms"
          className="w-fit text-sm text-primary underline-offset-4 hover:underline"
        >
          打开平台目录
        </Link>
      </section>

      {intent ? (
        <ConfirmActionDialog
          open
          onOpenChange={(open) => {
            if (!open && mutationState !== 'pending') setIntent(null);
          }}
          title={intent.title}
          targetIdentity={
            intent.kind === 'start' ? intent.requestId : intent.job.job_id
          }
          impact={intent.impact}
          reversible={false}
          state={mutationState}
          error={mutationError}
          stepUpContent={
            mutationState === 'step_up_required' ? (
              <AdminRecentMfaPanel
                onVerified={() => setMutationState('confirm_required')}
              />
            ) : null
          }
          onCheckUnknown={
            mutationState === 'unknown_outcome'
              ? () => void checkUnknown()
              : undefined
          }
          onConfirm={() => void submitIntent()}
        />
      ) : null}

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
        description="只显示服务端返回的状态、checkpoint 和安全元数据；不虚构未由 API 返回的历史时间线。"
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
                API 只提供当前检查点；页面不把它展开成猜测的历史 timeline。
              </p>
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Detail label="Job ID" value={inspectedJob.job_id} mono />
              <Detail label="Request ID" value={inspectedJob.request_id} mono />
              <Detail
                label="User ID"
                value={inspectedJob.user_id ?? '—'}
                mono
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
              <Detail label="Fence" value={`${inspectedJob.fence ?? '—'}`} />
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
              {['blocked', 'retry'].includes(inspectedJob.state) ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => openRetry(inspectedJob)}
                  data-test="operation-inspector-retry"
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
      {mono && value !== '—' ? (
        <ResourceId value={value} className="mt-2" />
      ) : null}
    </div>
  );
}
