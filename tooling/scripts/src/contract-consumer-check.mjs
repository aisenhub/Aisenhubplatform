import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const manifestPath = path.join(root, 'docs/reference/contract-consumers.json');

function fail(message) {
  throw new Error(`Consumer compatibility check failed: ${message}`);
}

function readJson(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) fail(`missing file ${relativePath}`);
  try {
    return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  } catch (error) {
    fail(`invalid JSON ${relativePath}: ${error.message}`);
  }
}

function readText(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) fail(`missing file ${relativePath}`);
  return fs.readFileSync(absolutePath, 'utf8');
}

function resolvePointer(document, pointer) {
  if (!pointer.startsWith('#/')) fail(`unsupported pointer ${pointer}`);
  return pointer
    .slice(2)
    .split('/')
    .reduce((value, segment) => {
      const key = segment.replaceAll('~1', '/').replaceAll('~0', '~');
      if (!value || typeof value !== 'object' || !(key in value))
        fail(`unresolved pointer ${pointer}`);
      return value[key];
    }, document);
}

function assertTextRef(reference, role) {
  const text = readText(reference.path);
  if (!text.includes(reference.contains))
    fail(`${role} ${reference.path} is missing ${reference.contains}`);
}

function assertSchemaField(schema, field, role) {
  const rootField = field.split('.')[0];
  if (!schema?.properties?.[rootField])
    fail(`${role} schema is missing field ${field}`);
}

const manifest = readJson('docs/reference/contract-consumers.json');
if (manifest.schema_version !== '1.0.0')
  fail(`unsupported manifest version ${manifest.schema_version}`);
if (!Array.isArray(manifest.contracts) || manifest.contracts.length === 0)
  fail('manifest must contain contracts');

const contractIds = new Set();
for (const contract of manifest.contracts) {
  if (!contract.id || contractIds.has(contract.id))
    fail(`duplicate or empty contract id ${contract.id}`);
  contractIds.add(contract.id);

  assertTextRef(contract.producer, `${contract.id} producer`);
  assertTextRef(contract.edge, `${contract.id} edge`);

  const openapi = readJson(contract.openapi.path);
  const schema = resolvePointer(openapi, contract.openapi.pointer);
  const consumers = Array.isArray(contract.consumers) ? contract.consumers : [];
  const consumerIds = new Set();
  for (const consumer of consumers) {
    if (!consumer.id || consumerIds.has(consumer.id))
      fail(`${contract.id} has duplicate or empty consumer id ${consumer.id}`);
    consumerIds.add(consumer.id);
    assertTextRef(consumer, `${contract.id} consumer ${consumer.id}`);
  }
  if (consumerIds.size === 0) fail(`${contract.id} has no consumers`);

  const tests = Array.isArray(contract.test_owners) ? contract.test_owners : [];
  const testIds = new Set();
  for (const test of tests) {
    if (!test.id || testIds.has(test.id))
      fail(`${contract.id} has duplicate or empty test id ${test.id}`);
    testIds.add(test.id);
    assertTextRef(test, `${contract.id} test ${test.id}`);
  }
  if (testIds.size === 0) fail(`${contract.id} has no test owners`);

  const fields = Array.isArray(contract.fields) ? contract.fields : [];
  const fieldNames = new Set();
  for (const field of fields) {
    if (!field.name || fieldNames.has(field.name))
      fail(`${contract.id} has duplicate or empty field ${field.name}`);
    fieldNames.add(field.name);
    assertSchemaField(schema, field.name, contract.id);
    if (!Array.isArray(field.consumers) || field.consumers.length === 0)
      fail(`${contract.id}.${field.name} has no consumers`);
    for (const consumerId of field.consumers) {
      if (!consumerIds.has(consumerId))
        fail(
          `${contract.id}.${field.name} references unknown consumer ${consumerId}`,
        );
    }
    if (!Array.isArray(field.tests) || field.tests.length === 0)
      fail(`${contract.id}.${field.name} has no test owner`);
    for (const testId of field.tests) {
      if (!testIds.has(testId))
        fail(`${contract.id}.${field.name} references unknown test ${testId}`);
    }
  }
  if (fieldNames.size === 0) fail(`${contract.id} has no fields`);
}

console.log(
  `Consumer compatibility check PASS: ${manifest.contracts.length} contracts, ${manifest.contracts.reduce((total, contract) => total + contract.fields.length, 0)} fields, producers/consumers/tests/OpenAPI schemas validated`,
);
