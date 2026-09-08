'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';

function csrfToken(): string {
  return (
    document.cookie
      .split('; ')
      .find((entry) => entry.startsWith('aisenhub-csrf='))
      ?.split('=')[1] ?? ''
  );
}

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('正在更新密码…');
    const response = await fetch('/api/auth/password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: window.location.origin,
        'X-CSRF-Token': csrfToken(),
      },
      body: JSON.stringify({ password }),
    });
    setStatus(response.ok ? '密码已更新。' : '更新失败，请重新获取重置链接。');
    if (response.ok) window.location.assign('/login');
  }

  return (
    <main className="shell">
      <p className="eyebrow">Template Preview</p>
      <h1>Set new password</h1>
      <p className="muted">
        此页面只使用回调设置的 HttpOnly session，不接收或显示 reset token。
      </p>
      <form className="panel stack-form" onSubmit={submit}>
        <label htmlFor="password">新密码（至少 8 位）</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          minLength={8}
          required
        />
        <button type="submit">更新密码</button>
        <span className="muted" role="status">
          {status}
        </span>
      </form>
    </main>
  );
}
