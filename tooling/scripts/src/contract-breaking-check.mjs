import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { compareContractDocuments } from './contract-breaking-lib.mjs';

const root = process.cwd();
const baseRef =
  process.argv[2] ?? process.env.CONTRACT_BASE_REF ?? 'origin/main';
const contracts = [
  {
    name: 'account',
    current: 'contracts/account/v1/openapi.json',
    legacy: 'docs/reference/contracts/account.openapi.json',
  },
  {
    name: 'admin',
    current: 'contracts/admin/v1/openapi.json',
    legacy: 'docs/reference/contracts/admin.openapi.json',
  },
];

function parseJson(raw, source) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${source}: invalid JSON (${error.message})`);
  }
}

function readCurrent(relative) {
  return parseJson(
    fs.readFileSync(path.join(root, relative), 'utf8'),
    relative,
  );
}

function readBase(entry) {
  for (const candidate of [entry.current, entry.legacy]) {
    try {
      const raw = execFileSync('git', ['show', `${baseRef}:${candidate}`], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      return {
        document: parseJson(raw, `${baseRef}:${candidate}`),
        path: candidate,
      };
    } catch {
      // The canonical path changed in the previous migration; try the legacy path.
    }
  }
  throw new Error(`${entry.name}: no contract found at ${baseRef}`);
}

const failures = [];
const sources = [];
for (const entry of contracts) {
  const before = readBase(entry);
  const after = readCurrent(entry.current);
  failures.push(
    ...compareContractDocuments(entry.name, before.document, after),
  );
  sources.push(`${entry.name}:${before.path}`);
}

if (failures.length) {
  console.error(
    `Contract breaking check FAIL against ${baseRef}: ${failures.length} issue(s)`,
  );
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(
  `Contract breaking check PASS against ${baseRef} (${sources.join(', ')})`,
);
