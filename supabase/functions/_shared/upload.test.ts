/// <reference lib="deno.ns" />

import { assertEquals, assertRejects } from 'jsr:@std/assert@1';

import {
  readBoundedBody,
  readBoundedJson,
  UploadFault,
  UploadGate,
} from './upload.ts';

Deno.test('JSON reader rejects chunked overflow before parsing or buffering the rest', async () => {
  let cancelled = false;
  const oversized = new Request('http://local/json', {
    method: 'POST',
    body: new ReadableStream({
      pull(controller) {
        controller.enqueue(new Uint8Array(32_769));
      },
      cancel() {
        cancelled = true;
      },
    }),
  });
  await assertRejects(
    () => readBoundedJson(oversized),
    UploadFault,
    'PAYLOAD_TOO_LARGE',
  );
  assertEquals(cancelled, true);
  assertEquals(await readBoundedJson(request('{"name":"fixture"}')), {
    name: 'fixture',
  });
  for (const invalid of ['null', '[]', '"scalar"', '{'])
    await assertRejects(
      () => readBoundedJson(request(invalid)),
      UploadFault,
      'INVALID_INPUT',
    );
});

Deno.test('bounded reader times out stalled input and cancels its stream', async () => {
  let cancelled = false;
  const stalled = new Request('http://local/upload', {
    method: 'PUT',
    body: new ReadableStream({
      cancel() {
        cancelled = true;
      },
    }),
  });
  await assertRejects(
    () => readBoundedBody(stalled, 5, 10),
    UploadFault,
    'STORAGE_UNAVAILABLE',
  );
  assertEquals(cancelled, true);
  const failedCancel = new Request('http://local/upload', {
    method: 'PUT',
    body: new ReadableStream({
      cancel() {
        throw new Error('fixture cancellation failed');
      },
    }),
  });
  await assertRejects(
    () => readBoundedBody(failedCancel, 5, 10),
    UploadFault,
    'STORAGE_UNAVAILABLE',
  );
});

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

Deno.test('proxy reader permits empty DELETE bodies without relaxing upload or size checks', async () => {
  for (const body of [null, '']) {
    const empty = new Request('http://local/file', { method: 'DELETE', body });
    assertEquals((await readBoundedBody(empty, 65_536, 15_000, true)).size, 0);
  }
  await assertRejects(
    () =>
      readBoundedBody(
        request(null, { 'content-length': '1' }),
        5,
        15_000,
        true,
      ),
    UploadFault,
    'UPLOAD_SIZE_MISMATCH',
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
