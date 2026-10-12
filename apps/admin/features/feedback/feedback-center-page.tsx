'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

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

import { SessionRetryRequiredError } from '../../app/_lib/auth/browser';
import {
  adminAuthSession,
  sessionErrorMessage,
} from '../../app/_lib/auth-session';
import { usePlatformContext } from '../../components/platform-context/platform-workspace';
import { AdminPageHeader } from '../../components/shell/admin-page-header';
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
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_STATUSES,
  feedbackCategoryLabel,
  feedbackImagePath,
  feedbackStatusView,
  feedbackSummary,
  type FeedbackDetail,
  type FeedbackListItem,
} from './feedback-model';

type FilterDraft = {
  q: string;
  status: string;
  category: string;
  label: string;
  user: string;
  email: string;
  hasAttachments: string;
  from: string;
  to: string;
};

type FeedbackExport = {
  filename: string;
  row_count: number;
  csv: string;
};

function initialDraft(params: URLSearchParams): FilterDraft {
  return {
    q: params.get('q') ?? '',
    status: params.get('status') ?? '',
    category: params.get('category') ?? '',
    label: params.get('label') ?? '',
    user: params.get('user') ?? '',
    email: params.get('email') ?? '',
    hasAttachments: params.get('has_attachments') ?? '',
    from: params.get('from')?.slice(0, 10) ?? '',
    to: params.get('to')?.slice(0, 10) ?? '',
  };
}

function filterParams(
  params: URLSearchParams,
  includeCursor = true,
): URLSearchParams {
  const next = new URLSearchParams();
  for (const key of [
    'q',
    'status',
    'category',
    'label',
    'user',
    'email',
    'has_attachments',
    'from',
    'to',
  ]) {
    const value = params.get(key);
    if (value) next.set(key, value);
  }
  if (includeCursor && params.get('cursor'))
    next.set('cursor', params.get('cursor')!);
  return next;
}

function mutationErrorFromCaught(caught: unknown): ResourceError {
  return {
    title: '操作结果待确认',
    description:
      caught instanceof SessionRetryRequiredError
        ? '会话已恢复，但为避免重复写入，原操作没有自动重放。请刷新权威状态后重新决定。'
        : '响应前连接中断。请先刷新权威状态，不要立即重复提交。',
    requestId: null,
    technicalDetail:
      caught instanceof SessionRetryRequiredError
        ? 'SESSION_RECOVERY_REQUIRED'
        : 'UNKNOWN_OUTCOME',
  };
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words text-sm">{value || '—'}</dd>
    </div>
  );
}

export function FeedbackCenterPage() {
  const { platform } = usePlatformContext();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryKey = searchParams.toString();
  const [draft, setDraft] = useState<FilterDraft>(() =>
    initialDraft(new URLSearchParams(queryKey)),
  );
  const [items, setItems] = useState<FeedbackListItem[]>([]);
  const [state, setState] = useState<ResourceLoadState>('loading');
  const [listError, setListError] = useState<ResourceError | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<FeedbackDetail | null>(null);
  const [detailState, setDetailState] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle');
  const [detailError, setDetailError] = useState<ResourceError | null>(null);
  const [actionError, setActionError] = useState<ResourceError | null>(null);
  const [statusReason, setStatusReason] = useState('');
  const [nextStatus, setNextStatus] = useState('reviewing');
  const [labelsDraft, setLabelsDraft] = useState('');
  const [flagReason, setFlagReason] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteState, setDeleteState] =
    useState<MutationState>('confirm_required');
  const [deleteError, setDeleteError] = useState<ResourceError | null>(null);
  const [deleteOperationId, setDeleteOperationId] = useState<string | null>(
    null,
  );
  const listGeneration = useRef(0);
  const detailGeneration = useRef(0);

  const base = useMemo(
    () => resourcePath(platform.platform_id, '/feedback'),
    [platform.platform_id],
  );

  const loadList = useCallback(
    async (preserve = false) => {
      const generation = ++listGeneration.current;
      const epoch = adminAuthSession.getEpoch();
      if (!preserve) setState('loading');
      setListError(null);
      try {
        const params = filterParams(new URLSearchParams(queryKey));
        params.set('limit', '20');
        const response = await adminAuthSession.request(
          `${base}?${params.toString()}`,
          {
            cache: 'no-store',
          },
        );
        const payload = await readApiPayload<FeedbackListItem[]>(response);
        if (
          generation !== listGeneration.current ||
          !adminAuthSession.isCurrentEpoch(epoch)
        )
          return;
        if (!response.ok || !Array.isArray(payload?.data)) {
          setListError(resourceError(response, payload, '用户反馈'));
          if (!preserve) setState('error');
          return;
        }
        const nextItems = payload.data;
        setItems(nextItems);
        setNextCursor(payload.next_cursor ?? null);
        setSelected((current) => {
          const visible = new Set(nextItems.map((item) => item.feedback_id));
          return new Set([...current].filter((id) => visible.has(id)));
        });
        setState('success');
      } catch (caught) {
        if (
          generation !== listGeneration.current ||
          !adminAuthSession.isCurrentEpoch(epoch)
        )
          return;
        setListError({
          title: '用户反馈读取失败',
          description: sessionErrorMessage(caught),
          requestId: null,
          technicalDetail: null,
        });
        if (!preserve) setState('error');
      }
    },
    [base, queryKey],
  );

  const loadDetail = useCallback(
    async (feedbackId: string) => {
      const generation = ++detailGeneration.current;
      setDetailId(feedbackId);
      setDetail(null);
      setDetailState('loading');
      setDetailError(null);
      setActionError(null);
      try {
        const response = await adminAuthSession.request(
          `${base}/${encodeURIComponent(feedbackId)}`,
          { cache: 'no-store' },
        );
        const payload = await readApiPayload<FeedbackDetail>(response);
        if (generation !== detailGeneration.current) return;
        if (!response.ok || !payload?.data) {
          setDetailError(resourceError(response, payload, '反馈详情'));
          setDetailState('error');
          return;
        }
        setDetail(payload.data);
        setNextStatus(
          payload.data.status === 'new' ? 'reviewing' : payload.data.status,
        );
        setLabelsDraft(payload.data.labels.join(', '));
        setDetailState('success');
      } catch (caught) {
        if (generation !== detailGeneration.current) return;
        setDetailError({
          title: '反馈详情读取失败',
          description: sessionErrorMessage(caught),
          requestId: null,
          technicalDetail: null,
        });
        setDetailState('error');
      }
    },
    [base],
  );

  useEffect(() => {
    setDraft(initialDraft(new URLSearchParams(queryKey)));
    void loadList();
  }, [loadList, queryKey]);

  function setDraftField(field: keyof FilterDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    const entries: Array<[string, string]> = [
      ['q', draft.q.trim()],
      ['status', draft.status],
      ['category', draft.category],
      ['label', draft.label.trim()],
      ['user', draft.user.trim()],
      ['email', draft.email.trim()],
      ['has_attachments', draft.hasAttachments],
      ['from', draft.from ? `${draft.from}T00:00:00.000Z` : ''],
      ['to', draft.to ? `${draft.to}T23:59:59.999Z` : ''],
    ];
    for (const [key, value] of entries) if (value) params.set(key, value);
    router.replace(`${pathname}${params.size ? `?${params.toString()}` : ''}`);
  }

  function goToCursor(cursor: string | null) {
    const params = filterParams(new URLSearchParams(queryKey), false);
    if (cursor) params.set('cursor', cursor);
    router.replace(`${pathname}${params.size ? `?${params.toString()}` : ''}`);
  }

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else if (next.size < 100) next.add(id);
      return next;
    });
  }

  async function mutateDetail(
    path: string,
    method: 'POST' | 'PUT',
    body: Record<string, unknown>,
    useVersion = false,
  ) {
    if (!detail) return;
    setActionError(null);
    try {
      const response = await adminAuthSession.request(
        path,
        {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...(useVersion ? { 'If-Match': `W/"${detail.row_version}"` } : {}),
          },
          body: JSON.stringify(body),
        },
        { replay: 'never' },
      );
      const payload = await readApiPayload<Record<string, unknown>>(response);
      if (!response.ok) {
        setActionError(resourceError(response, payload, '反馈治理操作'));
        if ([409, 412, 428].includes(response.status)) {
          await loadDetail(detail.feedback_id);
        }
        return;
      }
      await Promise.all([loadList(true), loadDetail(detail.feedback_id)]);
      setStatusReason('');
      setFlagReason('');
      setNoteDraft('');
    } catch (caught) {
      setActionError(mutationErrorFromCaught(caught));
    }
  }

  async function exportFeedback() {
    setExporting(true);
    setListError(null);
    try {
      const params = filterParams(new URLSearchParams(queryKey), false);
      if (selected.size) params.set('ids', [...selected].join(','));
      const response = await adminAuthSession.request(
        `${base}/export?${params.toString()}`,
        { cache: 'no-store' },
      );
      const payload = await readApiPayload<FeedbackExport>(response);
      if (!response.ok || !payload?.data) {
        setListError(resourceError(response, payload, '反馈导出'));
        return;
      }
      const blob = new Blob([payload.data.csv], {
        type: 'text/csv;charset=utf-8',
      });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = payload.data.filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(href);
    } catch (caught) {
      setListError({
        title: '反馈导出失败',
        description: sessionErrorMessage(caught),
        requestId: null,
        technicalDetail: null,
      });
    } finally {
      setExporting(false);
    }
  }

  function openDelete() {
    if (!selected.size) return;
    setDeleteOperationId(crypto.randomUUID());
    setDeleteState('confirm_required');
    setDeleteError(null);
    setDeleteOpen(true);
  }

  async function executeDelete(reason: string) {
    if (!selected.size || !deleteOperationId) return;
    setDeleteState('pending');
    setDeleteError(null);
    try {
      const response = await adminAuthSession.request(
        `${base}/batch-delete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            feedback_ids: [...selected],
            reason,
            operation_id: deleteOperationId,
          }),
        },
        { replay: 'never' },
      );
      const payload = await readApiPayload<Record<string, unknown>>(response);
      if (!response.ok) {
        if (isRecentMfaRequired(response, payload)) {
          setDeleteState('step_up_required');
          return;
        }
        setDeleteState('failure');
        setDeleteError(resourceError(response, payload, '反馈批量删除'));
        return;
      }
      setDeleteState('accepted');
      setSelected(new Set());
      if (detailId && selected.has(detailId)) {
        setDetailId(null);
        setDetail(null);
        setDetailState('idle');
      }
      await loadList();
    } catch (caught) {
      if (caught instanceof SessionRetryRequiredError) {
        setDeleteState('failure');
      } else {
        setDeleteState('unknown_outcome');
      }
      setDeleteError(mutationErrorFromCaught(caught));
    }
  }

  async function checkDeleteOutcome() {
    await loadList();
    setDeleteState('failure');
    setDeleteError({
      title: '已重新读取权威状态',
      description:
        '请根据最新列表判断原删除请求是否生效；页面不会自动重发批量删除。',
      requestId: null,
      technicalDetail: 'STATE_RELOADED',
    });
  }

  return (
    <div className="grid gap-6" data-test="feedback-page">
      <AdminPageHeader
        title="用户反馈"
        description="处理平台用户提交的文字、图片与联系意愿；筛选、导出与删除都以服务端权威范围为准。"
      />

      <section className="panel gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2>反馈队列</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              新反馈与处理中属于平台概览待办；已删除内容不会继续出现在处理中心。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadList(true)}
              data-test="feedback-refresh"
            >
              刷新
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={exporting}
              onClick={() => void exportFeedback()}
              data-test="feedback-export"
            >
              {selected.size ? `导出已选 ${selected.size} 条` : '导出当前筛选'}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={!selected.size}
              onClick={openDelete}
              data-test="feedback-batch-delete"
            >
              批量删除
            </Button>
          </div>
        </div>

        <form className="grid gap-3 md:grid-cols-4" onSubmit={submitFilters}>
          <div className="grid gap-1 md:col-span-2">
            <Label htmlFor="feedback-q">关键词</Label>
            <Input
              id="feedback-q"
              value={draft.q}
              onChange={(event) => setDraftField('q', event.target.value)}
              maxLength={256}
              placeholder="标题、正文、用户或邮箱"
              data-test="feedback-filter-q"
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="feedback-status">状态</Label>
            <select
              id="feedback-status"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={draft.status}
              onChange={(event) => setDraftField('status', event.target.value)}
            >
              <option value="">全部</option>
              {FEEDBACK_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {feedbackStatusView(value).label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="feedback-category">分类</Label>
            <select
              id="feedback-category"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={draft.category}
              onChange={(event) =>
                setDraftField('category', event.target.value)
              }
            >
              <option value="">全部</option>
              {FEEDBACK_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {feedbackCategoryLabel(value)}
                </option>
              ))}
            </select>
          </div>
          <Input
            aria-label="标签"
            value={draft.label}
            onChange={(event) => setDraftField('label', event.target.value)}
            placeholder="标签"
            maxLength={32}
          />
          <Input
            aria-label="用户"
            value={draft.user}
            onChange={(event) => setDraftField('user', event.target.value)}
            placeholder="用户名称 / UUID"
          />
          <Input
            aria-label="邮箱"
            value={draft.email}
            onChange={(event) => setDraftField('email', event.target.value)}
            placeholder="邮箱"
          />
          <select
            aria-label="是否含图片"
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={draft.hasAttachments}
            onChange={(event) =>
              setDraftField('hasAttachments', event.target.value)
            }
          >
            <option value="">图片不限</option>
            <option value="true">含图片</option>
            <option value="false">无图片</option>
          </select>
          <Input
            aria-label="开始日期"
            type="date"
            value={draft.from}
            onChange={(event) => setDraftField('from', event.target.value)}
          />
          <Input
            aria-label="结束日期"
            type="date"
            value={draft.to}
            onChange={(event) => setDraftField('to', event.target.value)}
          />
          <Button type="submit" data-test="feedback-filter-submit">
            应用筛选
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.replace(pathname)}
          >
            清除
          </Button>
        </form>

        {listError ? (
          <Alert variant="destructive">
            <AlertTitle>{listError.title}</AlertTitle>
            <AlertDescription>
              {listError.description}
              <SupportErrorId
                requestId={listError.requestId}
                technicalDetail={listError.technicalDetail}
              />
            </AlertDescription>
          </Alert>
        ) : null}
        {state === 'loading' ? <AsyncState state="loading" /> : null}
        {state === 'error' && listError ? (
          <AsyncState
            state="error"
            title={listError.title}
            description={listError.description}
            requestId={listError.requestId}
            technicalDetail={listError.technicalDetail}
            onRetry={() => void loadList()}
          />
        ) : null}
        {state === 'success' && items.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            当前筛选没有用户反馈。
          </div>
        ) : null}
        {state === 'success' && items.length ? (
          <div
            className="data-table"
            tabIndex={0}
            role="region"
            aria-label="用户反馈列表，可横向滚动"
          >
            <Table data-test="feedback-table">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">选择</TableHead>
                  <TableHead>提交时间</TableHead>
                  <TableHead>用户 / 摘要</TableHead>
                  <TableHead>分类</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>标签 / 图片</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const status = feedbackStatusView(item.status);
                  return (
                    <TableRow key={item.feedback_id} data-test="feedback-row">
                      <TableCell>
                        <input
                          type="checkbox"
                          aria-label={`选择 ${feedbackSummary(item)}`}
                          checked={selected.has(item.feedback_id)}
                          onChange={() => toggleSelected(item.feedback_id)}
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {formatUtc(item.submitted_at ?? item.created_at)}
                      </TableCell>
                      <TableCell className="min-w-64 whitespace-normal">
                        <strong className="block text-sm">
                          {item.author_display_name}
                        </strong>
                        <span className="mt-1 block text-sm">
                          {feedbackSummary(item)}
                        </span>
                        {item.body_summary && item.title ? (
                          <span className="mt-1 block line-clamp-2 text-xs text-muted-foreground">
                            {item.body_summary}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {feedbackCategoryLabel(item.category)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          label={status.label}
                          tone={status.tone}
                          rawValue={item.status}
                        />
                        {item.flagged ? (
                          <span className="ml-2 text-xs font-medium text-destructive">
                            重点
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="min-w-44 whitespace-normal text-xs text-muted-foreground">
                        {item.labels.length
                          ? item.labels.join(' · ')
                          : '无标签'}{' '}
                        · {item.attachment_count} 张图片
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void loadDetail(item.feedback_id)}
                          data-test="feedback-open-detail"
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
        {state === 'success' && items.length ? (
          <div className="flex justify-end gap-2">
            {searchParams.get('cursor') ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToCursor(null)}
              >
                返回首页
              </Button>
            ) : null}
            {nextCursor ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToCursor(nextCursor)}
              >
                下一页
              </Button>
            ) : null}
          </div>
        ) : null}
      </section>

      <ResourceInspector
        open={Boolean(detailId)}
        onOpenChange={(open) => {
          if (!open) {
            setDetailId(null);
            setDetail(null);
            setDetailState('idle');
            setActionError(null);
          }
        }}
        title={detail?.title || detail?.author_display_name || '反馈详情'}
        description="正文、联系邮箱、图片与内部备注只在受保护的 Admin 详情中展示。"
      >
        {detailState === 'loading' ? <AsyncState state="loading" /> : null}
        {detailState === 'error' && detailError ? (
          <AsyncState
            state="error"
            title={detailError.title}
            description={detailError.description}
            requestId={detailError.requestId}
            technicalDetail={detailError.technicalDetail}
            onRetry={() => detailId && void loadDetail(detailId)}
          />
        ) : null}
        {detailState === 'success' && detail ? (
          <div className="grid gap-5" data-test="feedback-detail">
            <div className="flex flex-wrap gap-2">
              <StatusBadge
                label={feedbackStatusView(detail.status).label}
                tone={feedbackStatusView(detail.status).tone}
                rawValue={detail.status}
              />
              <StatusBadge
                label={feedbackCategoryLabel(detail.category)}
                tone="neutral"
              />
              {detail.flagged ? (
                <StatusBadge label="重点" tone="danger" />
              ) : null}
            </div>
            <dl className="grid gap-3 sm:grid-cols-2">
              <DetailField label="用户" value={detail.author_display_name} />
              <DetailField
                label="联系"
                value={
                  detail.contact_allowed
                    ? detail.contact_email || '允许联系，但邮箱未记录'
                    : '用户未允许邮件联系'
                }
              />
              <DetailField
                label="提交时间"
                value={formatUtc(detail.submitted_at)}
              />
              <DetailField label="Feedback ID" value={detail.feedback_id} />
            </dl>
            <div className="grid gap-2">
              <strong className="text-sm">完整反馈</strong>
              <p className="whitespace-pre-wrap rounded-lg border bg-muted/20 p-3 text-sm">
                {detail.body || detail.title || '无文字正文'}
              </p>
            </div>
            {detail.attachments.length ? (
              <div className="grid gap-2">
                <strong className="text-sm">图片附件</strong>
                <div className="grid grid-cols-2 gap-3">
                  {detail.attachments.map((attachment) =>
                    attachment.content_path ? (
                      <a
                        key={attachment.attachment_id}
                        href={feedbackImagePath(attachment.content_path)}
                        target="_blank"
                        rel="noreferrer"
                        className="overflow-hidden rounded-lg border"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={feedbackImagePath(attachment.content_path)}
                          alt={attachment.original_name}
                          className="aspect-video w-full object-cover"
                          loading="lazy"
                        />
                        <span className="block truncate px-2 py-1 text-xs">
                          {attachment.original_name}
                        </span>
                      </a>
                    ) : null,
                  )}
                </div>
              </div>
            ) : null}

            {actionError ? (
              <Alert variant="destructive">
                <AlertTitle>{actionError.title}</AlertTitle>
                <AlertDescription>
                  {actionError.description}
                  <SupportErrorId
                    requestId={actionError.requestId}
                    technicalDetail={actionError.technicalDetail}
                  />
                  {actionError.technicalDetail === 'UNKNOWN_OUTCOME' ||
                  actionError.technicalDetail ===
                    'SESSION_RECOVERY_REQUIRED' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() =>
                        void Promise.all([
                          loadList(true),
                          loadDetail(detail.feedback_id),
                        ])
                      }
                    >
                      刷新权威状态
                    </Button>
                  ) : null}
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="grid gap-3 border-t pt-4">
              <strong className="text-sm">处理动作</strong>
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <select
                  aria-label="反馈状态"
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={nextStatus}
                  onChange={(event) => setNextStatus(event.target.value)}
                >
                  {FEEDBACK_STATUSES.filter(
                    (value) => value !== 'deleting',
                  ).map((value) => (
                    <option key={value} value={value}>
                      {feedbackStatusView(value).label}
                    </option>
                  ))}
                </select>
                <Input
                  value={statusReason}
                  onChange={(event) => setStatusReason(event.target.value)}
                  placeholder="状态变更原因"
                  maxLength={2000}
                  data-test="feedback-status-reason"
                />
                <Button
                  size="sm"
                  disabled={
                    !statusReason.trim() || nextStatus === detail.status
                  }
                  onClick={() =>
                    void mutateDetail(
                      `${base}/${detail.feedback_id}/status`,
                      'POST',
                      { status: nextStatus, reason: statusReason.trim() },
                      true,
                    )
                  }
                  data-test="feedback-status-update"
                >
                  更新状态
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <Input
                  value={labelsDraft}
                  onChange={(event) => setLabelsDraft(event.target.value)}
                  placeholder="标签，以逗号分隔"
                  data-test="feedback-labels"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void mutateDetail(
                      `${base}/${detail.feedback_id}/labels`,
                      'PUT',
                      {
                        labels: labelsDraft
                          .split(',')
                          .map((label) => label.trim())
                          .filter(Boolean),
                      },
                      true,
                    )
                  }
                  data-test="feedback-labels-save"
                >
                  保存标签
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <Input
                  value={flagReason}
                  onChange={(event) => setFlagReason(event.target.value)}
                  placeholder={detail.flagged ? '取消重点原因' : '标记重点原因'}
                  maxLength={2000}
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!flagReason.trim()}
                  onClick={() =>
                    void mutateDetail(
                      `${base}/${detail.feedback_id}/flag`,
                      'POST',
                      { flagged: !detail.flagged, reason: flagReason.trim() },
                      true,
                    )
                  }
                  data-test="feedback-flag-update"
                >
                  {detail.flagged ? '取消重点' : '标记重点'}
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <textarea
                  className="min-h-24 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={noteDraft}
                  onChange={(event) => setNoteDraft(event.target.value)}
                  placeholder="内部处理备注（用户不可见）"
                  maxLength={5000}
                  data-test="feedback-note"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!noteDraft.trim()}
                  onClick={() =>
                    void mutateDetail(
                      `${base}/${detail.feedback_id}/notes`,
                      'POST',
                      { note: noteDraft.trim() },
                    )
                  }
                  data-test="feedback-note-add"
                >
                  添加备注
                </Button>
              </div>
            </div>

            <div className="grid gap-2 border-t pt-4">
              <strong className="text-sm">处理时间线</strong>
              {detail.timeline.length ? (
                <div className="grid gap-2">
                  {detail.timeline.map((event) => (
                    <div
                      key={event.event_id}
                      className="rounded-lg border p-3 text-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <strong>{event.event_type}</strong>
                        <span className="text-xs text-muted-foreground">
                          {formatUtc(event.created_at)}
                        </span>
                      </div>
                      {event.note_body ? (
                        <p className="mt-2 whitespace-pre-wrap">
                          {event.note_body}
                        </p>
                      ) : null}
                      {Object.keys(event.metadata ?? {}).length ? (
                        <p className="mt-2 break-words text-xs text-muted-foreground">
                          {JSON.stringify(event.metadata)}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">暂无处理事件。</p>
              )}
            </div>
            <details className="border-t pt-4 text-xs text-muted-foreground">
              <summary className="cursor-pointer font-medium">
                客户端环境上下文
              </summary>
              <pre className="mt-2 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted/40 p-3">
                {JSON.stringify(detail.client_context ?? {}, null, 2)}
              </pre>
            </details>
          </div>
        ) : null}
      </ResourceInspector>

      <ConfirmActionDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (deleteState === 'pending') return;
          setDeleteOpen(open);
          if (!open) {
            setDeleteState('confirm_required');
            setDeleteError(null);
          }
        }}
        title="批量删除用户反馈"
        targetIdentity={`${selected.size} 条 Feedback`}
        impact="正文、联系信息和用户归属会立即最小化；图片对象进入异步删除，只有全部物理清理后才终态 deleted。"
        reversible={false}
        asyncOperation
        historyRetained
        reasonRequired
        reasonLabel="删除原因"
        reasonPlaceholder="填写不包含个人信息的删除原因"
        state={deleteState}
        error={deleteError}
        stepUpContent={
          deleteState === 'step_up_required' ? (
            <AdminRecentMfaPanel
              onVerified={() => setDeleteState('confirm_required')}
            />
          ) : null
        }
        onCheckUnknown={
          deleteState === 'unknown_outcome'
            ? () => void checkDeleteOutcome()
            : undefined
        }
        onConfirm={(reason) => void executeDelete(reason)}
      />
    </div>
  );
}
