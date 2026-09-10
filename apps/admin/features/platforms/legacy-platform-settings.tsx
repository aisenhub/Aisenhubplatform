'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { AsyncState } from '@kit/ui/async-state';
import { Button } from '@kit/ui/button';
import { ConfirmActionDialog } from '@kit/ui/confirm-action-dialog';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import type { MutationState } from '@kit/ui/mutation-state';
import { OneTimeSecretPanel } from '@kit/ui/one-time-secret-panel';
import { ResourceId } from '@kit/ui/resource-id';
import { StatusBadge } from '@kit/ui/status-badge';
import { SupportErrorId } from '@kit/ui/support-error-id';
import { SessionRetryRequiredError } from '@kit/account-auth-nextjs/browser';

import { AdminPageHeader } from '../../components/shell/admin-page-header';
import { usePlatformContext } from '../../components/platform-context/platform-workspace';
import { platformStatus } from '../../components/platform-context/platform-types';
import {
  adminAuthSession,
  sessionErrorMessage,
} from '../../app/_lib/auth-session';
import { AdminRecentMfaPanel } from '../security/admin-recent-mfa-panel';

type Origin = {
  origin_id: string;
  environment: string;
  origin: string;
  status: string;
};

type Account = {
  platform_account_id: string;
  user_id: string | null;
  status: string;
};

type Key = {
  key_id: string;
  name: string;
  status: string;
  key_prefix: string;
  key_suffix: string;
  deployment_confirmed_at: string | null;
};

type ApiList<T> = {
  data?: T[];
  error?: { code?: string; message?: string };
  request_id?: string;
};

type ApiErrorEnvelope = {
  error?: { code?: string; message?: string };
  request_id?: string;
};

type OperationError = {
  title: string;
  description: string;
  requestId: string | null;
  technicalDetail: string | null;
};

type ConfirmIntent = {
  kind:
    | 'platform-toggle'
    | 'key-create'
    | 'key-deployment'
    | 'key-revoke'
    | 'account-action';
  targetId: string;
  title: string;
  impact: string;
  reversible: boolean;
  reasonRequired?: boolean;
  action?: 'suspend' | 'restore' | 'close';
  keyId?: string;
  keyName?: string;
  accountId?: string;
};

function headers() {
  return { 'Content-Type': 'application/json' };
}

function listError(
  response: Response,
  payload: ApiErrorEnvelope | null,
): OperationError {
  return {
    title: response.status === 401 ? '会话已结束' : '设置数据读取失败',
    description:
      response.status === 403
        ? '当前账号没有读取这个平台配置的权限。'
        : payload?.error?.message ||
          '请检查网络或服务状态后重试；本页不会把读取失败显示成空列表。',
    requestId:
      response.headers.get('x-request-id') ?? payload?.request_id ?? null,
    technicalDetail: payload?.error?.code ?? `HTTP_${response.status}`,
  };
}

export function LegacyPlatformSettings() {
  const { platform, reload: reloadPlatform } = usePlatformContext();
  const platformId = platform.platform_id;
  const prefix = `/api/v1/admin/api/v1/platforms/${encodeURIComponent(platformId)}`;
  const [origins, setOrigins] = useState<Origin[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [keys, setKeys] = useState<Key[]>([]);
  const [state, setState] = useState<'loading' | 'success' | 'error'>(
    'loading',
  );
  const [error, setError] = useState<OperationError | null>(null);
  const [originFilter, setOriginFilter] = useState('');
  const [originQuery, setOriginQuery] = useState('');
  const [keyFilter, setKeyFilter] = useState('');
  const [keyQuery, setKeyQuery] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [accountQuery, setAccountQuery] = useState('');
  const [origin, setOrigin] = useState('http://localhost:3000');
  const [keyName, setKeyName] = useState('BFF key');
  const [secret, setSecret] = useState<string | null>(null);
  const [operation, setOperation] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<OperationError | null>(
    null,
  );
  const [confirmIntent, setConfirmIntent] = useState<ConfirmIntent | null>(
    null,
  );
  const [mutationState, setMutationState] =
    useState<MutationState>('confirm_required');

  const load = useCallback(async () => {
    const epoch = adminAuthSession.getEpoch();
    setState('loading');
    setError(null);
    const responses = await Promise.all([
      adminAuthSession.request(
        `${prefix}/origins${originQuery.trim() ? `?q=${encodeURIComponent(originQuery.trim())}` : ''}`,
        { cache: 'no-store' },
      ),
      adminAuthSession.request(
        `${prefix}/accounts?limit=100${accountQuery.trim() ? `&q=${encodeURIComponent(accountQuery.trim())}` : ''}`,
        { cache: 'no-store' },
      ),
      adminAuthSession.request(
        `${prefix}/keys${keyQuery.trim() ? `?q=${encodeURIComponent(keyQuery.trim())}` : ''}`,
        { cache: 'no-store' },
      ),
    ]).catch((caught) => {
      setError({
        title: '设置数据读取失败',
        description: sessionErrorMessage(caught),
        requestId: null,
        technicalDetail: null,
      });
      setState('error');
      return null;
    });

    if (!responses || !adminAuthSession.isCurrentEpoch(epoch)) return;
    if (responses.some((response) => !response.ok)) {
      const response = responses.find((item) => !item.ok)!;
      const payload = (await response
        .json()
        .catch(() => null)) as ApiList<unknown> | null;
      setError(listError(response, payload));
      setState('error');
      return;
    }

    const [originBody, accountBody, keyBody] = (await Promise.all(
      responses.map((response) => response.json()),
    )) as [ApiList<Origin>, ApiList<Account>, ApiList<Key>];
    if (!adminAuthSession.isCurrentEpoch(epoch)) return;
    setOrigins(Array.isArray(originBody.data) ? originBody.data : []);
    setAccounts(Array.isArray(accountBody.data) ? accountBody.data : []);
    setKeys(Array.isArray(keyBody.data) ? keyBody.data : []);
    setState('success');
  }, [accountQuery, keyQuery, originQuery, prefix]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createOrigin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedOrigin = origin.trim().replace(/\/$/, '');
    if (!/^https?:\/\/[^\s]+$/i.test(normalizedOrigin)) {
      setOperationError({
        title: 'Origin 格式不正确',
        description: '请输入完整的 http 或 https Origin，不要包含路径。',
        requestId: null,
        technicalDetail: null,
      });
      return;
    }
    setOperationError(null);
    setOperation('origin');
    try {
      const response = await adminAuthSession.request(`${prefix}/origins`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          environment: 'local',
          origin: normalizedOrigin,
          oauth_callback_url: `${normalizedOrigin}/auth/callback`,
          password_reset_url: `${normalizedOrigin}/update-password`,
          email_confirmation_url: `${normalizedOrigin}/auth/confirm`,
        }),
      });
      const payload = (await response
        .json()
        .catch(() => null)) as ApiList<unknown> | null;
      if (!response.ok) {
        setOperationError(listError(response, payload));
        return;
      }
      await load();
    } catch (caught) {
      setOperationError({
        title: 'Origin 登记失败',
        description: sessionErrorMessage(caught),
        requestId: null,
        technicalDetail: null,
      });
    } finally {
      setOperation(null);
    }
  }

  function createKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedName = keyName.trim();
    if (!normalizedName) {
      setOperationError({
        title: '请填写 Key 名称',
        description: '名称只用于管理员识别，不要填写密钥明文。',
        requestId: null,
        technicalDetail: null,
      });
      return;
    }
    openConfirmation({
      kind: 'key-create',
      targetId: normalizedName,
      keyName: normalizedName,
      title: '创建 Platform Key',
      impact:
        '服务端会生成一把新 Key，并且只在成功响应中返回一次明文；请准备好受控保存位置。',
      reversible: false,
    });
  }

  function openConfirmation(intent: ConfirmIntent) {
    setOperationError(null);
    setMutationState('confirm_required');
    setConfirmIntent(intent);
  }

  function accountAction(
    accountId: string,
    action: 'suspend' | 'restore' | 'close',
  ) {
    const actionLabel =
      action === 'suspend' ? '暂停' : action === 'restore' ? '恢复' : '关闭';
    openConfirmation({
      kind: 'account-action',
      targetId: accountId,
      accountId,
      action,
      title: `${actionLabel}平台账户`,
      impact:
        action === 'close'
          ? '关闭是不可逆的账户状态动作，并会保留审计记录。'
          : `服务端会尝试${actionLabel}这个账户，最终状态以 API 返回为准。`,
      reversible: action !== 'close',
      reasonRequired: true,
    });
  }

  function confirmKeyDeployment(keyId: string) {
    openConfirmation({
      kind: 'key-deployment',
      targetId: keyId,
      keyId,
      title: '确认 Platform Key 已部署',
      impact:
        '服务端会记录部署确认；只有确认成功后，旧的 active Key 才能进入撤销流程。',
      reversible: false,
    });
  }

  function revokeKey(keyId: string) {
    openConfirmation({
      kind: 'key-revoke',
      targetId: keyId,
      keyId,
      title: '撤销 Platform Key',
      impact: '撤销后该 Key 不可恢复；请确认目标部署已完成且不再依赖它。',
      reversible: false,
    });
  }

  function togglePlatform() {
    openConfirmation({
      kind: 'platform-toggle',
      targetId: platformId,
      title: platform.status === 'active' ? '停用平台' : '启用平台',
      impact:
        platform.status === 'active'
          ? '平台停用后，新的激活流程会受服务端策略限制；当前诊断数据仍可读取。'
          : '平台启用后，是否允许激活仍由服务端返回的策略字段决定。',
      reversible: true,
    });
  }

  async function executeConfirmation(reason: string) {
    if (!confirmIntent) return;
    const intent = confirmIntent;
    setMutationState('pending');
    setOperationError(null);
    try {
      let path = prefix;
      let init: RequestInit = { method: 'PATCH', headers: headers() };
      if (intent.kind === 'platform-toggle') {
        init = {
          method: 'PATCH',
          headers: headers(),
          body: JSON.stringify({
            status: platform.status === 'active' ? 'disabled' : 'active',
            allow_activation: platform.allow_activation,
          }),
        };
      } else if (intent.kind === 'key-deployment' && intent.keyId) {
        path = `${prefix}/keys/${encodeURIComponent(intent.keyId)}/confirm-deployment`;
        init = { method: 'POST', headers: headers() };
      } else if (intent.kind === 'key-create' && intent.keyName) {
        path = `${prefix}/keys`;
        init = {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({ name: intent.keyName }),
        };
      } else if (intent.kind === 'key-revoke' && intent.keyId) {
        path = `${prefix}/keys/${encodeURIComponent(intent.keyId)}/revoke`;
        init = { method: 'POST', headers: headers() };
      } else if (
        intent.kind === 'account-action' &&
        intent.accountId &&
        intent.action
      ) {
        path = `${prefix}/accounts/${encodeURIComponent(intent.accountId)}/${intent.action}`;
        init = {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({ reason }),
        };
      }

      const response = await adminAuthSession.request(path, init, {
        replay: 'never',
      });
      const payload = (await response
        .json()
        .catch(() => null)) as ApiErrorEnvelope & {
        data?: {
          operation_id?: string;
          job_id?: string;
          presented_key?: string;
        };
      };
      const code = payload?.error?.code;
      if (!response.ok) {
        if (code === 'RECENT_MFA_REQUIRED' || code === 'MFA_REQUIRED') {
          setMutationState('step_up_required');
          setOperationError(null);
          return;
        }
        setMutationState('failure');
        setOperationError(listError(response, payload));
        return;
      }

      if (response.status === 202) {
        setMutationState('accepted');
        setOperationError({
          title: '请求已受理',
          description:
            '服务端已接受这次操作，最终状态仍需通过后续真实资源读取确认。',
          requestId:
            response.headers.get('x-request-id') ?? payload?.request_id ?? null,
          technicalDetail:
            payload?.data?.operation_id ?? payload?.data?.job_id ?? null,
        });
      } else {
        if (intent.kind === 'key-create' && !payload?.data?.presented_key) {
          setMutationState('failure');
          setOperationError({
            title: 'Key 已创建但明文未返回',
            description:
              '页面不会尝试再次创建 Key。请通过服务端 Key 元数据和支持流程确认这次创建结果。',
            requestId:
              response.headers.get('x-request-id') ??
              payload?.request_id ??
              null,
            technicalDetail: null,
          });
          return;
        }
        setMutationState('success');
        setOperationError({
          title: '操作已完成',
          description: '服务端已返回成功；页面将重新读取当前平台的权威状态。',
          requestId:
            response.headers.get('x-request-id') ?? payload?.request_id ?? null,
          technicalDetail: null,
        });
      }
      if (intent.kind === 'key-create' && payload?.data?.presented_key) {
        setSecret(payload.data.presented_key);
        setConfirmIntent(null);
        setMutationState('confirm_required');
      }
      if (intent.kind === 'platform-toggle') {
        reloadPlatform();
      }
      await load();
    } catch (caught) {
      if (caught instanceof SessionRetryRequiredError) {
        setMutationState('failure');
        setOperationError({
          title: '会话已恢复，请重新提交',
          description:
            '为避免重复执行，这次高风险请求没有自动重放。请确认目标仍然正确后再次提交。',
          requestId: null,
          technicalDetail: null,
        });
      } else {
        setMutationState('unknown_outcome');
        setOperationError({
          title: '操作结果待确认',
          description:
            '网络在服务端响应前中断，无法确认操作是否已执行。请先关闭当前提示并重新读取资源状态，不要立即发起第二次相同操作。',
          requestId: null,
          technicalDetail: null,
        });
      }
    }
  }

  async function checkUnknownOutcome() {
    setOperationError({
      title: '正在重新读取权威状态',
      description:
        '不会重新发送原操作。读取完成后请根据真实资源状态决定下一步。',
      requestId: null,
      technicalDetail: null,
    });
    await load();
    setOperationError({
      title: '状态已重新读取，但原结果仍待确认',
      description:
        '当前 API 没有提供可证明原 mutation 已执行的 operation receipt。请联系支持人员确认后再决定是否继续，不要重复发起相同的高风险操作。',
      requestId: null,
      technicalDetail: null,
    });
  }

  const visibleOrigins = useMemo(
    () =>
      origins.filter((item) =>
        `${item.environment} ${item.origin} ${item.status}`
          .toLowerCase()
          .includes(originFilter.trim().toLowerCase()),
      ),
    [originFilter, origins],
  );
  const visibleKeys = useMemo(
    () =>
      keys.filter((item) =>
        `${item.name} ${item.status} ${item.key_prefix} ${item.key_suffix}`
          .toLowerCase()
          .includes(keyFilter.trim().toLowerCase()),
      ),
    [keyFilter, keys],
  );
  const visibleAccounts = useMemo(
    () =>
      accounts.filter((account) =>
        `${account.user_id ?? ''} ${account.status}`
          .toLowerCase()
          .includes(accountFilter.trim().toLowerCase()),
      ),
    [accountFilter, accounts],
  );
  const status = platformStatus(platform.status);

  if (state === 'loading') {
    return (
      <section className="grid gap-4" data-test="platform-settings-loading">
        <AdminPageHeader
          title="平台设置"
          description="正在读取 Origin、账户和 Key 配置。"
        />
        <AsyncState state="loading" />
      </section>
    );
  }

  if (state === 'error' && error) {
    return (
      <section className="grid gap-4" data-test="platform-settings-error">
        <AdminPageHeader
          title="平台设置"
          description="读取当前平台的兼容设置操作。"
        />
        <AsyncState
          state="error"
          title={error.title}
          description={error.description}
          requestId={error.requestId}
          technicalDetail={error.technicalDetail}
          onRetry={() => void load()}
        />
      </section>
    );
  }

  return (
    <section className="grid gap-5" data-test="platform-settings">
      <AdminPageHeader
        title="平台设置"
        description="保留的兼容入口：Origin、账户状态动作和平台 Key 均继续通过当前平台上下文访问；敏感动作仍需服务端 MFA。"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            data-test="platform-settings-refresh"
          >
            刷新设置
          </Button>
        }
      />
      {operationError ? (
        <Alert
          variant={
            mutationState === 'success' || mutationState === 'accepted'
              ? undefined
              : 'destructive'
          }
          data-test="platform-settings-operation-error"
        >
          <AlertTitle>{operationError.title}</AlertTitle>
          <AlertDescription>
            {operationError.description}
            <SupportErrorId
              requestId={operationError.requestId}
              technicalDetail={operationError.technicalDetail}
            />
          </AlertDescription>
        </Alert>
      ) : null}
      {secret ? (
        <OneTimeSecretPanel
          secret={secret}
          title="Platform Key 只显示这一次"
          onAcknowledged={() => setSecret(null)}
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="panel gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2>平台状态</h2>
            <StatusBadge
              label={status.label}
              tone={status.tone}
              rawValue={platform.status}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            状态切换通过当前阶段的确认、MFA 和服务端权威状态流程处理。
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm">
              激活能力：{platform.allow_activation ? '允许' : '已关闭'}
            </span>
            <ResourceId value={platform.platform_id} />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={togglePlatform}
            className="w-fit"
            data-test="platform-toggle-open"
          >
            {platform.status === 'active' ? '停用平台' : '启用平台'}
          </Button>
        </div>

        <div className="panel gap-3">
          <h2>登记 Local Origin</h2>
          <form className="grid gap-3" onSubmit={createOrigin}>
            <div className="grid gap-2">
              <Label htmlFor="platform-origin">Origin</Label>
              <Input
                id="platform-origin"
                value={origin}
                onChange={(event) => setOrigin(event.target.value)}
                placeholder="https://console.example.com"
                disabled={operation === 'origin'}
              />
            </div>
            <Button
              type="submit"
              size="sm"
              className="w-fit"
              disabled={operation === 'origin'}
              data-test="platform-origin-submit"
            >
              {operation === 'origin' ? '登记中…' : '登记 Origin'}
            </Button>
          </form>
          <FilterForm
            id="origin-filter"
            label="筛选 Origin"
            value={originFilter}
            onChange={setOriginFilter}
            onSubmit={() => setOriginQuery(originFilter)}
            placeholder="environment、origin 或 status"
          />
          {visibleOrigins.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              当前查询暂无 Origin。
            </p>
          ) : (
            <ul className="data-list" data-test="platform-origin-list">
              {visibleOrigins.map((item) => (
                <li key={item.origin_id}>
                  <span className="min-w-0">
                    <strong>{item.environment}</strong>
                    <small className="mt-1 block break-all">
                      {item.origin}
                    </small>
                  </span>
                  <StatusBadge
                    label={item.status}
                    tone="neutral"
                    rawValue={item.status}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="panel gap-3">
          <h2>平台 Key</h2>
          <form className="grid gap-3" onSubmit={createKey}>
            <div className="grid gap-2">
              <Label htmlFor="platform-key-name">Key 名称</Label>
              <Input
                id="platform-key-name"
                value={keyName}
                onChange={(event) => setKeyName(event.target.value)}
                placeholder="BFF production key"
                disabled={
                  mutationState === 'pending' &&
                  confirmIntent?.kind === 'key-create'
                }
              />
            </div>
            <Button
              type="submit"
              size="sm"
              className="w-fit"
              disabled={
                mutationState === 'pending' &&
                confirmIntent?.kind === 'key-create'
              }
              data-test="platform-key-create-submit"
            >
              创建 Key（需近期 MFA）
            </Button>
          </form>
          <FilterForm
            id="key-filter"
            label="筛选 Key"
            value={keyFilter}
            onChange={setKeyFilter}
            onSubmit={() => setKeyQuery(keyFilter)}
            placeholder="名称、状态或 suffix"
          />
          {visibleKeys.length === 0 ? (
            <p className="text-sm text-muted-foreground">当前查询暂无 Key。</p>
          ) : (
            <ul className="data-list" data-test="platform-key-list">
              {visibleKeys.map((item) => {
                const rowOperation =
                  mutationState === 'pending' &&
                  confirmIntent?.keyId === item.key_id;
                return (
                  <li key={item.key_id} className="items-start">
                    <span className="min-w-0">
                      <strong>{item.name}</strong>
                      <small className="mt-1 block break-all">
                        {item.key_prefix}…{item.key_suffix} · {item.status} ·{' '}
                        {item.deployment_confirmed_at
                          ? '已确认部署'
                          : '待部署确认'}
                      </small>
                    </span>
                    <span className="flex shrink-0 flex-wrap justify-end gap-2">
                      {item.status === 'active' &&
                      !item.deployment_confirmed_at ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={rowOperation}
                          onClick={() => void confirmKeyDeployment(item.key_id)}
                          data-test={`platform-key-deploy-${item.key_id}`}
                        >
                          确认已部署
                        </Button>
                      ) : null}
                      {item.status === 'active' &&
                      item.deployment_confirmed_at ? (
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={rowOperation}
                          onClick={() => void revokeKey(item.key_id)}
                          data-test={`platform-key-revoke-${item.key_id}`}
                        >
                          撤销
                        </Button>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="panel gap-3">
          <h2>平台账户</h2>
          <p className="text-sm text-muted-foreground">
            每个账户动作都在独立确认窗口中填写原因，不共享或残留到其他账户。
          </p>
          <FilterForm
            id="account-filter"
            label="筛选账户"
            value={accountFilter}
            onChange={setAccountFilter}
            onSubmit={() => setAccountQuery(accountFilter)}
            placeholder="user ID 或 status"
          />
          {visibleAccounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">当前查询暂无账户。</p>
          ) : (
            <ul className="data-list" data-test="platform-account-list">
              {visibleAccounts.map((account) => {
                const rowOperation =
                  mutationState === 'pending' &&
                  confirmIntent?.accountId === account.platform_account_id;
                const isSuspended = account.status === 'suspended';
                return (
                  <li key={account.platform_account_id} className="items-start">
                    <span className="min-w-0">
                      <strong className="break-all">
                        {account.user_id ?? '已匿名化账户'}
                      </strong>
                      <small className="mt-1 block">{account.status}</small>
                    </span>
                    <span className="flex shrink-0 flex-wrap justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={rowOperation}
                        data-test={`platform-account-${account.platform_account_id}-toggle`}
                        onClick={() =>
                          void accountAction(
                            account.platform_account_id,
                            isSuspended ? 'restore' : 'suspend',
                          )
                        }
                      >
                        {isSuspended ? '恢复' : '暂停'}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={rowOperation}
                        data-test={`platform-account-${account.platform_account_id}-close`}
                        onClick={() =>
                          void accountAction(
                            account.platform_account_id,
                            'close',
                          )
                        }
                      >
                        关闭
                      </Button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      {confirmIntent ? (
        <ConfirmActionDialog
          open
          onOpenChange={(open) => {
            if (!open && mutationState !== 'pending') {
              setConfirmIntent(null);
              setMutationState('confirm_required');
            }
          }}
          title={confirmIntent.title}
          targetIdentity={confirmIntent.targetId}
          impact={confirmIntent.impact}
          reversible={confirmIntent.reversible}
          reasonRequired={confirmIntent.reasonRequired}
          state={mutationState}
          error={mutationErrorForDialog(operationError, mutationState)}
          stepUpContent={
            mutationState === 'step_up_required' ? (
              <AdminRecentMfaPanel
                onVerified={() => setMutationState('confirm_required')}
              />
            ) : null
          }
          onCheckUnknown={
            mutationState === 'unknown_outcome'
              ? () => void checkUnknownOutcome()
              : undefined
          }
          onConfirm={executeConfirmation}
        />
      ) : null}
    </section>
  );
}

function mutationErrorForDialog(
  value: OperationError | null,
  state: MutationState,
) {
  if (!value || state === 'success' || state === 'accepted') return null;
  return value;
}

function FilterForm({
  id,
  label,
  value,
  onChange,
  onSubmit,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
}) {
  return (
    <form
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <div className="flex gap-2">
        <Input
          id={id}
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
        <Button
          type="submit"
          variant="outline"
          size="sm"
          data-test={`platform-${id}-filter-submit`}
        >
          查询
        </Button>
      </div>
    </form>
  );
}
