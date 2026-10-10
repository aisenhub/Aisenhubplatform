import { describe, expect, it } from 'vitest';

import {
  accountContractSummary,
  adminContractSummary,
  summarizeContract,
} from './contract-summary';

describe('consumer lab contract summaries', () => {
  it('reads the current canonical Account contract', () => {
    expect(accountContractSummary.major).toBe('v1');
    expect(accountContractSummary.version).toBe('1.0.1');
    expect(accountContractSummary.operations).toHaveLength(22);
    expect(accountContractSummary.operations).toContainEqual(
      expect.objectContaining({
        method: 'GET',
        path: '/v1/account/principal',
        operationId: 'getPrincipal',
      }),
    );
  });

  it('reads the current canonical Admin contract', () => {
    expect(adminContractSummary.major).toBe('v1');
    expect(adminContractSummary.version).toBe('1.0.0');
    expect(adminContractSummary.operations).toHaveLength(47);
    expect(adminContractSummary.operations).toContainEqual(
      expect.objectContaining({
        method: 'GET',
        path: '/admin/api/v1/accounts/{userId}',
        operationId: 'adminGetIdentity',
      }),
    );
  });

  it('derives operation and security names without a handwritten route table', () => {
    expect(
      summarizeContract(
        {
          info: { title: 'Fixture', version: '1.2.3' },
          paths: {
            '/v1/example': {
              get: {
                operationId: 'fixtureGet',
                security: [{ platformKey: [], bearerAuth: [] }],
              },
            },
          },
          components: { securitySchemes: { platformKey: {}, bearerAuth: {} } },
        },
        'v1',
      ),
    ).toEqual({
      title: 'Fixture',
      major: 'v1',
      version: '1.2.3',
      securitySchemes: ['bearerAuth', 'platformKey'],
      operations: [
        {
          method: 'GET',
          path: '/v1/example',
          operationId: 'fixtureGet',
          security: ['bearerAuth', 'platformKey'],
        },
      ],
    });
  });
});
