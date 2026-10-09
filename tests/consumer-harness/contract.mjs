import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(here, '../..');
const accountContractPath = path.join(
  repositoryRoot,
  'contracts',
  'account',
  'v1',
  'openapi.json',
);

export const SUPPORTED_OPERATIONS = [
  ['GET', '/v1/plans'],
  ['GET', '/v1/subscription/products'],
  ['GET', '/v1/account/principal'],
  ['POST', '/v1/account/activate'],
  ['GET', '/v1/profile'],
  ['PATCH', '/v1/profile'],
  ['GET', '/v1/preferences'],
  ['PATCH', '/v1/preferences'],
  ['GET', '/v1/subscription'],
  ['POST', '/v1/subscription/redeem'],
  ['POST', '/v1/config-files/upload-intent'],
  ['GET', '/v1/config-files'],
  ['GET', '/v1/config-files/{fileId}'],
  ['DELETE', '/v1/config-files/{fileId}'],
  ['GET', '/v1/config-files/{fileId}/content'],
  ['PUT', '/v1/config-files/{fileId}/content'],
];

const UUID =
  '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}';

export function loadAccountContract() {
  return JSON.parse(fs.readFileSync(accountContractPath, 'utf8'));
}

function templatePattern(template) {
  const escaped = template.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return new RegExp(`^${escaped.replace('\\{fileId\\}', UUID)}$`, 'u');
}

export function operationFor(method, pathname) {
  const normalized = method.toUpperCase();
  for (const [candidateMethod, template] of SUPPORTED_OPERATIONS) {
    if (
      candidateMethod === normalized &&
      templatePattern(template).test(pathname)
    )
      return { method: candidateMethod, template };
  }
  return null;
}

export function validateSupportedOperations(document = loadAccountContract()) {
  const failures = [];
  for (const [method, template] of SUPPORTED_OPERATIONS) {
    const operation = document.paths?.[template]?.[method.toLowerCase()];
    if (!operation)
      failures.push(
        `${method} ${template} is not present in canonical Account OpenAPI`,
      );
    else if (
      !Array.isArray(operation.security) ||
      operation.security.length === 0
    )
      failures.push(`${method} ${template} has no security declaration`);
  }
  return failures;
}

export function contractSummary() {
  const document = loadAccountContract();
  return {
    title: document.info?.title ?? 'Account API',
    version: document.info?.version ?? 'unknown',
    major: 'v1',
    supported_operations: SUPPORTED_OPERATIONS.length,
  };
}
