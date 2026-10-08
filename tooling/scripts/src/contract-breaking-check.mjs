import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const baseRef = process.argv[2] ?? process.env.CONTRACT_BASE_REF ?? 'origin/main';
const contracts = [
  {
    name: 'account',
    current: 'contracts/account/v1/openapi.json',
    legacy: 'docs/reference/contracts/account.openapi.json',
  },
  {
    name: 'admin',
    current: 'contracts/admin/v1/openapi.json',
    legacy: 'docs/reference/contracts/admin.openapi.json',
  },
];
const methods = new Set(['get', 'post', 'put', 'patch', 'delete']);
const failures = [];

function parseJson(raw, source) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${source}: invalid JSON (${error.message})`);
  }
}

function readCurrent(relative) {
  return parseJson(fs.readFileSync(path.join(root, relative), 'utf8'), relative);
}

function readBase(entry) {
  for (const candidate of [entry.current, entry.legacy]) {
    try {
      const raw = execFileSync('git', ['show', `${baseRef}:${candidate}`], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      return { document: parseJson(raw, `${baseRef}:${candidate}`), path: candidate };
    } catch {
      // The canonical path changed in this migration; try the previous location.
    }
  }
  throw new Error(`${entry.name}: no contract found at ${baseRef}`);
}

function sameJson(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function typeSignature(schema) {
  if (!schema || typeof schema !== 'object') return null;
  if ('$ref' in schema) return `$ref:${schema.$ref}`;
  return JSON.stringify({
    type: schema.type ?? null,
    format: schema.format ?? null,
    nullable: schema.nullable ?? null,
  });
}

function compareSchema(name, before, after, location) {
  if (!after) {
    failures.push(`${name}: removed schema ${location}`);
    return;
  }
  const beforeSignature = typeSignature(before);
  const afterSignature = typeSignature(after);
  if (beforeSignature !== afterSignature)
    failures.push(`${name}: changed type/reference at ${location}`);

  if (Array.isArray(before?.enum)) {
    const next = new Set(Array.isArray(after?.enum) ? after.enum : []);
    for (const value of before.enum) {
      if (!next.has(value)) failures.push(`${name}: removed enum value ${location}=${JSON.stringify(value)}`);
    }
  }

  const beforeRequired = new Set(Array.isArray(before?.required) ? before.required : []);
  const afterRequired = new Set(Array.isArray(after?.required) ? after.required : []);
  for (const field of afterRequired) {
    if (!beforeRequired.has(field) && before?.properties?.[field])
      failures.push(`${name}: made existing field required at ${location}.${field}`);
  }

  const beforeProperties = before?.properties ?? {};
  const afterProperties = after?.properties ?? {};
  for (const [field, schema] of Object.entries(beforeProperties)) {
    if (!(field in afterProperties)) {
      failures.push(`${name}: removed property ${location}.${field}`);
      continue;
    }
    compareSchema(name, schema, afterProperties[field], `${location}.${field}`);
  }

  if (before?.items && after?.items)
    compareSchema(name, before.items, after.items, `${location}[]`);
}

function compareOperation(name, route, method, before, after) {
  if (!after) {
    failures.push(`${name}: removed operation ${method.toUpperCase()} ${route}`);
    return;
  }
  if (before.operationId !== after.operationId)
    failures.push(`${name}: changed operationId for ${method.toUpperCase()} ${route}`);
  if (!sameJson(before.security, after.security))
    failures.push(`${name}: changed security for ${method.toUpperCase()} ${route}`);

  const beforeParameters = new Map(
    (before.parameters ?? []).map((item) => [`${item.in}:${item.name}`, item]),
  );
  const afterParameters = new Map(
    (after.parameters ?? []).map((item) => [`${item.in}:${item.name}`, item]),
  );
  for (const [key, parameter] of afterParameters) {
    const previous = beforeParameters.get(key);
    if (!previous && parameter.required)
      failures.push(`${name}: added required parameter ${key} to ${method.toUpperCase()} ${route}`);
    if (previous && !previous.required && parameter.required)
      failures.push(`${name}: made parameter required ${key} on ${method.toUpperCase()} ${route}`);
    if (previous && typeSignature(previous.schema) !== typeSignature(parameter.schema))
      failures.push(`${name}: changed parameter schema ${key} on ${method.toUpperCase()} ${route}`);
  }

  if (before.requestBody && after.requestBody && !before.requestBody.required && after.requestBody.required)
    failures.push(`${name}: made request body required on ${method.toUpperCase()} ${route}`);

  for (const status of Object.keys(before.responses ?? {})) {
    if (!(status in (after.responses ?? {})))
      failures.push(`${name}: removed response ${status} from ${method.toUpperCase()} ${route}`);
  }
}

function compareContract(entry) {
  const beforeSource = readBase(entry);
  const before = beforeSource.document;
  const after = readCurrent(entry.current);
  if (before.openapi !== after.openapi)
    failures.push(`${entry.name}: changed OpenAPI dialect ${before.openapi} -> ${after.openapi}`);

  for (const [route, pathItem] of Object.entries(before.paths ?? {})) {
    const afterPathItem = after.paths?.[route];
    if (!afterPathItem) {
      failures.push(`${entry.name}: removed path ${route}`);
      continue;
    }
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!methods.has(method)) continue;
      compareOperation(entry.name, route, method, operation, afterPathItem[method]);
    }
  }

  const beforeSchemas = before.components?.schemas ?? {};
  const afterSchemas = after.components?.schemas ?? {};
  for (const [schemaName, schema] of Object.entries(beforeSchemas))
    compareSchema(entry.name, schema, afterSchemas[schemaName], `#/components/schemas/${schemaName}`);

  return beforeSource.path;
}

const sources = contracts.map((entry) => `${entry.name}:${compareContract(entry)}`);
if (failures.length) {
  console.error(`Contract breaking check FAIL against ${baseRef}: ${failures.length} issue(s)`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`Contract breaking check PASS against ${baseRef} (${sources.join(', ')})`);
