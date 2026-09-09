'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import {
  consumerAuthSession,
  responseErrorCode,
  sessionErrorMessage,
  useConsumerSessionSnapshot,
} from '../_lib/auth-session';

type Profile = {
  display_name: string | null;
  bio: string | null;
  locale: string | null;
  timezone: string | null;
  row_version: number;
};

type Preferences = {
  preferences: Record<string, unknown>;
  row_version: number;
};

export default function AccountPage() {
  const sessionSnapshot = useConsumerSessionSnapshot();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [preferenceText, setPreferenceText] = useState('{}');
  const [tokenHash, setTokenHash] = useState('');
  const [status, setStatus] = useState('正在读取账户资料…');

  useEffect(() => {
    if (
      !sessionSnapshot.resolved ||
      !['unauthenticated', 'expired'].includes(sessionSnapshot.state)
    )
      return;
    setProfile(null);
    setPreferences(null);
    setDisplayName('');
    setBio('');
    setPreferenceText('{}');
    setTokenHash('');
    setStatus('会话已结束，账户资料已清理。');
  }, [sessionSnapshot.resolved, sessionSnapshot.state]);

  async function load() {
    const epoch = consumerAuthSession.getEpoch();
    let profileResponse: Response;
    let preferencesResponse: Response;
    try {
      [profileResponse, preferencesResponse] = await Promise.all([
        consumerAuthSession.request('/api/v1/profile'),
        consumerAuthSession.request('/api/v1/preferences'),
      ]);
    } catch (error) {
      if (consumerAuthSession.isCurrentEpoch(epoch))
        setStatus(sessionErrorMessage(error));
      return;
    }
    if (!profileResponse.ok || !preferencesResponse.ok) {
      const code = await responseErrorCode(profileResponse);
      if (consumerAuthSession.isCurrentEpoch(epoch))
        setStatus(`账户资料读取失败：${code}`);
      return;
    }
    const nextProfile = (await profileResponse.json()).data as Profile;
    const nextPreferences = (await preferencesResponse.json())
      .data as Preferences;
    if (!consumerAuthSession.isCurrentEpoch(epoch)) return;
    setProfile(nextProfile);
    setPreferences(nextPreferences);
    setDisplayName(nextProfile.display_name ?? '');
    setBio(nextProfile.bio ?? '');
    setPreferenceText(JSON.stringify(nextPreferences.preferences, null, 2));
    setStatus('资料和偏好已从 Account API 读取。');
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    const epoch = consumerAuthSession.getEpoch();
    let response: Response;
    try {
      response = await consumerAuthSession.request(
        '/api/v1/profile',
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'If-Match': `W/"${profile.row_version}"`,
          },
          body: JSON.stringify({ display_name: displayName, bio }),
        },
        { replay: 'never' },
      );
    } catch (error) {
      if (consumerAuthSession.isCurrentEpoch(epoch))
        setStatus(sessionErrorMessage(error));
      return;
    }
    if (!consumerAuthSession.isCurrentEpoch(epoch)) return;
    setStatus(
      response.ok ? '资料已保存。' : '资料保存失败，可能需要刷新版本。',
    );
    if (response.ok) await load();
  }

  async function savePreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preferences) return;
    const epoch = consumerAuthSession.getEpoch();
    let value: unknown;
    try {
      value = JSON.parse(preferenceText);
    } catch {
      setStatus('偏好必须是 JSON 对象。');
      return;
    }
    if (!value || Array.isArray(value) || typeof value !== 'object') {
      setStatus('偏好必须是 JSON 对象。');
      return;
    }
    let response: Response;
    try {
      response = await consumerAuthSession.request(
        '/api/v1/preferences',
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'If-Match': `W/"${preferences.row_version}"`,
          },
          body: JSON.stringify(value),
        },
        { replay: 'never' },
      );
    } catch (error) {
      if (consumerAuthSession.isCurrentEpoch(epoch))
        setStatus(sessionErrorMessage(error));
      return;
    }
    if (!consumerAuthSession.isCurrentEpoch(epoch)) return;
    setStatus(
      response.ok ? '偏好已保存。' : '偏好保存失败，可能需要刷新版本。',
    );
    if (response.ok) await load();
  }

  async function requestReauth() {
    const epoch = consumerAuthSession.getEpoch();
    let response: Response;
    try {
      response = await consumerAuthSession.request(
        '/api/auth/reauth/start',
        { method: 'POST' },
        { replay: 'never' },
      );
    } catch (error) {
      if (consumerAuthSession.isCurrentEpoch(epoch))
        setStatus(sessionErrorMessage(error));
      return;
    }
    if (!consumerAuthSession.isCurrentEpoch(epoch)) return;
    setStatus(
      response.ok
        ? '验证邮件已发送，请粘贴邮件链接中的 token_hash。'
        : '近期认证邮件发送失败。',
    );
  }

  async function verifyReauth() {
    const epoch = consumerAuthSession.getEpoch();
    let response: Response;
    try {
      response = await consumerAuthSession.request(
        '/api/auth/reauth/verify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token_hash: tokenHash }),
        },
        { replay: 'never' },
      );
    } catch (error) {
      if (consumerAuthSession.isCurrentEpoch(epoch))
        setStatus(sessionErrorMessage(error));
      return;
    }
    if (!consumerAuthSession.isCurrentEpoch(epoch)) return;
    setStatus(
      response.ok ? '近期认证已完成，可执行敏感账户操作。' : '近期认证未通过。',
    );
    if (response.ok) setTokenHash('');
  }

  async function sensitiveAction(path: string) {
    const epoch = consumerAuthSession.getEpoch();
    let response: Response;
    try {
      response = await consumerAuthSession.request(
        path,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        },
        { replay: 'never' },
      );
    } catch (error) {
      if (consumerAuthSession.isCurrentEpoch(epoch))
        setStatus(sessionErrorMessage(error));
      return;
    }
    if (!consumerAuthSession.isCurrentEpoch(epoch)) return;
    setStatus(
      response.ok ? '敏感操作已提交。' : '敏感操作被拒绝，请先完成近期认证。',
    );
  }

  return (
    <main className="shell wide-shell">
      <p className="eyebrow">Template Preview · M2</p>
      <h1>Account settings</h1>
      <p className="muted">
        资料、偏好和敏感账户动作都通过同源 BFF；If-Match 冲突不会静默覆盖。
      </p>
      <p className="muted">{status}</p>
      <section className="grid-two">
        <form className="panel stack-form" onSubmit={saveProfile}>
          <h2>Profile</h2>
          <label htmlFor="display-name">显示名称</label>
          <input
            id="display-name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
          <label htmlFor="bio">简介</label>
          <textarea
            id="bio"
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            rows={4}
          />
          <button type="submit" disabled={!profile}>
            保存资料
          </button>
        </form>
        <form className="panel stack-form" onSubmit={savePreferences}>
          <h2>Preferences</h2>
          <label htmlFor="preferences">JSON Merge Patch</label>
          <textarea
            id="preferences"
            value={preferenceText}
            onChange={(event) => setPreferenceText(event.target.value)}
            rows={8}
          />
          <button type="submit" disabled={!preferences}>
            保存偏好
          </button>
        </form>
      </section>
      <section className="panel">
        <h2>近期认证</h2>
        <p className="muted">
          邮件事件只用于签发绑定当前会话的短期 proof；临时 Auth session
          不会返回浏览器。
        </p>
        <button type="button" onClick={() => void requestReauth()}>
          发送验证邮件
        </button>
        <input
          value={tokenHash}
          onChange={(event) => setTokenHash(event.target.value)}
          placeholder="粘贴 token_hash"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => void verifyReauth()}
          disabled={!tokenHash}
        >
          验证并签发 proof
        </button>
        <div className="inline-form">
          <button
            type="button"
            onClick={() => void sensitiveAction('/api/v1/account/close')}
          >
            关闭当前平台账户
          </button>
          <button
            type="button"
            onClick={() =>
              void sensitiveAction('/api/v1/identity/delete-request')
            }
          >
            提交全局删除请求
          </button>
        </div>
      </section>
      <nav className="actions" aria-label="Account navigation">
        <a className="link" href="/files">
          管理配置文件
        </a>
        <a className="link" href="/subscription">
          查看订阅
        </a>
        <a className="link" href="/">
          返回首页
        </a>
      </nav>
    </main>
  );
}
