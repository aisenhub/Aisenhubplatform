'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('正在创建账户…');
    const response = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: window.location.origin,
      },
      body: JSON.stringify({ email, password }),
    });
    const payload = (await response.json().catch(() => null)) as {
      data?: { needs_email_confirmation?: boolean };
      error?: { code?: string };
    } | null;
    if (!response.ok) {
      setStatus(`注册失败：${payload?.error?.code ?? response.status}`);
      return;
    }
    setStatus(
      payload?.data?.needs_email_confirmation
        ? '注册成功，请检查邮箱完成确认。'
        : '注册成功，正在进入账户…',
    );
    if (!payload?.data?.needs_email_confirmation)
      window.location.assign('/subscription');
  }

  return (
    <main className="shell">
      <p className="eyebrow">Template Preview</p>
      <h1>Create account</h1>
      <form className="panel stack-form" onSubmit={submit}>
        <label htmlFor="email">邮箱</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <label htmlFor="password">密码（至少 8 位）</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          minLength={8}
          required
        />
        <button type="submit">注册</button>
        <span className="muted" role="status">
          {status}
        </span>
      </form>
      <a className="link" href="/login">
        已有账户？登录
      </a>
    </main>
  );
}
