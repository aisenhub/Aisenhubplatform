import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const manifestPath = join(repositoryRoot, 'registry', 'manifest.json');
const templatesPath = join(repositoryRoot, 'registry', 'templates.json');
const templateRoot = join(repositoryRoot, 'apps', 'template-preview');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const templates = JSON.parse(readFileSync(templatesPath, 'utf8'));
assert(manifest.status === 'local-only', 'Registry must remain local-only');
assert(
  manifest.sdk_compatibility.range === '>=0.1.0 <0.2.0',
  'SDK range drifted',
);
assert(
  Array.isArray(templates) && templates.length === 12,
  'template coverage is incomplete',
);

const routePaths = new Set([
  'app/login/page.tsx',
  'app/signup/page.tsx',
  'app/forgot-password/page.tsx',
  'app/update-password/page.tsx',
  'app/pricing/page.tsx',
  'app/account/page.tsx',
  'app/subscription/page.tsx',
  'app/files/page.tsx',
  'app/api/auth/callback/route.ts',
]);
for (const routePath of routePaths)
  assert(
    existsSync(join(templateRoot, routePath)),
    `missing template route: ${routePath}`,
  );

const sourceFiles = [...routePaths]
  .filter((path) => path.endsWith('.tsx') || path.endsWith('.ts'))
  .map((path) => readFileSync(join(templateRoot, path), 'utf8'))
  .join('\n');
assert(
  !/SUPABASE_SERVICE_ROLE_KEY|service_role|DATABASE_URL/u.test(sourceFiles),
  'server secret marker in template',
);
assert(
  !/NEXT_PUBLIC_[A-Z0-9_]*(?:SERVICE|SECRET|DATABASE)/u.test(sourceFiles),
  'backend config masquerading as public config',
);
assert(
  !/from\s+['"]@kit\/account-server['"]/u.test(sourceFiles),
  'server SDK imported by browser route',
);

console.log(
  JSON.stringify(
    {
      manifest: 'PASS',
      templateCoverage: 'PASS',
      routeInventory: 'PASS',
      secretBoundaryScan: 'PASS',
      templates: templates.map((template) => template.id),
    },
    null,
    2,
  ),
);
