import { runtimeProbe } from '../../../supabase/functions/_shared/runtime-probe.ts';
import { readBoundedBody } from '../../../packages/domain/src/upload.ts';

const result = runtimeProbe('deno');
const upload = await readBoundedBody(
  new Request('http://local/upload', { method: 'PUT', body: 'probe' }),
  5,
);
if (new TextDecoder().decode(upload.bytes) !== 'probe')
  throw new Error('shared upload boundary failed');
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
