'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { SessionRetryRequiredError } from '@kit/account-auth-nextjs/browser';
import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import type { MutationState } from '@kit/ui/mutation-state';

import {
  ConsumerLogoutButton,
  ConsumerShell,
} from '../../components/consumer-shell';
import {
  ConsumerEmptyState,
  ConsumerNotice,
  ConsumerRemoteStateView,
  ConsumerStatus,
  errorFromException,
  errorFromResponse,
  type ConsumerError,
  type ConsumerRemoteState,
} from '../../components/consumer-state';
import {
  consumerAuthSession,
  useConsumerSessionSnapshot,
} from '../_lib/auth-session';

type Entitlement = {
  effective_status: string;
  entitlement_kind: string;
  plan: { code: string; name: string } | null;
  features: Record<string, unknown>;
  current_period_end: string | null;
};

type RedemptionIntent = {
  code: string;
  idempotencyKey: string;
};

function entitlementStatus(value: string | undefined) {
  switch (value) {
    case 'active':
      return '当前有效';
    case 'suspended':
      return '已暂停';
    case 'none':
      return '暂无权益';
    default:
      return value ?? '未确认';
  }
}

function formatDate(value: string | null) {
  if (!value) return '无期限';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未提供';
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export default function SubscriptionPage() {
  const sessionSnapshot = useConsumerSessionSnapshot();
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [loadState, setLoadState] = useState<ConsumerRemoteState>('loading');
  const [loadError, setLoadError] = useState<ConsumerError | null>(null);
  const [refreshError, setRefreshError] = useState<ConsumerError | null>(null);
  const [code, setCode] = useState('');
  const [intent, setIntent] = useState<RedemptionIntent | null>(null);
  const [mutationState, setMutationState] =
    useState<MutationState>('confirm_required');
  const [mutationError, setMutationError] = useState<ConsumerError | null>(
    null,
  );

  const load = useCallback(async (background = false) => {
    if (background) setRefreshError(null);
    else {
      setLoadState('loading');
      setLoadError(null);
    }
    try {
      const response = await consumerAuthSession.request(
        '/api/v1/subscription',
        { cache: 'no-store' },
      );
      if (!response.ok) {
        const nextError = await errorFromResponse(response, '权益');
        if (background) setRefreshError(nextError);
        else {
          setLoadError(nextError);
          setLoadState(nextError.title === '需要登录' ? 'access' : 'error');
        }
        return;
      }
      const payload = (await response.json()) as { data?: Entitlement };
      if (!payload.data) {
        const nextError: ConsumerError = {
          title: '权益暂时不可用',
          description: '服务返回的数据暂时无法读取，请稍后重试。',
          requestId: response.headers.get('x-request-id'),
          technicalDetail: 'INVALID_RESPONSE',
        };
        if (background) setRefreshError(nextError);
        else {
          setLoadError(nextError);
          setLoadState('error');
        }
        return;
      }
      setEntitlement(payload.data);
      setLoadState('success');
      setLoadError(null);
      setRefreshError(null);
    } catch (caught) {
      const nextError = errorFromException('权益', caught);
      if (background) setRefreshError(nextError);
      else {
        setLoadError(nextError);
        setLoadState('error');
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (
      !sessionSnapshot.resolved ||
      !['unauthenticated', 'expired'].includes(sessionSnapshot.state)
    )
      return;
    setEntitlement(null);
    setCode('');
    setIntent(null);
    setMutationState('confirm_required');
    setMutationError(null);
    setLoadState('access');
  }, [sessionSnapshot.resolved, sessionSnapshot.state]);

  async function submitRedeem(nextIntent: RedemptionIntent) {
    setMutationState('pending');
    setMutationError(null);
    try {
      const response = await consumerAuthSession.request(
        '/api/v1/subscription/redeem',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': nextIntent.idempotencyKey,
          },
          body: JSON.stringify({ code: nextIntent.code }),
        },
        { replay: 'never' },
      );
      if (!response.ok) {
        setMutationState('failure');
        setMutationError(await errorFromResponse(response, '兑换'));
        return;
      }
      setCode('');
      setIntent(null);
      setMutationState('success');
      await load(true);
    } catch (caught) {
      if (caught instanceof SessionRetryRequiredError) {
        setMutationState('failure');
        setMutationError({
          title: '会话已恢复，请重新提交',
          description: '本次兑换没有自动重放；原兑换 intent 仍保留。',
          requestId: null,
          technicalDetail: null,
        });
        return;
      }
      setMutationState('unknown_outcome');
      setMutationError({
        title: '兑换结果待确认',
        description:
          '网络在服务端响应前中断。请使用同一 intent 重试或先刷新权益，不会自动创建新 key。',
        requestId: null,
        technicalDetail: null,
      });
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextCode = code.trim();
    if (!nextCode) return;
    const nextIntent =
      intent && intent.code === nextCode
        ? intent
        : { code: nextCode, idempotencyKey: crypto.randomUUID() };
    setIntent(nextIntent);
    void submitRedeem(nextIntent);
  }

  function changeCode(value: string) {
    setCode(value);
    if (intent && intent.code !== value.trim()) {
      setIntent(null);
      setMutationState('confirm_required');
      setMutationError(null);
    }
  }

  return (
    <ConsumerShell
      eyebrow="Subscription"
      title="订阅与兑换"
      description="权益状态由 Account API 实时判定。兑换会保留同一 logical intent；网络不确定时不会静默创建新的幂等 key。"
      headerActions={<ConsumerLogoutButton />}
    >
      {refreshError ? (
        <ConsumerNotice
          title="权益可能已过期"
          description={refreshError.description}
          tone="warning"
          requestId={refreshError.requestId}
          technicalDetail={refreshError.technicalDetail}
          action={<Button onClick={() => void load(true)}>刷新权益</Button>}
        />
      ) : null}
      {loadState === 'error' || loadState === 'access' ? (
        <ConsumerRemoteStateView
          state={loadState}
          error={loadError}
          onRetry={() => void load()}
        />
      ) : null}
      {loadState === 'loading' ? (
        <ConsumerRemoteStateView state="loading" />
      ) : null}
      {loadState === 'success' ? (
        <section className="consumer-card" data-test="subscription-entitlement">
          <div className="consumer-card-header">
            <div>
              <p className="consumer-eyebrow">Current entitlement</p>
              <h2 className="mt-2">
                {entitlement?.plan?.name ?? '暂无当前套餐'}
              </h2>
            </div>
            <span className="consumer-code">
              {entitlement?.plan?.code ?? 'none'}
            </span>
          </div>
          <div className="consumer-stat-grid">
            <div className="consumer-stat">
              <span className="consumer-stat-label">状态</span>
              <span className="consumer-stat-value text-base">
                {entitlementStatus(entitlement?.effective_status)}
              </span>
            </div>
            <div className="consumer-stat">
              <span className="consumer-stat-label">权益类型</span>
              <span className="consumer-stat-value text-base">
                {entitlement?.entitlement_kind ?? 'none'}
              </span>
            </div>
            <div className="consumer-stat">
              <span className="consumer-stat-label">当前周期结束</span>
              <span className="consumer-stat-value text-base">
                {formatDate(entitlement?.current_period_end ?? null)}
              </span>
            </div>
          </div>
          <p className="consumer-help">
            套餐信息和权益判定是两件事；公开套餐展示不会改变当前账户授权。
          </p>
        </section>
      ) : null}
      {loadState === 'success' && !entitlement ? (
        <ConsumerEmptyState title="暂无权益数据" description="请刷新后重试。" />
      ) : null}

      <section className="consumer-card" id="redeem">
        <div>
          <h2>兑换码</h2>
          <p className="consumer-card-description">
            输入一次性兑换码。失败或网络中断后，原码和 intent
            会保留，直到你明确更换输入。
          </p>
        </div>
        <form className="consumer-form" onSubmit={submit}>
          <div className="consumer-field">
            <Label htmlFor="subscription-code">兑换码</Label>
            <Input
              id="subscription-code"
              value={code}
              onChange={(event) => changeCode(event.target.value)}
              placeholder="输入一次性兑换码"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className="consumer-actions">
            <Button
              type="submit"
              disabled={!code.trim() || mutationState === 'pending'}
            >
              {mutationState === 'pending'
                ? '兑换中…'
                : intent
                  ? '使用同一 intent 重试'
                  : '兑换'}
            </Button>
            {mutationState === 'unknown_outcome' ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => intent && void submitRedeem(intent)}
              >
                重试同一 intent
              </Button>
            ) : null}
            <Link className="consumer-inline-link" href="/pricing">
              查看公开套餐
            </Link>
          </div>
          {mutationState === 'pending' ? (
            <ConsumerStatus busy>正在提交兑换…</ConsumerStatus>
          ) : null}
        </form>
        {mutationError ? (
          <ConsumerNotice
            title={mutationError.title}
            description={mutationError.description}
            tone={mutationState === 'unknown_outcome' ? 'warning' : 'danger'}
            requestId={mutationError.requestId}
            technicalDetail={mutationError.technicalDetail}
          />
        ) : null}
        {mutationState === 'success' ? (
          <ConsumerNotice
            title="兑换完成"
            description="权益正在重新读取；最终状态以 Account API 返回为准。"
            tone="success"
          />
        ) : null}
      </section>
    </ConsumerShell>
  );
}
