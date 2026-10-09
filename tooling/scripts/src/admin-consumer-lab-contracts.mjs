import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { repositoryRoot } from './toolchain.mjs';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];
const outputFile = resolve(
  repositoryRoot,
  'apps/admin/features/consumer-lab/contract-summaries.generated.json',
);

function readJson(path) {
  return JSON.parse(readFileSync(resolve(repositoryRoot, path), 'utf8'));
}

function securityNames(requirements) {
  return [
    ...new Set((requirements ?? []).flatMap((entry) => Object.keys(entry))),
  ].sort();
}

export function summarizeContract(document, major) {
  const operations = [];
  for (const [route, pathItem] of Object.entries(document.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;
      operations.push({
        method: method.toUpperCase(),
        path: route,
        operationId: operation.operationId ?? 'missing-operation-id',
        security: securityNames(operation.security),
      });
    }
  }

  return {
    title: document.info?.title ?? 'Unnamed contract',
    major,
    version: document.info?.version ?? 'unknown',
    securitySchemes: Object.keys(
      document.components?.securitySchemes ?? {},
    ).sort(),
    operations: operations.sort((left, right) =>
      `${left.path}:${left.method}`.localeCompare(
        `${right.path}:${right.method}`,
      ),
    ),
  };
}

export function buildSnapshot() {
  return {
    account: summarizeContract(
      readJson('contracts/account/v1/openapi.json'),
      'v1',
    ),
    admin: summarizeContract(readJson('contracts/admin/v1/openapi.json'), 'v1'),
  };
}

function serializedSnapshot() {
  return `${JSON.stringify(buildSnapshot(), null, 2)}\n`;
}

function writeSnapshot() {
  writeFileSync(outputFile, serializedSnapshot(), 'utf8');
  console.log(`Consumer Lab contract snapshot written: ${outputFile}`);
}

function checkSnapshot() {
  if (!existsSync(outputFile))
    throw new Error(
      'CONSUMER_LAB_CONTRACT_SNAPSHOT_MISSING: run pnpm consumer-lab:contracts:write',
    );

  const expected = serializedSnapshot();
  const actual = readFileSync(outputFile, 'utf8');
  if (actual !== expected)
    throw new Error(
      'CONSUMER_LAB_CONTRACT_SNAPSHOT_DRIFT: run pnpm consumer-lab:contracts:write and commit the generated file',
    );

  console.log('Consumer Lab contract snapshot check PASS');
}

if (process.argv.includes('--write')) writeSnapshot();
else checkSnapshot();
