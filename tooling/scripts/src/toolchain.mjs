import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDirectory = dirname(fileURLToPath(import.meta.url));

export const repositoryRoot = resolve(scriptsDirectory, '../../..');
export const TOOLCHAIN = Object.freeze(
  JSON.parse(
    readFileSync(resolve(repositoryRoot, 'tooling/toolchain.json'), 'utf8'),
  ),
);

export function denoCommand() {
  return (
    process.env.DENO_BIN?.trim() ||
    (process.platform === 'win32' ? 'deno.exe' : 'deno')
  );
}

export function pnpmCliPath() {
  const path = process.env.npm_execpath?.trim();
  if (!path)
    throw new Error(
      'PNPM_CLI_UNAVAILABLE: run this command through the pinned pnpm workspace script.',
    );
  return path;
}
