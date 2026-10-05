import { lstatSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

export function assertSdkOutputDirectory(repositoryRoot, destination) {
  const artifactRoot = resolve(repositoryRoot, 'artifacts');
  const output = resolve(destination);
  const suffix = relative(artifactRoot, output);
  if (
    !suffix ||
    suffix === '..' ||
    suffix.startsWith(`..${sep}`) ||
    isAbsolute(suffix)
  )
    throw new Error(
      'SDK_OUTPUT_UNSAFE: use a dedicated directory below repository artifacts.',
    );
  // Reject junctions and symlinks before the recursive cleanup, including the
  // artifacts root itself. A lexical path check alone can escape via a link.
  let current = artifactRoot;
  for (const segment of ['', ...suffix.split(sep)]) {
    if (segment) current = join(current, segment);
    try {
      if (lstatSync(current).isSymbolicLink())
        throw new Error(
          'SDK_OUTPUT_UNSAFE: linked output directories are not allowed.',
        );
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return output;
}
