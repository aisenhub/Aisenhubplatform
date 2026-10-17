'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { AsyncState } from '@kit/ui/async-state';
import { Button } from '@kit/ui/button';
import { ConfirmActionDialog } from '@kit/ui/confirm-action-dialog';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import type { MutationState } from '@kit/ui/mutation-state';
import { ResourceInspector } from '@kit/ui/resource-inspector';
import { StatusBadge } from '@kit/ui/status-badge';
import { SupportErrorId } from '@kit/ui/support-error-id';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/table';
import { NativeSelect } from '@kit/ui/native-select';

import { SessionRetryRequiredError } from '../../app/_lib/auth/browser';
import {
  adminAuthSession,
  sessionErrorMessage,
} from '../../app/_lib/auth-session';
import { usePlatformContext } from '../../components/platform-context/platform-workspace';
import {
  AdminTaskToolbar,
  AdminWorkspaceSection,
} from '../../components/workspace/admin-workspace';
import { AdminRecentMfaPanel } from '../security/admin-recent-mfa-panel';
import {
  formatUtc,
  isRecentMfaRequired,
  readApiPayload,
  resourceError,
  resourcePath,
  type ResourceError,
  type ResourceLoadState,
} from '../resources/admin-resource-utils';

type ConfigResource = {
  config_id: string;
  platform_account_id: string;
  author_display_name: string;
  title: string;
  description?: string | null;
  config_status: string;
  current_version_id?: string | null;
  current_version_number?: number | null;
  current_schema_key?: string | null;
  current_schema_version?: string | null;
  current_file_id?: string | null;
  current_file_status?: string | null;
  current_write_outcome?: string | null;
  gallery_status: string;
  published_version_id?: string | null;
  pending_submission_id?: string | null;
  pending_version_id?: string | null;
  pending_submitted_at?: string | null;
  version_count?: number | string;
  like_count: number | string;
  download_count: number | string;
  apply_delivery_count: number | string;
  latest_submission_status?: string | null;
  latest_review_reason?: string | null;
  latest_reviewed_at?: string | null;
  delete_requested_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ConfigReview = {
  submission_id: string;
  config_id: string;
  version_id: string;
  title: string;
  author_display_name: string;
  schema_key: string;
  schema_version: string;
  changelog?: string | null;
  version_number: number;
  submitted_at: string;
  current_gallery_status: string;
  current_published_version_id?: string | null;
};

type Intent = {
  kind: 'review' | 'governance';
  url: string;
  body: Record<string, unknown>;
  title: string;
  targetIdentity: string;
  impact: string;
  reversible: boolean;
};

function statusView(value: string): {
  label: string;
  tone: 'neutral' | 'success' | 'warning' | 'danger' | 'unknown';
} {
  switch (value) {
    case 'active':
    case 'approved':
      return { label: value === 'active' ? '可用' : '已上架', tone: 'success' };
    case 'pending':
      return { label: '待审核', tone: 'warning' };
    case 'removed':
      return { label: '已下架', tone: 'neutral' };
    case 'blocked':
      return { label: '已封禁', tone: 'danger' };
    case 'deleting':
      return { label: '删除处理中', tone: 'warning' };
    case 'deleted':
      return { label: '已删除', tone: 'neutral' };
    case 'none':
      return { label: '未上架', tone: 'neutral' };
    default:
      return { label: value || '未记录', tone: 'unknown' };
  }
}

function metric(value: number | string | null | undefined): string {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? String(parsed) : '0';
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
    <div className="grid gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={mono ? 'break-all font-mono text-xs' : 'text-sm'}>
        {value}
      </dd>
    </div>
  );
}

export function ConfigResourceCenter() {
  const { platform } = usePlatformContext();
  const [resources, setResources] = useState<ConfigResource[]>([]);
  const [reviews, setReviews] = useState<ConfigReview[]>([]);
  const [resourceState, setResourceState] =
    useState<ResourceLoadState>('loading');
  const [reviewState, setReviewState] = useState<ResourceLoadState>('loading');
  const [resourceErrorState, setResourceErrorState] =
    useState<ResourceError | null>(null);
  const [reviewError, setReviewError] = useState<ResourceError | null>(null);
  const [query, setQuery] = useState('');
  const [draftQuery, setDraftQuery] = useState('');
  const [galleryStatus, setGalleryStatus] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [reviewReason, setReviewReason] = useState('');
  const [governanceReason, setGovernanceReason] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConfigResource | null>(null);
  const [detailState, setDetailState] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle');
  const [detailError, setDetailError] = useState<ResourceError | null>(null);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [mutationState, setMutationState] =
    useState<MutationState>('confirm_required');
  const [mutationError, setMutationError] = useState<ResourceError | null>(
    null,
  );
  const resourceGeneration = useRef(0);
  const reviewGeneration = useRef(0);
  const detailGeneration = useRef(0);

  const loadResources = useCallback(
    async (preserve = false) => {
      const generation = ++resourceGeneration.current;
      const epoch = adminAuthSession.getEpoch();
      if (!preserve) setResourceState('loading');
      setResourceErrorState(null);
      try {
        const params = new URLSearchParams({ limit: '20' });
        if (query.trim()) params.set('q', query.trim());
        if (galleryStatus) params.set('gallery_status', galleryStatus);
        if (cursor) params.set('cursor', cursor);
        const response = await adminAuthSession.request(
          `${resourcePath(platform.platform_id, '/config-resources')}?${params.toString()}`,
          { cache: 'no-store' },
        );
        const payload = await readApiPayload<ConfigResource[]>(response);
        if (
          generation !== resourceGeneration.current ||
          !adminAuthSession.isCurrentEpoch(epoch)
        )
          return;
        if (!response.ok || !Array.isArray(payload?.data)) {
          setResourceErrorState(resourceError(response, payload, '配置资源'));
          if (!preserve) setResourceState('error');
          return;
        }
        setResources(payload.data);
        setNextCursor(payload.next_cursor ?? null);
        setResourceState('success');
      } catch (caught) {
        if (
          generation !== resourceGeneration.current ||
          !adminAuthSession.isCurrentEpoch(epoch)
        )
          return;
        setResourceErrorState({
          title: '配置资源读取失败',
          description: sessionErrorMessage(caught),
          requestId: null,
          technicalDetail: null,
        });
        if (!preserve) setResourceState('error');
      }
    },
    [cursor, galleryStatus, platform.platform_id, query],
  );

  const loadReviews = useCallback(
    async (preserve = false) => {
      const generation = ++reviewGeneration.current;
      const epoch = adminAuthSession.getEpoch();
      if (!preserve) setReviewState('loading');
      setReviewError(null);
      try {
        const response = await adminAuthSession.request(
          `${resourcePath(platform.platform_id, '/config-reviews')}?limit=20`,
          { cache: 'no-store' },
        );
        const payload = await readApiPayload<ConfigReview[]>(response);
        if (
          generation !== reviewGeneration.current ||
          !adminAuthSession.isCurrentEpoch(epoch)
        )
          return;
        if (!response.ok || !Array.isArray(payload?.data)) {
          setReviewError(resourceError(response, payload, '配置审核队列'));
          if (!preserve) setReviewState('error');
          return;
        }
        setReviews(payload.data);
        setReviewState('success');
      } catch (caught) {
        if (
          generation !== reviewGeneration.current ||
          !adminAuthSession.isCurrentEpoch(epoch)
        )
          return;
        setReviewError({
          title: '配置审核队列读取失败',
          description: sessionErrorMessage(caught),
          requestId: null,
          technicalDetail: null,
        });
        if (!preserve) setReviewState('error');
      }
    },
    [platform.platform_id],
  );

  useEffect(() => {
    void loadResources();
  }, [loadResources]);

  useEffect(() => {
    void loadReviews();
  }, [loadReviews]);

  async function openDetail(configId: string) {
    const generation = ++detailGeneration.current;
    setDetailId(configId);
    setDetail(null);
    setDetailError(null);
    setDetailState('loading');
    try {
      const response = await adminAuthSession.request(
        resourcePath(
          platform.platform_id,
          `/config-resources/${encodeURIComponent(configId)}`,
        ),
        { cache: 'no-store' },
      );
      const payload = await readApiPayload<ConfigResource>(response);
      if (generation !== detailGeneration.current) return;
      if (!response.ok || !payload?.data) {
        setDetailError(resourceError(response, payload, '配置详情'));
        setDetailState('error');
        return;
      }
      setDetail(payload.data);
      setDetailState('success');
    } catch (caught) {
      if (generation !== detailGeneration.current) return;
      setDetailError({
        title: '配置详情读取失败',
        description: sessionErrorMessage(caught),
        requestId: null,
        technicalDetail: null,
      });
      setDetailState('error');
    }
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCursor(null);
    setQuery(draftQuery.trim());
  }

  function startReview(review: ConfigReview, action: 'approve' | 'reject') {
    const reason = reviewReason.trim();
    if (!reason) {
      setReviewError({
        title: '请填写审核原因',
        description: '批准或拒绝都必须留下可审计的业务原因。',
        requestId: null,
        technicalDetail: 'INVALID_INPUT',
      });
      return;
    }
    setIntent({
      kind: 'review',
      url: resourcePath(
        platform.platform_id,
        `/config-reviews/${encodeURIComponent(review.submission_id)}/review`,
      ),
      body: { action, reason },
      title: action === 'approve' ? '批准配置上架' : '拒绝配置上架',
      targetIdentity: review.title,
      impact:
        action === 'approve'
          ? `批准后 Gallery 将原子切换到 Version ${review.version_number}；此前已批准版本在此之前保持可用。`
          : '拒绝只关闭本次提交，不删除作者个人 Config，也不会替换当前已批准版本。',
      reversible: action === 'approve',
    });
    setMutationState('confirm_required');
    setMutationError(null);
  }

  function startGovernance(action: 'remove' | 'restore' | 'block') {
    if (!detail) return;
    const reason = governanceReason.trim();
    if (!reason) {
      setDetailError({
        title: '请填写治理原因',
        description: '下架、恢复或封禁都必须留下可审计原因。',
        requestId: null,
        technicalDetail: 'INVALID_INPUT',
      });
      return;
    }
    const labels = {
      remove: [
        '下架配置',
        '配置将立即从 Gallery 不可见，但作者个人 Config 保留。',
      ],
      restore: [
        '恢复上架',
        '仅在已批准 Version、作者账户和物理文件都仍可用时恢复 Gallery。',
      ],
      block: [
        '封禁配置',
        '配置将从 Gallery 不可见；作者个人 Config 仍保留，便于后续审计与申诉。',
      ],
    } as const;
    setIntent({
      kind: 'governance',
      url: resourcePath(
        platform.platform_id,
        `/config-resources/${encodeURIComponent(detail.config_id)}/gallery-governance`,
      ),
      body: { action, reason },
      title: labels[action][0],
      targetIdentity: detail.title,
      impact: labels[action][1],
      reversible: action !== 'block',
    });
    setMutationState('confirm_required');
    setMutationError(null);
  }

  async function executeIntent() {
    if (!intent) return;
    setMutationState('pending');
    setMutationError(null);
    try {
      const response = await adminAuthSession.request(
        intent.url,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(intent.body),
        },
        { replay: 'never' },
      );
      const payload = await readApiPayload<Record<string, unknown>>(response);
      if (!response.ok) {
        if (isRecentMfaRequired(response, payload)) {
          setMutationState('step_up_required');
          return;
        }
        setMutationState('failure');
        setMutationError(resourceError(response, payload, '配置治理操作'));
        return;
      }
      setMutationState('success');
      await Promise.all([loadResources(), loadReviews()]);
      if (detailId) await openDetail(detailId);
      setReviewReason('');
      setGovernanceReason('');
    } catch (caught) {
      if (caught instanceof SessionRetryRequiredError) {
        setMutationState('failure');
        setMutationError({
          title: '会话已恢复，请重新确认',
          description: '为避免重复治理，本次操作没有自动重放。',
          requestId: null,
          technicalDetail: 'SESSION_RECOVERY_REQUIRED',
        });
        return;
      }
      setMutationState('unknown_outcome');
      setMutationError({
        title: '操作结果待确认',
        description:
          '响应前连接中断。不要立即重复提交，请先重新读取资源和审核队列。',
        requestId: null,
        technicalDetail: 'UNKNOWN_OUTCOME',
      });
    }
  }

  async function checkUnknown() {
    await Promise.all([loadResources(), loadReviews()]);
    if (detailId) await openDetail(detailId);
    setMutationState('failure');
    setMutationError({
      title: '已刷新权威状态',
      description:
        '请根据最新 Gallery/审核状态判断原请求是否生效；页面不会自动重发治理操作。',
      requestId: null,
      technicalDetail: 'STATE_RELOADED',
    });
  }

  return (
    <section className="grid gap-4" data-test="config-resource-center">
      <AdminTaskToolbar aria-label="配置资源筛选与刷新">
        <form
          className="grid w-full gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto_auto]"
          onSubmit={submitSearch}
        >
          <div className="grid gap-2">
            <Label htmlFor="config-resource-query">标题、描述或作者</Label>
            <Input
              id="config-resource-query"
              type="search"
              maxLength={128}
              value={draftQuery}
              onChange={(event) => setDraftQuery(event.target.value)}
              placeholder="搜索配置资源…"
              data-test="config-resource-query"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="config-resource-gallery-status">Gallery 状态</Label>
            <NativeSelect
              id="config-resource-gallery-status"
              value={galleryStatus}
              onChange={(event) => {
                setCursor(null);
                setGalleryStatus(event.target.value);
              }}
              data-test="config-resource-gallery-status"
            >
              <option value="">全部</option>
              <option value="pending">待审核</option>
              <option value="approved">已上架</option>
              <option value="removed">已下架</option>
              <option value="blocked">已封禁</option>
              <option value="none">未上架</option>
            </NativeSelect>
          </div>
          <Button
            type="submit"
            className="self-end"
            data-test="config-resource-query-submit"
          >
            查询
          </Button>
          <Button
            type="button"
            variant="outline"
            className="self-end"
            onClick={() =>
              void Promise.all([loadResources(true), loadReviews(true)])
            }
            data-test="config-resource-refresh"
          >
            刷新业务状态
          </Button>
        </form>
      </AdminTaskToolbar>

      <AdminWorkspaceSection
        title="配置资源"
        titleId="config-resource-list-title"
        description="以 Config / Version / Gallery 业务对象为主视图；搜索与状态筛选在服务端分页前执行。"
      >
        {resourceState === 'loading' ? <AsyncState state="loading" /> : null}
        {resourceState === 'error' && resourceErrorState ? (
          <AsyncState
            state="error"
            title={resourceErrorState.title}
            description={resourceErrorState.description}
            requestId={resourceErrorState.requestId}
            technicalDetail={resourceErrorState.technicalDetail}
            onRetry={() => void loadResources()}
          />
        ) : null}
        {resourceState === 'success' && resourceErrorState ? (
          <Alert
            variant="destructive"
            data-test="config-resource-refresh-error"
          >
            <AlertTitle>配置资源刷新未完成</AlertTitle>
            <AlertDescription>
              {resourceErrorState.description}
              <SupportErrorId
                requestId={resourceErrorState.requestId}
                technicalDetail={resourceErrorState.technicalDetail}
              />
            </AlertDescription>
          </Alert>
        ) : null}
        {resourceState === 'success' && resources.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/80 p-8 text-center text-sm text-muted-foreground">
            当前筛选没有 Config 资源。
          </div>
        ) : null}
        {resourceState === 'success' && resources.length ? (
          <div
            className="data-table"
            tabIndex={0}
            role="region"
            aria-label="配置资源列表，可横向滚动"
          >
            <Table data-test="config-resource-table">
              <TableHeader>
                <TableRow>
                  <TableHead>配置</TableHead>
                  <TableHead>当前版本</TableHead>
                  <TableHead>Gallery</TableHead>
                  <TableHead>使用</TableHead>
                  <TableHead>更新时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resources.map((resource) => {
                  const gallery = statusView(
                    resource.pending_submission_id
                      ? 'pending'
                      : resource.gallery_status,
                  );
                  return (
                    <TableRow
                      key={resource.config_id}
                      data-test="config-resource-row"
                    >
                      <TableCell className="min-w-56 whitespace-normal">
                        <strong className="block text-sm">
                          {resource.title}
                        </strong>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {resource.author_display_name} ·{' '}
                          {statusView(resource.config_status).label}
                        </span>
                      </TableCell>
                      <TableCell className="min-w-44 whitespace-normal">
                        {resource.current_version_number
                          ? `v${resource.current_version_number}`
                          : '尚无可用版本'}
                        {resource.current_schema_key ? (
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {resource.current_schema_key} /{' '}
                            {resource.current_schema_version ?? '—'}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          label={gallery.label}
                          tone={gallery.tone}
                          rawValue={
                            resource.pending_submission_id
                              ? 'pending'
                              : resource.gallery_status
                          }
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        赞 {metric(resource.like_count)} · 下载{' '}
                        {metric(resource.download_count)} · 应用交付{' '}
                        {metric(resource.apply_delivery_count)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {formatUtc(resource.updated_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void openDetail(resource.config_id)}
                          data-test="config-resource-open"
                        >
                          详情
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : null}
        {resourceState === 'success' && resources.length ? (
          <div className="flex justify-end gap-2">
            {cursor ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCursor(null)}
              >
                返回首页
              </Button>
            ) : null}
            {nextCursor ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCursor(nextCursor)}
              >
                下一页
              </Button>
            ) : null}
          </div>
        ) : null}
      </AdminWorkspaceSection>

      <AdminWorkspaceSection
        id="config-reviews"
        title="配置广场审核队列"
        titleId="config-review-queue-title"
        description="Pending Version 在批准前不会进入 Gallery；拒绝不会替换最后一个已批准版本。"
        meta={
          <StatusBadge
            label={`${reviews.length} 条待审核`}
            tone={reviews.length ? 'warning' : 'neutral'}
          />
        }
        data-test="config-review-queue"
      >
        <div className="grid gap-2">
          <Label htmlFor="config-review-reason">本次审核原因</Label>
          <Input
            id="config-review-reason"
            maxLength={2000}
            value={reviewReason}
            onChange={(event) => setReviewReason(event.target.value)}
            placeholder="批准或拒绝前填写可审计原因"
            data-test="config-review-reason"
          />
        </div>
        {reviewError ? (
          <Alert variant="destructive">
            <AlertTitle>{reviewError.title}</AlertTitle>
            <AlertDescription>
              {reviewError.description}
              <SupportErrorId
                requestId={reviewError.requestId}
                technicalDetail={reviewError.technicalDetail}
              />
            </AlertDescription>
          </Alert>
        ) : null}
        {reviewState === 'success' && reviewError ? (
          <Alert variant="destructive" data-test="config-review-refresh-error">
            <AlertTitle>审核队列刷新未完成</AlertTitle>
            <AlertDescription>
              {reviewError.description}
              <SupportErrorId
                requestId={reviewError.requestId}
                technicalDetail={reviewError.technicalDetail}
              />
            </AlertDescription>
          </Alert>
        ) : null}
        {reviewState === 'loading' ? <AsyncState state="loading" /> : null}
        {reviewState === 'success' && reviews.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border/80 p-6 text-center text-sm text-muted-foreground">
            当前没有待审核配置。
          </p>
        ) : null}
        {reviewState === 'success' && reviews.length ? (
          <div className="grid gap-3">
            {reviews.map((review) => (
              <article
                key={review.submission_id}
                className="grid gap-3 rounded-xl border border-border/70 p-4 sm:grid-cols-[minmax(0,1fr)_auto]"
                data-test="config-review-row"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>{review.title}</strong>
                    <StatusBadge
                      label={`Version ${review.version_number}`}
                      tone="neutral"
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {review.author_display_name} · {review.schema_key} /{' '}
                    {review.schema_version} · 提交于{' '}
                    {formatUtc(review.submitted_at)}
                  </p>
                  {review.changelog ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {review.changelog}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <Button
                    size="sm"
                    onClick={() => startReview(review, 'approve')}
                    data-test="config-review-approve"
                  >
                    批准
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => startReview(review, 'reject')}
                    data-test="config-review-reject"
                  >
                    拒绝
                  </Button>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </AdminWorkspaceSection>

      <ResourceInspector
        open={Boolean(detailId)}
        onOpenChange={(open) => {
          if (!open) {
            setDetailId(null);
            setDetail(null);
            setDetailState('idle');
            setGovernanceReason('');
          }
        }}
        title={detail?.title ?? '配置详情'}
        description="业务事实优先；原始 UUID 与物理文件状态仅在详情中展示。"
      >
        {detailState === 'loading' ? <AsyncState state="loading" /> : null}
        {detailState === 'error' && detailError ? (
          <AsyncState
            state="error"
            title={detailError.title}
            description={detailError.description}
            requestId={detailError.requestId}
            technicalDetail={detailError.technicalDetail}
            onRetry={() => {
              if (detailId) void openDetail(detailId);
            }}
          />
        ) : null}
        {detailState === 'success' && detail ? (
          <div className="grid gap-5">
            <div className="flex flex-wrap gap-2">
              <StatusBadge
                label={statusView(detail.config_status).label}
                tone={statusView(detail.config_status).tone}
                rawValue={detail.config_status}
              />
              <StatusBadge
                label={statusView(detail.gallery_status).label}
                tone={statusView(detail.gallery_status).tone}
                rawValue={detail.gallery_status}
              />
            </div>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Detail label="作者" value={detail.author_display_name} />
              <Detail label="版本数量" value={metric(detail.version_count)} />
              <Detail
                label="当前版本"
                value={
                  detail.current_version_number
                    ? `v${detail.current_version_number} · ${detail.current_schema_key ?? 'schema 未记录'} / ${detail.current_schema_version ?? '—'}`
                    : '尚无可用版本'
                }
              />
              <Detail
                label="使用统计"
                value={`赞 ${metric(detail.like_count)} · 下载 ${metric(detail.download_count)} · 应用交付 ${metric(detail.apply_delivery_count)}`}
              />
              <Detail label="Config ID" value={detail.config_id} mono />
              <Detail
                label="Platform Account ID"
                value={detail.platform_account_id}
                mono
              />
              <Detail
                label="Current Version ID"
                value={detail.current_version_id ?? '—'}
                mono
              />
              <Detail
                label="Current File ID"
                value={detail.current_file_id ?? '—'}
                mono
              />
              <Detail
                label="物理状态"
                value={`${detail.current_file_status ?? '未记录'} / ${detail.current_write_outcome ?? '未记录'}`}
              />
              <Detail
                label="最近审核"
                value={`${detail.latest_submission_status ?? '无'}${detail.latest_review_reason ? ` · ${detail.latest_review_reason}` : ''}`}
              />
            </dl>
            <div className="grid gap-2 border-t border-border/70 pt-4">
              <Label htmlFor="config-governance-reason">Gallery 治理原因</Label>
              <Input
                id="config-governance-reason"
                maxLength={2000}
                value={governanceReason}
                onChange={(event) => setGovernanceReason(event.target.value)}
                placeholder="下架、恢复或封禁前填写原因"
                data-test="config-governance-reason"
              />
              {detailError?.technicalDetail === 'INVALID_INPUT' ? (
                <p className="text-xs text-destructive">
                  {detailError.description}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {detail.gallery_status === 'approved' ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => startGovernance('remove')}
                      data-test="config-governance-remove"
                    >
                      下架
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => startGovernance('block')}
                      data-test="config-governance-block"
                    >
                      封禁
                    </Button>
                  </>
                ) : null}
                {['removed', 'blocked'].includes(detail.gallery_status) ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => startGovernance('restore')}
                    data-test="config-governance-restore"
                  >
                    恢复上架
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </ResourceInspector>

      {intent ? (
        <ConfirmActionDialog
          open
          onOpenChange={(open) => {
            if (!open && mutationState !== 'pending') {
              setIntent(null);
              setMutationState('confirm_required');
              setMutationError(null);
            }
          }}
          title={intent.title}
          targetIdentity={intent.targetIdentity}
          impact={intent.impact}
          reversible={intent.reversible}
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
          onConfirm={() => void executeIntent()}
        />
      ) : null}
    </section>
  );
}
