import { describe, expect, it } from 'vitest';

import {
  readBoundedBody,
  readBoundedJson,
  UploadFault,
  UploadGate,
} from './bounded-body';

describe('reference consumer bounded input', () => {
  it('rejects a declared body above the limit', async () => {
    const request = new Request('https://consumer.example.test/upload', {
      method: 'POST',
      headers: { 'content-length': '5' },
      body: 'hello',
    });
    await expect(readBoundedBody(request, 4)).rejects.toMatchObject({
      code: 'PAYLOAD_TOO_LARGE',
      status: 413,
    } satisfies Partial<UploadFault>);
  });

  it('parses bounded JSON objects and rejects arrays', async () => {
    const objectRequest = new Request('https://consumer.example.test/api', {
      method: 'POST',
      body: JSON.stringify({ ok: true }),
    });
    await expect(readBoundedJson(objectRequest)).resolves.toEqual({ ok: true });

    const arrayRequest = new Request('https://consumer.example.test/api', {
      method: 'POST',
      body: '[]',
    });
    await expect(readBoundedJson(arrayRequest)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      status: 400,
    });
  });

  it('keeps upload admission bounded per instance and account', () => {
    const gate = new UploadGate(2, 1);
    expect(gate.tryAcquire('account-a')).toBe(true);
    expect(gate.tryAcquire('account-a')).toBe(false);
    expect(gate.tryAcquire('account-b')).toBe(true);
    expect(gate.tryAcquire('account-c')).toBe(false);
    gate.release('account-a');
    expect(gate.tryAcquire('account-a')).toBe(true);
  });
});
