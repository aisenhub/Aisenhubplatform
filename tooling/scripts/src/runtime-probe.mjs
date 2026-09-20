import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { denoCommand } from './toolchain.mjs';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../',
);
const nodeProbe = path.join(root, 'tests/spikes/runtime/node-import.mjs');
const nodeResult = spawnSync(
  process.execPath,
  ['--experimental-strip-types', nodeProbe],
  {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  },
);

if (nodeResult.status !== 0) {
  process.exit(nodeResult.status ?? 1);
}

const denoResult = spawnSync(denoCommand(), ['task', 'runtime:probe'], {
  cwd: root,
  env: process.env,
  stdio: 'inherit',
});

if (denoResult.error?.code === 'ENOENT') {
  console.error(
    'NOT_RUN: Deno runtime is not available; install the fixed project toolchain first.',
  );
  process.exit(2);
}

process.exit(denoResult.status ?? 1);
