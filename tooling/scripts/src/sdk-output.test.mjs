import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { test } from 'node:test';
import { assertSdkOutputDirectory } from './sdk-output.mjs';

test('SDK cleanup rejects repository/source roots, escapes and linked outputs', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'aisenhub-sdk-safety-'));
  const repository = join(fixture, 'repo');
  const artifacts = join(repository, 'artifacts');
  const outside = join(fixture, 'outside');
  mkdirSync(artifacts, { recursive: true });
  mkdirSync(outside);
  const sentinel = join(outside, 'keep.txt');
  writeFileSync(sentinel, 'fixture must survive');
  try {
    for (const path of [
      repository,
      artifacts,
      join(repository, 'packages'),
      outside,
    ])
      assert.throws(
        () => assertSdkOutputDirectory(repository, path),
        /SDK_OUTPUT_UNSAFE/,
      );
    assert.equal(
      assertSdkOutputDirectory(repository, join(artifacts, 'sdk')),
      join(artifacts, 'sdk'),
    );
    const link = join(artifacts, 'linked');
    symlinkSync(
      outside,
      link,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    assert.throws(
      () => assertSdkOutputDirectory(repository, link),
      /SDK_OUTPUT_UNSAFE/,
    );
    assert.throws(
      () => assertSdkOutputDirectory(repository, join(link, 'nested')),
      /SDK_OUTPUT_UNSAFE/,
    );
    assert.equal(existsSync(sentinel), true);
    // Remove the known link first; cleanup below stays in the test fixture.
    rmSync(link);
  } finally {
    assert.ok(
      isAbsolute(fixture) &&
        fixture.startsWith(join(tmpdir(), 'aisenhub-sdk-safety-')),
    );
    rmSync(fixture, { recursive: true, force: true });
  }
});
