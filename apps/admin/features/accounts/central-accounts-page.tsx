'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  ExternalLink,
  Filter,
  RefreshCw,
  Search,
  User,
  Users,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { AsyncState } from '@kit/ui/async-state';
import { Button } from '@kit/ui/button';
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
import { accountStatusLabel, accountTone, type Account } from './account-types';

type PlatformOption = {
  platform_id: string;
  code: string;
  name: string;
  status: string;
};

type AccountRecord = Account & {
  platform_id: string;
  platform_code: string;
  platform_name: string;
};

export function CentralAccountsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryParam = searchParams.get('q') ?? '';
  const platformParam = searchParams.get('platform') ?? 'all';

  const [platforms, setPlatforms] = useState<PlatformOption[]>([]);
  const [platformsState, setPlatformsState] =
    useState<ResourceLoadState>('loading');
  const [platformsError, setPlatformsError] = useState<ResourceError | null>(
    null,
  );

  const [selectedPlatform, setSelectedPlatform] = useState(platformParam);
  const [draftQuery, setDraftQuery] = useState(queryParam);
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [accountsState, setAccountsState] =
    useState<ResourceLoadState>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [accountsError, setAccountsError] = useState<ResourceError | null>(
    null,
  );
  const [refreshError, setRefreshError] = useState<ResourceError | null>(null);

  const loadGeneration = useRef(0);

  // 同步 URL 参数
  useEffect(() => {
    setDraftQuery(queryParam);
    setSelectedPlatform(platformParam);
  }, [platformParam, queryParam]);

  // 1. 加载所有可用平台列表
  const loadPlatforms = useCallback(async () => {
    setPlatformsState('loading');
    setPlatformsError(null);
    try {
      const response = await adminAuthSession.request(
        '/api/v1/admin/api/v1/platforms?limit=100',
        { cache: 'no-store' },
      );
      const payload = await readApiPayload<PlatformOption[]>(response);
      if (!response.ok || !Array.isArray(payload?.data)) {
        setPlatformsError(resourceError(response, payload, '平台列表'));
        setPlatformsState('error');
        return;
      }
      setPlatforms(payload.data);
      setPlatformsState('success');
    } catch (caught) {
      setPlatformsError({
        title: '平台列表读取失败',
        description: sessionErrorMessage(caught),
        requestId: null,
        technicalDetail: null,
      });
      setPlatformsState('error');
    }
  }, []);

  useEffect(() => {
    void loadPlatforms();
  }, [loadPlatforms]);

  // 2. 加载账户数据（按所选单平台或全平台并发拉取）
  const loadAccounts = useCallback(
    async (background = false) => {
      if (platforms.length === 0 && platformsState !== 'success') return;

      const generation = ++loadGeneration.current;
      const epoch = adminAuthSession.getEpoch();
      setRefreshError(null);
      setRefreshing(background);
      if (!background) {
        setAccountsState('loading');
        setAccountsError(null);
      }

      try {
        const targetPlatforms =
          selectedPlatform === 'all'
            ? platforms
            : platforms.filter((p) => p.platform_id === selectedPlatform);

        if (targetPlatforms.length === 0) {
          setAccounts([]);
          setAccountsState('success');
          return;
        }

        const q = draftQuery.trim();
        const search = q ? `?q=${encodeURIComponent(q)}&limit=50` : '?limit=50';

        const results = await Promise.allSettled(
          targetPlatforms.map(async (plat) => {
            const url = `/api/v1/admin/api/v1/platforms/${plat.platform_id}/accounts${search}`;
            const res = await adminAuthSession.request(url, {
              cache: 'no-store',
            });
            const pl = await readApiPayload<Account[]>(res);
            if (!res.ok || !Array.isArray(pl?.data)) {
              throw new Error(
                pl?.error?.message ?? `无法读取平台 ${plat.name} 的账户`,
              );
            }
            return pl.data.map((item) => ({
              ...item,
              platform_id: plat.platform_id,
              platform_code: plat.code,
              platform_name: plat.name,
            }));
          }),
        );

        if (
          generation !== loadGeneration.current ||
          !adminAuthSession.isCurrentEpoch(epoch)
        ) {
          return;
        }

        const aggregated: AccountRecord[] = [];
        let hasError = false;
        let lastErrorMessage = '';

        for (const res of results) {
          if (res.status === 'fulfilled') {
            aggregated.push(...res.value);
          } else {
            hasError = true;
            lastErrorMessage =
              res.reason instanceof Error
                ? res.reason.message
                : String(res.reason);
          }
        }

        setAccounts(aggregated);
        setAccountsState('success');

        if (hasError && aggregated.length === 0) {
          const nextError: ResourceError = {
            title: '账户列表读取受阻',
            description: lastErrorMessage || '未能成功获取任何平台的账户数据',
            requestId: null,
            technicalDetail: null,
          };
          if (background) {
            setRefreshError(nextError);
          } else {
            setAccountsError(nextError);
            setAccountsState('error');
          }
        }
      } catch (caught) {
        if (
          generation !== loadGeneration.current ||
          !adminAuthSession.isCurrentEpoch(epoch)
        ) {
          return;
        }
        const nextError: ResourceError = {
          title: '统一账户检索失败',
          description: sessionErrorMessage(caught),
          requestId: null,
          technicalDetail: null,
        };
        if (background) {
          setRefreshError(nextError);
        } else {
          setAccountsError(nextError);
          setAccountsState('error');
        }
      }
    },
    [draftQuery, platforms, platformsState, selectedPlatform],
  );

  useEffect(() => {
    if (platforms.length > 0) {
      void loadAccounts(false);
    }
  }, [loadAccounts, platforms.length]);

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (draftQuery.trim()) params.set('q', draftQuery.trim());
    if (selectedPlatform && selectedPlatform !== 'all')
      params.set('platform', selectedPlatform);
    router.replace(`/admin/accounts?${params.toString()}`);
    void loadAccounts(false);
  };

  const handlePlatformChange = (newPlatformId: string) => {
    setSelectedPlatform(newPlatformId);
    const params = new URLSearchParams();
    if (draftQuery.trim()) params.set('q', draftQuery.trim());
    if (newPlatformId !== 'all') params.set('platform', newPlatformId);
    router.replace(`/admin/accounts?${params.toString()}`);
  };

  const activeAccountsCount = useMemo(
    () => accounts.filter((a) => a.status === 'active').length,
    [accounts],
  );
  const suspendedAccountsCount = useMemo(
    () => accounts.filter((a) => a.status === 'suspended').length,
    [accounts],
  );

  return (
    <main className="shell wide-shell" data-test="admin-central-accounts">
      <AdminPageHeader
        title="统一用户与身份透视"
        description="跨平台检索用户账户，透视 Auth UID 分布与状态治理，并直接下钻至单平台工作区。"
        actions={
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadAccounts(true)}
              disabled={refreshing || accountsState === 'loading'}
            >
              <RefreshCw
                className={`mr-1.5 h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`}
              />
              {refreshing ? '刷新中…' : '刷新数据'}
            </Button>
          </div>
        }
      />

      {platformsError && (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>{platformsError.title}</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>{platformsError.description}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadPlatforms()}
            >
              重试加载平台
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {refreshError && (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>{refreshError.title}</AlertTitle>
          <AlertDescription>
            {refreshError.description}
            <SupportErrorId
              requestId={refreshError.requestId}
              technicalDetail={refreshError.technicalDetail}
            />
          </AlertDescription>
        </Alert>
      )}

      {/* 筛选与搜索工作栏 */}
      <section className="panel gap-4 p-4">
        <form
          onSubmit={handleSearchSubmit}
          className="flex flex-wrap items-center justify-between gap-4"
        >
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Filter className="h-4 w-4" />
              <span>平台范围：</span>
            </div>
            <select
              value={selectedPlatform}
              onChange={(e) => handlePlatformChange(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              data-test="accounts-platform-selector"
            >
              <option value="all">
                所有平台（{platforms.length} 个已注册平台）
              </option>
              {platforms.map((p) => (
                <option key={p.platform_id} value={p.platform_id}>
                  {p.name} ({p.code})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="search"
                value={draftQuery}
                onChange={(e) => setDraftQuery(e.target.value)}
                placeholder="搜索 User ID / 邮箱 / 状态…"
                className="h-9 w-64 rounded-md border border-input bg-background pl-8 pr-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring sm:w-80"
                data-test="accounts-search-input"
              />
            </div>
            <Button type="submit" size="sm" variant="secondary">
              检索
            </Button>
          </div>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <span>
              已加载账户：<strong>{accounts.length}</strong> 条
            </span>
            <span>
              正常活跃：
              <strong className="text-emerald-600">
                {activeAccountsCount}
              </strong>
            </span>
            {suspendedAccountsCount > 0 && (
              <span>
                异常暂停：
                <strong className="text-amber-600">
                  {suspendedAccountsCount}
                </strong>
              </span>
            )}
          </div>
          <div>
            <span>
              * 检索受后端权威平台范围限制，每平台展示最近窗口最多 50 条记录。
            </span>
          </div>
        </div>
      </section>

      {/* 结果表格 */}
      {accountsState === 'loading' ? <AsyncState state="loading" /> : null}
      {accountsState === 'error' && accountsError ? (
        <AsyncState
          state="error"
          title={accountsError.title}
          description={accountsError.description}
          requestId={accountsError.requestId}
          technicalDetail={accountsError.technicalDetail}
          onRetry={() => void loadAccounts(false)}
        />
      ) : null}
      {accountsState === 'success' && accounts.length === 0 ? (
        <section
          className="panel gap-2 p-12 text-center"
          data-test="accounts-empty"
        >
          <Users className="mx-auto h-10 w-10 text-muted-foreground" />
          <h3 className="mt-4 text-base font-semibold">未找到匹配的账户</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            请尝试更换平台范围或调整搜索关键字。
          </p>
        </section>
      ) : null}
      {accountsState === 'success' && accounts.length > 0 ? (
        <section className="panel gap-4 p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>所属平台</TableHead>
                <TableHead>Platform Account ID</TableHead>
                <TableHead>Auth User ID</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>激活时间</TableHead>
                <TableHead>最后更新</TableHead>
                <TableHead className="text-right">操作直通</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((acc) => (
                <TableRow key={`${acc.platform_id}-${acc.platform_account_id}`}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/admin/platforms/${acc.platform_id}`}
                        className="font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {acc.platform_name}
                      </Link>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        {acc.platform_code}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <ResourceId value={acc.platform_account_id} />
                  </TableCell>
                  <TableCell>
                    {acc.user_id ? (
                      <div className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                        <ResourceId value={acc.user_id} />
                      </div>
                    ) : (
                      <span className="text-muted-foreground">未关联</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      tone={accountTone(acc.status)}
                      label={accountStatusLabel(acc.status)}
                    />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatUtc(acc.activated_at ?? acc.created_at)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatUtc(acc.updated_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/admin/platforms/${acc.platform_id}/accounts?selected=${acc.platform_account_id}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
                    >
                      进入平台工作区
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : null}
    </main>
  );
}
