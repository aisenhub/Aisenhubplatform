import assert from 'node:assert/strict';

const { runtimeProbe } =
  await import('../../../supabase/functions/_shared/runtime-probe.ts');
const result = runtimeProbe('node');

assert.equal(result.ok, true);
assert.deepEqual(result.data, {
  runtime: 'node',
  sharedBoundary: 'packages/domain',
});
console.log('PASS: Node imported the shared Edge boundary');
