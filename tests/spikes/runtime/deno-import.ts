import { runtimeProbe } from '../../../supabase/functions/_shared/runtime-probe.ts';

const result = runtimeProbe('deno');
const expected = {
  ok: true,
  data: {
    runtime: 'deno',
    sharedBoundary: 'packages/domain',
  },
};

if (JSON.stringify(result) !== JSON.stringify(expected)) {
  throw new Error(`Unexpected Deno probe result: ${JSON.stringify(result)}`);
}

console.log('PASS: Deno imported the shared Edge boundary');
