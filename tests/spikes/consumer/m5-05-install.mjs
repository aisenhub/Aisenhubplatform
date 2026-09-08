import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const artifactsDirectory = join(repositoryRoot, 'artifacts', 'm5-05-sdk');
const sourceApp = join(repositoryRoot, 'apps', 'template-preview');
const consumerDirectory =
  process.platform === 'win32'
    ? 'E:\\AppData\\m5-template-consumer'
    : join('/tmp', 'm5-template-consumer');

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
    env: {
      ...process.env,
      ...env,
      CI: '1',
      COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
    },
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

rmSync(consumerDirectory, { recursive: true, force: true });
rmSync(artifactsDirectory, { recursive: true, force: true });
mkdirSync(consumerDirectory, { recursive: true });
run(packageManager(), ['run', 'sdk:pack'], repositoryRoot, {
  M5_SDK_PACK_DESTINATION: artifactsDirectory,
});

const tarballs = {
  '@kit/domain': join(artifactsDirectory, 'kit-domain-0.1.0.tgz'),
  '@kit/account-auth': join(artifactsDirectory, 'kit-account-auth-0.1.0.tgz'),
  '@kit/account-auth-nextjs': join(
    artifactsDirectory,
    'kit-account-auth-nextjs-0.1.0.tgz',
  ),
  '@kit/account-server': join(
    artifactsDirectory,
    'kit-account-server-0.1.0.tgz',
  ),
};
for (const [name, path] of Object.entries(tarballs))
  assert(existsSync(path), `missing tarball: ${name}`);

cpSync(sourceApp, consumerDirectory, {
  recursive: true,
  filter: (source) =>
    !source.includes(`${join('apps', 'template-preview', '.next')}`) &&
    !source.includes(`${join('apps', 'template-preview', 'node_modules')}`),
});
const packageJson = {
  name: 'm5-template-consumer',
  version: '0.0.0',
  private: true,
  type: 'module',
  scripts: {
    build: 'next build --webpack',
    typecheck: 'tsc --noEmit',
  },
  dependencies: {
    '@kit/domain': `file:${tarballs['@kit/domain']}`,
    '@kit/account-auth': `file:${tarballs['@kit/account-auth']}`,
    '@kit/account-auth-nextjs': `file:${tarballs['@kit/account-auth-nextjs']}`,
    '@kit/account-server': `file:${tarballs['@kit/account-server']}`,
    next: '16.3.0',
    react: '19.2.8',
    'react-dom': '19.2.8',
  },
  devDependencies: {
    '@types/node': '24.13.3',
    '@types/react': '19.2.18',
    '@types/react-dom': '19.2.4',
    typescript: '7.0.2',
    vitest: '4.1.10',
  },
};
writeFileSync(
  join(consumerDirectory, 'package.json'),
  `${JSON.stringify(packageJson, null, 2)}\n`,
);
writeFileSync(
  join(consumerDirectory, 'tsconfig.json'),
  `${JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2017',
        lib: ['dom', 'dom.iterable', 'esnext'],
        allowJs: false,
        skipLibCheck: true,
        strict: true,
        noEmit: true,
        esModuleInterop: true,
        module: 'esnext',
        moduleResolution: 'bundler',
        resolveJsonModule: true,
        isolatedModules: true,
        jsx: 'preserve',
        plugins: [{ name: 'next' }],
      },
      include: ['next-env.d.ts', '.next/types/**/*.ts', '**/*.ts', '**/*.tsx'],
      exclude: ['node_modules', '.next'],
    },
    null,
    2,
  )}\n`,
);
const localTarballPath = (name) => tarballs[name].replaceAll('\\', '/');
writeFileSync(
  join(consumerDirectory, 'pnpm-workspace.yaml'),
  `packages: []\noverrides:\n  "@kit/domain": "file:${localTarballPath('@kit/domain')}"\n  "@kit/account-auth": "file:${localTarballPath('@kit/account-auth')}"\n  "@kit/account-auth-nextjs": "file:${localTarballPath('@kit/account-auth-nextjs')}"\n  "@kit/account-server": "file:${localTarballPath('@kit/account-server')}"\n`,
);

run(
  packageManager(),
  ['install', '--prefer-offline', '--no-frozen-lockfile'],
  consumerDirectory,
);
run(packageManager(), ['run', 'typecheck'], consumerDirectory);
run(packageManager(), ['run', 'build'], consumerDirectory);

const consumerPackage = JSON.parse(
  readFileSync(join(consumerDirectory, 'package.json'), 'utf8'),
);
assert(
  Object.values(consumerPackage.dependencies).every(
    (value) => typeof value === 'string' && !value.startsWith('workspace:'),
  ),
  'consumer must not use workspace dependencies',
);
console.log(
  JSON.stringify(
    {
      independentConsumerInstall: 'PASS',
      typecheck: 'PASS',
      build: 'PASS',
      workspaceLinks: 'ABSENT',
      hostedDualPlatformE2E: 'NOT_RUN (X05/hosted backend unavailable)',
    },
    null,
    2,
  ),
);
