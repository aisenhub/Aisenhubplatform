'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';

export default function ConsumerLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('正在登录…');
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: window.location.origin,
      },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        data?: { code?: string };
      } | null;
      setStatus(
        `登录失败：${payload?.data?.code ?? 'AUTHORIZATION_UNAVAILABLE'}`,
      );
      return;
    }
    window.location.assign('/subscription');
  }

  return (
    <main className="shell">
      <p className="eyebrow">Template Preview</p>
      <h1>Consumer login</h1>
      <p className="muted">登录后由同源 BFF 访问 Account API。</p>
      <form className="panel stack-form" onSubmit={submit}>
        <label htmlFor="email">邮箱</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="username"
          required
        />
        <label htmlFor="password">密码</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
        />
        <button type="submit">登录</button>
        <span className="muted" role="status">
          {status}
        </span>
      </form>
    </main>
  );
}
