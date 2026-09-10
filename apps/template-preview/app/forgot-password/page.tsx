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

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ConsumerError | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSent(false);
    try {
      const response = await consumerAuthSession.request(
        '/api/auth/forgot-password',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        },
        { replay: 'never' },
      );
      if (!response.ok) {
        setError({
          title: '暂时无法发送邮件',
          description: '请稍后重试。如果邮箱可用，系统会发送重置链接。',
          requestId: response.headers.get('x-request-id'),
          technicalDetail: null,
        });
        return;
      }
      setSent(true);
    } catch (caught) {
      setError(errorFromException('密码重置', caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <ConsumerShell
      title="找回密码"
      description="为了保护账户，即使邮箱不存在，页面也会使用一致的提示。"
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
      {sent ? (
        <ConsumerNotice
          title="请检查邮箱"
          description="如果邮箱可用，重置链接将发送到邮箱。"
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
        <div className="consumer-actions">
          <Button
            type="submit"
            disabled={pending}
            data-test="consumer-forgot-submit"
          >
            {pending ? '发送中…' : '发送重置邮件'}
          </Button>
          <Link className="consumer-inline-link" href="/login">
            返回登录
          </Link>
        </div>
        {pending ? (
          <ConsumerStatus busy>正在发送重置邮件…</ConsumerStatus>
        ) : null}
      </form>
    </ConsumerShell>
  );
}
