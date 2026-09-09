'use client';

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { FormEvent } from 'react';
import { XIcon } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { AsyncState } from '@kit/ui/async-state';
import { Button } from '@kit/ui/button';
import {
  EmptyState,
  EmptyStateHeading,
  EmptyStateText,
} from '@kit/ui/empty-state';
import { Input } from '@kit/ui/input';
import { ResourceId } from '@kit/ui/resource-id';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@kit/ui/sheet';
import { StatusBadge, type StatusTone } from '@kit/ui/status-badge';
import { SupportErrorId } from '@kit/ui/support-error-id';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/table';

import { AdminPageHeader } from '../../../components/shell/admin-page-header';
import {
  adminAuthSession,
  sessionErrorMessage,
  useAdminSessionSnapshot,
} from '../../_lib/auth-session';

const PAGE_SIZE = 50;

type AuditEntry = {
  id?: string;
  request_id?: string | null;
  action?: string | null;
  actor_type?: string | null;
  actor_id?: string | null;
  target_type?: string | null;
  target_id?: string | null;
  outcome?: string | null;
  created_at?: string | null;
};

type AuditPayload = {
  data?: AuditEntry[];
  next_cursor?: string | null;
  request_id?: string | null;
  error?: { code?: string };
};

type LoadError = {
  title: string;
  description: string;
  requestId: string | null;
  technicalDetail: string | null;
};

function auditStatus(outcome: string | null | undefined): {
  label: string;
  tone: StatusTone;
} {
  switch (outcome?.toLowerCase()) {
    case 'success':
    case 'confirmed':
      return { label: '成功', tone: 'success' };
    case 'rejected':
    case 'revoked':
    case 'failed':
      return {
        label: outcome === 'rejected' ? '已拒绝' : '失败',
        tone: 'danger',
      };
    case 'pending':
    case 'accepted':
    case 'running':
      return { label: '处理中', tone: 'info' };
    case 'unknown':
    case 'unknown_outcome':
      return { label: '结果未确认', tone: 'unknown' };
    default:
      return { label: outcome ?? '未提供', tone: 'neutral' };
  }
}

function formatAuditDate(value: string | null | undefined): string {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'Asia/Shanghai',
  }).format(date);
}

function buildAuditUrl(
  pathname: string,
  query: string,
  cursor?: string | null,
) {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (cursor) params.set('cursor', cursor);
  const search = params.toString();
  return search ? `${pathname}?${search}` : pathname;
}

function readableTarget(entry: AuditEntry): string {
  return (
    [entry.target_type, entry.target_id].filter(Boolean).join(' · ') || '—'
  );
}

function TechnicalDetails({ entry }: { entry: AuditEntry }) {
  return (
    <details className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
      <summary
        data-test="audit-technical-details"
        className="cursor-pointer font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        技术详情
      </summary>
      <dl className="mt-3 grid gap-3">
        <div className="grid gap-1 sm:grid-cols-[7rem_1fr]">
          <dt>原始动作</dt>
          <dd className="m-0 break-all font-mono text-foreground">
            {entry.action ?? '—'}
          </dd>
        </div>
        <div className="grid gap-1 sm:grid-cols-[7rem_1fr]">
          <dt>原始结果</dt>
          <dd className="m-0 break-all font-mono text-foreground">
            {entry.outcome ?? '—'}
          </dd>
        </div>
        {entry.actor_type ? (
          <div className="grid gap-1 sm:grid-cols-[7rem_1fr]">
            <dt>主体类型</dt>
            <dd className="m-0 break-all font-mono text-foreground">
              {entry.actor_type}
            </dd>
          </div>
        ) : null}
      </dl>
    </details>
  );
}

function AuditInspector({
  entry,
  onClose,
}: {
  entry: AuditEntry | null;
  onClose: () => void;
}) {
  const status = auditStatus(entry?.outcome);

  return (
    <Sheet
      open={entry !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="right"
        showCloseButton={false}
        data-test="audit-inspector"
        className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl"
      >
        {entry ? (
          <>
            <SheetHeader className="border-b border-border/70 p-5 pr-14">
              <div className="flex items-center gap-2">
                <StatusBadge
                  label={status.label}
                  tone={status.tone}
                  rawValue={entry.outcome}
                />
                <span className="text-xs text-muted-foreground">审计事件</span>
              </div>
              <SheetTitle className="mt-1 break-words text-xl">
                {entry.action ?? '未命名动作'}
              </SheetTitle>
              <SheetDescription>
                只读查看安全审计信息；此处没有编辑、删除或重放操作。
              </SheetDescription>
            </SheetHeader>
            <SheetClose
              data-test="audit-inspector-close"
              aria-label="关闭审计详情"
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="absolute top-4 right-4"
                />
              }
            >
              <XIcon />
              <span className="sr-only">关闭审计详情</span>
            </SheetClose>
            <div className="grid gap-6 p-5">
              <dl className="grid gap-4">
                <div className="grid gap-1">
                  <dt className="text-xs font-medium text-muted-foreground">
                    发生时间（Asia/Shanghai）
                  </dt>
                  <dd className="m-0 text-sm text-foreground">
                    {formatAuditDate(entry.created_at)}
                  </dd>
                </div>
                <div className="grid gap-1">
                  <dt className="text-xs font-medium text-muted-foreground">
                    目标
                  </dt>
                  <dd className="m-0 text-sm text-foreground">
                    {readableTarget(entry)}
                  </dd>
                </div>
                {entry.target_id ? (
                  <div className="grid gap-1">
                    <dt className="text-xs font-medium text-muted-foreground">
                      目标 ID
                    </dt>
                    <dd className="m-0">
                      <ResourceId
                        value={entry.target_id}
                        label={`${entry.target_type ?? '资源'} · ${entry.target_id}`}
                      />
                    </dd>
                  </div>
                ) : null}
                {entry.actor_id ? (
                  <div className="grid gap-1">
                    <dt className="text-xs font-medium text-muted-foreground">
                      操作者 ID
                    </dt>
                    <dd className="m-0">
                      <ResourceId value={entry.actor_id} />
                    </dd>
                  </div>
                ) : null}
                {entry.request_id ? (
                  <div className="grid gap-1">
                    <dt className="text-xs font-medium text-muted-foreground">
                      请求 ID
                    </dt>
                    <dd className="m-0">
                      <ResourceId value={entry.request_id} />
                    </dd>
                  </div>
                ) : null}
              </dl>
              <TechnicalDetails entry={entry} />
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function AdminAuditPageContent() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionSnapshot = useAdminSessionSnapshot();
  const query = searchParams.get('q')?.trim() ?? '';
  const cursor = searchParams.get('cursor');
  const contextKey = `${query}\u0000${cursor ?? ''}`;
  const [queryInput, setQueryInput] = useState(query);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [remoteState, setRemoteState] = useState<
    'loading' | 'success' | 'error' | 'access'
  >('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [refreshError, setRefreshError] = useState<LoadError | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null);
  const generationRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const lastTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setQueryInput(query);
  }, [query]);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      const generation = generationRef.current + 1;
      generationRef.current = generation;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const epoch = adminAuthSession.getEpoch();

      if (mode === 'initial') {
        setEntries([]);
        setNextCursor(null);
        setSelectedEntry(null);
        setLoadError(null);
        setRefreshError(null);
        setRemoteState('loading');
      } else {
        setRefreshing(true);
        setRefreshError(null);
      }

      try {
        const response = await adminAuthSession.request(
          `/api/v1/admin/api/v1/audit?limit=${PAGE_SIZE}${query ? `&q=${encodeURIComponent(query)}` : ''}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
          { cache: 'no-store', signal: controller.signal },
        );
        const payload = (await response
          .json()
          .catch(() => null)) as AuditPayload | null;
        const requestId =
          response.headers.get('x-request-id') ?? payload?.request_id ?? null;

        if (
          generation !== generationRef.current ||
          !adminAuthSession.isCurrentEpoch(epoch)
        )
          return;

        if (!response.ok) {
          const technicalDetail =
            payload?.error?.code ?? `HTTP_${response.status}`;
          const nextError: LoadError =
            response.status === 401
              ? {
                  title: '会话已结束',
                  description:
                    '请重新登录后再查看审计记录。当前页面不会保留已退出会话的数据。',
                  requestId,
                  technicalDetail,
                }
              : response.status === 403
                ? {
                    title: '没有审计访问权限',
                    description: '请确认当前管理员账号具备审计读取权限。',
                    requestId,
                    technicalDetail,
                  }
                : {
                    title: '暂时无法读取审计记录',
                    description:
                      '请检查网络或服务状态后重试；本次读取失败不会被显示成暂无数据。',
                    requestId,
                    technicalDetail,
                  };

          if (mode === 'initial') {
            setLoadError(nextError);
            setRemoteState(
              response.status === 401 || response.status === 403
                ? 'access'
                : 'error',
            );
          } else {
            setRefreshError(nextError);
          }
          return;
        }

        setEntries(Array.isArray(payload?.data) ? payload.data : []);
        setNextCursor(payload?.next_cursor ?? null);
        setLoadError(null);
        setRefreshError(null);
        setRemoteState('success');
      } catch (error) {
        if (controller.signal.aborted) return;
        if (
          generation !== generationRef.current ||
          !adminAuthSession.isCurrentEpoch(epoch)
        )
          return;

        const nextError: LoadError = {
          title: '网络暂时不可用',
          description: sessionErrorMessage(error),
          requestId: null,
          technicalDetail: null,
        };
        if (mode === 'initial') {
          setLoadError(nextError);
          setRemoteState('error');
        } else {
          setRefreshError(nextError);
        }
      } finally {
        if (generation === generationRef.current) setRefreshing(false);
      }
    },
    [cursor, query],
  );

  useEffect(() => {
    void load('initial');
    return () => controllerRef.current?.abort();
  }, [contextKey, load]);

  useEffect(() => {
    if (
      sessionSnapshot.resolved &&
      ['unauthenticated', 'expired'].includes(sessionSnapshot.state)
    ) {
      controllerRef.current?.abort();
      generationRef.current += 1;
      setEntries([]);
      setNextCursor(null);
      setSelectedEntry(null);
      setLoadError({
        title: '会话已结束',
        description: '请重新登录后再查看审计记录。',
        requestId: null,
        technicalDetail: null,
      });
      setRemoteState('access');
    }
  }, [sessionSnapshot.resolved, sessionSnapshot.state]);

  const emptyKind = query ? 'filter' : 'true';
  const visibleSummary = useMemo(() => {
    if (remoteState !== 'success') return '';
    return entries.length
      ? `当前结果 ${entries.length} 条`
      : query
        ? '没有符合条件的记录'
        : '暂无审计记录';
  }, [entries.length, query, remoteState]);

  function submitQuery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(buildAuditUrl(pathname, queryInput.trim()));
  }

  function clearQuery() {
    router.push(pathname);
  }

  function goToNextPage() {
    if (nextCursor) router.push(buildAuditUrl(pathname, query, nextCursor));
  }

  function closeInspector() {
    setSelectedEntry(null);
    window.requestAnimationFrame(() => lastTriggerRef.current?.focus());
  }

  return (
    <main className="shell wide-shell" data-test="audit-page">
      <AdminPageHeader
        title="审计记录"
        description="只读查看脱敏审计事件。查询、游标和浏览器历史保持在 URL 中，读取失败不会被误显示为空数据。"
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-test="audit-refresh"
            disabled={refreshing || remoteState === 'loading'}
            onClick={() => void load('refresh')}
          >
            {refreshing ? '刷新中…' : '刷新'}
          </Button>
        }
      />

      <section className="panel gap-5" aria-labelledby="audit-query-heading">
        <div className="flex flex-col gap-1">
          <h2 id="audit-query-heading">查找审计事件</h2>
          <p className="text-sm text-muted-foreground">
            搜索由服务端执行；本页不再叠加当前页本地模糊筛选。
          </p>
        </div>
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={submitQuery}
        >
          <div className="grid min-w-0 flex-1 gap-2">
            <label htmlFor="audit-query">搜索动作或目标</label>
            <Input
              id="audit-query"
              type="search"
              value={queryInput}
              onChange={(event) => setQueryInput(event.target.value)}
              placeholder="例如 account.suspend 或 platform"
              data-test="audit-query"
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" data-test="audit-query-submit">
              查询
            </Button>
            {query ? (
              <Button
                type="button"
                variant="ghost"
                data-test="audit-query-clear"
                onClick={clearQuery}
              >
                清除
              </Button>
            ) : null}
          </div>
        </form>
      </section>

      {refreshError ? (
        <Alert variant="destructive" data-test="audit-background-error">
          <AlertTitle>{refreshError.title}</AlertTitle>
          <AlertDescription>
            {refreshError.description}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-test="audit-background-retry"
                onClick={() => void load('refresh')}
              >
                重试刷新
              </Button>
              <SupportErrorId
                requestId={refreshError.requestId}
                technicalDetail={refreshError.technicalDetail}
              />
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      <section className="panel gap-4" aria-labelledby="audit-table-heading">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 id="audit-table-heading">事件列表</h2>
            <p
              className="text-sm text-muted-foreground"
              role="status"
              aria-live="polite"
            >
              {visibleSummary ||
                (remoteState === 'loading' ? '正在加载审计记录…' : '')}
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            每页 {PAGE_SIZE} 条 · 时间显示为 Asia/Shanghai
          </span>
        </div>

        {remoteState === 'loading' && entries.length === 0 ? (
          <AsyncState state="loading" />
        ) : null}

        {remoteState === 'access' && loadError ? (
          <AsyncState
            state="access"
            title={loadError.title}
            description={loadError.description}
            requestId={loadError.requestId}
            technicalDetail={loadError.technicalDetail}
          />
        ) : null}

        {remoteState === 'error' && loadError ? (
          <AsyncState
            state="error"
            title={loadError.title}
            description={loadError.description}
            requestId={loadError.requestId}
            technicalDetail={loadError.technicalDetail}
            onRetry={() => void load('initial')}
          />
        ) : null}

        {remoteState === 'success' && entries.length === 0 ? (
          <EmptyState
            className="min-h-56 p-6"
            data-test={`audit-empty-${emptyKind}`}
          >
            <EmptyStateHeading>
              {emptyKind === 'filter' ? '没有符合条件的记录' : '暂无审计记录'}
            </EmptyStateHeading>
            <EmptyStateText>
              {emptyKind === 'filter'
                ? '请尝试其他动作或目标关键词，或清除当前搜索条件。'
                : '当管理员操作产生审计事件后，记录会显示在这里。'}
            </EmptyStateText>
            {emptyKind === 'filter' ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-test="audit-empty-clear"
                onClick={clearQuery}
              >
                清除搜索
              </Button>
            ) : null}
          </EmptyState>
        ) : null}

        {remoteState === 'success' && entries.length > 0 ? (
          <>
            <Table data-test="audit-table">
              <TableHeader>
                <TableRow>
                  <TableHead>时间</TableHead>
                  <TableHead>动作</TableHead>
                  <TableHead>目标</TableHead>
                  <TableHead>结果</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry, index) => {
                  const status = auditStatus(entry.outcome);
                  const key =
                    entry.id ?? entry.request_id ?? `${entry.action}-${index}`;
                  return (
                    <TableRow key={key} data-test="audit-row">
                      <TableCell className="whitespace-normal text-muted-foreground">
                        {formatAuditDate(entry.created_at)}
                      </TableCell>
                      <TableCell className="max-w-64 whitespace-normal font-medium text-foreground">
                        {entry.action ?? '—'}
                      </TableCell>
                      <TableCell className="max-w-72 whitespace-normal">
                        <div className="grid gap-1">
                          <span>{entry.target_type ?? '—'}</span>
                          {entry.target_id ? (
                            <span className="break-all font-mono text-xs text-muted-foreground">
                              {entry.target_id}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          label={status.label}
                          tone={status.tone}
                          rawValue={entry.outcome}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          data-test="audit-open-inspector"
                          onClick={(event) => {
                            lastTriggerRef.current = event.currentTarget;
                            setSelectedEntry(entry);
                          }}
                        >
                          查看详情
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <div className="flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm text-muted-foreground">
                {nextCursor
                  ? '还有更多记录，下一页仍由服务端游标决定。'
                  : '已到当前结果末尾。'}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-test="audit-next-page"
                disabled={!nextCursor}
                onClick={goToNextPage}
              >
                下一页
              </Button>
            </div>
          </>
        ) : null}
      </section>

      <AuditInspector entry={selectedEntry} onClose={closeInspector} />
    </main>
  );
}

function AuditPageFallback() {
  return (
    <main className="shell wide-shell" data-test="audit-page-loading">
      <div
        className="grid gap-3"
        aria-busy="true"
        aria-label="正在加载审计记录"
      >
        <div className="h-9 w-48 animate-pulse rounded-md bg-muted" />
        <div className="h-5 w-full max-w-2xl animate-pulse rounded-md bg-muted" />
        <div className="mt-4 h-72 animate-pulse rounded-xl border border-border bg-card" />
      </div>
    </main>
  );
}

export default function AdminAuditPage() {
  return (
    <Suspense fallback={<AuditPageFallback />}>
      <AdminAuditPageContent />
    </Suspense>
  );
}
