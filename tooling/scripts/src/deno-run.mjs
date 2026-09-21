import { spawnSync } from 'node:child_process';

import { denoCommand, repositoryRoot } from './toolchain.mjs';

const result = spawnSync(denoCommand(), process.argv.slice(2), {
  cwd: repositoryRoot,
  env: process.env,
  stdio: 'inherit',
  shell: false,
});

if (result.error?.code === 'ENOENT') {
  console.error(
    'Deno runtime is unavailable. Install the pinned project toolchain or set DENO_BIN.',
  );
  process.exit(2);
}
if (result.error) throw result.error;
process.exit(result.status ?? 1);
