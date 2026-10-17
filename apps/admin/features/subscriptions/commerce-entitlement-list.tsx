'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { StatusBadge } from '@kit/ui/status-badge';
import { NativeSelect } from '@kit/ui/native-select';

import {
  AdminTaskToolbar,
  AdminWorkspaceSection,
} from '../../components/workspace/admin-workspace';
import {
  adminAuthSession,
  sessionErrorMessage,
} from '../../app/_lib/auth-session';
import { usePlatformContext } from '../../components/platform-context/platform-workspace';
import {
  formatUtc,
  readApiPayload,
  resourceError,
  resourcePath,
  statusLabel,
  statusTone,
  type ResourceError,
} from '../resources/admin-resource-utils';

type Plan = {
  plan_id: string;
  code: string;
  name: string;
};

type EntitlementAccount = {
  platform_account_id: string;
  user_id: string | null;
  display_name: string | null;
  subscription_status: string;
  plan_id: string | null;
  plan_code: string | null;
  plan_name: string | null;
  entitlement_source: 'billing_order' | 'redemption_code' | 'admin' | null;
  offer_code: string | null;
  current_period_end: string | null;
  updated_at: string;
};

type PagePayload<T> = {
  data?: T;
  next_cursor?: string | null;
  request_id?: string;
  error?: { code?: string; message?: string };
};

export function CommerceEntitlementList({
  onSelectAccount,
}: {
  onSelectAccount: (accountId: string) => void;
}) {
  const { platform } = usePlatformContext();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [rows, setRows] = useState<EntitlementAccount[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [planId, setPlanId] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ResourceError | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    const epoch = adminAuthSession.getEpoch();
    void adminAuthSession
      .request(resourcePath(platform.platform_id, '/plans'), {
        cache: 'no-store',
      })
      .then(async (response) => {
        const payload = await readApiPayload<Plan[]>(response);
        if (
          adminAuthSession.isCurrentEpoch(epoch) &&
          response.ok &&
          Array.isArray(payload?.data)
        )
          setPlans(payload.data);
      })
      .catch(() => undefined);
  }, [platform.platform_id]);

  const load = useCallback(
    async (cursor: string | null = null) => {
      const current = ++generation.current;
      const epoch = adminAuthSession.getEpoch();
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ limit: '20' });
        if (cursor) params.set('cursor', cursor);
        if (query.trim()) params.set('q', query.trim());
        if (status) params.set('status', status);
        if (source) params.set('source', source);
        if (planId) params.set('plan_id', planId);
        const response = await adminAuthSession.request(
          `/api/v1/admin/api/v1/platforms/${encodeURIComponent(platform.platform_id)}/commerce/entitlements?${params}`,
          { cache: 'no-store' },
        );
        const payload = (await response
          .json()
          .catch(() => null)) as PagePayload<EntitlementAccount[]> | null;
        if (
          current !== generation.current ||
          !adminAuthSession.isCurrentEpoch(epoch)
        )
          return;
        if (!response.ok || !Array.isArray(payload?.data)) {
          setError(resourceError(response, payload, '权益账户列表'));
          return;
        }
        setRows((known) =>
          cursor ? [...known, ...payload.data!] : payload.data!,
        );
        setNextCursor(payload.next_cursor ?? null);
      } catch (caught) {
        if (current !== generation.current) return;
        setError({
          title: '权益账户列表读取失败',
          description: sessionErrorMessage(caught),
          requestId: null,
          technicalDetail: null,
        });
      } finally {
        if (current === generation.current) setLoading(false);
      }
    },
    [planId, platform.platform_id, query, source, status],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AdminWorkspaceSection
      title="当前权益账户"
      titleId="commerce-entitlement-list-title"
      description="服务端 stable cursor + filter；来源严格区分 Billing 购买、兑换码和管理员手工/补偿权益。"
      data-test="commerce-entitlement-list"
    >
      <AdminTaskToolbar aria-label="权益账户筛选">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="账户 / 用户 / Profile / Plan"
            aria-label="权益账户搜索"
          />
          <NativeSelect
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            aria-label="订阅状态"
          >
            <option value="">全部状态</option>
            <option value="active">active</option>
            <option value="suspended">suspended</option>
          </NativeSelect>
          <NativeSelect
            value={source}
            onChange={(event) => setSource(event.target.value)}
            aria-label="权益来源"
          >
            <option value="">全部来源</option>
            <option value="billing_order">Billing 购买</option>
            <option value="redemption_code">兑换码</option>
            <option value="admin">手工/补偿权益</option>
          </NativeSelect>
          <NativeSelect
            value={planId}
            onChange={(event) => setPlanId(event.target.value)}
            aria-label="权益 Plan"
          >
            <option value="">全部 Plan</option>
            {plans.map((plan) => (
              <option value={plan.plan_id} key={plan.plan_id}>
                {plan.code} · {plan.name}
              </option>
            ))}
          </NativeSelect>
          <Button
            variant="outline"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? '筛选中…' : '应用筛选'}
          </Button>
        </div>
      </AdminTaskToolbar>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>{error.title}</AlertTitle>
          <AlertDescription>{error.description}</AlertDescription>
        </Alert>
      ) : null}

      {rows.length ? (
        <div className="admin-selectable-collection">
          {rows.map((row) => (
            <button
              type="button"
              key={`${row.platform_account_id}-${row.updated_at}`}
              onClick={() => onSelectAccount(row.platform_account_id)}
              className="admin-selectable-row md:grid-cols-[1.2fr_1fr_1fr_auto] md:items-center"
              data-test={`entitlement-row-${row.platform_account_id}`}
            >
              <span className="min-w-0">
                <strong className="block truncate">
                  {row.display_name?.trim() || row.user_id || '匿名账户'}
                </strong>
                <small className="text-muted-foreground">
                  {row.platform_account_id}
                </small>
              </span>
              <span className="text-sm">
                {row.plan_name ?? row.plan_code ?? '无 Plan'}
                {row.offer_code ? (
                  <small className="block text-muted-foreground">
                    Offer {row.offer_code}
                  </small>
                ) : null}
              </span>
              <span className="text-sm">
                {row.entitlement_source === 'billing_order'
                  ? 'Billing 购买'
                  : row.entitlement_source === 'redemption_code'
                    ? '兑换码'
                    : row.entitlement_source === 'admin'
                      ? '手工/补偿权益'
                      : '来源待确认'}
                <small className="block text-muted-foreground">
                  至 {formatUtc(row.current_period_end)}
                </small>
              </span>
              <StatusBadge
                label={statusLabel(row.subscription_status)}
                tone={statusTone(row.subscription_status)}
                rawValue={row.subscription_status}
              />
            </button>
          ))}
        </div>
      ) : !loading ? (
        <p className="text-sm text-muted-foreground">当前筛选没有权益账户。</p>
      ) : (
        <p className="text-sm text-muted-foreground">正在读取权益账户…</p>
      )}
      {nextCursor ? (
        <Button
          variant="outline"
          onClick={() => void load(nextCursor)}
          disabled={loading}
        >
          加载更多
        </Button>
      ) : null}
    </AdminWorkspaceSection>
  );
}
