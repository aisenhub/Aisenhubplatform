import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertLocalSupabaseArguments,
  assertLocalSupabaseEnvironment,
} from './local-supabase.mjs';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../',
);
const [action, ...args] = process.argv.slice(2);
const localActions = new Set(['start', 'stop', 'db', 'db-reset']);

if (!localActions.has(action)) {
  console.error(`Unknown local Supabase action: ${action ?? '(missing)'}`);
  process.exit(2);
}

try {
  assertLocalSupabaseEnvironment(process.env);
  assertLocalSupabaseArguments(args);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

const cliEntrypoint = path.join(
  root,
  'node_modules',
  'supabase',
  'dist',
  'supabase.js',
);
const command =
  action === 'db-reset'
    ? ['db', 'reset', '--local', ...args]
    : action === 'db'
      ? ['test', 'db', '--local', ...args]
      : [action, ...args];
// Calling the package entrypoint through the current Node executable avoids
// Windows' non-executable .cmd shim while preserving the pinned project CLI.
const result = spawnSync(process.execPath, [cliEntrypoint, ...command], {
  cwd: root,
  env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: '1' },
  // `start` prints a JSON object containing the Local database password and
  // Auth/Storage secrets. Keep it out of terminals and verification logs.
  stdio: action === 'start' ? ['inherit', 'pipe', 'inherit'] : 'inherit',
});

if (result.error) {
  console.error(result.error.message);
}
if (action === 'start' && result.status === 0)
  console.log('Local Supabase start PASS (credentials omitted).');

process.exit(result.status ?? 1);
