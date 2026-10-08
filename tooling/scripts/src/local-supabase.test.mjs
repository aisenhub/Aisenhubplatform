import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  assertLocalSupabaseArguments,
  assertLocalSupabaseEnvironment,
} from './local-supabase.mjs';

test('Local Supabase rejects remote overrides before launching the CLI', () => {
  for (const flag of [
    '--linked',
    '--linked=true',
    '--db-url=postgresql://fixture:fake@remote.example.test/postgres',
    '--workdir=../another-project',
    '--profile=production',
    '--local=false',
  ]) {
    assert.throws(() => assertLocalSupabaseArguments([flag]));
    const result = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL('./supabase.mjs', import.meta.url)),
        'db-reset',
        flag,
      ],
      { env: {}, encoding: 'utf8' },
    );
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Local Supabase does not accept/);
    assert.doesNotMatch(result.stderr, /fixture:fake/);
  }
  assert.doesNotThrow(() =>
    assertLocalSupabaseArguments(['--local', '--no-seed', '--yes']),
  );
});

test('Local environment guards cover public Auth, API and every database URL', () => {
  for (const name of [
    'SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_LOCAL_URL',
    'ACCOUNT_API_URL',
    'SUPABASE_DB_URL',
    'ACCOUNT_API_DB_URL',
  ]) {
    assert.throws(
      () =>
        assertLocalSupabaseEnvironment({
          [name]: 'https://remote.example.test',
        }),
      new RegExp(name),
    );
  }
  assert.throws(() =>
    assertLocalSupabaseEnvironment({ SUPABASE_PROJECT_REF: 'fake-ref' }),
  );
  assert.doesNotThrow(() =>
    assertLocalSupabaseEnvironment({
      NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
      ACCOUNT_API_URL: 'http://127.0.0.1:8000',
      SUPABASE_DB_URL: 'postgresql://fixture:fake@[::1]:54322/postgres',
    }),
  );
});
