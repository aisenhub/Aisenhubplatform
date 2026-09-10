'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@kit/ui/button';

import { ConsumerShell } from '../../components/consumer-shell';
import {
  ConsumerEmptyState,
  ConsumerNotice,
  ConsumerRemoteStateView,
  errorFromException,
  errorFromResponse,
  type ConsumerError,
  type ConsumerRemoteState,
} from '../../components/consumer-state';

type PublicPlan = {
  code: string;
  name: string;
  description?: string | null;
  kind?: string | null;
  features?: Record<string, unknown>;
};

export default function PricingPage() {
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [state, setState] = useState<ConsumerRemoteState>('loading');
  const [error, setError] = useState<ConsumerError | null>(null);
  const [refreshError, setRefreshError] = useState<ConsumerError | null>(null);

  const load = useCallback(async (background = false) => {
    if (background) setRefreshError(null);
    else {
      setState('loading');
      setError(null);
    }
    try {
      const response = await fetch('/api/v1/plans', {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        const nextError = await errorFromResponse(response, '套餐');
        if (background) setRefreshError(nextError);
        else {
          setError(nextError);
          setState(nextError.title === '需要登录' ? 'access' : 'error');
        }
        return;
      }
      const payload = (await response.json()) as { data?: PublicPlan[] };
      if (!Array.isArray(payload.data)) {
        const nextError = {
          title: '套餐暂时不可用',
          description: '服务返回的数据格式暂时无法读取，请稍后重试。',
          requestId: response.headers.get('x-request-id'),
          technicalDetail: 'INVALID_RESPONSE',
        } satisfies ConsumerError;
        if (background) setRefreshError(nextError);
        else {
          setError(nextError);
          setState('error');
        }
        return;
      }
      setPlans(payload.data);
      setState('success');
      setError(null);
      setRefreshError(null);
    } catch (caught) {
      const nextError = errorFromException('套餐', caught);
      if (background) setRefreshError(nextError);
      else {
        setError(nextError);
        setState('error');
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ConsumerShell
      title="选择适合你的工作区"
      description="套餐信息来自公开 Plans API。展示套餐不代表账户已经获得对应权益；权益仍由登录后的 Account API 判定。"
      actions={
        <Button size="sm" render={<Link href="/login" />}>
          登录
        </Button>
      }
    >
      {refreshError ? (
        <ConsumerNotice
          title="套餐可能已过期"
          description={refreshError.description}
          tone="warning"
          requestId={refreshError.requestId}
          technicalDetail={refreshError.technicalDetail}
          action={<Button onClick={() => void load(true)}>重试刷新</Button>}
        />
      ) : null}
      {state === 'error' || state === 'access' ? (
        <ConsumerRemoteStateView
          state={state}
          error={error}
          onRetry={() => void load()}
        />
      ) : null}
      {state === 'loading' ? <ConsumerRemoteStateView state="loading" /> : null}
      {state === 'success' && plans.length === 0 ? (
        <ConsumerEmptyState
          title="暂时没有公开套餐"
          description="请稍后刷新，或直接联系支持了解可用方案。"
        />
      ) : null}
      {state === 'success' && plans.length > 0 ? (
        <section className="consumer-grid-two" aria-label="公开套餐列表">
          {plans.map((plan) => (
            <article key={plan.code} className="consumer-card">
              <div className="consumer-card-header">
                <div>
                  <h2>{plan.name}</h2>
                  <p className="consumer-card-meta">
                    {plan.kind === 'free' ? '免费套餐' : '付费套餐'}
                  </p>
                </div>
                <span className="consumer-code">{plan.code}</span>
              </div>
              <p className="consumer-card-description">
                {plan.description ?? '为你的工作区提供清晰、可控的使用能力。'}
              </p>
              <p className="consumer-help">登录后才能查看账户当前权益。</p>
              <Button variant="outline" render={<Link href="/signup" />}>
                创建账户
              </Button>
            </article>
          ))}
        </section>
      ) : null}
    </ConsumerShell>
  );
}
