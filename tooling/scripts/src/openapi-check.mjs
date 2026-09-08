import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const accountFile = path.join(root, 'docs/contracts/account.openapi.json');
const adminFile = path.join(root, 'docs/contracts/admin.openapi.json');

function fail(message) {
  throw new Error(message);
}

function readContract(file) {
  const raw = fs.readFileSync(file, 'utf8');
  let document;
  try {
    document = JSON.parse(raw);
  } catch (error) {
    fail(`${file}: invalid JSON (${error.message})`);
  }
  return { raw, document };
}

function resolvePointer(document, pointer) {
  if (!pointer.startsWith('#/'))
    fail(`only local references are allowed: ${pointer}`);
  return pointer
    .slice(2)
    .split('/')
    .reduce((value, segment) => {
      const key = segment.replaceAll('~1', '/').replaceAll('~0', '~');
      if (value === undefined || value === null || !(key in value)) {
        fail(`unresolved reference: ${pointer}`);
      }
      return value[key];
    }, document);
}

function checkReferences(document, value, location = '#') {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      checkReferences(document, item, `${location}/${index}`),
    );
    return;
  }
  if (!value || typeof value !== 'object') return;
  if ('$ref' in value) resolvePointer(document, value.$ref);
  Object.entries(value).forEach(([key, child]) =>
    checkReferences(document, child, `${location}/${key}`),
  );
}

function operations(document) {
  return Object.entries(document.paths).flatMap(([route, item]) =>
    Object.entries(item)
      .filter(([method]) =>
        ['get', 'post', 'put', 'patch', 'delete'].includes(method),
      )
      .map(([method, operation]) => ({ route, method, operation })),
  );
}

function checkOperations(document, name) {
  const ops = operations(document);
  const ids = new Set();
  for (const { route, method, operation } of ops) {
    if (!operation.operationId)
      fail(`${name} ${method.toUpperCase()} ${route}: missing operationId`);
    if (ids.has(operation.operationId))
      fail(`${name}: duplicate operationId ${operation.operationId}`);
    ids.add(operation.operationId);
    if (!Array.isArray(operation.security) || operation.security.length === 0) {
      fail(`${name} ${operation.operationId}: missing security declaration`);
    }
    if (!operation.responses || Object.keys(operation.responses).length === 0) {
      fail(`${name} ${operation.operationId}: missing responses`);
    }
  }
  return ops;
}

const account = readContract(accountFile);
const admin = readContract(adminFile);
if (
  account.document.openapi !== '3.1.0' ||
  admin.document.openapi !== '3.1.0'
) {
  fail('both contracts must use OpenAPI 3.1.0');
}
checkReferences(account.document, account.document);
checkReferences(admin.document, admin.document);

const accountOps = checkOperations(account.document, 'account');
const adminOps = checkOperations(admin.document, 'admin');
if (accountOps.length !== 18)
  fail(
    `account contract must freeze 18 operations, found ${accountOps.length}`,
  );
if (adminOps.length < 25)
  fail(
    `admin contract must freeze the planned resource surface, found ${adminOps.length}`,
  );
if (
  (account.raw.match(/"\/v1\/config-files\/\{fileId\}\/content"/g) ?? [])
    .length !== 1
) {
  fail('account contract must declare the file content path exactly once');
}

const errorCodes = account.document.components.schemas.ApiErrorCode.enum;
for (const code of [
  'INVALID_INPUT',
  'RECENT_MFA_REQUIRED',
  'ENTITLEMENT_PERPETUAL',
  'PRECONDITION_REQUIRED',
  'STORAGE_UNAVAILABLE',
]) {
  if (!errorCodes.includes(code)) fail(`missing stable error code ${code}`);
}
const entitlementExample =
  account.document.components.schemas.Entitlement.examples[0];
if (
  entitlementExample.plan !== null ||
  entitlementExample.started_at !== null ||
  entitlementExample.current_period_end !== null ||
  Object.keys(entitlementExample.features).length !== 0
) {
  fail('none entitlement example must preserve null Free/none semantics');
}
const binaryUpload =
  account.document.components.requestBodies.BinaryUpload.content[
    'application/octet-stream'
  ].schema;
if (binaryUpload.format !== 'binary')
  fail('binary upload must retain application/octet-stream and binary format');
const binaryResponse =
  account.document.components.responses.BinaryFile.content[
    'application/octet-stream'
  ].schema;
if (binaryResponse.format !== 'binary')
  fail('binary download must retain binary response format');
if (account.document.components.headers.NoStore.schema.const !== 'no-store')
  fail('private responses must declare Cache-Control: no-store');

const roundtrip = JSON.parse(
  JSON.stringify({
    data: entitlementExample,
    request_id: '00000000-0000-4000-8000-000000000000',
  }),
);
if (roundtrip.data.plan !== null || roundtrip.data.entitlement_kind !== 'none')
  fail('sample response roundtrip changed entitlement semantics');

console.log(
  `OpenAPI contract check PASS: account=${accountOps.length} operations, admin=${adminOps.length} operations, refs/sample/binary/no-store validated`,
);
