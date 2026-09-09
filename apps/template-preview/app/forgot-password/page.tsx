'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('正在发送重置邮件…');
    const response = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: window.location.origin,
      },
      body: JSON.stringify({ email }),
    });
    setStatus(
      response.ok
        ? '如果邮箱可用，重置链接将发送到邮箱。'
        : '请求失败，请稍后重试。',
    );
  }

  return (
    <main className="shell">
      <p className="eyebrow">Template Preview</p>
      <h1>Forgot password</h1>
      <form className="panel stack-form" onSubmit={submit}>
        <label htmlFor="email">邮箱</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <button type="submit">发送重置邮件</button>
        <span className="muted" role="status">
          {status}
        </span>
      </form>
      <a className="link" href="/login">
        返回登录
      </a>
    </main>
  );
}
