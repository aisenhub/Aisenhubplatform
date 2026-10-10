'use client';

import Link from 'next/link';
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { FormEvent, ReactNode } from 'react';
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
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@kit/ui/sheet';
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

import { AdminPageHeader } from '../../components/shell/admin-page-header';
import {
  adminAuthSession,
  sessionErrorMessage,
  useAdminSessionSnapshot,
} from '../../app/_lib/auth-session';
import {
  readApiPayload,
  resourceError,
  type ResourceError,
} from '../resources/admin-resource-utils';
import {
  AUDIT_ACTION_OPTIONS,
  AUDIT_OUTCOME_OPTIONS,
  AUDIT_TARGET_TYPE_OPTIONS,
  auditActionLabel,
  auditActorLabel,
  auditActorSecondary,
  auditOutcomeStatus,
  auditPlatformLabel,
  auditPlatformSecondary,
  auditTargetLabel,
  auditTargetSecondary,
  auditTargetTypeLabel,
  type AdminAuditEntry,
} from './admin-audit-model';

const PAGE_SIZE = 50;

const selectClassName =
  'h-10 min-w-0 rounded-md border border-input bg-background px-3 text-sm';

type AuditPayload = {
  data?: AdminAuditEntry[];
  next_cursor?: string | null;
  request_id?: string | null;
  error?: { code?: string };
};

type PlatformOption = {
  platform_id: string;
  name: string;
  code: string;
};

type AuditFilters = {
  q: string;
  actor: string;
  platformId: string;
  action: string;
  targetType: string;
  outcome: string;
};

const emptyFilters = (): AuditFilters => ({
  q: '',
  actor: '',
  platformId: '',
  action: '',
  targetType: '',
  outcome: '',
});

function auditFiltersFromSearchParams(
  searchParams: URLSearchParams,
): AuditFilters {
  return {
    q: searchParams.get('q')?.trim() ?? '',
    actor: searchParams.get('actor')?.trim() ?? '',
    platformId: searchParams.get('platform_id')?.trim() ?? '',
    action: searchParams.get('action')?.trim() ?? '',
    targetType: searchParams.get('target_type')?.trim() ?? '',
    outcome: searchParams.get('outcome')?.trim() ?? '',
  };
}

function hasAuditFilters(filters: AuditFilters): boolean {
  return Object.values(filters).some(Boolean);
}

function buildAuditUrl(
  pathname: string,
  filters: AuditFilters,
  cursor?: string | null,
): string {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.actor) params.set('actor', filters.actor);
  if (filters.platformId) params.set('platform_id', filters.platformId);
  if (filters.action) params.set('action', filters.action);
  if (filters.targetType) params.set('target_type', filters.targetType);
  if (filters.outcome) params.set('outcome', filters.outcome);
  if (cursor) params.set('cursor', cursor);
  const search = params.toString();
  return search ? `${pathname}?${search}` : pathname;
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

function supportedTargetHref(entry: AdminAuditEntry): string | null {
  if (!entry.target_id) return null;
  if (entry.target_type === 'platform') {
    return `/admin/platforms/${encodeURIComponent(entry.target_id)}`;
  }
  if (entry.target_type === 'deletion_job') {
    return `/admin/accounts/deletion-jobs?job_id=${encodeURIComponent(entry.target_id)}`;
  }
  return null;
}

function BusinessValue({
  primary,
  secondary,
}: {
  primary: string;
  secondary?: string | null;
}) {
  return (
    <span className="grid gap-0.5">
      <span className="font-medium text-foreground">{primary}</span>
      {secondary ? (
        <span className="break-all text-xs text-muted-foreground">
          {secondary}
        </span>
      ) : null}
    </span>
  );
}

function TechnicalDetails({ entry }: { entry: AdminAuditEntry }) {
  const rows = [
    ['原始动作', entry.action],
    ['原始对象类型', entry.target_type],
    ['原始主体类型', entry.actor_type],
    ['Audit ID', entry.id],
    ['Request ID', entry.request_id],
    ['Platform ID', entry.platform_id],
    ['Platform Account ID', entry.platform_account_id],
    ['Actor ID', entry.actor_id],
    ['Target ID', entry.target_id],
    ['原始结果', entry.outcome],
  ] as const;

  return (
    <details className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
      <summary
        data-test="audit-technical-details"
        className="cursor-pointer font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        技术详情
      </summary>
      <dl className="mt-3 grid gap-3">
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-1 sm:grid-cols-[9rem_1fr]">
            <dt>{label}</dt>
            <dd className="m-0 break-all font-mono text-foreground">
              {value ?? '—'}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function AuditInspector({
  entry,
  onClose,
}: {
  entry: AdminAuditEntry | null;
  onClose: () => void;
}) {
  const status = auditOutcomeStatus(entry?.outcome);
  const targetHref = entry ? supportedTargetHref(entry) : null;

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
                {auditActionLabel(entry.action)}
              </SheetTitle>
              <SheetDescription>
                业务语义用于快速判断，原始代码与追踪标识保留在技术详情中。
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
                <InspectorRow label="操作者">
                  <BusinessValue
                    primary={auditActorLabel(entry)}
                    secondary={auditActorSecondary(entry)}
                  />
                </InspectorRow>
                <InspectorRow label="平台范围">
                  <BusinessValue
                    primary={auditPlatformLabel(entry)}
                    secondary={auditPlatformSecondary(entry)}
                  />
                </InspectorRow>
                <InspectorRow label="操作对象">
                  <div className="grid gap-2">
                    <BusinessValue
                      primary={auditTargetTypeLabel(entry.target_type)}
                      secondary={entry.target_id}
                    />
                    {targetHref ? (
                      <Link
                        href={targetHref}
                        className="w-fit text-sm text-primary underline-offset-4 hover:underline"
                        data-test="audit-target-link"
                      >
                        打开关联资源
                      </Link>
                    ) : null}
                  </div>
                </InspectorRow>
                <InspectorRow label="发生时间（Asia/Shanghai）">
                  <span className="text-sm text-foreground">
                    {formatAuditDate(entry.created_at)}
                  </span>
                </InspectorRow>
              </dl>
              <TechnicalDetails entry={entry} />
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function InspectorRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="m-0">{children}</dd>
    </div>
  );
}

function AdminAuditPageContent() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionSnapshot = useAdminSessionSnapshot();
  const filters = useMemo(
    () => auditFiltersFromSearchParams(searchParams),
    [searchParams],
  );
  const cursor = searchParams.get('cursor');
  const contextKey = `${JSON.stringify(filters)}\u0000${cursor ?? ''}`;

  const [draftFilters, setDraftFilters] = useState<AuditFilters>(filters);
  const [entries, setEntries] = useState<AdminAuditEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [remoteState, setRemoteState] = useState<
    'loading' | 'success' | 'error' | 'access'
  >('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<ResourceError | null>(null);
  const [refreshError, setRefreshError] = useState<ResourceError | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<AdminAuditEntry | null>(
    null,
  );
  const [platforms, setPlatforms] = useState<PlatformOption[]>([]);
  const [platformsError, setPlatformsError] = useState<ResourceError | null>(
    null,
  );
  const generationRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const lastTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setDraftFilters(filters);
  }, [filters]);

  const loadPlatforms = useCallback(async () => {
    try {
      const response = await adminAuthSession.request(
        '/api/v1/admin/api/v1/platforms?limit=100',
        { cache: 'no-store' },
      );
      const payload = await readApiPayload<PlatformOption[]>(response);
      if (!response.ok || !Array.isArray(payload?.data)) {
        setPlatformsError(resourceError(response, payload, '平台筛选列表'));
        return;
      }
      setPlatforms(payload.data);
      setPlatformsError(null);
    } catch (error) {
      setPlatformsError({
        title: '平台筛选列表读取失败',
        description: sessionErrorMessage(error),
        requestId: null,
        technicalDetail: null,
      });
    }
  }, []);

  useEffect(() => {
    void loadPlatforms();
  }, [loadPlatforms]);

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

      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (filters.q) params.set('q', filters.q);
      if (filters.actor) params.set('actor', filters.actor);
      if (filters.platformId) params.set('platform_id', filters.platformId);
      if (filters.action) params.set('action', filters.action);
      if (filters.targetType) params.set('target_type', filters.targetType);
      if (filters.outcome) params.set('outcome', filters.outcome);
      if (cursor) params.set('cursor', cursor);

      try {
        const response = await adminAuthSession.request(
          `/api/v1/admin/api/v1/audit?${params.toString()}`,
          { cache: 'no-store', signal: controller.signal },
        );
        const payload = (await response
          .json()
          .catch(() => null)) as AuditPayload | null;
        if (
          generation !== generationRef.current ||
          !adminAuthSession.isCurrentEpoch(epoch)
        ) {
          return;
        }
        if (!response.ok) {
          const nextError = resourceError(response, payload, '审计记录');
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
        ) {
          return;
        }
        const nextError: ResourceError = {
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
    [cursor, filters],
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

  const filtered = hasAuditFilters(filters);
  const visibleSummary = useMemo(() => {
    if (remoteState !== 'success') return '';
    if (entries.length) return `当前结果 ${entries.length} 条`;
    return filtered ? '没有符合条件的记录' : '暂无审计记录';
  }, [entries.length, filtered, remoteState]);

  const platformById = useMemo(
    () =>
      new Map(platforms.map((platform) => [platform.platform_id, platform])),
    [platforms],
  );

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = Object.fromEntries(
      Object.entries(draftFilters).map(([key, value]) => [key, value.trim()]),
    ) as AuditFilters;
    router.push(buildAuditUrl(pathname, normalized));
  }

  function clearFilters() {
    setDraftFilters(emptyFilters());
    router.push(pathname);
  }

  function goToNextPage() {
    if (nextCursor) router.push(buildAuditUrl(pathname, filters, nextCursor));
  }

  function closeInspector() {
    setSelectedEntry(null);
    window.requestAnimationFrame(() => lastTriggerRef.current?.focus());
  }

  return (
    <main className="shell wide-shell" data-test="audit-page">
      <AdminPageHeader
        title="全局审计中心"
        description="按操作者、平台范围、对象、业务动作与结果检索管理操作；技术字段保留在详情中。"
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="audit-query-heading">筛选审计事件</h2>
            <p className="text-sm text-muted-foreground">
              筛选由服务端在游标分页前组合执行；应用新筛选会自动清除旧 cursor。
            </p>
          </div>
          {platformsError ? (
            <span className="max-w-md text-xs text-warning-foreground">
              平台选择列表暂不可用；仍可通过关键词或已有 URL 平台条件查询。
            </span>
          ) : platforms.length >= 100 ? (
            <span className="max-w-md text-xs text-muted-foreground">
              平台选择器当前为有界目录（最多 100 条），不把它视为全量平台集合。
            </span>
          ) : null}
        </div>

        <form className="grid gap-3" onSubmit={submitFilters}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <label className="grid gap-1 text-sm" htmlFor="audit-query">
              <span>关键词</span>
              <Input
                id="audit-query"
                type="search"
                value={draftFilters.q}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    q: event.target.value,
                  }))
                }
                placeholder="平台、动作、对象 ID、request_id…"
                data-test="audit-query"
              />
            </label>
            <label className="grid gap-1 text-sm" htmlFor="audit-actor">
              <span>操作者</span>
              <Input
                id="audit-actor"
                value={draftFilters.actor}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    actor: event.target.value,
                  }))
                }
                placeholder="姓名、邮箱、主体类型或 UUID"
                data-test="audit-actor-filter"
              />
            </label>
            <label className="grid gap-1 text-sm" htmlFor="audit-platform">
              <span>平台范围</span>
              <select
                id="audit-platform"
                className={selectClassName}
                value={draftFilters.platformId}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    platformId: event.target.value,
                  }))
                }
                data-test="audit-platform-filter"
              >
                <option value="">全部平台 / 全局事件</option>
                {draftFilters.platformId &&
                !platformById.has(draftFilters.platformId) ? (
                  <option value={draftFilters.platformId}>
                    当前 URL 平台筛选
                  </option>
                ) : null}
                {platforms.map((platform) => (
                  <option
                    key={platform.platform_id}
                    value={platform.platform_id}
                  >
                    {platform.name} ({platform.code})
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm" htmlFor="audit-action">
              <span>操作 / 动作</span>
              <select
                id="audit-action"
                className={selectClassName}
                value={draftFilters.action}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    action: event.target.value,
                  }))
                }
                data-test="audit-action-filter"
              >
                <option value="">全部动作</option>
                {draftFilters.action &&
                !AUDIT_ACTION_OPTIONS.some(
                  (option) => option.value === draftFilters.action,
                ) ? (
                  <option value={draftFilters.action}>
                    {draftFilters.action}
                  </option>
                ) : null}
                {AUDIT_ACTION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} · {option.value}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm" htmlFor="audit-target-type">
              <span>对象类型</span>
              <select
                id="audit-target-type"
                className={selectClassName}
                value={draftFilters.targetType}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    targetType: event.target.value,
                  }))
                }
                data-test="audit-target-filter"
              >
                <option value="">全部对象</option>
                {draftFilters.targetType &&
                !AUDIT_TARGET_TYPE_OPTIONS.some(
                  (option) => option.value === draftFilters.targetType,
                ) ? (
                  <option value={draftFilters.targetType}>
                    {draftFilters.targetType}
                  </option>
                ) : null}
                {AUDIT_TARGET_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} · {option.value}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm" htmlFor="audit-outcome">
              <span>结果</span>
              <select
                id="audit-outcome"
                className={selectClassName}
                value={draftFilters.outcome}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    outcome: event.target.value,
                  }))
                }
                data-test="audit-outcome-filter"
              >
                <option value="">全部结果</option>
                {draftFilters.outcome &&
                !AUDIT_OUTCOME_OPTIONS.some(
                  (option) => option.value === draftFilters.outcome,
                ) ? (
                  <option value={draftFilters.outcome}>
                    {draftFilters.outcome}
                  </option>
                ) : null}
                {AUDIT_OUTCOME_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" data-test="audit-query-submit">
              应用筛选
            </Button>
            <Button
              type="button"
              variant="outline"
              data-test="audit-query-clear"
              onClick={clearFilters}
              disabled={!filtered && !hasAuditFilters(draftFilters)}
            >
              清除筛选
            </Button>
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
            data-test={`audit-empty-${filtered ? 'filter' : 'true'}`}
          >
            <EmptyStateHeading>
              {filtered ? '没有符合条件的记录' : '暂无审计记录'}
            </EmptyStateHeading>
            <EmptyStateText>
              {filtered
                ? '请调整操作者、平台、动作、对象、结果或关键词条件。'
                : '当管理操作产生审计事件后，记录会显示在这里。'}
            </EmptyStateText>
            {filtered ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-test="audit-empty-clear"
                onClick={clearFilters}
              >
                清除筛选
              </Button>
            ) : null}
          </EmptyState>
        ) : null}

        {remoteState === 'success' && entries.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <Table data-test="audit-table" className="min-w-[76rem]">
                <TableHeader>
                  <TableRow>
                    <TableHead>操作者</TableHead>
                    <TableHead>平台范围</TableHead>
                    <TableHead>对象</TableHead>
                    <TableHead>操作</TableHead>
                    <TableHead>结果</TableHead>
                    <TableHead>时间</TableHead>
                    <TableHead className="text-right">详情</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry, index) => {
                    const status = auditOutcomeStatus(entry.outcome);
                    const key =
                      entry.id ??
                      entry.request_id ??
                      `${entry.action}-${index}`;
                    return (
                      <TableRow key={key} data-test="audit-row">
                        <TableCell className="max-w-64 whitespace-normal align-top">
                          <BusinessValue
                            primary={auditActorLabel(entry)}
                            secondary={auditActorSecondary(entry)}
                          />
                        </TableCell>
                        <TableCell className="max-w-60 whitespace-normal align-top">
                          <BusinessValue
                            primary={auditPlatformLabel(entry)}
                            secondary={auditPlatformSecondary(entry)}
                          />
                        </TableCell>
                        <TableCell className="max-w-64 whitespace-normal align-top">
                          <BusinessValue
                            primary={auditTargetLabel(entry)}
                            secondary={auditTargetSecondary(entry)}
                          />
                        </TableCell>
                        <TableCell className="max-w-64 whitespace-normal align-top">
                          <BusinessValue
                            primary={auditActionLabel(entry.action)}
                          />
                        </TableCell>
                        <TableCell className="align-top">
                          <StatusBadge
                            label={status.label}
                            tone={status.tone}
                            rawValue={entry.outcome}
                          />
                        </TableCell>
                        <TableCell className="whitespace-normal text-muted-foreground align-top">
                          {formatAuditDate(entry.created_at)}
                        </TableCell>
                        <TableCell className="text-right align-top">
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
            </div>
            <div className="flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm text-muted-foreground">
                {nextCursor
                  ? '还有更多记录；下一页沿用当前服务端筛选。'
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

export function AdminAuditPage() {
  return (
    <Suspense fallback={<AuditPageFallback />}>
      <AdminAuditPageContent />
    </Suspense>
  );
}
