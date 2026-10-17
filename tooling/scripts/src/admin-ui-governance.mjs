import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.ts', '.tsx']);
const STANDARD_CONTROLS = new Set([
  'Button',
  'Checkbox',
  'Input',
  'NativeSelect',
  'Switch',
  'Textarea',
]);

export const nativeElementExceptions = [
  {
    path: 'apps/admin/features/accounts/deletion-jobs-page.tsx',
    tag: 'button',
    requiredFragment: 'data-test={`deletion-job-inspect-${job.job_id}`}',
    reason:
      'Composite business row has sibling actions; a native row trigger avoids nesting interactive Button controls.',
  },
  {
    path: 'apps/admin/features/billing/billing-order-workspace.tsx',
    tag: 'button',
    requiredFragment: 'className="admin-selectable-row"',
    reason:
      'The entire business collection item is the selection target and consumes the product-owned selectable-row skin.',
  },
  {
    path: 'apps/admin/features/platform-keys/platform-keys-page.tsx',
    tag: 'button',
    requiredFragment: 'data-test={`platform-key-inspect-${key.key_id}`}',
    reason:
      'Composite key row has sibling governance actions; a native metadata trigger avoids nested interactive controls.',
  },
  {
    path: 'apps/admin/features/subscriptions/commerce-entitlement-list.tsx',
    tag: 'button',
    requiredFragment: 'className="admin-selectable-row',
    reason:
      'The entitlement business row is itself the selection target and consumes the product-owned selectable-row skin.',
  },
  {
    path: 'apps/admin/features/feedback/feedback-center-page.tsx',
    tag: 'img',
    requiredFragment: 'src={feedbackImagePath(attachment.content_path)}',
    reason:
      'User-uploaded Feedback attachment is business content served through the authenticated same-origin binary proxy.',
  },
];

const THEME_OWNER_PREFIX = 'apps/admin/components/appearance/';
const THEME_OWNER_FILES = new Set(['apps/admin/app/layout.tsx']);
const THEME_SIGNALS = [
  'data-theme',
  'data-theme-mode',
  'data-accent',
  'data-surface',
  'prefers-color-scheme',
];

function walkSourceFiles(directory) {
  const files = [];
  if (!fs.existsSync(directory)) return files;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (['.next', 'node_modules'].includes(entry.name)) continue;
      files.push(...walkSourceFiles(absolute));
      continue;
    }
    if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(absolute);
  }
  return files;
}

function relativePath(root, absolutePath) {
  return path.relative(root, absolutePath).replaceAll('\\', '/');
}

function lineNumber(source, index) {
  return source.slice(0, index).split('\n').length;
}

function readOpeningTag(source, startIndex) {
  let quote = null;
  let escaped = false;
  let braceDepth = 0;
  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') {
      braceDepth += 1;
      continue;
    }
    if (char === '}') {
      braceDepth = Math.max(0, braceDepth - 1);
      continue;
    }
    if (char === '>' && braceDepth === 0)
      return source.slice(startIndex, index + 1);
  }
  return source.slice(startIndex);
}

function rawTagMatches(source, tag) {
  const matches = [];
  const expression = new RegExp(`<${tag}\\b`, 'gu');
  for (const match of source.matchAll(expression)) {
    matches.push({
      index: match.index,
      openingTag: readOpeningTag(source, match.index),
    });
  }
  return matches;
}

function visualSkinTokens(className) {
  return className
    .split(/\s+/u)
    .filter(Boolean)
    .filter((token) => {
      if (
        /^(?:bg-|border(?:-|$)|rounded(?:-|$)|shadow(?:-|$)|ring(?:-|$)|outline(?:-|$)|opacity-)/u.test(
          token,
        )
      )
        return true;
      if (
        /^(?:hover|focus|focus-visible|active|pressed|selected|dark):/u.test(
          token,
        )
      )
        return true;
      return /^text-(?:foreground|background|primary|secondary|muted|accent|destructive|success|warning|danger|info|black|white|slate-|gray-|zinc-|neutral-|stone-|red-|orange-|amber-|yellow-|lime-|green-|emerald-|teal-|cyan-|sky-|blue-|indigo-|violet-|purple-|fuchsia-|pink-|rose-)/u.test(
        token,
      );
    });
}

function standardControlSkinIssues(relative, source) {
  const issues = [];
  const expression =
    /<(Button|Checkbox|Input|NativeSelect|Switch|Textarea)\b/gu;
  for (const match of source.matchAll(expression)) {
    if (!STANDARD_CONTROLS.has(match[1])) continue;
    const openingTag = readOpeningTag(source, match.index);
    const staticClass = /className\s*=\s*["']([^"']*)["']/u.exec(
      openingTag,
    )?.[1];
    if (!staticClass) continue;
    const forbidden = visualSkinTokens(staticClass);
    if (!forbidden.length) continue;
    issues.push({
      code: 'STANDARD_CONTROL_SKIN_OVERRIDE',
      path: relative,
      line: lineNumber(source, match.index),
      detail: `${match[1]} className owns internal visual skin tokens: ${forbidden.join(', ')}`,
    });
  }
  return issues;
}

function staticPanelClassIssues(relative, source) {
  const issues = [];
  const expression = /className\s*=\s*["']([^"']*)["']/gu;
  for (const match of source.matchAll(expression)) {
    if (!match[1].split(/\s+/u).includes('panel')) continue;
    issues.push({
      code: 'LEGACY_PANEL_CLASS',
      path: relative,
      line: lineNumber(source, match.index),
      detail:
        'legacy .panel page hierarchy is retired; use product composition primitives',
    });
  }
  return issues;
}

function directSkinHelperIssues(relative, source) {
  const issues = [];
  for (const helper of ['buttonVariants']) {
    const expression = new RegExp(`\\b${helper}\\s*\\(`, 'gu');
    for (const match of source.matchAll(expression)) {
      issues.push({
        code: 'FEATURE_SKIN_HELPER',
        path: relative,
        line: lineNumber(source, match.index),
        detail: `${helper}() bypasses the standard component API inside a Feature`,
      });
    }
  }
  return issues;
}

function assetImportIssues(relative, source) {
  const issues = [];
  const expression =
    /(?:from\s+|import\s+)["'][^"']+\.(?:gif|jpe?g|png|svg|webp)["']/giu;
  for (const match of source.matchAll(expression)) {
    issues.push({
      code: 'DIRECT_UI_ASSET_IMPORT',
      path: relative,
      line: lineNumber(source, match.index),
      detail:
        'direct image/icon asset imports need a documented brand/business/professional-graphic exception',
    });
  }
  return issues;
}

function themeOwnerIssues(relative, source) {
  if (
    THEME_OWNER_FILES.has(relative) ||
    relative.startsWith(THEME_OWNER_PREFIX)
  )
    return [];
  const issues = [];
  for (const signal of THEME_SIGNALS) {
    const index = source.indexOf(signal);
    if (index === -1) continue;
    issues.push({
      code: 'THEME_OWNER_VIOLATION',
      path: relative,
      line: lineNumber(source, index),
      detail: `${signal} is owned by the global Appearance system`,
    });
  }
  return issues;
}

function nativeElementIssues(relative, source, exceptionUsage) {
  const issues = [];
  for (const tag of ['button', 'input', 'select', 'textarea', 'svg', 'img']) {
    for (const match of rawTagMatches(source, tag)) {
      const exceptionIndex = nativeElementExceptions.findIndex(
        (exception) =>
          exception.path === relative &&
          exception.tag === tag &&
          match.openingTag.includes(exception.requiredFragment),
      );
      if (exceptionIndex !== -1) {
        exceptionUsage.add(exceptionIndex);
        continue;
      }
      issues.push({
        code:
          tag === 'svg' || tag === 'img'
            ? 'RAW_UI_GRAPHIC'
            : 'RAW_BASE_CONTROL',
        path: relative,
        line: lineNumber(source, match.index),
        detail: `<${tag}> requires a standard component or an explicit documented exception`,
      });
    }
  }
  return issues;
}

function orphanProductCssIssues(root, adminSources) {
  const cssPath = path.join(root, 'apps/admin/app/globals.css');
  if (!fs.existsSync(cssPath)) return [];
  const css = fs.readFileSync(cssPath, 'utf8');
  const sourceCorpus = adminSources
    .filter((entry) => entry.relative !== 'apps/admin/app/globals.css')
    .map((entry) => entry.source)
    .join('\n');
  const names = new Set();
  for (const match of css.matchAll(/(?<![\w-])\.([A-Za-z_][A-Za-z0-9_-]*)/gu)) {
    if (match[1].startsWith('admin-') || match[1].startsWith('platform-'))
      names.add(match[1]);
  }
  return [...names]
    .filter((name) => !sourceCorpus.includes(name))
    .map((name) => ({
      code: 'ORPHAN_PRODUCT_CSS',
      path: 'apps/admin/app/globals.css',
      line: 1,
      detail: `.${name} has no Admin source consumer`,
    }));
}

export function scanAdminUiGovernance(root) {
  const adminRoot = path.join(root, 'apps/admin');
  const featureRoot = path.join(adminRoot, 'features');
  const adminSources = walkSourceFiles(adminRoot).map((absolute) => ({
    absolute,
    relative: relativePath(root, absolute),
    source: fs.readFileSync(absolute, 'utf8'),
  }));
  const featureFiles = new Set(
    walkSourceFiles(featureRoot).map((absolute) => path.resolve(absolute)),
  );
  const issues = [];
  const exceptionUsage = new Set();

  for (const entry of adminSources) {
    issues.push(...themeOwnerIssues(entry.relative, entry.source));
    issues.push(...assetImportIssues(entry.relative, entry.source));
    if (!featureFiles.has(path.resolve(entry.absolute))) continue;
    issues.push(
      ...nativeElementIssues(entry.relative, entry.source, exceptionUsage),
    );
    issues.push(...staticPanelClassIssues(entry.relative, entry.source));
    issues.push(...directSkinHelperIssues(entry.relative, entry.source));
    issues.push(...standardControlSkinIssues(entry.relative, entry.source));
  }

  for (const [index, exception] of nativeElementExceptions.entries()) {
    if (exceptionUsage.has(index)) continue;
    issues.push({
      code: 'STALE_NATIVE_EXCEPTION',
      path: exception.path,
      line: 1,
      detail: `unused <${exception.tag}> exception must be removed: ${exception.reason}`,
    });
  }

  issues.push(...orphanProductCssIssues(root, adminSources));
  return {
    issues,
    sourceFileCount: adminSources.length,
    featureFileCount: featureFiles.size,
    exceptionCount: nativeElementExceptions.length,
  };
}

function runCli() {
  const root = process.cwd();
  const result = scanAdminUiGovernance(root);
  if (result.issues.length) {
    console.error(`Admin UI governance FAIL: ${result.issues.length} issue(s)`);
    for (const issue of result.issues) {
      console.error(
        `- [${issue.code}] ${issue.path}:${issue.line} ${issue.detail}`,
      );
    }
    process.exitCode = 1;
    return;
  }
  console.log(
    `Admin UI governance PASS: ${result.featureFileCount} feature files / ${result.sourceFileCount} Admin source files, ${result.exceptionCount} explicit native exceptions validated`,
  );
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) runCli();
