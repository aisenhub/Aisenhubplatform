import { execFileSync } from 'node:child_process';

import { pnpmCliPath, TOOLCHAIN } from './toolchain.mjs';

void checkRequirements();

function fail(message) {
  console.error('\x1b[31m%s\x1b[0m', message);
  process.exit(1);
}

function checkRequirements() {
  checkNodeVersion();
  checkPnpmVersion();
  checkPathNotOneDrive();
}

function checkNodeVersion() {
  const current = process.versions.node;
  if (current !== TOOLCHAIN.node)
    fail(
      `Aisenhubplatform requires Node ${TOOLCHAIN.node}; received ${current}.`,
    );
  console.log('\x1b[32m%s\x1b[0m', `You are running Node ${current}.`);
}

function checkPnpmVersion() {
  let current;
  try {
    current = execFileSync(process.execPath, [pnpmCliPath(), '--version'], {
      encoding: 'utf8',
    }).trim();
  } catch {
    fail(
      `Aisenhubplatform requires pnpm ${TOOLCHAIN.pnpm}; run installs through the pinned workspace package manager.`,
    );
  }
  if (current !== TOOLCHAIN.pnpm)
    fail(
      `Aisenhubplatform requires pnpm ${TOOLCHAIN.pnpm}; received ${current}.`,
    );
  console.log('\x1b[32m%s\x1b[0m', `You are running pnpm ${current}.`);
}

function checkPathNotOneDrive() {
  if (process.cwd().includes('OneDrive'))
    fail(
      'Aisenhubplatform must run from a local working directory outside OneDrive.',
    );
}
