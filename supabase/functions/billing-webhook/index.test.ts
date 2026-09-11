/// <reference lib="deno.ns" />

import { assert, assertEquals } from 'jsr:@std/assert@1';

import { handleBillingWebhookRequest } from './index.ts';

const providerAccountId = '00000000-0000-4000-8000-000000000401';
const eventId = '00000000-0000-4000-8000-000000000402';
const jobId = '00000000-0000-4000-8000-000000000403';

function database(valuesSeen: unknown[][], duplicate = false) {
  return {
    async begin<T>(
      callback: (transaction: {
        unsafe<R extends Record<string, unknown>>(
          query: string,
          values?: unknown[],
        ): Promise<R[]>;
      }) => Promise<T>,
    ) {
      return callback({
        async unsafe<R extends Record<string, unknown>>(
          query: string,
          values?: unknown[],
        ): Promise<R[]> {
          if (query.startsWith('set local role')) return [] as R[];
          valuesSeen.push(values ?? []);
          return [
            {
              event_id: eventId,
              job_id: jobId,
              duplicate,
              processing_status: 'queued',
            },
          ] as unknown as R[];
        },
      });
    },
  };
}

function request(body: string, eventKey = 'provider-event-1') {
  return new Request(
    'http://local/functions/v1/billing-webhook/webhooks/afdian',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-provider-event-id': eventKey,
        'x-provider-order-no': 'order-1',
        'x-provider-signature': 'test-signature',
      },
      body,
    },
  );
}

Deno.test('billing webhook requires a provider signature before persistence', async () => {
  const valuesSeen: unknown[][] = [];
  const response = await handleBillingWebhookRequest(
    new Request('http://local/functions/v1/billing-webhook/webhooks/afdian', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-provider-event-id': 'provider-event-1',
      },
      body: '{}',
    }),
    {
      providerAccountId,
      database: database(valuesSeen),
      verifySignature: async () => true,
    },
  );
  assertEquals(response.status, 401);
  assertEquals(valuesSeen, []);
});

Deno.test('billing webhook rejects bodies over the bounded ingress limit', async () => {
  const response = await handleBillingWebhookRequest(
    request(JSON.stringify({ payload: 'x'.repeat(70000) })),
    {
      providerAccountId,
      database: database([]),
      verifySignature: async () => true,
    },
  );
  assertEquals(response.status, 413);
});

Deno.test('billing webhook persists only hash and enqueue result, with duplicate ACK support', async () => {
  const valuesSeen: unknown[][] = [];
  const first = await handleBillingWebhookRequest(
    request(
      JSON.stringify({ order_no: 'order-1', secret_payload: 'do-not-store' }),
    ),
    {
      providerAccountId,
      database: database(valuesSeen),
      verifySignature: async () => true,
    },
  );
  assertEquals(first.status, 200);
  assertEquals((await first.json()).data.duplicate, false);
  assertEquals(valuesSeen.length, 1);
  assert(valuesSeen[0]![2] instanceof Uint8Array);
  assertEquals((valuesSeen[0]![2] as Uint8Array).byteLength, 32);
  assert(
    !valuesSeen.some((values) =>
      values.some((value) => value === 'do-not-store'),
    ),
  );

  const duplicate = await handleBillingWebhookRequest(
    request('{}', 'provider-event-1'),
    {
      providerAccountId,
      database: database([], true),
      verifySignature: async () => true,
    },
  );
  assertEquals(duplicate.status, 200);
  assertEquals((await duplicate.json()).data.duplicate, true);
});

Deno.test('billing webhook intake can be stopped without touching persistence', async () => {
  const valuesSeen: unknown[][] = [];
  const response = await handleBillingWebhookRequest(
    request(JSON.stringify({ order_no: 'order-1' })),
    {
      providerAccountId,
      webhookIngressEnabled: false,
      database: database(valuesSeen),
      verifySignature: async () => true,
    },
  );
  assertEquals(response.status, 503);
  assertEquals((await response.json()).error.code, 'WEBHOOK_INGRESS_DISABLED');
  assertEquals(valuesSeen, []);
});
