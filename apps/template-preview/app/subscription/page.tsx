'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import {
  consumerAuthSession,
  responseErrorCode,
  sessionErrorMessage,
  useConsumerSessionSnapshot,
} from '../_lib/auth-session';

type Entitlement = {
  effective_status: string;
  entitlement_kind: string;
  plan: { code: string; name: string } | null;
  features: Record<string, unknown>;
  current_period_end: string | null;
};

export default function SubscriptionPage() {
  const sessionSnapshot = useConsumerSessionSnapshot();
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [code, setCode] = useState('');
  const [status, setStatus] = useState('正在读取账户权益…');

  useEffect(() => {
    if (
      !sessionSnapshot.resolved ||
      !['unauthenticated', 'expired'].includes(sessionSnapshot.state)
    )
      return;
    setEntitlement(null);
    setCode('');
    setStatus('会话已结束，权益数据已清理。');
  }, [sessionSnapshot.resolved, sessionSnapshot.state]);

  async function load() {
    const epoch = consumerAuthSession.getEpoch();
    let response: Response;
    try {
      response = await consumerAuthSession.request('/api/v1/subscription');
    } catch (error) {
      if (consumerAuthSession.isCurrentEpoch(epoch))
        setStatus(sessionErrorMessage(error));
      return;
    }
    if (!response.ok) {
      const code = await responseErrorCode(response);
      if (consumerAuthSession.isCurrentEpoch(epoch))
        setStatus(`权益读取失败：${code}`);
      return;
    }
    const payload = (await response.json()) as { data: Entitlement };
    if (!consumerAuthSession.isCurrentEpoch(epoch)) return;
    setEntitlement(payload.data);
    setStatus('权益已从 Account API 实时读取。');
  }

  useEffect(() => {
    void load();
  }, []);

  async function redeem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!code.trim()) return;
    const epoch = consumerAuthSession.getEpoch();
    setStatus('正在提交兑换…');
    let response: Response;
    try {
      response = await consumerAuthSession.request(
        '/api/v1/subscription/redeem',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': crypto.randomUUID(),
          },
          body: JSON.stringify({ code }),
        },
        { replay: 'never' },
      );
    } catch (error) {
      if (consumerAuthSession.isCurrentEpoch(epoch))
        setStatus(sessionErrorMessage(error));
      return;
    }
    if (!response.ok) {
      const code = await responseErrorCode(response);
      if (consumerAuthSession.isCurrentEpoch(epoch))
        setStatus(`兑换未完成：${code}`);
      return;
    }
    if (!consumerAuthSession.isCurrentEpoch(epoch)) return;
    setCode('');
    setStatus('兑换成功，正在刷新权益…');
    await load();
  }

  async function logout() {
    try {
      await consumerAuthSession.logout();
    } catch (error) {
      setStatus(sessionErrorMessage(error));
      return;
    }
    window.location.assign('/login');
  }

  return (
    <main className="shell">
      <p className="eyebrow">Template Preview · M3</p>
      <h1>Subscription</h1>
      <p className="muted">
        页面只调用同源 BFF；兑换规则、幂等和权益计算均由 Account
        API/数据库领域函数执行。
      </p>
      <section className="panel">
        <strong>{entitlement?.plan?.name ?? '未读取到权益'}</strong>
        <span className="muted">
          {entitlement
            ? `${entitlement.effective_status} · ${entitlement.entitlement_kind}`
            : status}
        </span>
        {entitlement?.current_period_end ? (
          <span className="muted">
            到期：
            {new Date(entitlement.current_period_end).toLocaleString('zh-CN')}
          </span>
        ) : null}
      </section>
      <form className="panel redeem-form" onSubmit={redeem}>
        <label htmlFor="subscription-code">兑换码</label>
        <input
          id="subscription-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="输入一次性兑换码"
          autoComplete="off"
        />
        <button type="submit">兑换</button>
        <span className="muted">{status}</span>
      </form>
      <a className="link" href="/pricing">
        查看公开套餐
      </a>
      <button type="button" onClick={() => void logout()}>
        退出登录
      </button>
    </main>
  );
}
