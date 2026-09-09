import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

for (const variable of ['SUPABASE_URL', 'NEXT_PUBLIC_SITE_URL']) {
  const value = process.env[variable];
  if (
    value &&
    !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(
      value,
    )
  ) {
    console.error(
      `Refusing local Supabase action because ${variable} is not a localhost URL.`,
    );
    process.exit(2);
  }
}

if (process.env.SUPABASE_PROJECT_REF) {
  console.error(
    'Refusing local Supabase action while SUPABASE_PROJECT_REF is set.',
  );
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
    ? ['db', 'reset', ...args]
    : action === 'db'
      ? ['test', 'db', ...args]
      : [action, ...args];
// Calling the package entrypoint through the current Node executable avoids
// Windows' non-executable .cmd shim while preserving the pinned project CLI.
const result = spawnSync(process.execPath, [cliEntrypoint, ...command], {
  cwd: root,
  env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: '1' },
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error.message);
}

process.exit(result.status ?? 1);
