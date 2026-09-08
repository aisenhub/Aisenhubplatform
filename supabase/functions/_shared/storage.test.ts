/// <reference lib="deno.ns" />

import { assertEquals, assertRejects } from 'jsr:@std/assert@1';

import { createSupabaseStorageAdapter } from './storage.ts';

Deno.test('Storage adapter exposes immutable server-only operations', async () => {
  const originalUrl = Deno.env.get('SUPABASE_URL');
  const originalSecret = Deno.env.get('SUPABASE_SECRET_KEY');
  const originalFetch = globalThis.fetch;
  const calls: Request[] = [];
  Deno.env.set('SUPABASE_URL', 'https://storage.example.test');
  Deno.env.set('SUPABASE_SECRET_KEY', 'sb_secret_fake_fixture');
  globalThis.fetch = (async (input, init) => {
    const request = new Request(input, init);
    calls.push(request);
    if (request.method === 'HEAD')
      return new Response(null, {
        status: 200,
        headers: { 'content-length': '5', etag: 'provider-etag' },
      });
    if (request.method === 'GET') return new Response('hello', { status: 200 });
    return new Response(null, {
      status: 200,
      headers: { 'x-request-id': 'provider-1' },
    });
  }) as typeof fetch;
  try {
    const adapter = createSupabaseStorageAdapter();
    const put = await adapter.putImmutable({
      bucket: 'platform-config-files',
      path: 'platform/account/file',
      body: new TextEncoder().encode('hello'),
      contentType: 'text/plain',
      timeoutMs: 1000,
    });
    assertEquals(put.providerRequestId, 'provider-1');
    assertEquals(calls[0]?.method, 'POST');
    assertEquals(calls[0]?.headers.get('x-upsert'), 'false');
    assertEquals(
      calls[0]?.headers.get('authorization'),
      'Bearer sb_secret_fake_fixture',
    );
    assertEquals(await calls[0]?.text(), 'hello');
    assertEquals(
      (
        await adapter.getInfo({
          bucket: 'platform-config-files',
          path: 'platform/account/file',
          timeoutMs: 1000,
        })
      ).size,
      5,
    );
    assertEquals(
      (
        await adapter.download({
          bucket: 'platform-config-files',
          path: 'platform/account/file',
          timeoutMs: 1000,
        })
      ).status,
      200,
    );
    await adapter.remove({
      bucket: 'platform-config-files',
      path: 'platform/account/file',
      timeoutMs: 1000,
    });
    assertEquals(
      calls.map((call) => call.method),
      ['POST', 'HEAD', 'GET', 'DELETE'],
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) Deno.env.delete('SUPABASE_URL');
    else Deno.env.set('SUPABASE_URL', originalUrl);
    if (originalSecret === undefined) Deno.env.delete('SUPABASE_SECRET_KEY');
    else Deno.env.set('SUPABASE_SECRET_KEY', originalSecret);
  }
});

Deno.test('Storage adapter requires the dedicated secret', async () => {
  const originalSecret = Deno.env.get('SUPABASE_SECRET_KEY');
  Deno.env.delete('SUPABASE_SECRET_KEY');
  try {
    const adapter = createSupabaseStorageAdapter();
    await assertRejects(
      () =>
        adapter.getInfo({
          bucket: 'platform-config-files',
          path: 'x',
          timeoutMs: 1000,
        }),
      Error,
      'STORAGE_NOT_CONFIGURED',
    );
  } finally {
    if (originalSecret === undefined) Deno.env.delete('SUPABASE_SECRET_KEY');
    else Deno.env.set('SUPABASE_SECRET_KEY', originalSecret);
  }
});
