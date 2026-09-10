'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { SessionRetryRequiredError } from '@kit/account-auth-nextjs/browser';
import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { AsyncState } from '@kit/ui/async-state';
import { Button } from '@kit/ui/button';
import { ConfirmActionDialog } from '@kit/ui/confirm-action-dialog';
import { Input } from '@kit/ui/input';
import type { MutationState } from '@kit/ui/mutation-state';
import { ResourceId } from '@kit/ui/resource-id';
import { StatusBadge } from '@kit/ui/status-badge';
import { SupportErrorId } from '@kit/ui/support-error-id';

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
  subscriptionsPath,
  type ResourceError,
  type ResourceLoadState,
} from '../resources/admin-resource-utils';

type AccountSummary = {
  platform_account_id: string;
  user_id: string | null;
  status: string;
};

type Plan = {
  plan_id: string;
  code: string;
  name: string;
  kind: 'free' | 'paid';
  status: 'active' | 'archived';
};

type Subscription = {
  platform_account_id: string;
  subscription_id: string;
  status: string;
  plan_id: string | null;
  plan_code: string | null;
  plan_name: string | null;
  features?: Record<string, unknown>;
  started_at: string | null;
  current_period_end: string | null;
  next_transition_at: string | null;
  last_event_sequence: number;
};

type CommandAction = 'pause' | 'resume' | 'grant' | 'revoke' | 'correct';

type CommandPayload = {
  action: CommandAction;
  operation_id: string;
  plan_id?: string;
  duration_value?: number;
  duration_unit?: 'day' | 'month' | 'year';
  grant_id?: string;
};

type CommandIntent = {
  payload: CommandPayload;
  targetId: string;
  title: string;
  impact: string;
};

export function PlatformSubscriptionPage() {
  const { platform } = usePlatformContext();
  const [accountId, setAccountId] = useState('');
  const [accountQuery, setAccountQuery] = useState('');
  const [accountCandidates, setAccountCandidates] = useState<AccountSummary[]>(
    [],
  );
  const [searchingAccounts, setSearchingAccounts] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [state, setState] = useState<ResourceLoadState>('success');
  const [error, setError] = useState<ResourceError | null>(null);
  const [refreshError, setRefreshError] = useState<ResourceError | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [command, setCommand] = useState<CommandAction>('pause');
  const [commandPlanId, setCommandPlanId] = useState('');
  const [commandDuration, setCommandDuration] = useState('30');
  const [commandDurationUnit, setCommandDurationUnit] = useState<
    'day' | 'month' | 'year'
  >('day');
  const [commandGrantId, setCommandGrantId] = useState('');
  const [intent, setIntent] = useState<CommandIntent | null>(null);
  const [mutationState, setMutationState] =
    useState<MutationState>('confirm_required');
  const [mutationError, setMutationError] = useState<ResourceError | null>(
    null,
  );
  const plansGeneration = useRef(0);
  const accountSearchGeneration = useRef(0);
  const subscriptionGeneration = useRef(0);

  const loadPlans = useCallback(async () => {
    const generation = ++plansGeneration.current;
    const epoch = adminAuthSession.getEpoch();
    try {
      const response = await adminAuthSession.request(
        resourcePath(platform.platform_id, '/plans'),
        { cache: 'no-store' },
      );
      const payload = await readApiPayload<Plan[]>(response);
      if (
        generation !== plansGeneration.current ||
        !adminAuthSession.isCurrentEpoch(epoch)
      )
        return;
      if (response.ok && Array.isArray(payload?.data)) {
        setPlans(payload.data);
        setCommandPlanId(
          (current) => current || payload.data?.[0]?.plan_id || '',
        );
      }
    } catch {
      // Plan selection is optional for read-only subscription inspection. The
      // command form will surface the server's validation if it is required.
    }
  }, [platform.platform_id]);

  const loadSubscription = useCallback(
    async (background = false) => {
      const generation = ++subscriptionGeneration.current;
      const epoch = adminAuthSession.getEpoch();
      if (!accountId.trim()) return;
      setRefreshError(null);
      setRefreshing(background);
      if (!background) {
        setState('loading');
        setError(null);
      }
      try {
        const response = await adminAuthSession.request(
          subscriptionsPath(platform.platform_id, accountId.trim()),
          { cache: 'no-store' },
        );
        const payload = await readApiPayload<Subscription>(response);
        if (
          generation !== subscriptionGeneration.current ||
          !adminAuthSession.isCurrentEpoch(epoch)
        )
          return;
        if (!response.ok || !payload?.data) {
          const nextError = resourceError(response, payload, '订阅投影');
          if (background) setRefreshError(nextError);
          else {
            setError(nextError);
            setState('error');
          }
          return;
        }
        setSubscription(payload.data);
        setState('success');
      } catch (caught) {
        if (
          generation !== subscriptionGeneration.current ||
          !adminAuthSession.isCurrentEpoch(epoch)
        )
          return;
        const nextError: ResourceError = {
          title: '订阅投影读取失败',
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
        if (generation === subscriptionGeneration.current) setRefreshing(false);
      }
    },
    [accountId, platform.platform_id],
  );

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  useEffect(() => {
    const initialAccount = new URLSearchParams(window.location.search).get(
      'account',
    );
    if (initialAccount) setAccountId(initialAccount);
  }, []);

  useEffect(() => {
    if (accountId) void loadSubscription(false);
  }, [accountId, loadSubscription]);

  async function searchAccounts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const generation = ++accountSearchGeneration.current;
    const epoch = adminAuthSession.getEpoch();
    const query = accountQuery.trim();
    if (!query) {
      setAccountCandidates([]);
      return;
    }
    setSearchingAccounts(true);
    try {
      const response = await adminAuthSession.request(
        `${resourcePath(platform.platform_id, '/accounts')}?q=${encodeURIComponent(query)}&limit=10`,
        { cache: 'no-store' },
      );
      const payload = await readApiPayload<AccountSummary[]>(response);
      if (
        generation !== accountSearchGeneration.current ||
        !adminAuthSession.isCurrentEpoch(epoch)
      )
        return;
      if (!response.ok || !Array.isArray(payload?.data)) {
        setAccountCandidates([]);
        setError(resourceError(response, payload, '账户搜索'));
        return;
      }
      setAccountCandidates(payload.data);
    } catch (caught) {
      if (generation !== accountSearchGeneration.current) return;
      setError({
        title: '账户搜索失败',
        description: sessionErrorMessage(caught),
        requestId: null,
        technicalDetail: null,
      });
    } finally {
      if (generation === accountSearchGeneration.current)
        setSearchingAccounts(false);
    }
  }

  function selectAccount(nextAccountId: string) {
    setAccountId(nextAccountId);
    setAccountCandidates([]);
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}?account=${encodeURIComponent(nextAccountId)}`,
    );
  }

  function openCommand() {
    if (!accountId.trim()) return;
    const operationId = crypto.randomUUID();
    const payload: CommandPayload = {
      action: command,
      operation_id: operationId,
    };
    if (command === 'grant' || command === 'correct') {
      payload.plan_id = commandPlanId || undefined;
      payload.duration_value = Number(commandDuration);
      payload.duration_unit = commandDurationUnit;
    }
    if (command === 'revoke' || command === 'correct') {
      payload.grant_id = commandGrantId.trim() || undefined;
    }
    const labels: Record<CommandAction, string> = {
      pause: '暂停订阅访问',
      resume: '恢复订阅访问',
      grant: '授予 Plan 权益',
      revoke: '撤销 Grant',
      correct: '修正订阅权益',
    };
    setMutationState('confirm_required');
    setMutationError(null);
    setIntent({
      payload,
      targetId: accountId.trim(),
      title: labels[command],
      impact:
        command === 'pause'
          ? '暂停只改变访问状态，不冻结权益时钟；恢复和最终有效期以服务端投影为准。'
          : command === 'resume'
            ? '恢复会移除暂停状态，已过期权益不会被自动补时。'
            : '订阅 Grant/修正会写入不可变事件并保留审计原因，不能直接编辑 Projection。',
    });
  }

  async function executeCommand(reason: string) {
    if (!intent) return;
    setMutationState('pending');
    setMutationError(null);
    try {
      const response = await adminAuthSession.request(
        `/api/v1/admin/api/v1/subscriptions/${encodeURIComponent(intent.targetId)}/commands?platform_id=${encodeURIComponent(platform.platform_id)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...intent.payload, reason }),
        },
        { replay: 'never' },
      );
      const payload = await readApiPayload<unknown>(response);
      if (!response.ok) {
        if (
          payload?.error?.code === 'MFA_REQUIRED' ||
          payload?.error?.code === 'RECENT_MFA_REQUIRED'
        ) {
          setMutationState('step_up_required');
          return;
        }
        if (response.status === 409) {
          await loadSubscription(true);
          setMutationState('failure');
          setMutationError({
            ...resourceError(response, payload, '订阅命令'),
            title: '订阅发生并发冲突',
            description:
              '服务端已拒绝这次旧状态命令，页面已重新读取当前投影。请核对当前状态后，再显式重试同一 operation_id 或关闭并创建新的逻辑操作。',
          });
          return;
        }
        setMutationState('failure');
        setMutationError(resourceError(response, payload, '订阅命令'));
        return;
      }
      setMutationState('success');
      setMutationError({
        title: '订阅命令已完成',
        description: '页面正在重新读取服务端权威投影。',
        requestId:
          response.headers.get('x-request-id') ?? payload?.request_id ?? null,
        technicalDetail: null,
      });
      await loadSubscription(true);
      setIntent(null);
    } catch (caught) {
      if (caught instanceof SessionRetryRequiredError) {
        setMutationState('failure');
        setMutationError({
          title: '会话已恢复，请重新提交',
          description:
            '原 operation_id 和 payload 已保留，本次请求没有自动重放。',
          requestId: null,
          technicalDetail: null,
        });
        return;
      }
      setMutationState('unknown_outcome');
      setMutationError({
        title: '订阅命令结果待确认',
        description:
          '网络在服务端响应前中断；原 operation_id 已保留，不会自动创建第二个命令。请检查当前投影后再决定是否重试。',
        requestId: null,
        technicalDetail: null,
      });
    }
  }

  async function checkUnknown() {
    await loadSubscription(true);
    setMutationError({
      title: '订阅投影已重新读取',
      description:
        '此次检查没有重新发送 command；如需继续，请核对当前投影后显式确认原 operation_id。',
      requestId: null,
      technicalDetail: null,
    });
  }

  return (
    <section className="grid gap-5" data-test="platform-subscription-page">
      <AdminPageHeader
        title="订阅投影"
        description="当前 Admin API 没有订阅列表端点，本页只读取指定平台账户的真实投影；账户由平台范围搜索选择，不手输 Platform ID。"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadSubscription(true)}
            disabled={!accountId || refreshing}
            data-test="subscription-refresh"
          >
            {refreshing ? '刷新中…' : '刷新投影'}
          </Button>
        }
      />

      <section className="panel gap-4" data-test="subscription-account-picker">
        <div>
          <h2>选择平台账户</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            从 Account API
            搜索真实账户，再读取其单条订阅投影；查询参数会保留在当前 URL。
          </p>
        </div>
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={searchAccounts}
        >
          <label
            className="grid min-w-0 flex-1 gap-2"
            htmlFor="subscription-account-search"
          >
            <span className="text-sm font-medium">账户 ID、用户 ID 或状态</span>
            <Input
              id="subscription-account-search"
              value={accountQuery}
              onChange={(event) => setAccountQuery(event.target.value)}
              placeholder="搜索账户"
              data-test="subscription-account-search"
            />
          </label>
          <Button
            type="submit"
            disabled={searchingAccounts}
            data-test="subscription-account-search-submit"
          >
            {searchingAccounts ? '搜索中…' : '搜索账户'}
          </Button>
        </form>
        {accountCandidates.length > 0 ? (
          <ul className="data-list" data-test="subscription-account-results">
            {accountCandidates.map((account) => (
              <li key={account.platform_account_id} className="items-center">
                <span className="min-w-0 text-left">
                  <strong className="block truncate">
                    {account.user_id || '匿名账户'}
                  </strong>
                  <small className="mt-1 block">{account.status}</small>
                </span>
                <span className="flex items-center gap-2">
                  <ResourceId value={account.platform_account_id} />
                  <Button
                    size="sm"
                    onClick={() => selectAccount(account.platform_account_id)}
                    data-test={`subscription-select-account-${account.platform_account_id}`}
                  >
                    查看投影
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {accountId ? (
          <div className="rounded-lg border border-border/70 bg-muted/30 p-3 text-sm">
            当前账户：
            <ResourceId value={accountId} />
          </div>
        ) : null}
      </section>

      {refreshError ? (
        <Alert variant="destructive" data-test="subscription-refresh-error">
          <AlertTitle>刷新失败，仍保留已知投影</AlertTitle>
          <AlertDescription>
            {refreshError.description}
            <SupportErrorId
              requestId={refreshError.requestId}
              technicalDetail={refreshError.technicalDetail}
            />
          </AlertDescription>
        </Alert>
      ) : null}
      {!accountId ? (
        <section className="panel gap-2" data-test="subscription-no-account">
          <h2>先选择账户</h2>
          <p className="text-sm text-muted-foreground">
            搜索并选择一个平台账户后，这里会显示该账户的真实订阅投影。
          </p>
        </section>
      ) : null}
      {state === 'loading' ? <AsyncState state="loading" /> : null}
      {state === 'error' && error ? (
        <AsyncState
          state="error"
          title={error.title}
          description={error.description}
          requestId={error.requestId}
          technicalDetail={error.technicalDetail}
          onRetry={() => void loadSubscription(false)}
        />
      ) : null}
      {state === 'success' && accountId && !subscription ? (
        <section className="panel gap-2" data-test="subscription-empty">
          <h2>没有订阅投影</h2>
          <p className="text-sm text-muted-foreground">
            服务端没有返回该账户的订阅投影，页面不会用默认 Plan 填充。
          </p>
        </section>
      ) : null}
      {subscription ? (
        <section className="grid gap-4" data-test="subscription-detail">
          <div className="panel gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2>当前投影</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  最终权益和时间边界以服务端 projection 与领域事件为准。
                </p>
              </div>
              <StatusBadge
                label={statusLabel(subscription.status)}
                tone={statusTone(subscription.status)}
                rawValue={subscription.status}
              />
            </div>
            <dl className="detail-list text-sm">
              <div>
                <dt>Subscription ID</dt>
                <dd>
                  <ResourceId value={subscription.subscription_id} />
                </dd>
              </div>
              <div>
                <dt>Account ID</dt>
                <dd>
                  <ResourceId value={subscription.platform_account_id} />
                </dd>
              </div>
              <div>
                <dt>有效 Plan</dt>
                <dd>
                  {subscription.plan_code
                    ? `${subscription.plan_code}${subscription.plan_name ? ` · ${subscription.plan_name}` : ''}`
                    : '无有效 Plan'}
                </dd>
              </div>
              <div>
                <dt>开始时间</dt>
                <dd>{formatUtc(subscription.started_at)}</dd>
              </div>
              <div>
                <dt>当前周期结束</dt>
                <dd>{formatUtc(subscription.current_period_end)}</dd>
              </div>
              <div>
                <dt>下一次边界</dt>
                <dd>{formatUtc(subscription.next_transition_at)}</dd>
              </div>
              <div>
                <dt>事件序号</dt>
                <dd>{subscription.last_event_sequence}</dd>
              </div>
            </dl>
          </div>
          <div className="panel gap-4">
            <div>
              <h2>受控命令</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                每次打开命令都会创建一个逻辑 operation_id；网络歧义时保留该
                ID，不自动新建。
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-2" htmlFor="subscription-command">
                <span className="text-sm font-medium">命令</span>
                <select
                  id="subscription-command"
                  value={command}
                  onChange={(event) =>
                    setCommand(event.target.value as CommandAction)
                  }
                  data-test="subscription-command"
                >
                  <option value="pause">pause · 暂停</option>
                  <option value="resume">resume · 恢复</option>
                  <option value="grant">grant · 授予</option>
                  <option value="revoke">revoke · 撤销</option>
                  <option value="correct">correct · 修正</option>
                </select>
              </label>
              {command === 'grant' || command === 'correct' ? (
                <label
                  className="grid gap-2"
                  htmlFor="subscription-command-plan"
                >
                  <span className="text-sm font-medium">Plan</span>
                  <select
                    id="subscription-command-plan"
                    value={commandPlanId}
                    onChange={(event) => setCommandPlanId(event.target.value)}
                    data-test="subscription-command-plan"
                  >
                    <option value="">选择 Plan</option>
                    {plans
                      .filter((plan) => plan.status === 'active')
                      .map((plan) => (
                        <option key={plan.plan_id} value={plan.plan_id}>
                          {plan.code} · {plan.name}
                        </option>
                      ))}
                  </select>
                </label>
              ) : null}
              {command === 'grant' || command === 'correct' ? (
                <label
                  className="grid gap-2"
                  htmlFor="subscription-command-duration"
                >
                  <span className="text-sm font-medium">时长</span>
                  <Input
                    id="subscription-command-duration"
                    type="number"
                    min={1}
                    value={commandDuration}
                    onChange={(event) => setCommandDuration(event.target.value)}
                    data-test="subscription-command-duration"
                  />
                </label>
              ) : null}
              {command === 'grant' || command === 'correct' ? (
                <label
                  className="grid gap-2"
                  htmlFor="subscription-command-duration-unit"
                >
                  <span className="text-sm font-medium">时长单位</span>
                  <select
                    id="subscription-command-duration-unit"
                    value={commandDurationUnit}
                    onChange={(event) =>
                      setCommandDurationUnit(
                        event.target.value as typeof commandDurationUnit,
                      )
                    }
                    data-test="subscription-command-duration-unit"
                  >
                    <option value="day">day</option>
                    <option value="month">month</option>
                    <option value="year">year</option>
                  </select>
                </label>
              ) : null}
              {command === 'revoke' || command === 'correct' ? (
                <label
                  className="grid gap-2 md:col-span-2"
                  htmlFor="subscription-command-grant"
                >
                  <span className="text-sm font-medium">Grant ID</span>
                  <Input
                    id="subscription-command-grant"
                    value={commandGrantId}
                    onChange={(event) => setCommandGrantId(event.target.value)}
                    placeholder="需要撤销/修正的真实 Grant ID"
                    data-test="subscription-command-grant"
                  />
                </label>
              ) : null}
            </div>
            <Button
              className="w-fit"
              onClick={openCommand}
              data-test="subscription-command-open"
            >
              打开确认窗口
            </Button>
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
          targetIdentity={intent.targetId}
          impact={intent.impact}
          reversible={intent.payload.action !== 'revoke'}
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
          onConfirm={executeCommand}
        />
      ) : null}
    </section>
  );
}
