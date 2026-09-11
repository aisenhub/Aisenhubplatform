/// <reference lib="deno.ns" />

import { assertEquals, assert } from 'jsr:@std/assert@1';

import { normalizeAfdianOrder, toBillingOrderFacts } from './afdian.ts';

Deno.test('Afdian normalizer keeps only provider-neutral billing facts', () => {
  const snapshot = normalizeAfdianOrder({
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
  }, new Date('2026-09-11T00:00:00Z'));
  assert(snapshot !== null);
  assertEquals(snapshot.status, 'paid');
  assertEquals(snapshot.sku_items, [{ external_sku_id: 'sku-1', quantity: 1 }]);
  assertEquals(toBillingOrderFacts(snapshot).address, undefined);
  assertEquals(toBillingOrderFacts(snapshot).custom_order_id, 'checkout-1');
});

Deno.test('Afdian normalizer rejects incomplete or malformed observations', () => {
  assertEquals(normalizeAfdianOrder({ out_trade_no: 'order-1' }), null);
  assertEquals(normalizeAfdianOrder({
    out_trade_no: 'order-1',
    total_amount: '19.90',
    show_amount: '19.90',
    currency: 'CNY',
    sku_detail: '{bad-json',
  }), null);
});
