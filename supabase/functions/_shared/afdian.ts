/// <reference lib="deno.ns" />

import {
  PROVIDER_ADAPTER_CONTRACT_VERSION,
  type ProviderOrderSnapshotDto,
  type ProviderOrderStatus,
  toMoneyAmount,
} from '../../../packages/domain/src/contracts/billing.ts';

type ObjectValue = Record<string, unknown>;

function objectValue(value: unknown): ObjectValue | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as ObjectValue
    : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function number(value: unknown): number | null {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  if (typeof value === 'string' && /^\d+$/u.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

function money(value: unknown) {
  if (typeof value === 'number') value = value.toFixed(2);
  if (typeof value !== 'string') return null;
  return toMoneyAmount(value);
}

function status(value: unknown): ProviderOrderStatus {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized === '2' || normalized === 'paid' || normalized === 'success')
    return 'paid';
  if (normalized === '1' || normalized === 'pending' || normalized === 'created')
    return 'pending';
  return 'failed';
}

function skuIds(value: unknown): readonly string[] | null {
  let parsed = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(parsed)) return [];
  const ids: string[] = [];
  for (const item of parsed) {
    const object = objectValue(item);
    const id = text(object?.sku_id ?? object?.id ?? item);
    if (!id) return null;
    ids.push(id);
  }
  return ids;
}

/**
 * Converts an Afdian-shaped observation into the provider-neutral snapshot.
 * It performs no network call and intentionally drops fields outside the
 * billing contract (for example address and private profile data).
 */
export function normalizeAfdianOrder(
  value: unknown,
  observedAt = new Date(),
): ProviderOrderSnapshotDto | null {
  const input = objectValue(value);
  if (!input) return null;
  const externalOrderId = text(input.out_trade_no ?? input.order_no);
  const totalAmount = money(input.total_amount);
  const displayAmount = money(input.show_amount ?? input.total_amount);
  const currency = text(input.currency);
  const skuItems = skuIds(input.sku_detail ?? input.sku_items);
  if (
    !externalOrderId ||
    !totalAmount ||
    !displayAmount ||
    !currency ||
    !skuItems ||
    !Number.isFinite(observedAt.getTime())
  ) return null;
  const termQuantity = number(input.month ?? input.purchase_months);
  const termUnit = termQuantity === null ? null : 'month';
  return {
    contract_version: PROVIDER_ADAPTER_CONTRACT_VERSION,
    provider: 'afdian',
    external_order_id: externalOrderId,
    external_user_id: text(input.user_id),
    external_plan_id: text(input.plan_id),
    custom_order_id: text(input.custom_order_id),
    status: status(input.status),
    term_quantity: termQuantity,
    term_unit: termUnit,
    product_type: text(input.product_type),
    sku_items: skuItems.map((externalSkuId) => ({
      external_sku_id: externalSkuId,
      quantity: 1,
    })),
    total_amount: totalAmount,
    display_amount: displayAmount,
    currency,
    observed_at: observedAt.toISOString(),
  };
}

export function toBillingOrderFacts(
  snapshot: ProviderOrderSnapshotDto,
): Record<string, unknown> {
  return {
    status: snapshot.status,
    provider_user_id: snapshot.external_user_id,
    external_plan_id: snapshot.external_plan_id,
    product_type: snapshot.product_type,
    sku_ids: snapshot.sku_items.map((item) => item.external_sku_id),
    purchase_months: snapshot.term_quantity,
    total_amount: snapshot.total_amount,
    show_amount: snapshot.display_amount,
    currency: snapshot.currency,
    custom_order_id: snapshot.custom_order_id,
    observed_at: snapshot.observed_at,
    external_order_id: snapshot.external_order_id,
  };
}
