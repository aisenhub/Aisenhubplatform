'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

type Factor = {
  id: string;
  factor_type: string;
  friendly_name: string | null;
};

function csrfToken(): string {
  return (
    document.cookie
      .split('; ')
      .find((entry) => entry.startsWith('aisenhub-csrf='))
      ?.split('=')[1] ?? ''
  );
}

export default function AdminMfaPage() {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [factorId, setFactorId] = useState('');
  const [code, setCode] = useState('');
  const [status, setStatus] = useState('正在读取已验证的 MFA 因子…');

  useEffect(() => {
    void fetch('/api/auth/mfa/factors', {
      headers: { Accept: 'application/json', Origin: window.location.origin },
      cache: 'no-store',
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as {
          data?: { factors?: Factor[] };
        } | null;
        if (!response.ok || !payload?.data?.factors?.length) {
          setStatus('没有可用的已验证 MFA 因子，管理员会话保持受限。');
          return;
        }
        setFactors(payload.data.factors);
        setFactorId(payload.data.factors[0]?.id ?? '');
        setStatus('请输入认证器中的 6 位验证码。');
      })
      .catch(() => setStatus('MFA 服务暂时不可用，请稍后重试。'));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('正在验证 MFA 并获取近期认证证明…');
    const response = await fetch('/api/auth/mfa/verify', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Origin: window.location.origin,
        'X-CSRF-Token': csrfToken(),
      },
      body: JSON.stringify({ factor_id: factorId, code }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        data?: { code?: string };
      } | null;
      setStatus(
        `MFA 失败：${payload?.data?.code ?? 'AUTHORIZATION_UNAVAILABLE'}`,
      );
      return;
    }
    window.location.assign('/admin');
  }

  return (
    <main className="shell">
      <p className="eyebrow">Aisenhub Admin</p>
      <h1>Confirm administrator MFA</h1>
      <p className="muted">
        Admin 操作需要 AAL2；验证成功后，服务端向当前 session 绑定 5 分钟
        proof，浏览器不会自行提交 proof。
      </p>
      <form className="panel stack-form" onSubmit={submit}>
        <label htmlFor="factor">认证器</label>
        <select
          id="factor"
          value={factorId}
          onChange={(event) => setFactorId(event.target.value)}
          required
        >
          {factors.map((factor) => (
            <option key={factor.id} value={factor.id}>
              {factor.friendly_name ?? factor.factor_type}
            </option>
          ))}
        </select>
        <label htmlFor="code">验证码</label>
        <input
          id="code"
          inputMode="numeric"
          pattern="[0-9]{6}"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          autoComplete="one-time-code"
          maxLength={6}
          required
        />
        <button type="submit" disabled={!factorId || code.length !== 6}>
          验证并继续
        </button>
        <span className="muted" role="status">
          {status}
        </span>
      </form>
    </main>
  );
}
