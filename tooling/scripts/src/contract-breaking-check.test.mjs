import assert from 'node:assert/strict';
import test from 'node:test';

import { compareContractDocuments } from './contract-breaking-lib.mjs';

function baseDocument() {
  return {
    openapi: '3.1.0',
    paths: {
      '/v1/items': {
        post: {
          operationId: 'createItem',
          security: [{ platformKey: [], bearerAuth: [] }],
          parameters: [
            {
              name: 'Idempotency-Key',
              in: 'header',
              required: true,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { name: { type: 'string' } },
                },
              },
            },
          },
          responses: {
            200: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['status'],
                    properties: {
                      status: { type: 'string', enum: ['ready', 'paused'] },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    components: { schemas: {} },
  };
}

const clone = (value) => structuredClone(value);

test('rejects a new required request body field', () => {
  const before = baseDocument();
  const after = clone(before);
  const schema =
    after.paths['/v1/items'].post.requestBody.content['application/json']
      .schema;
  schema.properties.tenant = { type: 'string' };
  schema.required = ['tenant'];
  assert.match(
    compareContractDocuments('account', before, after).join('\n'),
    /required request field/u,
  );
});

test('rejects removed parameters', () => {
  const before = baseDocument();
  const after = clone(before);
  after.paths['/v1/items'].post.parameters = [];
  assert.match(
    compareContractDocuments('account', before, after).join('\n'),
    /removed parameter/u,
  );
});

test('rejects removed response properties and enum values', () => {
  const before = baseDocument();
  const after = clone(before);
  const schema =
    after.paths['/v1/items'].post.responses[200].content['application/json']
      .schema;
  schema.properties.status.enum = ['ready'];
  assert.match(
    compareContractDocuments('account', before, after).join('\n'),
    /removed enum value/u,
  );

  const removed = clone(before);
  delete removed.paths['/v1/items'].post.responses[200].content[
    'application/json'
  ].schema.properties.status;
  assert.match(
    compareContractDocuments('account', before, removed).join('\n'),
    /removed property/u,
  );
});

test('rejects security changes', () => {
  const before = baseDocument();
  const after = clone(before);
  after.paths['/v1/items'].post.security = [{ bearerAuth: [] }];
  assert.match(
    compareContractDocuments('account', before, after).join('\n'),
    /changed security/u,
  );
});

test('allows additive endpoints and optional response fields', () => {
  const before = baseDocument();
  const after = clone(before);
  after.paths['/v1/extra'] = {
    get: {
      operationId: 'extra',
      security: [{ platformKey: [] }],
      responses: { 200: { description: 'ok' } },
    },
  };
  after.paths['/v1/items'].post.responses[200].content[
    'application/json'
  ].schema.properties.detail = {
    type: 'string',
  };
  assert.deepEqual(compareContractDocuments('account', before, after), []);
});

test('resolves response content entries that directly reference schemas', () => {
  const before = baseDocument();
  before.components.schemas.Envelope = {
    type: 'object',
    required: ['data'],
    properties: { data: { type: 'string' } },
  };
  before.paths['/v1/items'].post.responses[200].content['application/json'] = {
    $ref: '#/components/schemas/Envelope',
  };
  const after = clone(before);
  assert.deepEqual(compareContractDocuments('account', before, after), []);
});
