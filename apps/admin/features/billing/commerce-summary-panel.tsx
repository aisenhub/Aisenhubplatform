'use client';

import { useCallback, useEffect, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { Button } from '@kit/ui/button';

import {
  adminAuthSession,
  sessionErrorMessage,
} from '../../app/_lib/auth-session';
import {
  readApiPayload,
  resourceError,
  type ResourceError,
} from '../resources/admin-resource-utils';

export type CommerceSummary = {
  platform_id: string | null;
  period_start: string;
  period_end: string;
  currency: 'CNY';
  active_paid_entitlement_accounts: number | string;
  billing_grant_count: number | string;
  admin_grant_count: number | string;
  redemption_grant_count: number | string;
  verified_gross_amount: number | string;
  compensated_refund_amount: number | string;
  net_verified_amount: number | string;
  amount_unknown_count: number | string;
  refund_amount_unknown_count: number | string;
  expiring_paid_entitlement_accounts: number | string;
};

function count(value: number | string): string {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? new Intl.NumberFormat('zh-CN').format(numeric)
    : String(value);
}

function money(value: number | string): string {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? new Intl.NumberFormat('zh-CN', {
        style: 'currency',
        currency: 'CNY',
        minimumFractionDigits: 2,
      }).format(numeric)
    : `${value} CNY`;
}

export function CommerceSummaryPanel({
  platformId,
  title = '经营摘要',
}: {
  platformId?: string;
  title?: string;
}) {
  const [summary, setSummary] = useState<CommerceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ResourceError | null>(null);

  const load = useCallback(async () => {
    const epoch = adminAuthSession.getEpoch();
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (platformId) params.set('platform_id', platformId);
      const response = await adminAuthSession.request(
        `/api/v1/admin/api/v1/commerce/summary${params.size ? `?${params}` : ''}`,
        { cache: 'no-store' },
      );
      const payload = await readApiPayload<CommerceSummary>(response);
      if (!adminAuthSession.isCurrentEpoch(epoch)) return;
      if (!response.ok || !payload?.data) {
        setError(resourceError(response, payload, '经营摘要'));
        return;
      }
      setSummary(payload.data);
    } catch (caught) {
      if (!adminAuthSession.isCurrentEpoch(epoch)) return;
      setError({
        title: '经营摘要读取失败',
        description: sessionErrorMessage(caught),
        requestId: null,
        technicalDetail: null,
      });
    } finally {
      if (adminAuthSession.isCurrentEpoch(epoch)) setLoading(false);
    }
  }, [platformId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="grid gap-4" data-test="commerce-summary-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2>{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            仅统计已验证并最终授予权益的结算事实，以及已完成补偿的退款；这些数字不是
            Revenue、MRR 或 ARR。
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? '读取中…' : '刷新摘要'}
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>{error.title}</AlertTitle>
          <AlertDescription>{error.description}</AlertDescription>
        </Alert>
      ) : null}

      {loading && !summary ? (
        <div className="panel text-sm text-muted-foreground">
          正在读取可核实商业事实…
        </div>
      ) : summary ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              [
                '当前有效付费权益账户',
                count(summary.active_paid_entitlement_accounts),
              ],
              ['可核实成交', money(summary.verified_gross_amount)],
              ['已补偿退款', money(summary.compensated_refund_amount)],
              ['净可核实成交额', money(summary.net_verified_amount)],
              ['期间 Billing Grant', count(summary.billing_grant_count)],
              ['期间手工/补偿权益', count(summary.admin_grant_count)],
              ['期间兑换权益', count(summary.redemption_grant_count)],
              [
                '30 天内即将到期',
                count(summary.expiring_paid_entitlement_accounts),
              ],
            ].map(([label, value], index) => (
              <article
                className="panel gap-1"
                key={label}
                data-test={
                  index === 0 ? 'commerce-summary-paid-accounts' : undefined
                }
              >
                <span className="text-xs text-muted-foreground">{label}</span>
                <strong className="text-xl tabular-nums">{value}</strong>
              </article>
            ))}
          </div>
          {Number(summary.amount_unknown_count) > 0 ||
          Number(summary.refund_amount_unknown_count) > 0 ? (
            <Alert>
              <AlertTitle>存在无法证明金额的事实</AlertTitle>
              <AlertDescription>
                {count(summary.amount_unknown_count)}{' '}
                个成功订单金额未进入成交额，
                {count(summary.refund_amount_unknown_count)}{' '}
                个补偿退款金额未进入退款额。 页面不会用 0 或推测金额补齐。
              </AlertDescription>
            </Alert>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
