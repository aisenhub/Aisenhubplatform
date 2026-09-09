'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { AdminFilterInput } from '../components/admin-filter-input';
import { AdminNav } from '../components/admin-nav';
import {
  adminAuthSession,
  useAdminSessionSnapshot,
} from '../../_lib/auth-session';

type Platform = {
  platform_id: string;
  code: string;
  name: string;
  status: 'active' | 'disabled';
  allow_activation: boolean;
};

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

function mutationHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
  };
}

export default function PlatformsPage() {
  const sessionSnapshot = useAdminSessionSnapshot();
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [origins, setOrigins] = useState<Origin[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [keys, setKeys] = useState<Key[]>([]);
  const [platformFilter, setPlatformFilter] = useState('');
  const [platformQuery, setPlatformQuery] = useState('');
  const [originFilter, setOriginFilter] = useState('');
  const [originQuery, setOriginQuery] = useState('');
  const [keyFilter, setKeyFilter] = useState('');
  const [keyQuery, setKeyQuery] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [accountQuery, setAccountQuery] = useState('');
  const [status, setStatus] = useState('正在读取平台…');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [origin, setOrigin] = useState('http://localhost:3000');
  const [keyName, setKeyName] = useState('BFF key');
  const [accountReason, setAccountReason] = useState('');

  useEffect(() => {
    if (
      !sessionSnapshot.resolved ||
      !['unauthenticated', 'expired'].includes(sessionSnapshot.state)
    )
      return;
    setPlatforms([]);
    setSelectedId('');
    setOrigins([]);
    setAccounts([]);
    setKeys([]);
    setStatus('会话已结束，平台与账户数据已清理。');
  }, [sessionSnapshot.resolved, sessionSnapshot.state]);

  const loadPlatforms = useCallback(async () => {
    const epoch = adminAuthSession.getEpoch();
    const response = await adminAuthSession.request(
      `/api/v1/admin/api/v1/platforms?limit=100${platformQuery.trim() ? `&q=${encodeURIComponent(platformQuery.trim())}` : ''}`,
      {
        cache: 'no-store',
      },
    );
    if (!response.ok) {
      setStatus('平台读取失败，请确认管理员会话。');
      return;
    }
    const payload = (await response.json()) as { data?: Platform[] };
    if (!adminAuthSession.isCurrentEpoch(epoch)) return;
    const next = payload.data ?? [];
    setPlatforms(next);
    setSelectedId((current) => current || next[0]?.platform_id || '');
    setStatus(`已读取 ${next.length} 个平台。`);
  }, [platformQuery]);

  const loadSelected = useCallback(async () => {
    if (!selectedId) return;
    const epoch = adminAuthSession.getEpoch();
    const prefix = `/api/v1/admin/api/v1/platforms/${selectedId}`;
    const [originResponse, accountResponse, keyResponse] = await Promise.all([
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
    ]);
    if (!originResponse.ok || !accountResponse.ok || !keyResponse.ok) {
      setStatus('平台详情读取失败。');
      return;
    }
    const originsBody = (await originResponse.json()) as { data?: Origin[] };
    const accountsBody = (await accountResponse.json()) as { data?: Account[] };
    const keysBody = (await keyResponse.json()) as { data?: Key[] };
    if (!adminAuthSession.isCurrentEpoch(epoch)) return;
    setOrigins(originsBody.data ?? []);
    setAccounts(accountsBody.data ?? []);
    setKeys(keysBody.data ?? []);
  }, [accountQuery, keyQuery, originQuery, selectedId]);

  useEffect(() => {
    void loadPlatforms();
  }, [loadPlatforms]);

  useEffect(() => {
    void loadSelected();
  }, [loadSelected]);

  async function createPlatform(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await adminAuthSession.request(
      '/api/v1/admin/api/v1/platforms',
      {
        method: 'POST',
        headers: mutationHeaders(),
        body: JSON.stringify({
          code,
          name,
          status: 'active',
          allow_activation: true,
        }),
      },
    );
    setStatus(response.ok ? '平台已创建。' : '平台创建失败。');
    if (response.ok) {
      setCode('');
      setName('');
      await loadPlatforms();
    }
  }

  async function patchPlatform(platform: Platform) {
    const response = await adminAuthSession.request(
      `/api/v1/admin/api/v1/platforms/${platform.platform_id}`,
      {
        method: 'PATCH',
        headers: mutationHeaders(),
        body: JSON.stringify({
          status: platform.status === 'active' ? 'disabled' : 'active',
          allow_activation: platform.allow_activation,
        }),
      },
    );
    setStatus(response.ok ? '平台状态已更新。' : '平台状态更新失败。');
    if (response.ok) await loadPlatforms();
  }

  async function createOrigin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await adminAuthSession.request(
      `/api/v1/admin/api/v1/platforms/${selectedId}/origins`,
      {
        method: 'POST',
        headers: mutationHeaders(),
        body: JSON.stringify({
          environment: 'local',
          origin,
          oauth_callback_url: `${origin}/auth/callback`,
          password_reset_url: `${origin}/update-password`,
          email_confirmation_url: `${origin}/auth/confirm`,
        }),
      },
    );
    setStatus(response.ok ? 'Origin 已登记。' : 'Origin 登记失败。');
    if (response.ok) await loadSelected();
  }

  async function createKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await adminAuthSession.request(
      `/api/v1/admin/api/v1/platforms/${selectedId}/keys`,
      {
        method: 'POST',
        headers: mutationHeaders(),
        body: JSON.stringify({ name: keyName }),
      },
    );
    const payload = (await response.json().catch(() => null)) as {
      data?: { presented_key?: string };
    } | null;
    setStatus(
      response.ok
        ? `Key 已创建；仅本次响应显示：${payload?.data?.presented_key ?? '(missing)'}`
        : 'Key 创建失败，请先完成近期 MFA。',
    );
    if (response.ok) await loadSelected();
  }

  async function revokeKey(keyId: string) {
    if (!window.confirm('确认撤销该 Platform Key？撤销后不可恢复。')) return;
    const response = await adminAuthSession.request(
      `/api/v1/admin/api/v1/platforms/${selectedId}/keys/${keyId}/revoke`,
      { method: 'POST', headers: mutationHeaders() },
    );
    setStatus(
      response.ok
        ? 'Key 已撤销且不可恢复；如需轮换请先确认新 Key 已部署。'
        : 'Key 撤销失败，请确认近期 MFA proof。',
    );
    if (response.ok) await loadSelected();
  }

  async function confirmKeyDeployment(keyId: string) {
    if (
      !window.confirm(
        '确认新 Key 已在目标 BFF/部署环境完成配置？确认后才允许撤销旧 Key。',
      )
    )
      return;
    const response = await adminAuthSession.request(
      `/api/v1/admin/api/v1/platforms/${selectedId}/keys/${keyId}/confirm-deployment`,
      { method: 'POST', headers: mutationHeaders() },
    );
    setStatus(
      response.ok
        ? 'Key 部署已记录；现在可以显式撤销旧 Key。'
        : 'Key 部署确认失败，请先完成近期 MFA 并确认目标平台。',
    );
    if (response.ok) await loadSelected();
  }

  async function accountAction(
    accountId: string,
    action: 'suspend' | 'restore' | 'close',
  ) {
    if (!accountReason.trim()) {
      setStatus('账户状态动作必须填写原因；原因不要包含个人信息。');
      return;
    }
    const response = await adminAuthSession.request(
      `/api/v1/admin/api/v1/platforms/${selectedId}/accounts/${accountId}/${action}`,
      {
        method: 'POST',
        headers: mutationHeaders(),
        body: JSON.stringify({ reason: accountReason.trim() }),
      },
    );
    setStatus(
      response.ok ? `账户 ${action} 已提交。` : `账户 ${action} 失败。`,
    );
    if (response.ok) await loadSelected();
  }

  const selected = platforms.find(
    (platform) => platform.platform_id === selectedId,
  );
  const visiblePlatforms = platforms.filter((platform) =>
    `${platform.code} ${platform.name} ${platform.status}`
      .toLowerCase()
      .includes(platformFilter.trim().toLowerCase()),
  );
  const visibleOrigins = origins.filter((item) =>
    `${item.environment} ${item.origin} ${item.status}`
      .toLowerCase()
      .includes(originFilter.trim().toLowerCase()),
  );
  const visibleKeys = keys.filter((item) =>
    `${item.name} ${item.status} ${item.key_prefix} ${item.key_suffix}`
      .toLowerCase()
      .includes(keyFilter.trim().toLowerCase()),
  );
  const visibleAccounts = accounts.filter((account) =>
    `${account.user_id ?? ''} ${account.status}`
      .toLowerCase()
      .includes(accountFilter.trim().toLowerCase()),
  );

  return (
    <main className="shell wide-shell">
      <AdminNav />
      <p className="eyebrow">Aisenhub Admin · M2</p>
      <h1>Platform operations</h1>
      <p className="muted">
        平台、Origin、账户状态和平台 Key 均经 Admin API 与受控领域函数处理；Key
        明文只在创建响应中出现。
      </p>
      <p className="muted">{status}</p>
      <section className="grid-two">
        <div className="panel">
          <h2>创建平台</h2>
          <form onSubmit={createPlatform} className="stack-form">
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="code"
              aria-label="Platform code"
            />
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="name"
              aria-label="Platform name"
            />
            <button type="submit">创建平台</button>
          </form>
          <h2>平台列表</h2>
          <AdminFilterInput
            id="platform-filter"
            label="筛选平台"
            value={platformFilter}
            onChange={setPlatformFilter}
            onSubmit={() => setPlatformQuery(platformFilter)}
            placeholder="code、name 或 status"
          />
          <ul className="data-list">
            {visiblePlatforms.map((platform) => (
              <li key={platform.platform_id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(platform.platform_id)}
                >
                  {platform.code}
                </button>
                <span>{platform.status}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="panel">
          <h2>{selected?.name ?? '选择平台'}</h2>
          {selected ? (
            <>
              <p className="muted">{selected.platform_id}</p>
              <button
                type="button"
                onClick={() => void patchPlatform(selected)}
              >
                切换 active/disabled
              </button>
              <form onSubmit={createOrigin} className="stack-form">
                <h3>登记 Local Origin</h3>
                <input
                  value={origin}
                  onChange={(event) => setOrigin(event.target.value)}
                  aria-label="Origin"
                />
                <button type="submit">登记 Origin</button>
              </form>
              <AdminFilterInput
                id="origin-filter"
                label="筛选 Origin"
                value={originFilter}
                onChange={setOriginFilter}
                onSubmit={() => setOriginQuery(originFilter)}
                placeholder="environment、origin 或 status"
              />
              <ul className="data-list">
                {visibleOrigins.map((item) => (
                  <li key={item.origin_id}>
                    <strong>{item.environment}</strong>
                    <span>
                      {item.origin} · {item.status}
                    </span>
                  </li>
                ))}
              </ul>
              <form onSubmit={createKey} className="stack-form">
                <h3>创建平台 Key</h3>
                <input
                  value={keyName}
                  onChange={(event) => setKeyName(event.target.value)}
                  aria-label="Key name"
                />
                <button type="submit">创建 Key（需近期 MFA）</button>
              </form>
              <AdminFilterInput
                id="key-filter"
                label="筛选 Key"
                value={keyFilter}
                onChange={setKeyFilter}
                onSubmit={() => setKeyQuery(keyFilter)}
                placeholder="name、status 或 suffix"
              />
              <ul className="data-list">
                {visibleKeys.map((item) => (
                  <li key={item.key_id}>
                    <strong>{item.name}</strong>
                    <span>
                      {item.status} · {item.key_prefix}…{item.key_suffix} ·{' '}
                      {item.deployment_confirmed_at
                        ? '已确认部署'
                        : '待部署确认'}{' '}
                      {item.status === 'active' &&
                      !item.deployment_confirmed_at ? (
                        <button
                          type="button"
                          onClick={() => void confirmKeyDeployment(item.key_id)}
                        >
                          确认已部署
                        </button>
                      ) : null}{' '}
                      {item.status === 'active' &&
                      item.deployment_confirmed_at ? (
                        <button
                          type="button"
                          onClick={() => void revokeKey(item.key_id)}
                        >
                          撤销
                        </button>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="muted">暂无平台。</p>
          )}
        </div>
      </section>
      <section className="panel">
        <h2>平台账户</h2>
        <label htmlFor="account-reason">
          账户状态操作原因（必填，勿含个人信息）
        </label>
        <input
          id="account-reason"
          value={accountReason}
          onChange={(event) => setAccountReason(event.target.value)}
          maxLength={500}
          placeholder="例如：support review completed"
        />
        <AdminFilterInput
          id="account-filter"
          label="筛选账户"
          value={accountFilter}
          onChange={setAccountFilter}
          onSubmit={() => setAccountQuery(accountFilter)}
          placeholder="user ID 或 status"
        />
        {visibleAccounts.length === 0 ? (
          <p className="muted">暂无账户。</p>
        ) : (
          <ul className="data-list">
            {visibleAccounts.map((account) => (
              <li key={account.platform_account_id}>
                <strong>{account.user_id ?? 'anonymized'}</strong>
                <span>
                  {account.status}{' '}
                  <button
                    type="button"
                    onClick={() =>
                      void accountAction(
                        account.platform_account_id,
                        account.status === 'suspended' ? 'restore' : 'suspend',
                      )
                    }
                  >
                    {account.status === 'suspended' ? '恢复' : '暂停'}
                  </button>{' '}
                  <button
                    type="button"
                    onClick={() =>
                      void accountAction(account.platform_account_id, 'close')
                    }
                  >
                    关闭
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <a className="link" href="/admin">
        返回控制中心
      </a>
    </main>
  );
}
