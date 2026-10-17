import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { scanAdminUiGovernance } from './admin-ui-governance.mjs';

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-ui-governance-'));
  fs.mkdirSync(path.join(root, 'apps/admin/app'), { recursive: true });
  fs.mkdirSync(path.join(root, 'apps/admin/features/demo'), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(root, 'apps/admin/app/globals.css'),
    files.css ?? '',
  );
  for (const [relative, content] of Object.entries(files.sources ?? {})) {
    const absolute = path.join(root, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content);
  }
  return root;
}

function codes(root) {
  return scanAdminUiGovernance(root).issues.map((issue) => issue.code);
}

test('rejects raw controls, local theme ownership, and direct skin helpers', () => {
  const root = fixture({
    sources: {
      'apps/admin/features/demo/page.tsx': `
        export function Demo() {
          return <><input /><div data-theme="dark" />{buttonVariants({ variant: 'outline' })}</>;
        }
      `,
    },
  });
  const result = codes(root);
  assert.ok(result.includes('RAW_BASE_CONTROL'));
  assert.ok(result.includes('THEME_OWNER_VIOLATION'));
  assert.ok(result.includes('FEATURE_SKIN_HELPER'));
});

test('rejects internal visual skin overrides on standard controls but allows layout classes', () => {
  const bad = fixture({
    sources: {
      'apps/admin/features/demo/page.tsx': `export function Demo() { return <Button className="w-full bg-red-500 hover:bg-red-600" />; }`,
    },
  });
  assert.ok(codes(bad).includes('STANDARD_CONTROL_SKIN_OVERRIDE'));

  const good = fixture({
    sources: {
      'apps/admin/features/demo/page.tsx': `export function Demo() { return <Button className="w-full sm:w-auto" />; }`,
    },
  });
  assert.ok(!codes(good).includes('STANDARD_CONTROL_SKIN_OVERRIDE'));
});

test('rejects orphan product CSS ownership', () => {
  const root = fixture({
    css: '.admin-dead-surface { background: red; }',
    sources: {
      'apps/admin/features/demo/page.tsx': `export function Demo() { return <div />; }`,
    },
  });
  assert.ok(codes(root).includes('ORPHAN_PRODUCT_CSS'));
});
