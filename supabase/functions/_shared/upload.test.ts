/// <reference lib="deno.ns" />

import { assertEquals, assertRejects } from 'jsr:@std/assert@1';

import { readBoundedBody, UploadFault, UploadGate } from './upload.ts';

function request(body: BodyInit | null, headers: HeadersInit = {}): Request {
  return new Request('http://local/upload', { method: 'PUT', body, headers });
}

Deno.test('bounded reader accepts exact bytes and rejects empty bodies', async () => {
  const result = await readBoundedBody(request('hello'), 5);
  assertEquals(result.size, 5);
  assertEquals(new TextDecoder().decode(result.bytes), 'hello');
  await assertRejects(
    () => readBoundedBody(request(null), 5),
    UploadFault,
    'INVALID_INPUT',
  );
});

Deno.test('bounded reader rejects declared, chunked and compressed overflow', async () => {
  await assertRejects(
    () => readBoundedBody(request('123456', { 'content-length': '6' }), 5),
    UploadFault,
    'PAYLOAD_TOO_LARGE',
  );
  await assertRejects(
    () =>
      readBoundedBody(
        new Request('http://local/upload', {
          method: 'PUT',
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('123'));
              controller.enqueue(new TextEncoder().encode('456'));
              controller.close();
            },
          }),
        }),
        5,
      ),
    UploadFault,
    'PAYLOAD_TOO_LARGE',
  );
  await assertRejects(
    () => readBoundedBody(request('x', { 'content-encoding': 'gzip' }), 5),
    UploadFault,
    'INVALID_INPUT',
  );
});

Deno.test('upload gate enforces instance and per-account limits before body reads', () => {
  const gate = new UploadGate(2, 1);
  assertEquals(gate.tryAcquire('a'), true);
  assertEquals(gate.tryAcquire('a'), false);
  assertEquals(gate.tryAcquire('b'), true);
  assertEquals(gate.tryAcquire('c'), false);
  gate.release('a');
  assertEquals(gate.tryAcquire('a'), true);
  gate.release('a');
  gate.release('b');
});
