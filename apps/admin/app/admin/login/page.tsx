'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';

import {
  adminAuthSession,
  responseErrorCode,
  sessionErrorMessage,
} from '../../_lib/auth-session';

export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('正在登录…');
    let response: Response;
    try {
      response = await adminAuthSession.login({
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
    adminAuthSession.markStepUpRequired('admin_mfa');
    window.location.assign('/admin/mfa');
  }

  return (
    <main className="admin-auth-layout" data-test="admin-login-page">
      <div className="admin-auth-brand" aria-label="Aisenhub 管理工作台">
        <span className="admin-auth-brand-mark">A</span>
        <span>Aisenhub</span>
        <span className="admin-auth-brand-note">管理工作台</span>
      </div>
      <div className="admin-auth-copy">
        <h1>登录管理员控制台</h1>
        <p className="muted">
          登录会建立管理员会话；计划和兑换写操作仍需要 AAL2 与近期认证证明。
        </p>
      </div>
      <form
        className="panel stack-form admin-auth-card"
        onSubmit={submit}
        data-test="admin-login-form"
      >
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
        <button type="submit" data-test="admin-login-submit">
          登录
        </button>
        <span className="muted" role="status">
          {status}
        </span>
      </form>
    </main>
  );
}
