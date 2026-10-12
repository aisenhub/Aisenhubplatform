'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { SessionRetryRequiredError } from '../../app/_lib/auth/browser';
import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { AsyncState } from '@kit/ui/async-state';
import { Button } from '@kit/ui/button';
import { ConfirmActionDialog } from '@kit/ui/confirm-action-dialog';
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
import type { MutationState } from '@kit/ui/mutation-state';

import { AdminPageHeader } from '../../components/shell/admin-page-header';
import { usePlatformContext } from '../../components/platform-context/platform-workspace';
import { AdminRecentMfaPanel } from '../security/admin-recent-mfa-panel';
import {
  adminAuthSession,
  sessionErrorMessage,
} from '../../app/_lib/auth-session';
import {
  formatUtc,
  isRecentMfaRequired,
  readApiPayload,
  resourceError,
  resourcePath,
  statusLabel,
  statusTone,
  type ResourceError,
  type ResourceLoadState,
} from '../resources/admin-resource-utils';

import {
  accountFiltersFromSearchParams,
  accountListApiSearchParams,
  accountListUrlSearchParams,
  type AccountListFilters,
} from './account-workbench-model';
import { type Account, type AccountIntent } from './account-types';

const PAGE_SIZE = 20;
const selectClassName =
  'h-10 min-w-0 rounded-md border border-input bg-background px-3 text-sm';

type PlanOption = {
  plan_id: string;
  code: string;
  name: string;
  status: string;
};

function accountInitial(account: Account): string {
  const source =
    account.display_name?.trim() ||
    account.user_id ||
    account.platform_account_id;
  return source.slice(0, 1).toUpperCase();
}

function planLabel(account: Account): string {
  if (!account.plan_name && !account.plan_code) return '无有效方案';
  return account.plan_name || account.plan_code || '未知方案';
}

function tagsLabel(tags: string[] | undefined): string {
  return tags?.length ? tags.join(' · ') : '无标签';
}

export function PlatformAccountsPage() {
  const { platform } = usePlatformContext();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryKey = searchParams.toString();
  const filters = useMemo(
    () => accountFiltersFromSearchParams(new URLSearchParams(queryKey)),
    [queryKey],
  );
  const [draft, setDraft] = useState<AccountListFilters>(filters);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [state, setState] = useState<ResourceLoadState>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<ResourceError | null>(null);
  const [refreshError, setRefreshError] = useState<ResourceError | null>(null);
  const [intent, setIntent] = useState<AccountIntent | null>(null);
  const [mutationState, setMutationState] =
    useState<MutationState>('confirm_required');
  const [mutationError, setMutationError] = useState<ResourceError | null>(
    null,
  );
  const loadGeneration = useRef(0);

  useEffect(() => setDraft(filters), [filters]);

  const loadPlans = useCallback(async () => {
    try {
      const response = await adminAuthSession.request(
        resourcePath(platform.platform_id, '/plans'),
        { cache: 'no-store' },
      );
      const payload = await readApiPayload<PlanOption[]>(response);
      if (response.ok && Array.isArray(payload?.data)) setPlans(payload.data);
    } catch {
      setPlans([]);
    }
  }, [platform.platform_id]);

  const load = useCallback(
    async (background = false) => {
      const generation = ++loadGeneration.current;
      const epoch = adminAuthSession.getEpoch();
      setRefreshError(null);
      setRefreshing(background);
      if (!background) {
        setState('loading');
        setError(null);
      }
      try {
        const params = accountListApiSearchParams(filters, PAGE_SIZE);
        const response = await adminAuthSession.request(
          `${resourcePath(platform.platform_id, '/accounts')}?${params.toString()}`,
          { cache: 'no-store' },
        );
        const payload = await readApiPayload<Account[]>(response);
        if (
          generation !== loadGeneration.current ||
          !adminAuthSession.isCurrentEpoch(epoch)
        )
          return;
        if (!response.ok || !Array.isArray(payload?.data)) {
          const nextError = resourceError(response, payload, '账户列表');
          if (background) setRefreshError(nextError);
          else {
            setError(nextError);
            setState('error');
          }
          return;
        }
        setAccounts(payload.data);
        setNextCursor(payload.next_cursor ?? null);
        setState('success');
      } catch (caught) {
        if (
          generation !== loadGeneration.current ||
          !adminAuthSession.isCurrentEpoch(epoch)
        )
          return;
        const nextError: ResourceError = {
          title: '账户列表读取失败',
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
        if (generation === loadGeneration.current) setRefreshing(false);
      }
    },
    [filters, platform.platform_id],
  );

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  useEffect(() => {
    void load(false);
  }, [load]);

  function setDraftField(field: keyof AccountListFilters, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = accountListUrlSearchParams({ ...draft, cursor: '' }, null);
    router.replace(`${pathname}${params.size ? `?${params.toString()}` : ''}`);
  }

  function goToCursor(cursor: string | null) {
    const params = accountListUrlSearchParams(filters, cursor);
    router.replace(`${pathname}${params.size ? `?${params.toString()}` : ''}`);
  }

  function openAction(account: Account, action: AccountIntent['action']) {
    const actionLabel =
      action === 'suspend' ? '暂停' : action === 'restore' ? '恢复' : '关闭';
    setMutationError(null);
    setMutationState('confirm_required');
    setIntent({
      accountId: account.platform_account_id,
      action,
      title: `${actionLabel}平台账户`,
      impact:
        action === 'close'
          ? '关闭不可逆；支持记录会保留，Global Identity 隐私删除仍由统一用户生命周期单独处理。'
          : `服务端会${actionLabel}该 Platform Account，并把原因写入权威治理时间线。`,
      reversible: action !== 'close',
    });
  }

  async function executeAction(reason: string) {
    if (!intent) return;
    setMutationState('pending');
    setMutationError(null);
    try {
      const response = await adminAuthSession.request(
        resourcePath(
          platform.platform_id,
          `/accounts/${encodeURIComponent(intent.accountId)}/${intent.action}`,
        ),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason }),
        },
        { replay: 'never' },
      );
      const payload = await readApiPayload<Account>(response);
      if (!response.ok) {
        if (isRecentMfaRequired(response, payload)) {
          setMutationState('step_up_required');
          return;
        }
        setMutationState('failure');
        setMutationError(resourceError(response, payload, '账户动作'));
        return;
      }
      setMutationState(response.status === 202 ? 'accepted' : 'success');
      setMutationError({
        title: response.status === 202 ? '请求已受理' : '账户状态已更新',
        description: '页面正在重新读取权威账户列表。',
        requestId:
          response.headers.get('x-request-id') ?? payload?.request_id ?? null,
        technicalDetail: null,
      });
      await load(true);
      setIntent(null);
    } catch (caught) {
      if (caught instanceof SessionRetryRequiredError) {
        setMutationState('failure');
        setMutationError({
          title: '会话已恢复，请重新提交',
          description: '本次账户动作没有自动重放，请重新核对目标后显式提交。',
          requestId: null,
          technicalDetail: null,
        });
        return;
      }
      setMutationState('unknown_outcome');
      setMutationError({
        title: '账户动作结果待确认',
        description:
          '网络在服务端响应前中断，原动作没有自动重放。请刷新权威列表确认当前状态。',
        requestId: null,
        technicalDetail: null,
      });
    }
  }

  async function checkUnknown() {
    await load(true);
    setMutationError({
      title: '账户状态已重新读取',
      description: '本次检查没有重新发送原动作。',
      requestId: null,
      technicalDetail: null,
    });
  }

  return (
    <section className="grid gap-5" data-test="platform-accounts-page">
      <AdminPageHeader
        title="账户"
        description="按平台事实筛选 Platform Account，查看 Profile、Plan、标签与加入时间，并进入 Account 360。"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load(true)}
            disabled={refreshing}
            data-test="accounts-refresh"
          >
            {refreshing ? '刷新中…' : '刷新'}
          </Button>
        }
      />

      <form
        className="panel grid gap-3 md:grid-cols-2 xl:grid-cols-4"
        onSubmit={applyFilters}
        role="search"
        data-test="accounts-filters"
      >
        <div className="grid gap-1 xl:col-span-2">
          <Label htmlFor="account-query">搜索</Label>
          <Input
            id="account-query"
            type="search"
            maxLength={128}
            value={draft.q}
            onChange={(event) => setDraftField('q', event.target.value)}
            placeholder="Account / User ID、显示名称、Plan 名称或代码"
            data-test="accounts-query"
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="account-status">账户状态</Label>
          <select
            id="account-status"
            className={selectClassName}
            value={draft.status}
            onChange={(event) => setDraftField('status', event.target.value)}
            data-test="accounts-status-filter"
          >
            <option value="">全部</option>
            <option value="active">正常</option>
            <option value="suspended">已暂停</option>
            <option value="closed">已关闭</option>
          </select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="account-plan">当前 Plan</Label>
          <select
            id="account-plan"
            className={selectClassName}
            value={draft.planId}
            onChange={(event) => setDraftField('planId', event.target.value)}
            data-test="accounts-plan-filter"
          >
            <option value="">全部方案</option>
            {plans.map((plan) => (
              <option key={plan.plan_id} value={plan.plan_id}>
                {plan.name} · {plan.code}
                {plan.status === 'archived' ? '（已归档）' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="account-subscription-status">订阅状态</Label>
          <select
            id="account-subscription-status"
            className={selectClassName}
            value={draft.subscriptionStatus}
            onChange={(event) =>
              setDraftField('subscriptionStatus', event.target.value)
            }
            data-test="accounts-subscription-filter"
          >
            <option value="">全部</option>
            <option value="active">active</option>
            <option value="suspended">suspended</option>
            <option value="none">无订阅</option>
          </select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="account-tag">管理员标签</Label>
          <Input
            id="account-tag"
            maxLength={32}
            value={draft.tag}
            onChange={(event) => setDraftField('tag', event.target.value)}
            placeholder="例如 vip"
            data-test="accounts-tag-filter"
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="account-joined-from">加入日期起</Label>
          <Input
            id="account-joined-from"
            type="date"
            value={draft.joinedFrom}
            onChange={(event) =>
              setDraftField('joinedFrom', event.target.value)
            }
            data-test="accounts-joined-from"
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="account-joined-to">加入日期止</Label>
          <Input
            id="account-joined-to"
            type="date"
            value={draft.joinedTo}
            onChange={(event) => setDraftField('joinedTo', event.target.value)}
            data-test="accounts-joined-to"
          />
        </div>
        <div className="flex flex-wrap items-end gap-2 md:col-span-2 xl:col-span-4">
          <Button type="submit" data-test="accounts-query-submit">
            应用筛选
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.replace(pathname)}
            data-test="accounts-query-reset"
          >
            清除
          </Button>
          <span className="text-xs text-muted-foreground">
            每页 {PAGE_SIZE} 条；筛选在服务端 cursor 分页前执行。
          </span>
        </div>
      </form>

      {refreshError ? (
        <Alert variant="destructive" data-test="accounts-refresh-error">
          <AlertTitle>刷新失败，仍保留已知数据</AlertTitle>
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
      {state === 'success' && accounts.length === 0 ? (
        <section className="panel gap-2" data-test="accounts-empty">
          <h2>没有匹配的账户</h2>
          <p className="text-sm text-muted-foreground">
            当前平台和筛选条件下没有返回 Platform Account。
          </p>
        </section>
      ) : null}
      {state === 'success' && accounts.length > 0 ? (
        <section
          className="admin-resource-surface grid gap-3"
          data-test="accounts-table-section"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2>账户目录</h2>
              <p
                className="mt-1 text-sm text-muted-foreground"
                role="status"
                aria-live="polite"
              >
                当前页 {accounts.length} 条
              </p>
            </div>
          </div>
          <div
            className="data-table"
            tabIndex={0}
            role="region"
            aria-label="平台账户列表，可横向滚动"
            aria-describedby="account-table-scroll-hint"
          >
            <Table className="min-w-[68rem]" data-test="accounts-table">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">用户</TableHead>
                  <TableHead scope="col">状态</TableHead>
                  <TableHead scope="col">当前方案</TableHead>
                  <TableHead scope="col">管理员标签</TableHead>
                  <TableHead scope="col">加入时间</TableHead>
                  <TableHead scope="col" className="text-right">
                    操作
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => {
                  const suspended = account.status === 'suspended';
                  const closed = account.status === 'closed';
                  const pending =
                    intent?.accountId === account.platform_account_id &&
                    mutationState === 'pending';
                  return (
                    <TableRow
                      key={account.platform_account_id}
                      data-test={`account-row-${account.platform_account_id}`}
                    >
                      <TableCell className="min-w-[20rem] whitespace-normal">
                        <div className="flex items-start gap-3">
                          <div
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-muted text-sm font-semibold"
                            aria-label={
                              account.avatar_url
                                ? '用户已配置头像'
                                : '用户未配置头像'
                            }
                            title={
                              account.avatar_url
                                ? '为避免 Admin 页面向第三方头像地址发起请求，此处使用安全占位头像。'
                                : undefined
                            }
                          >
                            {accountInitial(account)}
                          </div>
                          <div className="min-w-0">
                            <strong className="block truncate text-sm">
                              {account.display_name?.trim() || '未设置显示名称'}
                            </strong>
                            <ResourceId value={account.platform_account_id} />
                            <span className="mt-1 block text-xs text-muted-foreground">
                              {account.user_id
                                ? `User · ${account.user_id}`
                                : '匿名账户'}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          label={statusLabel(account.status)}
                          tone={statusTone(account.status)}
                          rawValue={account.status}
                        />
                      </TableCell>
                      <TableCell className="min-w-44 whitespace-normal">
                        <span className="block text-sm font-medium">
                          {planLabel(account)}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {account.subscription_status ?? 'none'}
                          {account.current_period_end
                            ? ` · 至 ${formatUtc(account.current_period_end)}`
                            : ''}
                        </span>
                      </TableCell>
                      <TableCell className="min-w-44 whitespace-normal text-xs text-muted-foreground">
                        {tagsLabel(account.tags)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatUtc(account.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="flex flex-wrap justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            nativeButton={false}
                            render={
                              <Link
                                href={`/admin/platforms/${encodeURIComponent(platform.platform_id)}/accounts/${encodeURIComponent(account.platform_account_id)}`}
                              />
                            }
                            data-test={`account-detail-${account.platform_account_id}`}
                          >
                            Account 360
                          </Button>
                          {!closed ? (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={pending}
                              onClick={() =>
                                openAction(
                                  account,
                                  suspended ? 'restore' : 'suspend',
                                )
                              }
                              data-test={`account-toggle-${account.platform_account_id}`}
                            >
                              {suspended ? '恢复' : '暂停'}
                            </Button>
                          ) : null}
                          {!closed ? (
                            <Button
                              variant="ghost"
                              className="text-destructive"
                              size="sm"
                              disabled={pending}
                              onClick={() => openAction(account, 'close')}
                              data-test={`account-close-${account.platform_account_id}`}
                            >
                              关闭
                            </Button>
                          ) : null}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <p
            id="account-table-scroll-hint"
            className="text-xs text-muted-foreground xl:hidden"
          >
            左右滑动查看全部列，或聚焦表格后使用方向键。
          </p>
          <div className="flex justify-end gap-2">
            {filters.cursor ? (
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
                data-test="accounts-next-page"
              >
                下一页
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}

      {intent ? (
        <ConfirmActionDialog
          open
          onOpenChange={(open) => {
            if (!open && mutationState !== 'pending') {
              setIntent(null);
              setMutationState('confirm_required');
            }
          }}
          title={intent.title}
          targetIdentity={intent.accountId}
          impact={intent.impact}
          reversible={intent.reversible}
          reasonRequired
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
            mutationState === 'unknown_outcome' ? checkUnknown : undefined
          }
          onConfirm={executeAction}
        />
      ) : null}
    </section>
  );
}
