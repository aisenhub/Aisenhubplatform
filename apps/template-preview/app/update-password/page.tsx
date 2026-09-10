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
  type ConsumerError,
} from '../../components/consumer-state';
import { consumerAuthSession } from '../_lib/auth-session';

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ConsumerError | null>(null);
  const [updated, setUpdated] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setUpdated(false);
    try {
      const response = await consumerAuthSession.request(
        '/api/auth/password',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
        },
        { replay: 'never' },
      );
      if (!response.ok) {
        setError({
          title: '密码更新失败',
          description: '请重新获取重置链接后再试。',
          requestId: response.headers.get('x-request-id'),
          technicalDetail: null,
        });
        return;
      }
      setUpdated(true);
      setPassword('');
    } catch (caught) {
      setError(errorFromException('密码更新', caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <ConsumerShell
      title="设置新密码"
      description="此页面只使用回调设置的 HttpOnly session，不接收或显示 reset token。"
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
      {updated ? (
        <ConsumerNotice
          title="密码已更新"
          description="请使用新密码登录账户。"
          tone="success"
          action={<Button render={<Link href="/login" />}>返回登录</Button>}
        />
      ) : null}
      <form className="consumer-card consumer-form" onSubmit={submit}>
        <div className="consumer-field">
          <Label htmlFor="password">新密码（至少 8 位）</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
        <div className="consumer-actions">
          <Button
            type="submit"
            disabled={pending}
            data-test="consumer-password-submit"
          >
            {pending ? '更新中…' : '更新密码'}
          </Button>
          <Link className="consumer-inline-link" href="/login">
            返回登录
          </Link>
        </div>
        {pending ? <ConsumerStatus busy>正在更新密码…</ConsumerStatus> : null}
      </form>
    </ConsumerShell>
  );
}
