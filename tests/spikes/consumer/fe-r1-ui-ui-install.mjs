import { execFileSync } from 'node:child_process';
import {
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
const artifactsDirectory = join(repositoryRoot, 'artifacts', 'fe-r1-ui');
const consumerDirectory =
  process.platform === 'win32'
    ? 'E:\\AppData\\fe-r1-ui-consumer'
    : join('/tmp', 'fe-r1-ui-consumer');

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
      pnpm_config_store_dir: 'E:\\AppData\\pnpm',
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
mkdirSync(artifactsDirectory, { recursive: true });

for (const packageName of ['@kit/shared', '@kit/ui']) {
  run(packageManager(), [
    '--filter',
    packageName,
    'pack',
    '--pack-destination',
    artifactsDirectory,
  ]);
}

const tarballs = {
  '@kit/shared': join(artifactsDirectory, 'kit-shared-0.1.0.tgz'),
  '@kit/ui': join(artifactsDirectory, 'kit-ui-0.1.0.tgz'),
};
for (const [name, path] of Object.entries(tarballs)) {
  assert(existsSync(path), `missing UI tarball: ${name}`);
  const packageManifest = run('tar', ['-xOf', path, 'package/package.json']);
  assert(
    !packageManifest.includes('workspace:') &&
      !packageManifest.includes(repositoryRoot),
    `${name} tarball contains a workspace or repository absolute dependency`,
  );
}

const packageJson = {
  name: 'fe-r1-ui-consumer',
  version: '0.0.0',
  private: true,
  type: 'module',
  scripts: {
    build: 'next build --webpack',
    start: 'next start',
    typecheck: 'tsc --noEmit',
  },
  dependencies: {
    '@kit/shared': `file:${tarballs['@kit/shared']}`,
    '@kit/ui': `file:${tarballs['@kit/ui']}`,
    next: '16.3.0',
    react: '19.2.8',
    'react-dom': '19.2.8',
  },
  devDependencies: {
    '@tailwindcss/postcss': '^4.1.14',
    '@types/node': '24.13.3',
    '@types/react': '19.2.18',
    '@types/react-dom': '19.2.4',
    tailwindcss: '4.3.3',
    typescript: '7.0.2',
  },
};
writeFileSync(
  join(consumerDirectory, 'package.json'),
  `${JSON.stringify(packageJson, null, 2)}\n`,
);
writeFileSync(
  join(consumerDirectory, 'pnpm-workspace.yaml'),
  `packages: []\noverrides:\n  "@kit/shared": "file:${tarballs['@kit/shared'].replaceAll(String.fromCharCode(92), '/')}"\n`,
);
writeFileSync(
  join(consumerDirectory, 'postcss.config.mjs'),
  `export default { plugins: { '@tailwindcss/postcss': {} } };\n`,
);
writeFileSync(
  join(consumerDirectory, 'next.config.mjs'),
  `export default { transpilePackages: ['@kit/ui'] };\n`,
);
writeFileSync(
  join(consumerDirectory, 'next-env.d.ts'),
  `/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n`,
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
mkdirSync(join(consumerDirectory, 'app'), { recursive: true });
writeFileSync(
  join(consumerDirectory, 'app', 'globals.css'),
  `@import '@kit/ui/styles.css';

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-border: var(--border);
  --color-muted-foreground: var(--muted-foreground);
  --color-success: var(--success);
}

:root {
  --background: oklch(0.98 0.01 250);
  --foreground: oklch(0.2 0.03 255);
  --primary: oklch(0.54 0.18 255);
  --primary-foreground: oklch(0.98 0.01 250);
  --border: oklch(0.88 0.02 255);
  --muted-foreground: oklch(0.5 0.04 255);
  --success: oklch(0.58 0.15 155);
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: ui-sans-serif, system-ui, sans-serif;
}
`,
);
writeFileSync(
  join(consumerDirectory, 'app', 'layout.tsx'),
  `import type { ReactNode } from 'react';

import './globals.css';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
`,
);
writeFileSync(
  join(consumerDirectory, 'app', 'page.tsx'),
  `'use client';

import { useState } from 'react';

import { Button } from '@kit/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@kit/ui/dialog';
import { StatusBadge } from '@kit/ui/status-badge';

export default function UiProbePage() {
  const [open, setOpen] = useState(false);

  return (
    <main className="mx-auto grid min-h-svh max-w-2xl content-center gap-6 px-6 py-12">
      <div className="grid gap-2">
        <p className="text-sm text-muted-foreground">FE-D03</p>
        <h1 className="text-3xl font-semibold tracking-tight">共享 UI 独立安装样例</h1>
        <p className="text-muted-foreground">Button、Dialog 和 StatusBadge 来自独立 tarball，样式由共享 CSS 入口提供。</p>
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-white p-5 shadow-sm">
        <StatusBadge label="已连接" tone="success" rawValue="connected" />
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button data-test="ui-probe-open">打开中文对话框</Button>} />
          <DialogContent showCloseButton={false}>
            <DialogHeader>
              <DialogTitle>独立安装成功</DialogTitle>
              <DialogDescription>共享组件和语义样式已从本地 tarball 加载。</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" data-test="ui-probe-close" />}>关闭</DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </main>
  );
}
`,
);

run(
  packageManager(),
  ['install', '--prefer-offline', '--no-frozen-lockfile'],
  consumerDirectory,
);
run(packageManager(), ['run', 'typecheck'], consumerDirectory);
run(
  process.execPath,
  [
    join(consumerDirectory, 'node_modules', 'next', 'dist', 'bin', 'next'),
    'build',
    '--webpack',
  ],
  consumerDirectory,
);

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
      independentUiInstall: 'PASS',
      typecheck: 'PASS',
      build: 'PASS',
      workspaceLinks: 'ABSENT',
      sharedCssEntry: 'PASS',
      browser: 'PENDING (run against consumer start in FE-V10)',
    },
    null,
    2,
  ),
);
