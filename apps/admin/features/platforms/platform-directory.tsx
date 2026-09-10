'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { AsyncState } from '@kit/ui/async-state';
import { Button } from '@kit/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@kit/ui/dialog';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@kit/ui/empty';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { ResourceId } from '@kit/ui/resource-id';
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

import {
  adminAuthSession,
  sessionErrorMessage,
  useAdminSessionSnapshot,
} from '../../app/_lib/auth-session';
import { AdminPageHeader } from '../../components/shell/admin-page-header';
import {
  platformStatus,
  type Platform,
  type PlatformListResponse,
} from '../../components/platform-context/platform-types';

type LoadError = {
  title: string;
  description: string;
  requestId: string | null;
  technicalDetail: string | null;
};

function buildDirectoryUrl(pathname: string, query: string) {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  const suffix = params.toString();
  return suffix ? `${pathname}?${suffix}` : pathname;
}

function responseError(
  response: Response,
  payload: PlatformListResponse | null,
): LoadError {
  const requestId =
    response.headers.get('x-request-id') ?? payload?.request_id ?? null;
  if (response.status === 401) {
    return {
      title: '会话已结束',
      description: '请重新登录后再查看平台目录。',
      requestId,
      technicalDetail: payload?.error?.code ?? 'UNAUTHENTICATED',
    };
  }
  if (response.status === 403) {
    return {
      title: '没有平台目录访问权限',
      description: '请确认当前管理员账号具备平台读取权限。',
      requestId,
      technicalDetail: payload?.error?.code ?? 'FORBIDDEN',
    };
  }
  return {
    title: '暂时无法读取平台目录',
    description:
      payload?.error?.message ||
      '请检查网络或服务状态后重试；本次读取失败不会显示成暂无平台。',
    requestId,
    technicalDetail: payload?.error?.code ?? `HTTP_${response.status}`,
  };
}

function CreatePlatformDialog({
  onCreated,
}: {
  onCreated: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<LoadError | null>(null);

  function reset() {
    setCode('');
    setName('');
    setError(null);
    setPending(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedCode = code.trim();
    const normalizedName = name.trim();
    if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(normalizedCode)) {
      setError({
        title: '请修正平台 Code',
        description:
          'Code 需使用 2–64 位小写字母、数字、短横线或下划线，并以字母或数字开头。',
        requestId: null,
        technicalDetail: null,
      });
      return;
    }
    if (normalizedName.length < 2 || normalizedName.length > 120) {
      setError({
        title: '请修正平台名称',
        description: '平台名称需为 2–120 个字符。',
        requestId: null,
        technicalDetail: null,
      });
      return;
    }

    setPending(true);
    setError(null);
    try {
      const response = await adminAuthSession.request(
        '/api/v1/admin/api/v1/platforms',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: normalizedCode,
            name: normalizedName,
            status: 'active',
            allow_activation: true,
          }),
        },
      );
      const payload = (await response
        .json()
        .catch(() => null)) as PlatformListResponse | null;
      if (!response.ok) {
        setError(responseError(response, payload));
        return;
      }
      await onCreated();
      setOpen(false);
      reset();
    } catch (caught) {
      setError({
        title: '平台创建失败',
        description: sessionErrorMessage(caught),
        requestId: null,
        technicalDetail: null,
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen && !pending) reset();
      }}
    >
      <DialogTrigger
        render={<Button data-test="platform-create-open">创建平台</Button>}
      />
      <DialogContent data-test="platform-create-dialog">
        <DialogHeader>
          <DialogTitle>创建平台</DialogTitle>
          <DialogDescription>
            创建后平台配置仍由服务端策略决定，默认启用激活能力；敏感配置请在平台工作区继续完成。
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid gap-2">
            <Label htmlFor="platform-code">平台 Code</Label>
            <Input
              id="platform-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="例如 pro"
              autoComplete="off"
              data-test="platform-create-code"
              disabled={pending}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="platform-name">平台名称</Label>
            <Input
              id="platform-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如 Aisenhub Pro"
              autoComplete="off"
              data-test="platform-create-name"
              disabled={pending}
            />
          </div>
          {error ? (
            <Alert variant="destructive" data-test="platform-create-error">
              <AlertTitle>{error.title}</AlertTitle>
              <AlertDescription>
                {error.description}
                <SupportErrorId
                  requestId={error.requestId}
                  technicalDetail={error.technicalDetail}
                />
              </AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <DialogClose
              render={
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  data-test="platform-create-cancel"
                />
              }
            >
              取消
            </DialogClose>
            <Button
              type="submit"
              disabled={pending}
              data-test="platform-create-submit"
            >
              {pending ? '创建中…' : '创建平台'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PlatformDirectoryContent() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionSnapshot = useAdminSessionSnapshot();
  const query = searchParams.get('q')?.trim() ?? '';
  const [queryInput, setQueryInput] = useState(query);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [remoteState, setRemoteState] = useState<
    'loading' | 'success' | 'access' | 'error'
  >('loading');
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<LoadError | null>(null);
  const generationRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => setQueryInput(query), [query]);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      const generation = generationRef.current + 1;
      generationRef.current = generation;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const epoch = adminAuthSession.getEpoch();

      if (mode === 'initial') {
        setPlatforms([]);
        setLoadError(null);
        setRefreshError(null);
        setRemoteState('loading');
      } else {
        setRefreshing(true);
        setRefreshError(null);
      }

      try {
        const querySuffix = query ? `&q=${encodeURIComponent(query)}` : '';
        const response = await adminAuthSession.request(
          `/api/v1/admin/api/v1/platforms?limit=100${querySuffix}`,
          { cache: 'no-store', signal: controller.signal },
        );
        const payload = (await response
          .json()
          .catch(() => null)) as PlatformListResponse | null;

        if (
          generation !== generationRef.current ||
          !adminAuthSession.isCurrentEpoch(epoch)
        )
          return;

        if (!response.ok) {
          const nextError = responseError(response, payload);
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

        setPlatforms(Array.isArray(payload?.data) ? payload.data : []);
        setLoadError(null);
        setRefreshError(null);
        setRemoteState('success');
      } catch (caught) {
        if (controller.signal.aborted) return;
        if (
          generation !== generationRef.current ||
          !adminAuthSession.isCurrentEpoch(epoch)
        )
          return;
        const nextError: LoadError = {
          title: '网络暂时不可用',
          description: sessionErrorMessage(caught),
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
    [query],
  );

  useEffect(() => {
    void load('initial');
    return () => controllerRef.current?.abort();
  }, [load]);

  useEffect(() => {
    if (
      sessionSnapshot.resolved &&
      ['unauthenticated', 'expired'].includes(sessionSnapshot.state)
    ) {
      controllerRef.current?.abort();
      generationRef.current += 1;
      setPlatforms([]);
      setLoadError({
        title: '会话已结束',
        description: '请重新登录后再查看平台目录。',
        requestId: null,
        technicalDetail: null,
      });
      setRemoteState('access');
    }
  }, [sessionSnapshot.resolved, sessionSnapshot.state]);

  function submitQuery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(buildDirectoryUrl(pathname, queryInput.trim()));
  }

  function clearQuery() {
    router.push(pathname);
  }

  const visibleSummary =
    remoteState === 'success'
      ? platforms.length
        ? `当前结果 ${platforms.length} 个`
        : query
          ? '没有符合条件的平台'
          : '暂无平台'
      : remoteState === 'loading'
        ? '正在加载平台目录…'
        : '';

  return (
    <main className="shell wide-shell" data-test="platform-directory">
      <AdminPageHeader
        title="平台目录"
        description="从服务端读取平台上下文。打开具体平台后，所有账户、配置和资源操作都沿用 URL 中的 platformId。"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={refreshing || remoteState === 'loading'}
              onClick={() => void load('refresh')}
              data-test="platform-directory-refresh"
            >
              {refreshing ? '刷新中…' : '刷新'}
            </Button>
            <CreatePlatformDialog onCreated={() => load('refresh')} />
          </div>
        }
      />

      <section
        className="panel gap-4"
        aria-labelledby="platform-directory-query"
      >
        <div>
          <h2 id="platform-directory-query">查找平台</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            搜索由 Admin API 执行；本页只传递 API 合同支持的 q 和 limit 参数。
          </p>
        </div>
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={submitQuery}
        >
          <div className="grid min-w-0 flex-1 gap-2">
            <Label htmlFor="platform-directory-search">名称或 Code</Label>
            <Input
              id="platform-directory-search"
              type="search"
              value={queryInput}
              onChange={(event) => setQueryInput(event.target.value)}
              placeholder="例如 pro 或 Aisenhub"
              data-test="platform-directory-search"
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" data-test="platform-directory-search-submit">
              查询
            </Button>
            {query ? (
              <Button
                type="button"
                variant="ghost"
                onClick={clearQuery}
                data-test="platform-directory-search-clear"
              >
                清除
              </Button>
            ) : null}
          </div>
        </form>
      </section>

      {refreshError ? (
        <Alert
          variant="destructive"
          data-test="platform-directory-background-error"
        >
          <AlertTitle>{refreshError.title}</AlertTitle>
          <AlertDescription>
            {refreshError.description}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void load('refresh')}
                data-test="platform-directory-background-retry"
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

      <section
        className="panel gap-4"
        aria-labelledby="platform-directory-list"
      >
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 id="platform-directory-list">平台列表</h2>
            <p
              className="text-sm text-muted-foreground"
              role="status"
              aria-live="polite"
            >
              {visibleSummary}
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            最多读取 100 个平台
          </span>
        </div>

        {remoteState === 'loading' ? <AsyncState state="loading" /> : null}
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
        {remoteState === 'success' && platforms.length === 0 ? (
          <Empty
            className="min-h-64 border-border/70 bg-card"
            data-test="platform-directory-empty"
          >
            <EmptyHeader>
              <EmptyTitle>
                {query ? '没有符合条件的平台' : '暂无平台'}
              </EmptyTitle>
              <EmptyDescription>
                {query
                  ? '请尝试其他名称或 Code，或清除当前搜索条件。'
                  : '创建第一个平台后，它会出现在这个目录中。'}
              </EmptyDescription>
            </EmptyHeader>
            {query ? (
              <Button
                variant="outline"
                onClick={clearQuery}
                data-test="platform-directory-empty-clear"
              >
                清除搜索
              </Button>
            ) : null}
          </Empty>
        ) : null}
        {remoteState === 'success' && platforms.length > 0 ? (
          <Table data-test="platform-directory-table">
            <TableHeader>
              <TableRow>
                <TableHead>平台</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>激活策略</TableHead>
                <TableHead>平台 ID</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {platforms.map((platform) => {
                const status = platformStatus(platform.status);
                const href = `/admin/platforms/${encodeURIComponent(platform.platform_id)}`;
                return (
                  <TableRow
                    key={platform.platform_id}
                    data-test="platform-directory-row"
                  >
                    <TableCell className="min-w-48 whitespace-normal">
                      <Link
                        href={href}
                        className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
                      >
                        {platform.name}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {platform.code}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        label={status.label}
                        tone={status.tone}
                        rawValue={platform.status}
                      />
                    </TableCell>
                    <TableCell>
                      {platform.allow_activation ? '允许激活' : '禁止激活'}
                    </TableCell>
                    <TableCell className="max-w-56">
                      <ResourceId value={platform.platform_id} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        render={<Link href={href} />}
                        data-test="platform-directory-open"
                      >
                        打开工作区
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : null}
      </section>
    </main>
  );
}

function PlatformDirectoryFallback() {
  return (
    <main className="shell wide-shell" data-test="platform-directory-loading">
      <div
        className="grid gap-3"
        aria-busy="true"
        aria-label="正在加载平台目录"
      >
        <div className="h-9 w-48 animate-pulse rounded-md bg-muted" />
        <div className="h-5 w-full max-w-2xl animate-pulse rounded-md bg-muted" />
        <div className="mt-4 h-72 animate-pulse rounded-xl border border-border bg-card" />
      </div>
    </main>
  );
}

export function PlatformDirectory() {
  return (
    <Suspense fallback={<PlatformDirectoryFallback />}>
      <PlatformDirectoryContent />
    </Suspense>
  );
}
