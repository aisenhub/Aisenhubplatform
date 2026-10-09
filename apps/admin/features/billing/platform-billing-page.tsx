'use client';

import { useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { AdminPageHeader } from '../../components/shell/admin-page-header';
import { usePlatformContext } from '../../components/platform-context/platform-workspace';
import { BillingOrderWorkspace } from './billing-order-workspace';
import {
  billingFiltersFromSearchParams,
  billingFiltersToSearchParams,
  type BillingFilters,
} from './billing-types';

function hrefWithFilters(
  pathname: string,
  filters: BillingFilters,
  selectedOrderId?: string | null,
): string {
  const scoped = { ...filters, platformId: '' };
  const encoded = billingFiltersToSearchParams(
    scoped,
    selectedOrderId,
  ).toString();
  return encoded ? `${pathname}?${encoded}` : pathname;
}

export function PlatformBillingPage() {
  const { platform } = usePlatformContext();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const filters = useMemo(() => {
    const parsed = billingFiltersFromSearchParams(searchParams);
    return { ...parsed, platformId: '' };
    // Serialized URL state is the deterministic dependency for browser
    // back/forward and copied deep links.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchKey]);
  const selectedOrderId = searchParams.get('selected');

  const platformTitle = platform ? `${platform.name} 订单与计费` : '订单与计费';
  const platformDesc = platform
    ? `管理 ${platform.name}（${platform.code}）平台的支付订单、结算状态、证据时间线与异常处理；平台范围由 URL 工作区锁定。`
    : '管理当前平台的支付订单与异常处理。';

  function updateFilters(next: BillingFilters) {
    router.replace(hrefWithFilters(pathname, next));
  }

  function updateSelected(orderId: string | null) {
    router.replace(hrefWithFilters(pathname, filters, orderId));
  }

  return (
    <main
      className="shell wide-shell space-y-6"
      data-test="platform-billing-page"
    >
      <AdminPageHeader title={platformTitle} description={platformDesc} />
      {platform?.platform_id ? (
        <BillingOrderWorkspace
          filters={filters}
          onFiltersChange={updateFilters}
          onSelectedOrderChange={updateSelected}
          platformId={platform.platform_id}
          selectedOrderId={selectedOrderId}
        />
      ) : null}
    </main>
  );
}
