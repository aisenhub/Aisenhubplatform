'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Button } from '@kit/ui/button';

import { adminAuthSession } from '../../app/_lib/auth-session';

type Attribution = {
  platform_account_id: string;
  entitlement_source: 'billing_order' | 'redemption_code' | 'admin' | null;
  grant_id: string | null;
  billing_order_id: string | null;
  redemption_batch_id: string | null;
  commercial_offer_id: string | null;
  offer_code: string | null;
};

export function AccountCommerceAttribution({
  platformId,
  accountId,
}: {
  platformId: string;
  accountId: string;
}) {
  const [fact, setFact] = useState<Attribution | null>(null);

  useEffect(() => {
    const epoch = adminAuthSession.getEpoch();
    const params = new URLSearchParams({ q: accountId, limit: '20' });
    void adminAuthSession
      .request(
        `/api/v1/admin/api/v1/platforms/${encodeURIComponent(platformId)}/commerce/entitlements?${params}`,
        { cache: 'no-store' },
      )
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as {
          data?: Attribution[];
        } | null;
        if (!adminAuthSession.isCurrentEpoch(epoch) || !response.ok) return;
        setFact(
          payload?.data?.find((row) => row.platform_account_id === accountId) ??
            null,
        );
      })
      .catch(() => undefined);
  }, [accountId, platformId]);

  if (!fact) return null;
  const source =
    fact.entitlement_source === 'billing_order'
      ? 'Billing 购买'
      : fact.entitlement_source === 'redemption_code'
        ? '兑换码'
        : fact.entitlement_source === 'admin'
          ? '手工/补偿权益'
          : '来源待确认';

  return (
    <div
      className="rounded-lg border border-border/70 p-3 text-sm"
      data-test="account-commerce-attribution"
    >
      <p>
        <strong>权益来源：</strong>
        {source}
      </p>
      <p className="mt-1 text-muted-foreground">
        Grant {fact.grant_id ?? '—'}
        {fact.offer_code ? ` · Offer ${fact.offer_code}` : ''}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          nativeButton={false}
          render={
            <Link
              href={`/admin/platforms/${encodeURIComponent(platformId)}/subscriptions?account=${encodeURIComponent(accountId)}`}
            />
          }
        >
          打开权益工作台
        </Button>
        {fact.billing_order_id ? (
          <Button
            size="sm"
            variant="outline"
            nativeButton={false}
            render={
              <Link
                href={`/admin/platforms/${encodeURIComponent(platformId)}/billing?order=${encodeURIComponent(fact.billing_order_id)}`}
              />
            }
          >
            查看来源订单
          </Button>
        ) : null}
        {fact.redemption_batch_id ? (
          <Button
            size="sm"
            variant="outline"
            nativeButton={false}
            render={
              <Link
                href={`/admin/platforms/${encodeURIComponent(platformId)}/redemption`}
              />
            }
          >
            查看兑换 Campaign
          </Button>
        ) : null}
      </div>
    </div>
  );
}
