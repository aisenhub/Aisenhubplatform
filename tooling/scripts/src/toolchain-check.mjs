import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  denoCommand,
  pnpmCliPath,
  repositoryRoot,
  TOOLCHAIN,
} from './toolchain.mjs';

function readJson(path) {
  return JSON.parse(readFileSync(resolve(repositoryRoot, path), 'utf8'));
}

function assertEqual(label, actual, expected) {
  if (actual !== expected)
    throw new Error(
      `TOOLCHAIN_MISMATCH: ${label} expected ${expected}, received ${actual}`,
    );
}

function pnpmOutput(args) {
  return execFileSync(process.execPath, [pnpmCliPath(), ...args], {
    cwd: repositoryRoot,
    env: process.env,
    encoding: 'utf8',
  }).trim();
}

const packageJson = readJson('package.json');
const registry = readJson('registry/manifest.json');
const denoConfig = readJson('deno.json');
const nvmrc = readFileSync(resolve(repositoryRoot, '.nvmrc'), 'utf8').trim();
const workflow = readFileSync(
  resolve(repositoryRoot, '.github/workflows/workflow.yml'),
  'utf8',
);

assertEqual('package engines.node', packageJson.engines?.node, TOOLCHAIN.node);
assertEqual('package engines.pnpm', packageJson.engines?.pnpm, TOOLCHAIN.pnpm);
assertEqual(
  'package packageManager',
  packageJson.packageManager,
  `pnpm@${TOOLCHAIN.pnpm}`,
);
assertEqual(
  'package Supabase CLI',
  packageJson.devDependencies?.supabase,
  TOOLCHAIN.supabase,
);
assertEqual('.nvmrc', nvmrc, TOOLCHAIN.node);
assertEqual('registry node', registry.build?.node, TOOLCHAIN.node);
assertEqual('registry pnpm', registry.build?.pnpm, TOOLCHAIN.pnpm);
assertEqual('Deno lock path', denoConfig.lock?.path, './deno.lock');
assertEqual('Deno lock frozen', denoConfig.lock?.frozen, true);
if (!existsSync(resolve(repositoryRoot, 'deno.lock')))
  throw new Error('TOOLCHAIN_MISMATCH: deno.lock is missing');

for (const expected of [
  `version: ${TOOLCHAIN.pnpm}`,
  `node-version: ${TOOLCHAIN.node}`,
  `deno-version: v${TOOLCHAIN.deno}`,
]) {
  if (!workflow.includes(expected))
    throw new Error(`TOOLCHAIN_MISMATCH: workflow is missing ${expected}`);
}

assertEqual('runtime Node', process.versions.node, TOOLCHAIN.node);
assertEqual('runtime pnpm', pnpmOutput(['--version']), TOOLCHAIN.pnpm);

const deno = spawnSync(denoCommand(), ['--version'], {
  cwd: repositoryRoot,
  env: process.env,
  encoding: 'utf8',
  shell: false,
});
if (deno.error) throw deno.error;
if (deno.status !== 0)
  throw new Error(`TOOLCHAIN_MISMATCH: Deno exited with ${deno.status}`);
const denoVersion = /^deno\s+([^\s]+)/mu.exec(deno.stdout)?.[1];
assertEqual('runtime Deno', denoVersion, TOOLCHAIN.deno);
assertEqual(
  'runtime Supabase CLI',
  pnpmOutput(['exec', 'supabase', '--version']),
  TOOLCHAIN.supabase,
);

console.log(
  JSON.stringify(
    {
      node: TOOLCHAIN.node,
      pnpm: TOOLCHAIN.pnpm,
      deno: TOOLCHAIN.deno,
      supabase: TOOLCHAIN.supabase,
    },
    null,
    2,
  ),
);
