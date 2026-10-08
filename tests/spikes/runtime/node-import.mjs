import assert from 'node:assert/strict';

const { runtimeProbe } =
  await import('../../../supabase/functions/_shared/runtime-probe.ts');
const result = runtimeProbe('node');
const { readBoundedBody } =
  await import('../../../packages/domain/src/upload.ts');
const upload = await readBoundedBody(
  new Request('http://local/upload', { method: 'PUT', body: 'probe' }),
  5,
);
assert.equal(new TextDecoder().decode(upload.bytes), 'probe');

assert.equal(result.ok, true);
assert.deepEqual(result.data, {
  runtime: 'node',
  sharedBoundary: 'packages/domain',
});
console.log('PASS: Node imported the shared Edge boundary');
