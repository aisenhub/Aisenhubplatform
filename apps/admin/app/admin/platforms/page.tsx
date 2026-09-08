'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { AdminNav } from '../components/admin-nav';

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
};

function csrfToken(): string {
  return (
    document.cookie
      .split('; ')
      .find((entry) => entry.startsWith('aisenhub-csrf='))
      ?.split('=')[1] ?? ''
  );
}

function mutationHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Origin: window.location.origin,
    'X-CSRF-Token': csrfToken(),
  };
}

export default function PlatformsPage() {
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [origins, setOrigins] = useState<Origin[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [keys, setKeys] = useState<Key[]>([]);
  const [status, setStatus] = useState('正在读取平台…');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [origin, setOrigin] = useState('http://localhost:3000');
  const [keyName, setKeyName] = useState('BFF key');

  const loadPlatforms = useCallback(async () => {
    const response = await fetch('/api/v1/admin/api/v1/platforms', {
      cache: 'no-store',
    });
    if (!response.ok) {
      setStatus('平台读取失败，请确认管理员会话。');
      return;
    }
    const payload = (await response.json()) as { data?: Platform[] };
    const next = payload.data ?? [];
    setPlatforms(next);
    setSelectedId((current) => current || next[0]?.platform_id || '');
    setStatus(`已读取 ${next.length} 个平台。`);
  }, []);

  const loadSelected = useCallback(async () => {
    if (!selectedId) return;
    const prefix = `/api/v1/admin/api/v1/platforms/${selectedId}`;
    const [originResponse, accountResponse, keyResponse] = await Promise.all([
      fetch(`${prefix}/origins`, { cache: 'no-store' }),
      fetch(`${prefix}/accounts`, { cache: 'no-store' }),
      fetch(`${prefix}/keys`, { cache: 'no-store' }),
    ]);
    if (!originResponse.ok || !accountResponse.ok || !keyResponse.ok) {
      setStatus('平台详情读取失败。');
      return;
    }
    setOrigins(
      ((await originResponse.json()) as { data?: Origin[] }).data ?? [],
    );
    setAccounts(
      ((await accountResponse.json()) as { data?: Account[] }).data ?? [],
    );
    setKeys(((await keyResponse.json()) as { data?: Key[] }).data ?? []);
  }, [selectedId]);

  useEffect(() => {
    void loadPlatforms();
  }, [loadPlatforms]);

  useEffect(() => {
    void loadSelected();
  }, [loadSelected]);

  async function createPlatform(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch('/api/v1/admin/api/v1/platforms', {
      method: 'POST',
      headers: mutationHeaders(),
      body: JSON.stringify({
        code,
        name,
        status: 'active',
        allow_activation: true,
      }),
    });
    setStatus(response.ok ? '平台已创建。' : '平台创建失败。');
    if (response.ok) {
      setCode('');
      setName('');
      await loadPlatforms();
    }
  }

  async function patchPlatform(platform: Platform) {
    const response = await fetch(
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
    const response = await fetch(
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
    const response = await fetch(
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

  async function accountAction(
    accountId: string,
    action: 'suspend' | 'restore' | 'close',
  ) {
    const response = await fetch(
      `/api/v1/admin/api/v1/platforms/${selectedId}/accounts/${accountId}/${action}`,
      { method: 'POST', headers: mutationHeaders(), body: '{}' },
    );
    setStatus(
      response.ok ? `账户 ${action} 已提交。` : `账户 ${action} 失败。`,
    );
    if (response.ok) await loadSelected();
  }

  const selected = platforms.find(
    (platform) => platform.platform_id === selectedId,
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
          <ul className="data-list">
            {platforms.map((platform) => (
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
              <ul className="data-list">
                {origins.map((item) => (
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
              <ul className="data-list">
                {keys.map((item) => (
                  <li key={item.key_id}>
                    <strong>{item.name}</strong>
                    <span>
                      {item.status} · {item.key_prefix}…{item.key_suffix}
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
        {accounts.length === 0 ? (
          <p className="muted">暂无账户。</p>
        ) : (
          <ul className="data-list">
            {accounts.map((account) => (
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
