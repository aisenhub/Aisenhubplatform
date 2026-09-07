'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';

export default function AdminLoginPage() {
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
    window.location.assign('/admin');
  }

  return (
    <main className="shell">
      <p className="eyebrow">Aisenhub Admin</p>
      <h1>Sign in to the admin console</h1>
      <p className="muted">
        登录会建立管理员会话；计划和兑换写操作仍需要 AAL2 与近期认证证明。
      </p>
      <form className="panel stack-form" onSubmit={submit}>
        <label htmlFor="email">管理员邮箱</label>
        <input
          id="email"
          name="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="username"
          placeholder="admin@example.test"
          required
        />
        <label htmlFor="password">密码</label>
        <input
          id="password"
          name="password"
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
