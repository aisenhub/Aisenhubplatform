'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { AsyncState } from '@kit/ui/async-state';
import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { ResourceId } from '@kit/ui/resource-id';
import { StatusBadge } from '@kit/ui/status-badge';
import { SupportErrorId } from '@kit/ui/support-error-id';

import { AdminPageHeader } from '../../components/shell/admin-page-header';
import { usePlatformContext } from '../../components/platform-context/platform-workspace';
import { platformStatus } from '../../components/platform-context/platform-types';
import {
  adminAuthSession,
  sessionErrorMessage,
} from '../../app/_lib/auth-session';

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
  const [accountReason, setAccountReason] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const [operation, setOperation] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<OperationError | null>(
    null,
  );

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

  async function createKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!keyName.trim()) {
      setOperationError({
        title: '请填写 Key 名称',
        description: '名称只用于管理员识别，不要填写密钥明文。',
        requestId: null,
        technicalDetail: null,
      });
      return;
    }
    setOperationError(null);
    setOperation('key');
    try {
      const response = await adminAuthSession.request(`${prefix}/keys`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ name: keyName.trim() }),
      });
      const payload = (await response.json().catch(() => null)) as {
        data?: { presented_key?: string };
        error?: { code?: string; message?: string };
        request_id?: string;
      } | null;
      if (!response.ok) {
        setOperationError(listError(response, payload));
        return;
      }
      setSecret(payload?.data?.presented_key ?? null);
      await load();
    } catch (caught) {
      setOperationError({
        title: 'Key 创建失败',
        description: sessionErrorMessage(caught),
        requestId: null,
        technicalDetail: null,
      });
    } finally {
      setOperation(null);
    }
  }

  async function confirmKeyDeployment(keyId: string) {
    if (!window.confirm('确认新 Key 已在目标 BFF/部署环境完成配置？')) return;
    setOperation(`key-confirm-${keyId}`);
    setOperationError(null);
    try {
      const response = await adminAuthSession.request(
        `${prefix}/keys/${encodeURIComponent(keyId)}/confirm-deployment`,
        { method: 'POST', headers: headers() },
      );
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
        title: '部署确认失败',
        description: sessionErrorMessage(caught),
        requestId: null,
        technicalDetail: null,
      });
    } finally {
      setOperation(null);
    }
  }

  async function revokeKey(keyId: string) {
    if (!window.confirm('确认撤销该 Platform Key？撤销后不可恢复。')) return;
    setOperation(`key-revoke-${keyId}`);
    setOperationError(null);
    try {
      const response = await adminAuthSession.request(
        `${prefix}/keys/${encodeURIComponent(keyId)}/revoke`,
        { method: 'POST', headers: headers() },
      );
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
        title: 'Key 撤销失败',
        description: sessionErrorMessage(caught),
        requestId: null,
        technicalDetail: null,
      });
    } finally {
      setOperation(null);
    }
  }

  async function accountAction(
    accountId: string,
    action: 'suspend' | 'restore' | 'close',
  ) {
    if (!accountReason.trim()) {
      setOperationError({
        title: '账户动作需要原因',
        description: '请填写不包含个人信息的支持或审核原因。',
        requestId: null,
        technicalDetail: null,
      });
      return;
    }
    setOperation(`account-${accountId}`);
    setOperationError(null);
    try {
      const response = await adminAuthSession.request(
        `${prefix}/accounts/${encodeURIComponent(accountId)}/${action}`,
        {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({ reason: accountReason.trim() }),
        },
      );
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
        title: `账户${action}失败`,
        description: sessionErrorMessage(caught),
        requestId: null,
        technicalDetail: null,
      });
    } finally {
      setOperation(null);
    }
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
          <Button variant="outline" size="sm" onClick={() => void load()}>
            刷新设置
          </Button>
        }
      />
      {operationError ? (
        <Alert
          variant="destructive"
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
        <Alert data-test="platform-key-secret">
          <AlertTitle>Platform Key 只显示这一次</AlertTitle>
          <AlertDescription>
            请立即保存到受控的部署配置中。关闭此提示后页面不会再次读取或生成这段明文。
            <code className="mt-3 block break-all rounded-md bg-muted p-3 font-mono text-xs text-foreground">
              {secret}
            </code>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => setSecret(null)}
              data-test="platform-key-secret-dismiss"
            >
              我已保存，关闭提示
            </Button>
          </AlertDescription>
        </Alert>
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
            状态切换仍由后续高风险交互阶段接管。本入口只展示服务端返回的当前状态。
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
            onClick={reloadPlatform}
            className="w-fit"
          >
            刷新平台状态
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
                disabled={operation === 'key'}
              />
            </div>
            <Button
              type="submit"
              size="sm"
              className="w-fit"
              disabled={operation === 'key'}
            >
              {operation === 'key' ? '创建中…' : '创建 Key（需近期 MFA）'}
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
                  operation === `key-confirm-${item.key_id}` ||
                  operation === `key-revoke-${item.key_id}`;
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
          <div className="grid gap-2">
            <Label htmlFor="account-reason">
              账户状态动作原因（必填，勿含个人信息）
            </Label>
            <Input
              id="account-reason"
              value={accountReason}
              onChange={(event) => setAccountReason(event.target.value)}
              maxLength={500}
              placeholder="例如：support review completed"
            />
          </div>
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
                  operation === `account-${account.platform_account_id}`;
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
    </section>
  );
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
        <Button type="submit" variant="outline" size="sm">
          查询
        </Button>
      </div>
    </form>
  );
}
