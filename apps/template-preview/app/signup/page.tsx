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

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ConsumerError | null>(null);
  const [confirmationRequired, setConfirmationRequired] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setConfirmationRequired(false);
    try {
      const response = await consumerAuthSession.request(
        '/api/auth/signup',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        },
        { replay: 'never' },
      );
      const payload = (await response.json().catch(() => null)) as {
        data?: { needs_email_confirmation?: boolean };
      } | null;
      if (!response.ok) {
        setError(await errorFromResponse(response, '注册'));
        return;
      }
      if (payload?.data?.needs_email_confirmation) {
        setConfirmationRequired(true);
        return;
      }
      consumerAuthSession.completeAuthentication();
      window.location.assign('/subscription');
    } catch (caught) {
      setError(errorFromException('注册', caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <ConsumerShell
      title="创建账户"
      description="创建后即可进入账户工作区。你的账户数据不会出现在公开套餐页面。"
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
      {confirmationRequired ? (
        <ConsumerNotice
          title="注册成功"
          description="请检查邮箱完成确认，再返回登录。"
          tone="success"
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
            autoComplete="email"
            required
          />
        </div>
        <div className="consumer-field">
          <Label htmlFor="password">密码（至少 8 位）</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
          <span className="consumer-field-hint">
            请使用你能安全保存的密码。
          </span>
        </div>
        <div className="consumer-actions">
          <Button
            type="submit"
            disabled={pending}
            data-test="consumer-signup-submit"
          >
            {pending ? '创建中…' : '创建账户'}
          </Button>
          <Link className="consumer-inline-link" href="/login">
            返回登录
          </Link>
        </div>
        {pending ? <ConsumerStatus busy>正在创建账户…</ConsumerStatus> : null}
      </form>
    </ConsumerShell>
  );
}
