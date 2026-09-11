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
    try {
      const response = await consumerAuthSession.login({
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        setStatus(`登录失败：${await responseErrorCode(response)}`);
        return;
      }
      window.location.assign('/subscription');
    } catch (error) {
      setStatus(sessionErrorMessage(error));
    }
  }

  return (
    <main className="consumer-auth-layout">
      <div className="consumer-auth-brand">
        <span className="consumer-brand-mark">A</span>
        <span>Aisenhub</span>
      </div>
      <div className="consumer-auth-copy">
        <h1>登录个人工作区</h1>
        <p>登录后才能读取账户权益、兑换激活码和创建 Checkout。</p>
      </div>
      <form className="consumer-panel consumer-auth-card" onSubmit={submit}>
        <label htmlFor="consumer-email">邮箱</label>
        <input
          id="consumer-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="username"
          required
        />
        <label htmlFor="consumer-password">密码</label>
        <input
          id="consumer-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
        />
        <button
          className="consumer-button consumer-button-primary"
          type="submit"
        >
          登录
        </button>
        <span className="consumer-form-message" role="status">
          {status}
        </span>
      </form>
    </main>
  );
}
