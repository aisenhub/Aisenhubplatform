import { describe, expect, it } from 'vitest';

import {
  accountFiltersFromSearchParams,
  accountListApiSearchParams,
  accountListUrlSearchParams,
} from './account-workbench-model';

describe('account workbench list model', () => {
  it('reads only supported enum filters from URL state', () => {
    const filters = accountFiltersFromSearchParams(
      new URLSearchParams(
        'q=alice&status=active&subscription_status=unknown&tag=vip&joined_from=2026-10-01&joined_to=2026-10-12&cursor=account-2',
      ),
    );
    expect(filters).toEqual({
      q: 'alice',
      status: 'active',
      planId: '',
      subscriptionStatus: '',
      tag: 'vip',
      joinedFrom: '2026-10-01',
      joinedTo: '2026-10-12',
      cursor: 'account-2',
    });
  });

  it('keeps list URL state readable while translating dates for the API', () => {
    const filters = {
      q: ' Pro ',
      status: 'suspended',
      planId: '00000000-0000-4000-8000-000000000001',
      subscriptionStatus: 'active',
      tag: ' vip ',
      joinedFrom: '2026-10-01',
      joinedTo: '2026-10-12',
      cursor: '00000000-0000-4000-8000-000000000002',
    };
    expect(accountListUrlSearchParams(filters).toString()).toBe(
      'q=Pro&status=suspended&plan_id=00000000-0000-4000-8000-000000000001&subscription_status=active&tag=vip&joined_from=2026-10-01&joined_to=2026-10-12&cursor=00000000-0000-4000-8000-000000000002',
    );
    expect(accountListApiSearchParams(filters).toString()).toBe(
      'limit=20&q=Pro&status=suspended&plan_id=00000000-0000-4000-8000-000000000001&subscription_status=active&tag=vip&joined_from=2026-10-01T00%3A00%3A00.000Z&joined_to=2026-10-12T23%3A59%3A59.999Z&cursor=00000000-0000-4000-8000-000000000002',
    );
  });

  it('drops cursor when a new filter submission starts from the first page', () => {
    const filters = accountFiltersFromSearchParams(
      new URLSearchParams('q=alice&cursor=account-2'),
    );
    expect(accountListUrlSearchParams(filters, null).toString()).toBe(
      'q=alice',
    );
  });
});
