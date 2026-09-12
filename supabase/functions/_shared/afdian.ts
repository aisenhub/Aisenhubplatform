/// <reference lib="deno.ns" />

import {
  PROVIDER_ADAPTER_CONTRACT_VERSION,
  type ProviderOrderSnapshotDto,
  type ProviderOrderStatus,
  toMoneyAmount,
} from '../../../packages/domain/src/contracts/billing.ts';

type ObjectValue = Record<string, unknown>;

export interface AfdianProviderAdapter {
  queryOrder(providerOrderNo: string): Promise<{
    readonly status: 'found' | 'not_found' | 'temporarily_unavailable';
    readonly order?: unknown;
    readonly facts?: Record<string, unknown>;
  }>;
}

export interface AfdianApiConfig {
  readonly userId: string;
  readonly apiToken: string;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
}

export interface AfdianWebhookObservation {
  readonly order: ObjectValue;
  readonly orderNo: string;
  readonly eventKey: string;
}

const DEFAULT_API_BASE_URL = 'https://afdian.com/api/open';
const DEFAULT_CHECKOUT_BASE_URL = 'https://afdian.com/order/create';
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_WEBHOOK_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwwdaCg1Bt+UKZKs0R54ylYnuANma49IpgoOwNmk3a0rhg/PQuhUJ0EOZSowIC44l0K3+fqGns3Ygi4AfmEfS4EKbdk1ahSxu7Zkp2rHMt+R9GarQFQkwSS/5x1dYiHNVMiR8oIXDgjmvxuNes2Cr8fw9dEF0xNBKdkKgG2qAawcN1nZrdyaKWtPVT9m2Hl0ddOO9thZmVLFOb9NVzgYfjEgI+KWX6aY19Ka/ghv/L4t1IXmz9pctablN5S0CRWpJW3Cn0k6zSXgjVdKm4uN7jRlgSRaf/Ind46vMCm3N2sgwxu/g3bnooW+db0iLo13zzuvyn727Q3UDQ0MmZcEWMQIDAQAB
-----END PUBLIC KEY-----`;

export function buildAfdianCheckoutUrl(input: {
  readonly baseUrl?: string;
  readonly productType: string;
  readonly externalPlanId: string;
  readonly externalSkuIds?: readonly string[];
  readonly customOrderId: string;
}): string {
  const url = new URL(input.baseUrl ?? DEFAULT_CHECKOUT_BASE_URL);
  if (url.protocol !== 'https:' && url.protocol !== 'http:')
    throw new Error('AFDIAN_CHECKOUT_URL_INVALID');
  if (!input.productType || !input.externalPlanId || !input.customOrderId)
    throw new Error('AFDIAN_CHECKOUT_FACTS_INCOMPLETE');
  url.searchParams.set('product_type', input.productType);
  url.searchParams.set('plan_id', input.externalPlanId);
  const skuIds = (input.externalSkuIds ?? []).filter(
    (skuId) => skuId.length > 0,
  );
  if (skuIds.length > 0) {
    url.searchParams.set(
      'sku',
      JSON.stringify(skuIds.map((skuId) => ({ sku_id: skuId, count: 1 }))),
    );
  }
  url.searchParams.set('custom_order_id', input.customOrderId);
  return url.toString();
}

function md5Hex(value: string): string {
  const bytes = new TextEncoder().encode(value);
  const wordCount = Math.ceil((bytes.length + 9) / 64) * 16;
  const words = new Uint32Array(wordCount);
  for (let index = 0; index < bytes.length; index += 1) {
    const wordIndex = index >>> 2;
    words[wordIndex] =
      (words[wordIndex] ?? 0) | (bytes[index]! << ((index & 3) * 8));
  }
  const paddingWordIndex = bytes.length >>> 2;
  words[paddingWordIndex] =
    (words[paddingWordIndex] ?? 0) | (0x80 << ((bytes.length & 3) * 8));
  const bitLength = bytes.length * 8;
  words[wordCount - 2] = bitLength >>> 0;
  words[wordCount - 1] = Math.floor(bitLength / 0x100000000) >>> 0;

  const shift = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5,
    9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11,
    16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10,
    15, 21,
  ];
  const constants = Array.from(
    { length: 64 },
    (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000) >>> 0,
  );
  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  for (let offset = 0; offset < wordCount; offset += 16) {
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let index = 0; index < 64; index += 1) {
      let functionValue: number;
      let wordIndex: number;
      if (index < 16) {
        functionValue = (b & c) | (~b & d);
        wordIndex = index;
      } else if (index < 32) {
        functionValue = (d & b) | (~d & c);
        wordIndex = (5 * index + 1) % 16;
      } else if (index < 48) {
        functionValue = b ^ c ^ d;
        wordIndex = (3 * index + 5) % 16;
      } else {
        functionValue = c ^ (b | ~d);
        wordIndex = (7 * index) % 16;
      }
      const rotated =
        (a + functionValue + constants[index]! + words[offset + wordIndex]!) >>>
        0;
      const left =
        (rotated << shift[index]!) | (rotated >>> (32 - shift[index]!));
      const next = (b + left) >>> 0;
      a = d;
      d = c;
      c = b;
      b = next;
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  return [a0, b0, c0, d0]
    .flatMap((word) => [0, 8, 16, 24].map((offset) => (word >>> offset) & 0xff))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function afdianCanonicalSign(input: {
  readonly token: string;
  readonly params: string;
  readonly timestamp: number;
  readonly userId: string;
}): string {
  const canonical = `${input.token}params${input.params}ts${input.timestamp}user_id${input.userId}`;
  return md5Hex(canonical);
}

function decodeBase64(value: string): Uint8Array | null {
  try {
    const binary = atob(value.replace(/\s/gu, ''));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const owned = new Uint8Array(bytes.byteLength);
  owned.set(bytes);
  return owned.buffer;
}

function pemToDer(value: string): ArrayBuffer | null {
  const base64 = value
    .replace(/-----BEGIN PUBLIC KEY-----/gu, '')
    .replace(/-----END PUBLIC KEY-----/gu, '')
    .replace(/\\n/gu, '\n')
    .replace(/\s/gu, '');
  const bytes = decodeBase64(base64);
  if (!bytes) return null;
  return ownedArrayBuffer(bytes);
}

/**
 * Verifies the standard Afdian order envelope signature.
 *
 * Afdian signs the concatenation of order.out_trade_no, order.user_id,
 * order.plan_id, and order.total_amount with RSA-SHA256. The public key is
 * public provider configuration and can be overridden for provider rotation.
 */
export async function verifyAfdianWebhookSignature(
  value: unknown,
  publicKeyPem = Deno.env.get('AFDIAN_WEBHOOK_PUBLIC_KEY') ??
    DEFAULT_WEBHOOK_PUBLIC_KEY,
): Promise<boolean> {
  const root = objectValue(value);
  const data = objectValue(root?.data);
  const order = objectValue(data?.order);
  const signature = text(data?.sign);
  if (data?.type !== 'order' || !order || !signature) return false;
  const signedValues = [
    order.out_trade_no,
    order.user_id,
    order.plan_id,
    order.total_amount,
  ];
  if (signedValues.some((item) => item === null || item === undefined))
    return false;
  const publicKey = pemToDer(publicKeyPem);
  const signatureBytes = decodeBase64(signature);
  if (!publicKey || !signatureBytes) return false;
  try {
    const key = await crypto.subtle.importKey(
      'spki',
      publicKey,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    return await crypto.subtle.verify(
      { name: 'RSASSA-PKCS1-v1_5' },
      key,
      ownedArrayBuffer(signatureBytes),
      new TextEncoder().encode(signedValues.map(String).join('')),
    );
  } catch {
    return false;
  }
}

function apiResponseOrders(value: unknown): readonly ObjectValue[] | null {
  const root = objectValue(value);
  const data = objectValue(root?.data);
  const list = data?.list;
  if (!Array.isArray(list)) return null;
  return list
    .map((item) => objectValue(item))
    .filter((item): item is ObjectValue => item !== null);
}

function stringOrderId(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function parseAfdianWebhook(
  value: unknown,
): AfdianWebhookObservation | null {
  const root = objectValue(value);
  const data = objectValue(root?.data);
  if (data?.type !== 'order') return null;
  const order = objectValue(data.order);
  const orderNo = stringOrderId(order?.out_trade_no ?? order?.order_no);
  if (!order || !orderNo || orderNo.length > 255) return null;
  const status = String(order.status ?? '');
  const eventKey = `afdian:${orderNo}:${status || 'unknown'}`;
  return { order, orderNo, eventKey };
}

async function fetchAfdianOrder(
  config: AfdianApiConfig,
  providerOrderNo: string,
): Promise<{
  readonly status: 'found' | 'not_found' | 'temporarily_unavailable';
  readonly order?: unknown;
}> {
  const timestamp = Math.floor(Date.now() / 1000);
  const params = JSON.stringify({ out_trade_no: providerOrderNo });
  const body = JSON.stringify({
    user_id: config.userId,
    params,
    ts: timestamp,
    sign: afdianCanonicalSign({
      token: config.apiToken,
      params,
      timestamp,
      userId: config.userId,
    }),
  });
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  try {
    const response = await (config.fetchImpl ?? fetch)(
      `${(config.baseUrl ?? DEFAULT_API_BASE_URL).replace(/\/$/u, '')}/query-order`,
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body,
        signal: controller.signal,
      },
    );
    if (!response.ok) return { status: 'temporarily_unavailable' };
    const payload = (await response.json().catch(() => null)) as unknown;
    const root = objectValue(payload);
    if (root?.ec !== 200) return { status: 'temporarily_unavailable' };
    const orders = apiResponseOrders(payload);
    if (!orders) return { status: 'temporarily_unavailable' };
    const order = orders.find(
      (candidate) =>
        stringOrderId(candidate.out_trade_no ?? candidate.order_no) ===
        providerOrderNo,
    );
    return order ? { status: 'found', order } : { status: 'not_found' };
  } catch {
    return { status: 'temporarily_unavailable' };
  } finally {
    clearTimeout(timer);
  }
}

export function createAfdianProviderAdapter(
  config: AfdianApiConfig,
): AfdianProviderAdapter {
  if (!config.userId || !config.apiToken)
    throw new Error('PROVIDER_NOT_CONFIGURED');
  return {
    queryOrder(providerOrderNo) {
      const normalized = providerOrderNo.trim();
      if (!normalized || normalized.length > 255)
        return Promise.resolve({ status: 'temporarily_unavailable' });
      return fetchAfdianOrder(config, normalized);
    },
  };
}

export function createAfdianProviderAdapterFromEnv(): AfdianProviderAdapter | null {
  const userId = Deno.env.get('AFDIAN_USER_ID');
  const apiToken = Deno.env.get('AFDIAN_API_TOKEN');
  if (!userId || !apiToken) return null;
  return createAfdianProviderAdapter({
    userId,
    apiToken,
    baseUrl: Deno.env.get('AFDIAN_API_BASE_URL') ?? undefined,
    timeoutMs: Number.parseInt(
      Deno.env.get('AFDIAN_API_TIMEOUT_MS') ?? String(DEFAULT_TIMEOUT_MS),
      10,
    ),
  });
}

function objectValue(value: unknown): ObjectValue | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as ObjectValue)
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
  if (
    normalized === '1' ||
    normalized === 'pending' ||
    normalized === 'created'
  )
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
  )
    return null;
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
