import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SUPPORTED_OPERATIONS,
  operationFor,
  validateSupportedOperations,
} from '../../consumer-harness/contract.mjs';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const harnessRoot = path.join(repositoryRoot, 'tests', 'consumer-harness');

function files(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(root, entry.name);
    return entry.isDirectory() ? files(absolute) : [absolute];
  });
}

const source = files(harnessRoot)
  .filter((file) => /\.(?:mjs|js|html|md)$/u.test(file))
  .map((file) => [file, fs.readFileSync(file, 'utf8')]);

for (const [file, text] of source) {
  assert.doesNotMatch(
    text,
    /(?:from\s+|import\s*\()\s*['"](?:@kit\/|next(?:\/|['"])|react(?:\/|['"]))/u,
    `forbidden runtime dependency in ${path.relative(repositoryRoot, file)}`,
  );
  assert.doesNotMatch(
    text,
    /(?:apps\/admin|packages\/domain|SUPABASE_SECRET_KEY|SERVICE_ROLE_KEY|ACCOUNT_API_DB_URL)/u,
    `forbidden central/private boundary in ${path.relative(repositoryRoot, file)}`,
  );
}

for (const name of ['index.html', 'app.js']) {
  const text = fs.readFileSync(path.join(harnessRoot, 'public', name), 'utf8');
  assert.doesNotMatch(
    text,
    /ACCOUNT_PLATFORM_KEY|access_token|refresh_token|SUPABASE_SECRET_KEY|SERVICE_ROLE_KEY/iu,
    `${name} must not contain server credential markers`,
  );
}

assert.deepEqual(validateSupportedOperations(), []);
assert.ok(
  SUPPORTED_OPERATIONS.length >= 10,
  'Harness must cover a meaningful Account surface',
);
assert.equal(
  operationFor(
    'GET',
    '/v1/config-files/00000000-0000-4000-8000-000000000001/content',
  )?.template,
  '/v1/config-files/{fileId}/content',
  'dynamic file route must match its canonical template',
);

const workspace = fs.readFileSync(
  path.join(repositoryRoot, 'pnpm-workspace.yaml'),
  'utf8',
);
assert.doesNotMatch(workspace, /tests\/consumer-harness/u);

console.log(
  JSON.stringify(
    {
      testOnlyBoundary: 'PASS',
      forbiddenImports: 'PASS',
      publicSecretMarkers: 'PASS',
      canonicalOperations: `${SUPPORTED_OPERATIONS.length} PASS`,
      dynamicRouteMatch: 'PASS',
      workspaceIsolation: 'PASS',
    },
    null,
    2,
  ),
);
