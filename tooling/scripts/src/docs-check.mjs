import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../',
);
const docsRoot = path.join(root, 'docs');
const requiredFiles = [
  'README.md',
  'agents.md',
  'architecture/overview.md',
  'guides/development.md',
  'guides/testing.md',
  'reference/api.md',
  'reference/configuration.md',
  'reference/data-model.md',
  'reference/contracts/account.openapi.json',
  'reference/contracts/admin.openapi.json',
];
const failures = [];
for (const relative of requiredFiles) {
  if (!existsSync(path.join(docsRoot, relative)))
    failures.push(`missing required document: docs/${relative}`);
}
function markdownFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(absolute);
    return entry.isFile() && entry.name.endsWith('.md') ? [absolute] : [];
  });
}
const documents = markdownFiles(docsRoot);
const files = [
  ...documents,
  ...['README.md', 'AGENTS.md', 'registry/README.md'].map((name) =>
    path.join(root, name),
  ),
];
const graph = new Map();
for (const file of files) {
  if (!existsSync(file)) {
    failures.push(`missing document: ${path.relative(root, file)}`);
    continue;
  }
  const targets = [];
  for (const match of readFileSync(file, 'utf8').matchAll(
    /\[[^\]]*\]\(([^)]+)\)/g,
  )) {
    const target = match[1].trim().replace(/^<|>$/g, '').split('#', 1)[0];
    if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    let resolved;
    try {
      resolved = path.resolve(path.dirname(file), decodeURIComponent(target));
    } catch {
      failures.push(
        `${path.relative(root, file)} -> invalid URL encoding: ${target}`,
      );
      continue;
    }
    if (!existsSync(resolved))
      failures.push(`${path.relative(root, file)} -> ${target}`);
    targets.push(resolved);
  }
  graph.set(file, targets);
}
const reached = new Set();
function visit(file) {
  if (reached.has(file)) return;
  reached.add(file);
  for (const target of graph.get(file) ?? []) visit(target);
}
visit(path.join(docsRoot, 'README.md'));
for (const file of documents) {
  if (!reached.has(file))
    failures.push(
      `not reachable from docs/README.md: ${path.relative(root, file)}`,
    );
}
if (failures.length) {
  console.error(`FAIL: documentation checks found ${failures.length} issue(s)`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(
  `PASS: ${documents.length} documents, required entries, local links and navigation are consistent`,
);
