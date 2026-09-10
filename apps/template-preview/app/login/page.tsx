'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { FormEvent } from 'react';

import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';

import { ConsumerShell } from '../../components/consumer-shell';
import {
  ConsumerNotice,
  ConsumerStatus,
  errorFromException,
  errorFromResponse,
  type ConsumerError,
} from '../../components/consumer-state';
import { consumerAuthSession } from '../_lib/auth-session';

export default function ConsumerLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ConsumerError | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await consumerAuthSession.login({
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        setError(await errorFromResponse(response, '登录'));
        return;
      }
      window.location.assign('/subscription');
    } catch (caught) {
      setError(errorFromException('登录', caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <ConsumerShell
      eyebrow="Welcome back"
      title="登录你的账户"
      description="登录后，账户、订阅和文件数据会通过同源 BFF 读取。"
      narrow
    >
      {error ? (
        <ConsumerNotice
          title={error.title}
          description={error.description}
          tone="danger"
          requestId={error.requestId}
          technicalDetail={error.technicalDetail}
        />
      ) : null}
      <form className="consumer-card consumer-form" onSubmit={submit}>
        <div className="consumer-field">
          <Label htmlFor="email">邮箱</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
            required
          />
        </div>
        <div className="consumer-field">
          <Label htmlFor="password">密码</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        <div className="consumer-actions">
          <Button
            type="submit"
            disabled={pending}
            data-test="consumer-login-submit"
          >
            {pending ? '登录中…' : '登录'}
          </Button>
          <Link className="consumer-inline-link" href="/forgot-password">
            忘记密码
          </Link>
        </div>
        {pending ? <ConsumerStatus busy>正在登录…</ConsumerStatus> : null}
      </form>
      <p className="consumer-help">
        还没有账户？{' '}
        <Link className="consumer-inline-link" href="/signup">
          创建账户
        </Link>
      </p>
    </ConsumerShell>
  );
}
