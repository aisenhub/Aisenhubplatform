'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { SessionRetryRequiredError } from '@kit/account-auth-nextjs/browser';
import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { AsyncState } from '@kit/ui/async-state';
import { Button } from '@kit/ui/button';
import { ConfirmActionDialog } from '@kit/ui/confirm-action-dialog';
import { ResourceId } from '@kit/ui/resource-id';
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
import type { MutationState } from '@kit/ui/mutation-state';

import { AdminPageHeader } from '../../components/shell/admin-page-header';
import { AdminRecentMfaPanel } from '../security/admin-recent-mfa-panel';
import { usePlatformContext } from '../../components/platform-context/platform-workspace';
import {
  adminAuthSession,
  sessionErrorMessage,
} from '../../app/_lib/auth-session';
import {
  formatUtc,
  readApiPayload,
  resourceError,
  resourcePath,
  statusLabel,
  statusTone,
  type ResourceError,
  type ResourceLoadState,
} from '../resources/admin-resource-utils';

type Account = {
  platform_account_id: string;
  user_id: string | null;
  status: string;
  activated_at?: string | null;
  suspended_at?: string | null;
  closed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type AccountIntent = {
  accountId: string;
  action: 'suspend' | 'restore' | 'close';
  title: string;
  impact: string;
  reversible: boolean;
};

type DetailState = 'idle' | 'loading' | 'success' | 'error';

export function PlatformAccountsPage() {
  const { platform } = usePlatformContext();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const [draftQuery, setDraftQuery] = useState(query);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [state, setState] = useState<ResourceLoadState>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<ResourceError | null>(null);
  const [refreshError, setRefreshError] = useState<ResourceError | null>(null);
  const [inspectorAccountId, setInspectorAccountId] = useState<string | null>(
    null,
  );
  const [inspectorState, setInspectorState] = useState<DetailState>('idle');
  const [inspectorError, setInspectorError] = useState<ResourceError | null>(
    null,
  );
  const [inspectedAccount, setInspectedAccount] = useState<Account | null>(
    null,
  );
  const [intent, setIntent] = useState<AccountIntent | null>(null);
  const [mutationState, setMutationState] =
    useState<MutationState>('confirm_required');
  const [mutationError, setMutationError] = useState<ResourceError | null>(
    null,
  );
  const loadGeneration = useRef(0);
  const detailGeneration = useRef(0);

  useEffect(() => setDraftQuery(query), [query]);

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
        const search = query.trim()
          ? `?q=${encodeURIComponent(query.trim())}&limit=100`
          : '?limit=100';
        const response = await adminAuthSession.request(
          `${resourcePath(platform.platform_id, '/accounts')}${search}`,
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
          if (background) {
            setRefreshError(nextError);
          } else {
            setError(nextError);
            setState('error');
          }
          return;
        }
        setAccounts(payload.data);
        setState('success');
      } catch (caught) {
        if (caught instanceof SessionRetryRequiredError) {
          const nextError = {
            ...resourceError(
              new Response(null, { status: 401 }),
              null,
              '账户列表',
            ),
            description: sessionErrorMessage(caught),
          };
          if (background) setRefreshError(nextError);
          else {
            setError(nextError);
            setState('error');
          }
        } else {
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
        }
      } finally {
        if (generation === loadGeneration.current) setRefreshing(false);
      }
    },
    [platform.platform_id, query],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  async function openInspector(accountId: string) {
    const generation = ++detailGeneration.current;
    setInspectorAccountId(accountId);
    setInspectorState('loading');
    setInspectorError(null);
    setInspectedAccount(null);
    try {
      const response = await adminAuthSession.request(
        resourcePath(
          platform.platform_id,
          `/accounts/${encodeURIComponent(accountId)}`,
        ),
        { cache: 'no-store' },
      );
      const payload = await readApiPayload<Account>(response);
      if (generation !== detailGeneration.current) return;
      if (!response.ok || !payload?.data) {
        setInspectorError(resourceError(response, payload, '账户详情'));
        setInspectorState('error');
        return;
      }
      setInspectedAccount(payload.data);
      setInspectorState('success');
    } catch (caught) {
      if (generation !== detailGeneration.current) return;
      setInspectorError({
        title: '账户详情读取失败',
        description: sessionErrorMessage(caught),
        requestId: null,
        technicalDetail: null,
      });
      setInspectorState('error');
    }
  }

  function applyQuery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    if (draftQuery.trim()) params.set('q', draftQuery.trim());
    else params.delete('q');
    router.replace(`${pathname}${params.toString() ? `?${params}` : ''}`);
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
          ? '关闭不可逆，并会保留账户审计记录；请确认目标账户 ID。'
          : `服务端会${actionLabel}该账户，最终状态以权威 Account API 返回为准。`,
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
        if (
          payload?.error?.code === 'MFA_REQUIRED' ||
          payload?.error?.code === 'RECENT_MFA_REQUIRED'
        ) {
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
        description:
          response.status === 202
            ? '服务端已接受关闭请求，请刷新后确认最终状态。'
            : '页面正在重新读取账户列表和详情。',
        requestId:
          response.headers.get('x-request-id') ?? payload?.request_id ?? null,
        technicalDetail: null,
      });
      await load(true);
      if (inspectorAccountId === intent.accountId)
        await openInspector(intent.accountId);
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
          '网络在服务端响应前中断，未重新发送请求。请检查当前账户状态后再决定下一步。',
        requestId: null,
        technicalDetail: null,
      });
    }
  }

  async function checkUnknown() {
    await load(true);
    setMutationError({
      title: '账户状态已重新读取',
      description:
        '本次检查没有重新发送原动作；请根据当前状态决定是否需要新的显式操作。',
      requestId: null,
      technicalDetail: null,
    });
  }

  const activeAccount = accounts.find(
    (account) => account.platform_account_id === inspectorAccountId,
  );

  return (
    <section className="grid gap-5" data-test="platform-accounts-page">
      <AdminPageHeader
        title="平台账户"
        description="在当前平台范围内搜索账户、查看权威状态，并从账户详情进入订阅投影。列表不额外发起逐行摘要请求。"
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

      <form className="panel gap-3" onSubmit={applyQuery}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="grid min-w-0 flex-1 gap-2" htmlFor="account-query">
            <span className="text-sm font-medium">搜索账户</span>
            <input
              id="account-query"
              type="search"
              value={draftQuery}
              onChange={(event) => setDraftQuery(event.target.value)}
              placeholder="账户 ID、用户 ID 或状态"
              data-test="accounts-query"
            />
          </label>
          <Button type="submit" data-test="accounts-query-submit">
            应用筛选
          </Button>
          {query ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setDraftQuery('');
                router.replace(pathname);
              }}
              data-test="accounts-query-reset"
            >
              清除
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          当前查询由 Account API 在平台授权边界内执行；URL 保留
          q，便于复制和返回。
        </p>
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
            当前平台和查询条件下没有返回账户。可以清除筛选，或确认账户是否已在此平台激活。
          </p>
        </section>
      ) : null}
      {state === 'success' && accounts.length > 0 ? (
        <section className="panel gap-4" data-test="accounts-table-section">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2>账户目录</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                显示 API 当前返回的 {accounts.length} 条账户记录。
              </p>
            </div>
            {query ? (
              <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                q：{query}
              </span>
            ) : null}
          </div>
          <div
            className="data-table"
            tabIndex={0}
            aria-label="账户列表，可横向滚动"
          >
            <Table className="min-w-[52rem]">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">账户 ID</TableHead>
                  <TableHead scope="col">用户 ID</TableHead>
                  <TableHead scope="col">状态</TableHead>
                  <TableHead scope="col">创建时间</TableHead>
                  <TableHead scope="col" className="text-right">
                    操作
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => {
                  const suspended = account.status === 'suspended';
                  const pending =
                    intent?.accountId === account.platform_account_id &&
                    mutationState === 'pending';
                  return (
                    <TableRow
                      key={account.platform_account_id}
                      data-test={`account-row-${account.platform_account_id}`}
                    >
                      <TableCell>
                        <ResourceId value={account.platform_account_id} />
                      </TableCell>
                      <TableCell>
                        <ResourceId
                          value={account.user_id ?? '匿名账户'}
                          label={account.user_id ? undefined : '匿名账户'}
                        />
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          label={statusLabel(account.status)}
                          tone={statusTone(account.status)}
                          rawValue={account.status}
                        />
                      </TableCell>
                      <TableCell className="text-left text-sm text-muted-foreground">
                        {formatUtc(account.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="flex flex-wrap justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              void openInspector(account.platform_account_id)
                            }
                            data-test={`account-inspect-${account.platform_account_id}`}
                          >
                            查看详情
                          </Button>
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
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={pending}
                            onClick={() => openAction(account, 'close')}
                            data-test={`account-close-${account.platform_account_id}`}
                          >
                            关闭
                          </Button>
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}

      <ResourceInspector
        open={Boolean(inspectorAccountId)}
        onOpenChange={(open) => {
          if (!open) setInspectorAccountId(null);
        }}
        title="账户详情"
        description="详情来自当前平台范围的单条 Account API；未返回的订阅、文件和活动信息不会被页面补造。"
        footer={
          inspectedAccount ? (
            <Button
              variant="outline"
              nativeButton={false}
              render={
                <Link
                  href={`/admin/platforms/${encodeURIComponent(platform.platform_id)}/subscriptions?account=${encodeURIComponent(inspectedAccount.platform_account_id)}`}
                />
              }
              data-test="account-subscription-link"
            >
              查看订阅投影
            </Button>
          ) : null
        }
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
              if (inspectorAccountId) void openInspector(inspectorAccountId);
            }}
          />
        ) : null}
        {inspectorState === 'success' && inspectedAccount ? (
          <>
            <dl className="detail-list text-sm">
              <div>
                <dt>Platform Account ID</dt>
                <dd>
                  <ResourceId value={inspectedAccount.platform_account_id} />
                </dd>
              </div>
              <div>
                <dt>User ID</dt>
                <dd>
                  {inspectedAccount.user_id ? (
                    <ResourceId value={inspectedAccount.user_id} />
                  ) : (
                    '匿名账户'
                  )}
                </dd>
              </div>
              <div>
                <dt>状态</dt>
                <dd>
                  <StatusBadge
                    label={statusLabel(inspectedAccount.status)}
                    tone={statusTone(inspectedAccount.status)}
                    rawValue={inspectedAccount.status}
                  />
                </dd>
              </div>
              <div>
                <dt>激活时间</dt>
                <dd>{formatUtc(inspectedAccount.activated_at)}</dd>
              </div>
              <div>
                <dt>暂停时间</dt>
                <dd>{formatUtc(inspectedAccount.suspended_at)}</dd>
              </div>
              <div>
                <dt>关闭时间</dt>
                <dd>{formatUtc(inspectedAccount.closed_at)}</dd>
              </div>
              <div>
                <dt>创建时间</dt>
                <dd>{formatUtc(inspectedAccount.created_at)}</dd>
              </div>
              <div>
                <dt>更新时间</dt>
                <dd>{formatUtc(inspectedAccount.updated_at)}</dd>
              </div>
            </dl>
            <div className="rounded-lg border border-border/70 bg-muted/30 p-3 text-sm text-muted-foreground">
              文件摘要与活动时间线没有对应的当前 list/detail
              contract，因此本页不展示虚构摘要；文件入口将在后续 Files
              阶段接入。
            </div>
            {activeAccount &&
            activeAccount.status !== inspectedAccount.status ? (
              <Alert>
                <AlertTitle>列表正在更新</AlertTitle>
                <AlertDescription>
                  该账户状态刚发生变化，请关闭并重新打开详情确认权威值。
                </AlertDescription>
              </Alert>
            ) : null}
          </>
        ) : null}
      </ResourceInspector>

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
                onVerified={() => {
                  setMutationState('confirm_required');
                  setMutationError(null);
                }}
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
