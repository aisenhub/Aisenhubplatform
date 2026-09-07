import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../',
);
const docsRoot = path.join(root, 'docs');
const requiredFiles = [
  'architecture.md',
  'development/contracts.md',
  'development/status.md',
  'development/tasks/batch-01.md',
  'development/evidence/README.md',
];
const failures = [];

for (const relative of requiredFiles) {
  if (!existsSync(path.join(docsRoot, relative))) {
    failures.push(`missing required document: docs/${relative}`);
  }
}

function markdownFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(absolute);
    return entry.isFile() && entry.name.endsWith('.md') ? [absolute] : [];
  });
}

const files = markdownFiles(docsRoot);
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1].trim().split('#', 1)[0];
    if (!target || /^(?:https?:|mailto:|#)/i.test(target)) continue;
    const resolved = path.resolve(path.dirname(file), target);
    if (!existsSync(resolved))
      failures.push(`${path.relative(root, file)} -> ${target}`);
  }
}

const batchPath = path.join(docsRoot, 'development/tasks/batch-01.md');
const batch = readFileSync(batchPath, 'utf8');
const taskHeadings = [...batch.matchAll(/^## (T\d+)\b/gm)].map(
  (match) => match[1],
);
const taskSet = new Set(taskHeadings);
const dependencies = new Map();
for (const match of batch.matchAll(
  /^## (T\d+)\b([\s\S]*?)(?=^## T\d+\b|(?![\s\S]))/gm,
)) {
  const task = match[1];
  const dependencyLine = match[2].match(/^- 依赖：([^\r\n]+)/m)?.[1] ?? '无';
  const deps =
    dependencyLine === '无'
      ? []
      : [...dependencyLine.matchAll(/T\d+/g)].map((item) => item[0]);
  dependencies.set(task, deps);
  for (const dependency of deps) {
    if (!taskSet.has(dependency))
      failures.push(`${task} references unknown dependency ${dependency}`);
  }
}

const visiting = new Set();
const visited = new Set();
function visit(task, chain = []) {
  if (visiting.has(task))
    failures.push(`task dependency cycle: ${[...chain, task].join(' -> ')}`);
  if (visited.has(task)) return;
  visiting.add(task);
  for (const dependency of dependencies.get(task) ?? [])
    visit(dependency, [...chain, task]);
  visiting.delete(task);
  visited.add(task);
}
for (const task of taskSet) visit(task);

const verification = readFileSync(
  path.join(docsRoot, 'development/verification-plan.md'),
  'utf8',
);
const knownIds = new Set(
  [
    ...verification.matchAll(/\b(?:SP|V)-[A-Z0-9-]+\b/g),
    ...verification.matchAll(/\bG\d+-[A-Z]\b/g),
  ].map((match) => match[0]),
);
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(
    /\b(?:SP|V)-[A-Z0-9-]+\b|\bG\d+-[A-Z]\b/g,
  )) {
    if (!knownIds.has(match[0]))
      failures.push(
        `${path.relative(root, file)} references unknown verification ID ${match[0]}`,
      );
  }
}

if (failures.length) {
  console.error(`FAIL: documentation checks found ${failures.length} issue(s)`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `PASS: docs links, ${taskSet.size} task dependency graph, and verification IDs are consistent`,
);
