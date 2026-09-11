import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { delimiter, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const packageNames = [
  'domain',
  'account-auth',
  'account-auth-nextjs',
  'account-server',
];
const destination = resolve(
  repositoryRoot,
  process.env.M5_SDK_PACK_DESTINATION ?? 'artifacts/sdk',
);

function packageManager() {
  if (process.platform !== 'win32') return 'pnpm';
  const pathValue = process.env.Path ?? process.env.PATH ?? '';
  for (const entry of pathValue.split(delimiter)) {
    const candidate = join(entry, 'pnpm.cmd');
    if (existsSync(candidate)) return candidate;
  }
  return 'pnpm.cmd';
}

function run(command, args, cwd) {
  execFileSync(command, args, {
    cwd,
    env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' },
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });
}

function runDirect(command, args, cwd) {
  execFileSync(command, args, {
    cwd,
    env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' },
    stdio: 'inherit',
  });
}

function sourceFiles(directory) {
  const result = [];
  const visit = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (
        /\.(?:ts|tsx)$/u.test(entry.name) &&
        !/\.d\.ts$/u.test(entry.name)
      )
        result.push(relative(directory, path));
    }
  };
  visit(directory);
  return result.sort();
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableJson(entry)]),
  );
}

rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });
const rawDestination = join(destination, '.raw');
const stagingRoot = join(destination, '.pack-staging');

const artifacts = [];
for (const packageName of packageNames) {
  const packageDirectory = join(repositoryRoot, 'packages', packageName);
  const packageJson = JSON.parse(
    readFileSync(join(packageDirectory, 'package.json'), 'utf8'),
  );
  const dist = join(packageDirectory, 'dist');
  rmSync(dist, { recursive: true, force: true });

  run(
    packageManager(),
    [
      'exec',
      'tsc',
      '--ignoreConfig',
      '--target',
      'ES2022',
      '--module',
      'ESNext',
      '--moduleResolution',
      'bundler',
      '--strict',
      '--skipLibCheck',
      '--declaration',
      '--outDir',
      'dist',
      '--rootDir',
      'src',
      '--rewriteRelativeImportExtensions',
      '--typeRoots',
      'node_modules/@types',
      '--types',
      'node',
      ...sourceFiles(join(packageDirectory, 'src')).map((file) =>
        join('src', file),
      ),
    ],
    packageDirectory,
  );

  const packageSlug = packageName.replaceAll('/', '-');
  const rawPackageDestination = join(rawDestination, packageSlug);
  const stagingDirectory = join(stagingRoot, packageSlug);
  const stagingPackageDirectory = join(stagingDirectory, 'package');
  mkdirSync(rawPackageDestination, { recursive: true });
  mkdirSync(stagingDirectory, { recursive: true });

  run(
    packageManager(),
    ['pack', '--pack-destination', rawPackageDestination],
    packageDirectory,
  );

  const rawTarball = join(
    rawPackageDestination,
    `${packageJson.name.replace(/^@/u, '').replaceAll('/', '-')}-${packageJson.version}.tgz`,
  );
  if (!existsSync(rawTarball))
    throw new Error(`SDK raw tarball was not created: ${rawTarball}`);

  runDirect(process.platform === 'win32' ? 'tar.exe' : 'tar', [
    '-xf',
    rawTarball,
    '-C',
    stagingDirectory,
  ]);
  const stagedPackageJsonPath = join(stagingPackageDirectory, 'package.json');
  const stagedPackageJson = JSON.parse(
    readFileSync(stagedPackageJsonPath, 'utf8'),
  );
  writeFileSync(
    stagedPackageJsonPath,
    `${JSON.stringify(stableJson(stagedPackageJson), null, 2)}\n`,
  );

  run(
    packageManager(),
    ['pack', '--pack-destination', destination],
    stagingPackageDirectory,
  );

  const tarball = join(
    destination,
    `${packageJson.name.replace(/^@/u, '').replaceAll('/', '-')}-${packageJson.version}.tgz`,
  );
  if (!existsSync(tarball))
    throw new Error(`SDK tarball was not created: ${tarball}`);
  artifacts.push({
    name: packageJson.name,
    version: packageJson.version,
    file: relative(repositoryRoot, tarball).replaceAll('\\', '/'),
    sha256: sha256(tarball),
  });
}

rmSync(rawDestination, { recursive: true, force: true });
rmSync(stagingRoot, { recursive: true, force: true });

writeFileSync(
  join(destination, 'manifest.json'),
  `${JSON.stringify({ generated_at: 'SOURCE_DATE_EPOCH_REQUIRED', artifacts }, null, 2)}\n`,
);
console.log(JSON.stringify({ artifacts }, null, 2));
