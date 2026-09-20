import { spawnSync } from 'node:child_process';

const deno =
  process.env.DENO_BIN?.trim() ||
  (process.platform === 'win32' ? 'deno.exe' : 'deno');

const testFiles = [
  'supabase/functions/_shared/afdian.test.ts',
  'supabase/functions/billing-webhook/index.test.ts',
  'supabase/functions/maintenance/index.test.ts',
  'supabase/functions/account-api/index.test.ts',
];

const result = spawnSync(
  deno,
  [
    'test',
    '--allow-env',
    '--allow-net',
    '--allow-read',
    '--allow-import',
    ...testFiles,
  ],
  {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    shell: false,
  },
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
