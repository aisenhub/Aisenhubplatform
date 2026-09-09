'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';

import {
  consumerAuthSession,
  responseErrorCode,
  sessionErrorMessage,
} from '../_lib/auth-session';

export default function ConsumerLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('正在登录…');
    let response: Response;
    try {
      response = await consumerAuthSession.login({
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
    } catch (error) {
      setStatus(sessionErrorMessage(error));
      return;
    }
    if (!response.ok) {
      setStatus(`登录失败：${await responseErrorCode(response)}`);
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
      <nav className="actions" aria-label="Account recovery">
        <a className="link" href="/signup">
          创建账户
        </a>
        <a className="link" href="/forgot-password">
          忘记密码
        </a>
      </nav>
    </main>
  );
}
