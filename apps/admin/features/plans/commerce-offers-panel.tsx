'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { Button } from '@kit/ui/button';
import { ConfirmActionDialog } from '@kit/ui/confirm-action-dialog';
import { Input } from '@kit/ui/input';
import type { MutationState } from '@kit/ui/mutation-state';
import { StatusBadge } from '@kit/ui/status-badge';
import { NativeSelect } from '@kit/ui/native-select';

import {
  adminAuthSession,
  sessionErrorMessage,
} from '../../app/_lib/auth-session';
import { AdminWorkspaceSection } from '../../components/workspace/admin-workspace';
import { AdminRecentMfaPanel } from '../security/admin-recent-mfa-panel';
import {
  isRecentMfaRequired,
  readApiPayload,
  resourceError,
  statusLabel,
  statusTone,
  type ResourceError,
} from '../resources/admin-resource-utils';
import {
  beginScopedLoad,
  isScopedLoadCurrent,
} from '../resources/scoped-load-guard';

type Plan = {
  plan_id: string;
  code: string;
  name: string;
  kind: 'free' | 'paid';
  status: string;
};
type Offer = {
  offer_id: string;
  plan_id: string;
  plan_code: string;
  plan_name: string;
  offer_code: string;
  offer_name: string;
  description: string | null;
  duration_value: number;
  duration_unit: 'day' | 'month' | 'year';
  status: 'draft' | 'active' | 'archived';
  recommended: boolean;
  row_version: number;
  price_id: string | null;
  price_version: number | null;
  price_amount: string | number | null;
  currency: string | null;
  price_status: string | null;
  provider_mapping_id: string | null;
  mapping_status: 'ready' | 'missing' | 'draft' | 'rejected';
};

type Intent =
  | {
      kind: 'activate' | 'archive';
      offer: Offer;
      operationId: string;
    }
  | {
      kind: 'publish_price' | 'retire_price';
      offer: Offer;
      operationId: string;
    };

export function CommerceOffersPanel({
  platformId,
  plans,
}: {
  platformId: string;
  plans: Plan[];
}) {
  const paidPlans = plans.filter(
    (plan) => plan.kind === 'paid' && plan.status === 'active',
  );
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ResourceError | null>(null);
  const [planId, setPlanId] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [durationValue, setDurationValue] = useState('1');
  const [durationUnit, setDurationUnit] = useState<'day' | 'month' | 'year'>(
    'month',
  );
  const [priceAmount, setPriceAmount] = useState<Record<string, string>>({});
  const [stepUpRequired, setStepUpRequired] = useState(false);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [mutationState, setMutationState] =
    useState<MutationState>('confirm_required');
  const [mutationError, setMutationError] = useState<ResourceError | null>(
    null,
  );
  const loadGeneration = useRef(0);
  const scopeRef = useRef(platformId);
  scopeRef.current = platformId;

  const load = useCallback(
    async (preserve = false) => {
      const token = beginScopedLoad(loadGeneration, platformId);
      const epoch = adminAuthSession.getEpoch();
      setLoading(true);
      setError(null);
      if (!preserve) setOffers([]);
      try {
        const response = await adminAuthSession.request(
          `/api/v1/admin/api/v1/platforms/${encodeURIComponent(platformId)}/commerce/offers`,
          { cache: 'no-store' },
        );
        const payload = await readApiPayload<Offer[]>(response);
        if (
          !isScopedLoadCurrent(loadGeneration, scopeRef, token) ||
          !adminAuthSession.isCurrentEpoch(epoch)
        )
          return;
        if (!response.ok || !Array.isArray(payload?.data)) {
          setError(resourceError(response, payload, 'Offer / Price 目录'));
          return;
        }
        setOffers(payload.data);
      } catch (caught) {
        if (
          !isScopedLoadCurrent(loadGeneration, scopeRef, token) ||
          !adminAuthSession.isCurrentEpoch(epoch)
        )
          return;
        setError({
          title: 'Offer / Price 读取失败',
          description: sessionErrorMessage(caught),
          requestId: null,
          technicalDetail: null,
        });
      } finally {
        if (
          isScopedLoadCurrent(loadGeneration, scopeRef, token) &&
          adminAuthSession.isCurrentEpoch(epoch)
        )
          setLoading(false);
      }
    },
    [platformId],
  );

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!planId && paidPlans[0]) setPlanId(paidPlans[0].plan_id);
  }, [paidPlans, planId]);

  async function createOffer() {
    setError(null);
    const response = await adminAuthSession.request(
      `/api/v1/admin/api/v1/platforms/${encodeURIComponent(platformId)}/commerce/offers`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_id: planId,
          code: code.trim(),
          name: name.trim(),
          description: null,
          duration_value: Number(durationValue),
          duration_unit: durationUnit,
          recommended: false,
        }),
      },
      { replay: 'never' },
    );
    const payload = await readApiPayload<Offer>(response);
    if (!response.ok) {
      if (isRecentMfaRequired(response, payload)) {
        setStepUpRequired(true);
        return;
      }
      setError(resourceError(response, payload, '创建 Offer'));
      return;
    }
    setCode('');
    setName('');
    setStepUpRequired(false);
    await load(true);
  }

  async function createPrice(offer: Offer) {
    const amount = Number(priceAmount[offer.offer_id]);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const response = await adminAuthSession.request(
      `/api/v1/admin/api/v1/platforms/${encodeURIComponent(platformId)}/commerce/offers/${encodeURIComponent(offer.offer_id)}/prices`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, currency: 'CNY' }),
      },
      { replay: 'never' },
    );
    const payload = await readApiPayload<Record<string, unknown>>(response);
    if (!response.ok) {
      if (isRecentMfaRequired(response, payload)) {
        setStepUpRequired(true);
        return;
      }
      setError(resourceError(response, payload, '创建 Price'));
      return;
    }
    setPriceAmount((known) => ({ ...known, [offer.offer_id]: '' }));
    setStepUpRequired(false);
    await load(true);
  }

  async function executeIntent(reason: string) {
    if (!intent) return;
    setMutationState('pending');
    setMutationError(null);
    const isPrice =
      intent.kind === 'publish_price' || intent.kind === 'retire_price';
    const path = isPrice
      ? `/api/v1/admin/api/v1/platforms/${encodeURIComponent(platformId)}/commerce/prices/${encodeURIComponent(intent.offer.price_id ?? '')}/commands`
      : `/api/v1/admin/api/v1/platforms/${encodeURIComponent(platformId)}/commerce/offers/${encodeURIComponent(intent.offer.offer_id)}/commands`;
    const action =
      intent.kind === 'publish_price'
        ? 'publish'
        : intent.kind === 'retire_price'
          ? 'retire'
          : intent.kind;
    try {
      const response = await adminAuthSession.request(
        path,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action,
            operation_id: intent.operationId,
            reason,
          }),
        },
        { replay: 'never' },
      );
      const payload = await readApiPayload<Record<string, unknown>>(response);
      if (!response.ok) {
        if (isRecentMfaRequired(response, payload)) {
          setMutationState('step_up_required');
          return;
        }
        setMutationState('failure');
        setMutationError(resourceError(response, payload, '商业目录操作'));
        return;
      }
      setMutationState('success');
      await load(true);
      setIntent(null);
    } catch (caught) {
      setMutationState('unknown_outcome');
      setMutationError({
        title: '操作结果待确认',
        description: sessionErrorMessage(caught),
        requestId: null,
        technicalDetail: null,
      });
    }
  }

  return (
    <AdminWorkspaceSection
      title="商业 Offer / Price"
      titleId="commerce-offers-title"
      description="Plan 定义权益；Offer 定义销售期限；Price 是不可变版本。一个平台可为多个 paid Plan 建立不同 Offer。"
      data-test="commerce-offers-panel"
    >
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>{error.title}</AlertTitle>
          <AlertDescription>{error.description}</AlertDescription>
        </Alert>
      ) : null}
      {stepUpRequired ? (
        <AdminRecentMfaPanel onVerified={() => setStepUpRequired(false)} />
      ) : null}
      <div className="grid gap-2 md:grid-cols-5">
        <NativeSelect
          value={planId}
          onChange={(event) => setPlanId(event.target.value)}
          aria-label="Offer Plan"
        >
          <option value="">选择 paid Plan</option>
          {paidPlans.map((plan) => (
            <option key={plan.plan_id} value={plan.plan_id}>
              {plan.code} · {plan.name}
            </option>
          ))}
        </NativeSelect>
        <Input
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="offer-code"
          aria-label="Offer code"
        />
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Offer 名称"
          aria-label="Offer 名称"
        />
        <span className="flex gap-2">
          <Input
            type="number"
            min={1}
            value={durationValue}
            onChange={(event) => setDurationValue(event.target.value)}
            aria-label="期限数值"
          />
          <NativeSelect
            value={durationUnit}
            onChange={(event) =>
              setDurationUnit(event.target.value as typeof durationUnit)
            }
            aria-label="期限单位"
          >
            <option value="day">day</option>
            <option value="month">month</option>
            <option value="year">year</option>
          </NativeSelect>
        </span>
        <Button
          onClick={() => void createOffer()}
          disabled={!planId || !code.trim() || !name.trim()}
        >
          创建 Offer
        </Button>
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">正在读取商业目录…</p>
      ) : null}
      <div className="divide-y divide-border/70">
        {offers.map((offer) => (
          <article
            className="grid gap-3 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start"
            key={offer.offer_id}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <strong>{offer.offer_name}</strong>
                  <p className="text-sm text-muted-foreground">
                    {offer.offer_code} · {offer.plan_code} / {offer.plan_name}
                  </p>
                </div>
                <StatusBadge
                  label={statusLabel(offer.status)}
                  tone={statusTone(offer.status)}
                  rawValue={offer.status}
                />
              </div>
              <p className="mt-3 text-sm">
                期限 {offer.duration_value} {offer.duration_unit} · Price{' '}
                {offer.price_amount == null
                  ? '未发布'
                  : `${offer.price_amount} ${offer.currency ?? 'CNY'} v${offer.price_version}`}{' '}
                · Mapping {offer.mapping_status}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 lg:max-w-md lg:justify-end">
              <Input
                className="max-w-36"
                inputMode="decimal"
                value={priceAmount[offer.offer_id] ?? ''}
                onChange={(event) =>
                  setPriceAmount((known) => ({
                    ...known,
                    [offer.offer_id]: event.target.value,
                  }))
                }
                placeholder="新 Price CNY"
                aria-label={`${offer.offer_code} 新 Price`}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => void createPrice(offer)}
              >
                创建 Price
              </Button>
              {offer.price_id && offer.price_status !== 'active' ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setIntent({
                      kind: 'publish_price',
                      offer,
                      operationId: crypto.randomUUID(),
                    });
                    setMutationState('confirm_required');
                  }}
                >
                  发布 Price
                </Button>
              ) : null}
              {offer.price_id && offer.price_status === 'active' ? (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    setIntent({
                      kind: 'retire_price',
                      offer,
                      operationId: crypto.randomUUID(),
                    });
                    setMutationState('confirm_required');
                  }}
                >
                  退役 Price
                </Button>
              ) : null}
              {offer.status !== 'active' ? (
                <Button
                  size="sm"
                  onClick={() => {
                    setIntent({
                      kind: 'activate',
                      offer,
                      operationId: crypto.randomUUID(),
                    });
                    setMutationState('confirm_required');
                  }}
                >
                  启用 Offer
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    setIntent({
                      kind: 'archive',
                      offer,
                      operationId: crypto.randomUUID(),
                    });
                    setMutationState('confirm_required');
                  }}
                >
                  归档 Offer
                </Button>
              )}
            </div>
          </article>
        ))}
      </div>
      {intent ? (
        <ConfirmActionDialog
          open
          onOpenChange={(open) => {
            if (!open && mutationState !== 'pending') {
              setIntent(null);
              setMutationState('confirm_required');
            }
          }}
          title={
            intent.kind === 'publish_price'
              ? '发布 Price'
              : intent.kind === 'retire_price'
                ? '退役 Price'
                : intent.kind === 'activate'
                  ? '启用 Offer'
                  : '归档 Offer'
          }
          targetIdentity={intent.offer.offer_id}
          impact="该操作会改变后续新购买可用性；历史 Checkout、Order 与 Grant snapshot 不会被改写。"
          reversible={
            intent.kind !== 'archive' && intent.kind !== 'retire_price'
          }
          reasonRequired
          state={mutationState}
          error={mutationError}
          stepUpContent={
            mutationState === 'step_up_required' ? (
              <AdminRecentMfaPanel
                onVerified={() => setMutationState('confirm_required')}
              />
            ) : null
          }
          onCheckUnknown={
            mutationState === 'unknown_outcome'
              ? async () => {
                  await load(true);
                  setMutationError({
                    title: '商业目录已重新读取',
                    description:
                      '原 operation_id 已保留。若当前状态仍不确定，可再次确认；服务端会按同一 operation_id 安全重放，而不会创建第二次业务事实。',
                    requestId: null,
                    technicalDetail: null,
                  });
                }
              : undefined
          }
          onConfirm={executeIntent}
        />
      ) : null}
    </AdminWorkspaceSection>
  );
}
