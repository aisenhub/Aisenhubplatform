'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';

import {
  adminAuthSession,
  responseErrorCode,
  sessionErrorMessage,
} from '../../_lib/auth-session';

export default function AdminLoginPage() {
  const [hydrated, setHydrated] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => setHydrated(true), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setStatus('正在登录…');
    let response: Response;
    try {
      response = await adminAuthSession.login({
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
    } catch (error) {
      setStatus(sessionErrorMessage(error));
      setSubmitting(false);
      return;
    }
    if (!response.ok) {
      setStatus(`登录失败：${await responseErrorCode(response)}`);
      setSubmitting(false);
      return;
    }
    adminAuthSession.markStepUpRequired('admin_mfa');
    window.location.assign('/admin/mfa');
  }

  const isError = Boolean(
    status &&
    (status.includes('失败') ||
      status.includes('错误') ||
      status.includes('UNAVAILABLE')),
  );

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
        data-hydrated={hydrated ? 'true' : 'false'}
      >
        <Label htmlFor="email">管理员邮箱</Label>
        <Input
          id="email"
          name="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="username"
          placeholder="admin@example.test"
          required
          disabled={submitting}
        />
        <Label htmlFor="password">密码</Label>
        <Input
          id="password"
          name="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
          disabled={submitting}
        />
        <Button
          type="submit"
          data-test="admin-login-submit"
          disabled={!hydrated || submitting}
          className="w-full"
        >
          {submitting ? (
            <>
              <Loader2
                className="mr-2 size-4 animate-spin"
                aria-hidden="true"
              />
              <span>正在登录…</span>
            </>
          ) : (
            <span>登录</span>
          )}
        </Button>
        {status ? (
          <span
            className={
              isError
                ? 'rounded-md border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive'
                : 'muted text-xs'
            }
            role={isError ? 'alert' : 'status'}
          >
            {status}
          </span>
        ) : null}
      </form>
    </main>
  );
}
