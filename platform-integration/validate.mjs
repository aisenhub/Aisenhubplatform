import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const integrationDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(integrationDir, '..');

function readJson(relativePath) {
  return JSON.parse(
    fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8'),
  );
}

function requirePath(relativePath, label) {
  if (!fs.existsSync(path.join(repositoryRoot, relativePath))) {
    throw new Error(`${label}_MISSING: ${relativePath}`);
  }
}

const manifest = readJson('platform-integration/manifest.json');
const capabilityDocument = readJson(
  'platform-integration/ai/capabilities.json',
);

if (manifest.contract_first !== true || manifest.runtime_sdk !== false) {
  throw new Error('PLATFORM_INTEGRATION_BOUNDARY_INVALID');
}

for (const [name, relativePath] of Object.entries(manifest.entrypoints ?? {})) {
  requirePath(relativePath, `ENTRYPOINT_${name.toUpperCase()}`);
}

const account = manifest.contracts?.account;
if (!account || account.major !== 'v1') {
  throw new Error('ACCOUNT_CONTRACT_POINTER_INVALID');
}

for (const [name, relativePath] of Object.entries({
  openapi: account.openapi,
  compatibility: account.compatibility,
  changelog: account.changelog,
})) {
  requirePath(relativePath, `ACCOUNT_${name.toUpperCase()}`);
}

requirePath(manifest.conformance?.implementation, 'CONFORMANCE_IMPLEMENTATION');

if (capabilityDocument.contract !== account.openapi) {
  throw new Error('CAPABILITY_CONTRACT_POINTER_DRIFT');
}

const openapi = readJson(account.openapi);
const operationIds = new Set();
for (const pathItem of Object.values(openapi.paths ?? {})) {
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    const operationId = pathItem?.[method]?.operationId;
    if (operationId) operationIds.add(operationId);
  }
}

const seenCapabilities = new Set();
for (const capability of capabilityDocument.capabilities ?? []) {
  if (!capability.id || seenCapabilities.has(capability.id)) {
    throw new Error(`CAPABILITY_ID_INVALID: ${capability.id ?? '<missing>'}`);
  }
  seenCapabilities.add(capability.id);
  if (typeof capability.required !== 'boolean') {
    throw new Error(`CAPABILITY_REQUIRED_INVALID: ${capability.id}`);
  }
  requirePath(capability.guide, `CAPABILITY_GUIDE_${capability.id}`);
  for (const operationId of capability.operation_ids ?? []) {
    if (!operationIds.has(operationId)) {
      throw new Error(
        `CAPABILITY_OPERATION_UNKNOWN: ${capability.id}:${operationId}`,
      );
    }
  }
}

for (const required of [
  'auth-session',
  'account-principal',
  'account-activation',
  'authorization-entitlement',
  'errors-observability',
]) {
  const capability = capabilityDocument.capabilities.find(
    (entry) => entry.id === required,
  );
  if (!capability?.required) {
    throw new Error(`CORE_CAPABILITY_MISSING: ${required}`);
  }
}

console.log(
  `Platform integration check PASS: ${seenCapabilities.size} capabilities, ${operationIds.size} canonical Account operations`,
);
