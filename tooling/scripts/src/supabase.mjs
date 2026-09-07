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

const executable = path.join(
  root,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'supabase.cmd' : 'supabase',
);
const command =
  action === 'db-reset'
    ? ['db', 'reset', ...args]
    : action === 'db'
      ? ['test', 'db', ...args]
      : [action, ...args];
const result = spawnSync(executable, command, {
  cwd: root,
  env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: '1' },
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error.message);
}

process.exit(result.status ?? 1);
