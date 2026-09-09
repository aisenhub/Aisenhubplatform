import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { delimiter, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const artifactsRoot = join(repositoryRoot, 'artifacts');
const firstDestination = join(artifactsRoot, 'm5-02-sdk-a');
const secondDestination = join(artifactsRoot, 'm5-02-sdk-b');
const consumerDirectory =
  process.platform === 'win32'
    ? 'E:\\AppData\\m5-sdk-consumer'
    : join('/tmp', 'm5-sdk-consumer');
const packageNames = [
  '@kit/domain',
  '@kit/account-auth',
  '@kit/account-auth-nextjs',
  '@kit/account-server',
];
const packageFiles = new Map([
  ['@kit/domain', 'kit-domain-0.1.0.tgz'],
  ['@kit/account-auth', 'kit-account-auth-0.1.0.tgz'],
  ['@kit/account-auth-nextjs', 'kit-account-auth-nextjs-0.1.0.tgz'],
  ['@kit/account-server', 'kit-account-server-0.1.0.tgz'],
]);

function packageManager() {
  if (process.platform !== 'win32') return 'pnpm';
  const pathValue = process.env.Path ?? process.env.PATH ?? '';
  for (const entry of pathValue.split(delimiter)) {
    const candidate = join(entry, 'pnpm.cmd');
    if (existsSync(candidate)) return candidate;
  }
  return 'pnpm.cmd';
}

function run(command, args, cwd = repositoryRoot, env = {}) {
  return execFileSync(command, args, {
    cwd,
    env: { ...process.env, ...env, COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' },
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

function runDirect(command, args, cwd = repositoryRoot, env = {}) {
  return execFileSync(command, args, {
    cwd,
    env: { ...process.env, ...env, COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function packageJsonFromTarball(path, destination) {
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(destination, { recursive: true });
  runDirect('tar.exe', ['-xf', path, '-C', destination]);
  return JSON.parse(
    readFileSync(join(destination, 'package', 'package.json'), 'utf8'),
  );
}

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

rmSync(artifactsRoot, { recursive: true, force: true });
rmSync(consumerDirectory, { recursive: true, force: true });
mkdirSync(artifactsRoot, { recursive: true });
run(packageManager(), ['run', 'sdk:pack'], repositoryRoot, {
  M5_SDK_PACK_DESTINATION: firstDestination,
});
run(packageManager(), ['run', 'sdk:pack'], repositoryRoot, {
  M5_SDK_PACK_DESTINATION: secondDestination,
});

const packageSummaries = [];
for (const packageName of packageNames) {
  const fileName = packageFiles.get(packageName);
  assert(fileName, `missing tarball mapping for ${packageName}`);
  const first = join(firstDestination, fileName);
  const second = join(secondDestination, fileName);
  assert(
    existsSync(first) && existsSync(second),
    `missing tarball for ${packageName}`,
  );
  assert(
    sha256(first) === sha256(second),
    `non-reproducible tarball: ${packageName}`,
  );

  const inspectDirectory = join(
    artifactsRoot,
    'inspect',
    packageName.replaceAll('/', '-'),
  );
  const packageJson = packageJsonFromTarball(first, inspectDirectory);
  const packageRoot = join(inspectDirectory, 'package');
  const files = walk(packageRoot).map((path) =>
    relative(packageRoot, path).replaceAll('\\', '/'),
  );
  assert(
    files.every((file) =>
      /^(?:dist\/|README\.md$|LICENSE$|package\.json$)/u.test(file),
    ),
    `tarball contains non-runtime files: ${packageName}`,
  );
  assert(
    !JSON.stringify(packageJson).includes('workspace:'),
    `workspace dependency leaked into tarball: ${packageName}`,
  );
  const sourceText = files
    .filter((file) => /\.(?:js|d\.ts|json|md)$/u.test(file))
    .map((file) => readFileSync(join(packageRoot, file), 'utf8'))
    .join('\n');
  for (const marker of [
    /SUPABASE_SECRET_KEY/iu,
    /SERVICE_ROLE_KEY/iu,
    /ACCOUNT_API_DB_URL/iu,
    /(?:^|[\\/])\.env(?:\.|$)/iu,
    /(?:^|[\\/])supabase[\\/]functions(?:[\\/]|$)/iu,
    /create\s+table\s+/iu,
    /from\s+private\./iu,
  ]) {
    assert(
      !marker.test(sourceText),
      `forbidden package content in ${packageName}: ${marker}`,
    );
  }
  packageSummaries.push({
    packageName,
    sha256: sha256(first),
    files: files.length,
  });
}

mkdirSync(join(consumerDirectory, 'src'), { recursive: true });
const dependency = (fileName) =>
  pathToFileURL(join(firstDestination, fileName)).href;
writeFileSync(
  join(consumerDirectory, 'package.json'),
  `${JSON.stringify(
    {
      name: 'm5-02-independent-consumer',
      version: '0.0.0',
      private: true,
      type: 'module',
      dependencies: {
        '@kit/domain': dependency(packageFiles.get('@kit/domain')),
        '@kit/account-auth': dependency(packageFiles.get('@kit/account-auth')),
        '@kit/account-auth-nextjs': dependency(
          packageFiles.get('@kit/account-auth-nextjs'),
        ),
        '@kit/account-server': dependency(
          packageFiles.get('@kit/account-server'),
        ),
        '@supabase/ssr': '^0.12.4',
        '@supabase/supabase-js': '2.111.0',
        typescript: '7.0.2',
      },
    },
    null,
    2,
  )}\n`,
);
writeFileSync(
  join(consumerDirectory, 'pnpm-workspace.yaml'),
  `packages:\n  - .\noverrides:\n  '@kit/domain': ${dependency(packageFiles.get('@kit/domain'))}\n  '@kit/account-auth': ${dependency(packageFiles.get('@kit/account-auth'))}\n  '@kit/account-auth-nextjs': ${dependency(packageFiles.get('@kit/account-auth-nextjs'))}\n  '@kit/account-server': ${dependency(packageFiles.get('@kit/account-server'))}\n`,
);
writeFileSync(
  join(consumerDirectory, 'src', 'browser.ts'),
  "import { createPasswordIntent } from '@kit/account-auth/browser';\nimport { createBrowserSupabaseClient } from '@kit/account-auth-nextjs/browser';\n\nexport const intent = createPasswordIntent('user@example.test');\nexport const client = createBrowserSupabaseClient({ url: 'https://auth.example.test', publishableKey: 'sb_publishable_test' });\n",
);
writeFileSync(
  join(consumerDirectory, 'src', 'server.ts'),
  "import { createAccountApiClient } from '@kit/account-server/server';\nimport { createServerSupabaseClient } from '@kit/account-auth-nextjs/server';\nimport type { PlanDto } from '@kit/domain/contracts';\n\nexport const client = createAccountApiClient({ baseUrl: 'https://account.example.test', platformKey: 'phk_test_server_only' });\nexport const plan: PlanDto | null = null;\nexport const serverFactory = createServerSupabaseClient;\n",
);
writeFileSync(
  join(consumerDirectory, 'src', 'edge.ts'),
  "import { isUuid, API_ERROR_CODES } from '@kit/domain';\nimport { createPasswordIntent } from '@kit/account-auth';\n\nif (!isUuid('00000000-0000-4000-8000-000000000001')) throw new Error('edge import failed');\nif (!API_ERROR_CODES.includes('UNAUTHORIZED')) throw new Error('contract import failed');\ncreatePasswordIntent('edge@example.test');\n",
);
writeFileSync(
  join(consumerDirectory, 'tsconfig.json'),
  `${JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        skipLibCheck: true,
        noEmit: true,
      },
      include: ['src'],
    },
    null,
    2,
  )}\n`,
);
run(
  packageManager(),
  ['install', '--offline', '--ignore-scripts', '--no-frozen-lockfile'],
  consumerDirectory,
);
run(packageManager(), ['exec', 'tsc', '--noEmit'], consumerDirectory);
runDirect(
  process.execPath,
  [
    '--input-type=module',
    '-e',
    "await import('@kit/account-auth/browser'); await import('@kit/account-server/server'); await import('@kit/domain/contracts');",
  ],
  consumerDirectory,
);
runDirect(
  process.execPath,
  [
    '--input-type=module',
    '-e',
    "try { await import('@kit/account-server/browser'); process.exit(1); } catch { process.exit(0); }",
  ],
  consumerDirectory,
);
runDirect(
  'D:\\APP\\Codex\\Deno\\bin\\deno.exe',
  ['run', '--no-check', 'src/edge.ts'],
  consumerDirectory,
);

console.log(
  JSON.stringify(
    {
      reproducibleTarballs: 'PASS',
      packageBoundaryAndContentScan: 'PASS',
      independentInstallTypecheck: 'PASS',
      nodeAndEdgeImports: 'PASS',
      serverPackageBrowserImport: 'REJECTED',
      packages: packageSummaries,
    },
    null,
    2,
  ),
);
