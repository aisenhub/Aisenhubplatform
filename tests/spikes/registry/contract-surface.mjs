import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const manifest = JSON.parse(
  fs.readFileSync(
    path.join(repositoryRoot, 'registry', 'manifest.json'),
    'utf8',
  ),
);

assert.equal(manifest.status, 'local-only');
assert.equal(manifest.schema_version, '3.0.0');
assert.equal(manifest.contract_compatibility?.account?.major, 'v1');
assert.equal(manifest.contract_compatibility?.admin?.major, 'v1');
assert.equal(
  manifest.contract_compatibility?.consumer_harness,
  'tests/consumer-harness',
);
assert.equal(
  manifest.contract_compatibility?.consumer_lab,
  'apps/admin/app/admin/consumer-lab/page.tsx',
);
assert.ok(!('sdk_compatibility' in manifest));
assert.ok(!('templates' in manifest));
assert.ok(!('reference_consumer' in (manifest.contract_compatibility ?? {})));

for (const surface of ['account', 'admin']) {
  const entry = manifest.contract_compatibility[surface];
  assert.ok(
    fs.existsSync(path.join(repositoryRoot, entry.contract)),
    `${surface} canonical contract is missing`,
  );
}

for (const required of [
  'tests/consumer-harness/server.mjs',
  'tests/consumer-harness/contract.mjs',
  'tests/consumer-harness/public/index.html',
  'apps/admin/app/admin/consumer-lab/page.tsx',
]) {
  assert.ok(
    fs.existsSync(path.join(repositoryRoot, required)),
    `missing ${required}`,
  );
}
assert.equal(
  fs.existsSync(path.join(repositoryRoot, 'registry', 'templates.json')),
  false,
  'Registry template inventory must remain retired',
);

const browserSource = ['index.html', 'app.js']
  .map((file) =>
    fs.readFileSync(
      path.join(repositoryRoot, 'tests', 'consumer-harness', 'public', file),
      'utf8',
    ),
  )
  .join('\n');
assert.doesNotMatch(
  browserSource,
  /ACCOUNT_PLATFORM_KEY|SUPABASE_SECRET_KEY|SERVICE_ROLE_KEY|access_token|refresh_token/iu,
  'Consumer Harness browser assets must not contain server credential markers',
);

console.log(
  JSON.stringify(
    {
      manifest: 'PASS',
      canonicalContracts: 'PASS',
      consumerHarness: 'PASS',
      adminConsumerLab: 'PASS',
      templateInventoryRetired: 'PASS',
      browserSecretBoundary: 'PASS',
    },
    null,
    2,
  ),
);
