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
  UserRound,
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
import {
  accountStatusLabel,
  accountTone,
  identityTone,
  type GlobalIdentity,
} from './account-types';

type PlatformOption = {
  platform_id: string;
  code: string;
  name: string;
  status: string;
};

function accountsHref(query: string, platformId: string): string {
  const params = new URLSearchParams();
  const committedQuery = query.trim();
  if (committedQuery) params.set('q', committedQuery);
  if (platformId && platformId !== 'all') params.set('platform', platformId);
  const encoded = params.toString();
  return encoded ? `/admin/accounts?${encoded}` : '/admin/accounts';
}

function identityStateLabel(state: string): string {
  return state === 'deleting'
    ? '全局删除中'
    : state === 'active'
      ? '正常'
      : state;
}

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
  const [identities, setIdentities] = useState<GlobalIdentity[]>([]);
  const [accountsState, setAccountsState] =
    useState<ResourceLoadState>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [accountsError, setAccountsError] = useState<ResourceError | null>(
    null,
  );
  const [refreshError, setRefreshError] = useState<ResourceError | null>(null);

  const loadGeneration = useRef(0);

  useEffect(() => {
    setDraftQuery(queryParam);
    setSelectedPlatform(platformParam);
  }, [platformParam, queryParam]);

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
        setPlatformsError(resourceError(response, payload, '平台筛选列表'));
        setPlatformsState('error');
        return;
      }
      setPlatforms(payload.data);
      setPlatformsState('success');
    } catch (caught) {
      setPlatformsError({
        title: '平台筛选列表读取失败',
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

  const loadIdentities = useCallback(
    async (background = false) => {
      const generation = ++loadGeneration.current;
      const epoch = adminAuthSession.getEpoch();
      setRefreshError(null);
      if (background) {
        setRefreshing(true);
      } else {
        setRefreshing(false);
        setAccountsState('loading');
        setAccountsError(null);
      }

      const params = new URLSearchParams({ limit: '50' });
      const committedQuery = queryParam.trim();
      if (committedQuery) params.set('q', committedQuery);
      if (platformParam !== 'all') params.set('platform_id', platformParam);

      try {
        const response = await adminAuthSession.request(
          `/api/v1/admin/api/v1/accounts?${params.toString()}`,
          { cache: 'no-store' },
        );
        const payload = await readApiPayload<GlobalIdentity[]>(response);
        if (
          generation !== loadGeneration.current ||
          !adminAuthSession.isCurrentEpoch(epoch)
        ) {
          return;
        }
        if (!response.ok || !Array.isArray(payload?.data)) {
          const nextError = resourceError(response, payload, '统一身份');
          if (background) {
            setRefreshError(nextError);
          } else {
            setAccountsError(nextError);
            setAccountsState('error');
          }
          return;
        }
        setIdentities(payload.data);
        setAccountsState('success');
      } catch (caught) {
        if (
          generation !== loadGeneration.current ||
          !adminAuthSession.isCurrentEpoch(epoch)
        ) {
          return;
        }
        const nextError: ResourceError = {
          title: '统一身份检索失败',
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
      } finally {
        if (
          background &&
          generation === loadGeneration.current &&
          adminAuthSession.isCurrentEpoch(epoch)
        ) {
          setRefreshing(false);
        }
      }
    },
    [platformParam, queryParam],
  );

  useEffect(() => {
    void loadIdentities(false);
  }, [loadIdentities]);

  function handleSearchSubmit(event: FormEvent) {
    event.preventDefault();
    const nextHref = accountsHref(draftQuery, selectedPlatform);
    const currentHref = accountsHref(queryParam, platformParam);
    if (nextHref === currentHref) {
      void loadIdentities(false);
      return;
    }
    router.replace(nextHref);
  }

  function handlePlatformChange(newPlatformId: string) {
    setSelectedPlatform(newPlatformId);
    router.replace(accountsHref(queryParam, newPlatformId));
  }

  const linkedAccountCount = useMemo(
    () =>
      identities.reduce(
        (total, identity) => total + identity.accounts.length,
        0,
      ),
    [identities],
  );
  const suspendedAccountCount = useMemo(
    () =>
      identities.reduce(
        (total, identity) =>
          total +
          identity.accounts.filter((account) => account.status === 'suspended')
            .length,
        0,
      ),
    [identities],
  );
  const selectedPlatformKnown =
    selectedPlatform === 'all' ||
    platforms.some((platform) => platform.platform_id === selectedPlatform);

  return (
    <main className="shell wide-shell" data-test="admin-central-accounts">
      <AdminPageHeader
        title="统一用户与身份透视"
        description="以全局 Auth Identity 为主对象检索用户，并在同一身份下查看跨平台账户关联与状态。"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadIdentities(true)}
            disabled={refreshing || accountsState === 'loading'}
          >
            <RefreshCw
              className={`mr-1.5 h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`}
            />
            {refreshing ? '刷新中…' : '刷新数据'}
          </Button>
        }
      />

      {platformsError ? (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>{platformsError.title}</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>
              {platformsError.description} Identity
              检索仍可继续，平台筛选选项暂不可用。
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadPlatforms()}
            >
              重试平台列表
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {refreshError ? (
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
      ) : null}

      <section className="panel gap-4 p-4">
        <form
          onSubmit={handleSearchSubmit}
          className="flex flex-wrap items-center justify-between gap-4"
        >
          <div className="flex w-full min-w-0 flex-wrap items-center gap-3 sm:w-auto">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Filter className="h-4 w-4" />
              <span>平台范围：</span>
            </div>
            <select
              value={selectedPlatform}
              onChange={(event) => handlePlatformChange(event.target.value)}
              className="h-9 w-full min-w-0 max-w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring sm:w-auto sm:max-w-96"
              data-test="accounts-platform-selector"
              aria-label="统一身份平台范围"
            >
              <option value="all">
                所有平台
                {platformsState === 'success'
                  ? `（筛选器已加载 ${platforms.length} 个）`
                  : ''}
              </option>
              {!selectedPlatformKnown ? (
                <option value={selectedPlatform}>当前 URL 平台筛选</option>
              ) : null}
              {platforms.map((platform) => (
                <option key={platform.platform_id} value={platform.platform_id}>
                  {platform.name} ({platform.code})
                </option>
              ))}
            </select>
          </div>

          <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
            <div className="relative min-w-0 flex-1 sm:flex-none">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="search"
                aria-label="搜索统一身份"
                value={draftQuery}
                onChange={(event) => setDraftQuery(event.target.value)}
                placeholder="搜索邮箱 / Auth UID"
                className="h-9 w-full min-w-0 rounded-md border border-input bg-background pl-8 pr-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring sm:w-80"
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
              Identity：<strong>{identities.length}</strong> 条
            </span>
            <span>
              关联平台账户：<strong>{linkedAccountCount}</strong> 个
            </span>
            {suspendedAccountCount > 0 ? (
              <span>
                已暂停账户：
                <strong className="text-amber-600">
                  {suspendedAccountCount}
                </strong>
              </span>
            ) : null}
          </div>
          <span>
            * Identity 结果最多 50 条；平台筛选器最多加载最近 100 个平台注册项。
          </span>
        </div>
      </section>

      {accountsState === 'loading' ? <AsyncState state="loading" /> : null}
      {accountsState === 'error' && accountsError ? (
        <AsyncState
          state="error"
          title={accountsError.title}
          description={accountsError.description}
          requestId={accountsError.requestId}
          technicalDetail={accountsError.technicalDetail}
          onRetry={() => void loadIdentities(false)}
        />
      ) : null}
      {accountsState === 'success' && identities.length === 0 ? (
        <section
          className="panel gap-2 p-12 text-center"
          data-test="accounts-empty"
        >
          <Users className="mx-auto h-10 w-10 text-muted-foreground" />
          <h3 className="mt-4 text-base font-semibold">未找到匹配的统一身份</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            请尝试更换平台范围，或使用完整/部分邮箱与 Auth UID 检索。
          </p>
        </section>
      ) : null}
      {accountsState === 'success' && identities.length > 0 ? (
        <section className="panel gap-4 p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>全局 Identity</TableHead>
                <TableHead>身份状态</TableHead>
                <TableHead>平台账户关联</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead>最近登录</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {identities.map((identity) => (
                <TableRow key={identity.user_id}>
                  <TableCell className="align-top">
                    <div className="flex items-start gap-2">
                      <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <div className="font-medium">
                          {identity.email ?? '未设置邮箱'}
                        </div>
                        <div className="mt-1">
                          <ResourceId value={identity.user_id} />
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="align-top">
                    <StatusBadge
                      tone={identityTone(identity.identity_state)}
                      label={identityStateLabel(identity.identity_state)}
                    />
                  </TableCell>
                  <TableCell className="min-w-[22rem] align-top">
                    {identity.accounts.length === 0 ? (
                      <span className="text-sm text-muted-foreground">
                        尚无平台账户
                      </span>
                    ) : (
                      <div className="grid gap-2">
                        {identity.accounts.map((account) => (
                          <div
                            key={`${account.platform_id}-${account.platform_account_id}`}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/70 px-3 py-2"
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <Link
                                  href={`/admin/platforms/${account.platform_id}`}
                                  className="font-medium text-primary underline-offset-4 hover:underline"
                                >
                                  {account.platform_name}
                                </Link>
                                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.68rem] text-muted-foreground">
                                  {account.platform_code}
                                </span>
                                <StatusBadge
                                  tone={accountTone(account.status)}
                                  label={accountStatusLabel(account.status)}
                                />
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                Account{' '}
                                <ResourceId
                                  value={account.platform_account_id}
                                />
                              </div>
                            </div>
                            <Link
                              href={`/admin/platforms/${account.platform_id}/accounts?selected=${account.platform_account_id}`}
                              className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
                            >
                              进入账户
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          </div>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="align-top text-xs text-muted-foreground">
                    {formatUtc(identity.created_at)}
                  </TableCell>
                  <TableCell className="align-top text-xs text-muted-foreground">
                    {formatUtc(identity.last_sign_in_at)}
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
