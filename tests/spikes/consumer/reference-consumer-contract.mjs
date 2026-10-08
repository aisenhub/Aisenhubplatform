import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const consumerRoot = join(repositoryRoot, 'apps', 'template-preview');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '.next' || entry.name === 'node_modules') return [];
      return sourceFiles(absolute);
    }
    return /\.(?:ts|tsx|mjs)$/u.test(entry.name) ? [absolute] : [];
  });
}

const packageJson = JSON.parse(
  readFileSync(join(consumerRoot, 'package.json'), 'utf8'),
);
const dependencies = {
  ...(packageJson.dependencies ?? {}),
  ...(packageJson.devDependencies ?? {}),
};
for (const forbidden of [
  '@kit/account-auth',
  '@kit/account-auth-nextjs',
  '@kit/account-server',
  '@kit/domain',
]) {
  assert(
    !(forbidden in dependencies),
    `forbidden Reference Consumer dependency: ${forbidden}`,
  );
}

const forbiddenImport =
  /(?:from\s+|import\s*\()\s*['"]@kit\/(?:account-auth(?:-nextjs)?|account-server|domain)(?:\/[^'"]*)?['"]/u;
for (const file of sourceFiles(join(consumerRoot, 'app'))) {
  const source = readFileSync(file, 'utf8');
  assert(
    !forbiddenImport.test(source),
    `forbidden Reference Consumer integration import: ${relative(repositoryRoot, file)}`,
  );
}

for (const required of [
  'app/_lib/auth/server.ts',
  'app/_lib/auth/browser-session.ts',
  'app/_lib/integration/account-contract.ts',
  'app/_lib/integration/authorization.ts',
  'app/api/v1/[...path]/route.ts',
  'app/api/protected/advanced-config/route.ts',
]) {
  assert(
    existsSync(join(consumerRoot, required)),
    `missing Reference Consumer boundary: ${required}`,
  );
}

const registry = JSON.parse(
  readFileSync(join(repositoryRoot, 'registry', 'manifest.json'), 'utf8'),
);
assert(
  registry.contract_compatibility?.reference_consumer ===
    'apps/template-preview',
  'Registry reference_consumer does not point to apps/template-preview',
);
for (const surface of ['account', 'admin']) {
  const entry = registry.contract_compatibility?.[surface];
  assert(entry?.major === 'v1', `${surface} contract major must remain v1`);
  assert(
    typeof entry.contract === 'string' &&
      existsSync(join(repositoryRoot, entry.contract)),
    `${surface} canonical contract is missing`,
  );
}

console.log(
  JSON.stringify(
    {
      referenceConsumerDependencyBoundary: 'PASS',
      referenceConsumerSourceBoundary: 'PASS',
      requiredIntegrationFiles: 'PASS',
      registryCanonicalContracts: 'PASS',
    },
    null,
    2,
  ),
);
