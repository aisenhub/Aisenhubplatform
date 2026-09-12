/// <reference lib="deno.ns" />

import { assertEquals, assert } from 'jsr:@std/assert@1';

import {
  buildAfdianCheckoutUrl,
  afdianCanonicalSign,
  createAfdianProviderAdapter,
  normalizeAfdianOrder,
  toBillingOrderFacts,
  verifyAfdianWebhookSignature,
} from './afdian.ts';

function base64(bytes: ArrayBuffer): string {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function pemPublicKey(bytes: ArrayBuffer): string {
  return `-----BEGIN PUBLIC KEY-----\n${base64(bytes)}\n-----END PUBLIC KEY-----`;
}

Deno.test('Afdian checkout URLs keep the server checkout binding intact', () => {
  const checkoutUrl = buildAfdianCheckoutUrl({
    baseUrl: 'https://afdian.test/order/create',
    productType: '1',
    externalPlanId: 'plan-monthly',
    externalSkuIds: ['sku-monthly'],
    customOrderId: 'checkout-001',
  });
  const url = new URL(checkoutUrl);
  assertEquals(url.pathname, '/order/create');
  assertEquals(url.searchParams.get('product_type'), '1');
  assertEquals(url.searchParams.get('plan_id'), 'plan-monthly');
  assertEquals(url.searchParams.get('custom_order_id'), 'checkout-001');
  assertEquals(
    url.searchParams.get('sku'),
    JSON.stringify([{ sku_id: 'sku-monthly', count: 1 }]),
  );
});

Deno.test('Afdian API signing follows the documented canonical vector', () => {
  assertEquals(
    afdianCanonicalSign({
      token: '123',
      params: '{"a":333}',
      timestamp: 1624339905,
      userId: 'abc',
    }),
    'a4acc28b81598b7e5d84ebdc3e91710c',
  );
});

Deno.test('Afdian webhook signatures verify the documented order fields', async () => {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
  const order = {
    out_trade_no: 'order-1',
    user_id: 'afdian-user-1',
    plan_id: 'plan-monthly',
    total_amount: '9.90',
  };
  const signature = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    keyPair.privateKey,
    new TextEncoder().encode(
      `${order.out_trade_no}${order.user_id}${order.plan_id}${order.total_amount}`,
    ),
  );
  const payload = {
    ec: 200,
    data: { type: 'order', order, sign: base64(signature) },
  };
  const publicKey = pemPublicKey(
    await crypto.subtle.exportKey('spki', keyPair.publicKey),
  );
  assert(await verifyAfdianWebhookSignature(payload, publicKey));
  assert(
    !(await verifyAfdianWebhookSignature(
      {
        ...payload,
        data: {
          ...payload.data,
          order: { ...order, total_amount: '19.90' },
        },
      },
      publicKey,
    )),
  );
});

Deno.test('Afdian adapter queries an order by out_trade_no without exposing credentials', async () => {
  const requests: Request[] = [];
  const adapter = createAfdianProviderAdapter({
    userId: 'creator-user',
    apiToken: 'fixture-token',
    baseUrl: 'https://afdian.test/api/open',
    fetchImpl: async (input, init) => {
      requests.push(new Request(input, init));
      return new Response(
        JSON.stringify({
          ec: 200,
          data: {
            list: [
              {
                out_trade_no: 'order-1',
                status: 2,
                total_amount: '9.90',
              },
            ],
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    },
  });
  const result = await adapter.queryOrder('order-1');
  assertEquals(result.status, 'found');
  assertEquals(
    (result.order as Record<string, unknown>).out_trade_no,
    'order-1',
  );
  if (requests.length === 0)
    throw new Error('fixture request was not captured');
  const body = (await requests[0]!.json()) as Record<string, unknown>;
  assertEquals(body.user_id, 'creator-user');
  assertEquals(body.params, '{"out_trade_no":"order-1"}');
  assert(typeof body.sign === 'string');
  assert(!JSON.stringify(body).includes('fixture-token'));
});

Deno.test('Afdian adapter treats missing orders as not found and API failures as retryable', async () => {
  const missing = createAfdianProviderAdapter({
    userId: 'creator-user',
    apiToken: 'fixture-token',
    fetchImpl: async () =>
      new Response(JSON.stringify({ ec: 200, data: { list: [] } }), {
        status: 200,
      }),
  });
  assertEquals((await missing.queryOrder('missing')).status, 'not_found');

  const unavailable = createAfdianProviderAdapter({
    userId: 'creator-user',
    apiToken: 'fixture-token',
    fetchImpl: async () => new Response('upstream failure', { status: 503 }),
  });
  assertEquals(
    (await unavailable.queryOrder('order-1')).status,
    'temporarily_unavailable',
  );
});

Deno.test('Afdian normalizer keeps only provider-neutral billing facts', () => {
  const snapshot = normalizeAfdianOrder(
    {
      out_trade_no: 'order-1',
      user_id: 'provider-user-1',
      plan_id: 'plan-monthly',
      status: 2,
      month: 1,
      product_type: 'subscription',
      sku_detail: JSON.stringify([{ sku_id: 'sku-1', count: 1 }]),
      total_amount: '19.90',
      show_amount: '19.90',
      currency: 'CNY',
      custom_order_id: 'checkout-1',
      address: 'must-not-be-carried',
    },
    new Date('2026-09-11T00:00:00Z'),
  );
  assert(snapshot !== null);
  assertEquals(snapshot.status, 'paid');
  assertEquals(snapshot.sku_items, [{ external_sku_id: 'sku-1', quantity: 1 }]);
  assertEquals(toBillingOrderFacts(snapshot).address, undefined);
  assertEquals(toBillingOrderFacts(snapshot).custom_order_id, 'checkout-1');
});

Deno.test('Afdian normalizer rejects incomplete or malformed observations', () => {
  assertEquals(normalizeAfdianOrder({ out_trade_no: 'order-1' }), null);
  assertEquals(
    normalizeAfdianOrder({
      out_trade_no: 'order-1',
      total_amount: '19.90',
      show_amount: '19.90',
      currency: 'CNY',
      sku_detail: '{bad-json',
    }),
    null,
  );
});
