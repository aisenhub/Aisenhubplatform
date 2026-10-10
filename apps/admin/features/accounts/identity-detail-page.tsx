'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ExternalLink,
  RefreshCw,
  ShieldAlert,
  UserRound,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { AsyncState } from '@kit/ui/async-state';
import { Button, buttonVariants } from '@kit/ui/button';
import { ResourceId } from '@kit/ui/resource-id';
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
import {
  accountStatusLabel,
  accountTone,
  identityTone,
  type GlobalIdentityDetail,
  type IdentityDeletionJob,
  type IdentityDeletionRequest,
} from './account-types';
import {
  DeletionMutationDialog,
  type DeletionMutationIntent,
  type DeletionUnknownResolution,
} from './deletion-mutation-dialog';

function identityStateLabel(state: string): string {
  return state === 'deleting'
    ? '全局删除中'
    : state === 'active'
      ? '正常'
      : state;
}

function requestStatus(state: string): { label: string; tone: StatusTone } {
  switch (state) {
    case 'pending_admin':
      return { label: '等待管理员批准', tone: 'warning' };
    case 'approved':
      return { label: '已批准', tone: 'info' };
    case 'cancelled':
      return { label: '已取消', tone: 'neutral' };
    default:
      return { label: state, tone: 'unknown' };
  }
}

function jobStatus(state: string): { label: string; tone: StatusTone } {
  switch (state) {
    case 'pending':
    case 'running':
      return { label: '处理中', tone: 'info' };
    case 'retry':
      return { label: '等待重试', tone: 'warning' };
    case 'blocked':
      return { label: '已阻塞', tone: 'danger' };
    case 'completed':
      return { label: '已完成', tone: 'success' };
    default:
      return { label: '结果未确认', tone: 'unknown' };
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

export function IdentityDetailPage({ userId }: { userId: string }) {
  const [identity, setIdentity] = useState<GlobalIdentityDetail | null>(null);
  const [state, setState] = useState<ResourceLoadState>('loading');
  const [error, setError] = useState<ResourceError | null>(null);
  const [refreshError, setRefreshError] = useState<ResourceError | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [intent, setIntent] = useState<DeletionMutationIntent | null>(null);
  const generationRef = useRef(0);

  const load = useCallback(
    async (background = false): Promise<GlobalIdentityDetail | undefined> => {
      const generation = ++generationRef.current;
      const epoch = adminAuthSession.getEpoch();
      setRefreshError(null);
      setRefreshing(background);
      if (!background) {
        setState('loading');
        setError(null);
      }
      try {
        const response = await adminAuthSession.request(
          `/api/v1/admin/api/v1/accounts/${encodeURIComponent(userId)}`,
          { cache: 'no-store' },
        );
        const payload = await readApiPayload<GlobalIdentityDetail>(response);
        if (
          generation !== generationRef.current ||
          !adminAuthSession.isCurrentEpoch(epoch)
        )
          return;
        if (!response.ok || !payload?.data) {
          const nextError = resourceError(response, payload, 'Identity 详情');
          if (background) setRefreshError(nextError);
          else {
            setError(nextError);
            setState('error');
          }
          return;
        }
        setIdentity(payload.data);
        setState('success');
        return payload.data;
      } catch (caught) {
        if (
          generation !== generationRef.current ||
          !adminAuthSession.isCurrentEpoch(epoch)
        )
          return;
        const nextError: ResourceError = {
          title: 'Identity 详情读取失败',
          description: sessionErrorMessage(caught),
          requestId: null,
          technicalDetail: null,
        };
        if (background) setRefreshError(nextError);
        else {
          setError(nextError);
          setState('error');
        }
      } finally {
        if (generation === generationRef.current) setRefreshing(false);
      }
    },
    [userId],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  function openStart(request: IdentityDeletionRequest) {
    setIntent({
      kind: 'start',
      requestId: request.request_id,
      idempotencyKey: crypto.randomUUID(),
      title: '批准并启动全局删除',
      impact:
        '服务端会批准这个用户已经提交的 deletion request，并创建可续跑的 Global Delete 任务。Auth、Storage 与匿名化步骤仍由权威 worker 推进，页面不会假设删除已完成。',
    });
  }

  function openRetry(job: IdentityDeletionJob) {
    if (!['blocked', 'retry'].includes(job.state)) return;
    setIntent({
      kind: 'retry',
      jobId: job.job_id,
      idempotencyKey: crypto.randomUUID(),
      title: '重新排队全局删除任务',
      impact:
        '仅对服务端报告为 blocked/retry 的任务提交显式重试。worker 会重新获取执行权并继续 checkpoint；页面不会直接修改任务状态。',
    });
  }

  async function checkStartUnknown(
    requestId: string,
  ): Promise<DeletionUnknownResolution> {
    const latest = await load(true);
    const sameRequest = latest?.deletion.request?.request_id === requestId;
    const matchedJob = sameRequest ? latest?.deletion.job : null;
    if (matchedJob) {
      return {
        resolved: true,
        title: '已找到该请求的删除任务',
        description:
          'Identity 权威详情已经返回与原 request 关联的 job；页面不会再次提交原批准请求。',
        technicalDetail: matchedJob.job_id,
      };
    }
    return {
      resolved: false,
      title: '当前详情尚不能证明原请求结果',
      description:
        '权威 Identity 详情尚未返回该 request 的 job。页面不会按时间或状态猜测，也不会自动重发批准请求。',
      technicalDetail: 'UNKNOWN_OUTCOME',
    };
  }

  return (
    <main className="shell wide-shell" data-test="identity-detail-page">
      <AdminPageHeader
        title="统一用户详情"
        description="查看 live Auth Identity、跨平台账户关系与权威 Global Delete 生命周期。"
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/accounts/deletion-jobs"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              删除任务
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void load(true)}
              disabled={refreshing || state === 'loading'}
              data-test="identity-detail-refresh"
            >
              <RefreshCw
                className={`mr-1.5 h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`}
              />
              {refreshing ? '刷新中…' : '刷新'}
            </Button>
          </div>
        }
      />

      <Link
        href="/admin/accounts"
        className="inline-flex w-fit items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        返回统一用户
      </Link>

      {refreshError ? (
        <Alert variant="destructive">
          <AlertTitle>{refreshError.title}</AlertTitle>
          <AlertDescription>
            {refreshError.description}
            <SupportErrorId
              requestId={refreshError.requestId}
              technicalDetail={refreshError.technicalDetail}
            />
          </AlertDescription>
        </Alert>
      ) : null}

      {state === 'loading' ? <AsyncState state="loading" /> : null}
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

      {state === 'success' && identity ? (
        <>
          <section className="grid gap-4 md:grid-cols-3">
            <div className="panel gap-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <UserRound className="h-4 w-4" />
                Auth Identity
              </div>
              <p className="break-all font-medium">
                {identity.email ?? '未设置邮箱'}
              </p>
              <ResourceId value={identity.user_id} />
            </div>
            <div className="panel gap-2">
              <p className="text-xs text-muted-foreground">身份状态</p>
              <div>
                <StatusBadge
                  tone={identityTone(identity.identity_state)}
                  label={identityStateLabel(identity.identity_state)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                创建 {formatUtc(identity.created_at)} · 最近登录{' '}
                {formatUtc(identity.last_sign_in_at)}
              </p>
            </div>
            <div className="panel gap-2">
              <p className="text-xs text-muted-foreground">平台账户关联</p>
              <p className="text-2xl font-semibold">
                {identity.accounts.length}
              </p>
              <p className="text-xs text-muted-foreground">
                仅展示此 live Identity 当前关联的平台账户。
              </p>
            </div>
          </section>

          <section className="panel gap-4" data-test="identity-detail-accounts">
            <div>
              <h2>平台账户</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Identity 是全局主对象；账户状态仍由各平台账户权威数据决定。
              </p>
            </div>
            {identity.accounts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/80 p-6 text-sm text-muted-foreground">
                当前没有关联平台账户。
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {identity.accounts.map((account) => (
                  <article
                    key={`${account.platform_id}-${account.platform_account_id}`}
                    className="rounded-xl border border-border/70 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <Link
                          href={`/admin/platforms/${account.platform_id}`}
                          className="font-medium text-primary underline-offset-4 hover:underline"
                        >
                          {account.platform_name}
                        </Link>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {account.platform_code}
                        </p>
                      </div>
                      <StatusBadge
                        tone={accountTone(account.status)}
                        label={accountStatusLabel(account.status)}
                      />
                    </div>
                    <div className="mt-3">
                      <ResourceId value={account.platform_account_id} />
                    </div>
                    <Link
                      href={`/admin/platforms/${account.platform_id}/accounts?selected=${account.platform_account_id}`}
                      className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
                    >
                      进入平台账户
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="panel gap-4" data-test="identity-detail-deletion">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2>身份删除生命周期</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  request 与 job 来自权威生命周期投影；执行租约、fence 与 Auth
                  session 等内部字段不会暴露在这里。
                </p>
              </div>
              <ShieldAlert className="h-5 w-5 text-muted-foreground" />
            </div>

            {!identity.deletion.request ? (
              <div className="rounded-lg border border-dashed border-border/80 p-6 text-sm text-muted-foreground">
                当前没有删除请求。
              </div>
            ) : (
              <DeletionRequestCard
                request={identity.deletion.request}
                onStart={openStart}
              />
            )}

            {identity.deletion.job ? (
              <DeletionJobCard
                job={identity.deletion.job}
                onRetry={openRetry}
              />
            ) : identity.deletion.request?.state === 'approved' ? (
              <Alert>
                <AlertTitle>已批准，尚未返回关联任务</AlertTitle>
                <AlertDescription>
                  页面不会自行推断任务进度。请刷新详情或进入删除任务子视图检查权威状态。
                </AlertDescription>
              </Alert>
            ) : null}
          </section>
        </>
      ) : null}

      <DeletionMutationDialog
        intent={intent}
        onClose={() => setIntent(null)}
        onRefresh={async () => {
          await load(true);
        }}
        onCheckStartUnknown={checkStartUnknown}
      />
    </main>
  );
}

function DeletionRequestCard({
  request,
  onStart,
}: {
  request: IdentityDeletionRequest;
  onStart: (request: IdentityDeletionRequest) => void;
}) {
  const status = requestStatus(request.state);
  return (
    <article className="rounded-xl border border-border/70 bg-muted/15 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <strong>删除请求</strong>
            <StatusBadge label={status.label} tone={status.tone} />
          </div>
          <div className="mt-2">
            <ResourceId value={request.request_id} />
          </div>
        </div>
        {request.state === 'pending_admin' ? (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => onStart(request)}
            data-test="identity-detail-start"
          >
            批准并启动
          </Button>
        ) : null}
      </div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Detail label="申请时间" value={formatUtc(request.requested_at)} />
        <Detail label="批准时间" value={formatUtc(request.approved_at)} />
        <Detail label="取消时间" value={formatUtc(request.cancelled_at)} />
        <Detail label="批准人" value={request.approved_by ?? '—'} mono />
      </dl>
    </article>
  );
}

function DeletionJobCard({
  job,
  onRetry,
}: {
  job: IdentityDeletionJob;
  onRetry: (job: IdentityDeletionJob) => void;
}) {
  const status = jobStatus(job.state);
  const retryable = ['blocked', 'retry'].includes(job.state);
  return (
    <article className="rounded-xl border border-border/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <strong>{checkpointLabel(job.checkpoint)}</strong>
            <StatusBadge
              label={status.label}
              tone={status.tone}
              rawValue={job.state}
            />
          </div>
          <div className="mt-2">
            <ResourceId value={job.job_id} />
          </div>
        </div>
        {retryable ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onRetry(job)}
            data-test="identity-detail-retry"
          >
            重试任务
          </Button>
        ) : null}
      </div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Detail label="Retry count" value={`${job.retry_count}`} />
        <Detail label="Next attempt" value={formatUtc(job.next_attempt_at)} />
        <Detail label="Created" value={formatUtc(job.created_at)} />
        <Detail label="Completed" value={formatUtc(job.completed_at)} />
        <Detail
          label="Last error code"
          value={job.last_error_code ?? '—'}
          mono
        />
      </dl>
      <Link
        href={`/admin/accounts/deletion-jobs?job_id=${encodeURIComponent(job.job_id)}`}
        className="mt-4 inline-flex text-sm text-primary underline-offset-4 hover:underline"
      >
        在删除任务中查看
      </Link>
    </article>
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
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`mt-1 break-all ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </dd>
    </div>
  );
}
