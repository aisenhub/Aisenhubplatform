export type AccountListFilters = {
  q: string;
  status: string;
  planId: string;
  subscriptionStatus: string;
  tag: string;
  joinedFrom: string;
  joinedTo: string;
  cursor: string;
};

const ACCOUNT_STATUSES = new Set(['active', 'suspended', 'closed']);
const SUBSCRIPTION_STATUSES = new Set(['active', 'suspended', 'none']);

function allowed(value: string | null, values: Set<string>): string {
  return value && values.has(value) ? value : '';
}

export function accountFiltersFromSearchParams(
  params: URLSearchParams,
): AccountListFilters {
  return {
    q: params.get('q') ?? '',
    status: allowed(params.get('status'), ACCOUNT_STATUSES),
    planId: params.get('plan_id') ?? '',
    subscriptionStatus: allowed(
      params.get('subscription_status'),
      SUBSCRIPTION_STATUSES,
    ),
    tag: params.get('tag') ?? '',
    joinedFrom: params.get('joined_from') ?? '',
    joinedTo: params.get('joined_to') ?? '',
    cursor: params.get('cursor') ?? '',
  };
}

export function accountListUrlSearchParams(
  filters: AccountListFilters,
  cursor: string | null = filters.cursor || null,
): URLSearchParams {
  const params = new URLSearchParams();
  const entries: Array<[string, string]> = [
    ['q', filters.q.trim()],
    ['status', filters.status],
    ['plan_id', filters.planId],
    ['subscription_status', filters.subscriptionStatus],
    ['tag', filters.tag.trim()],
    ['joined_from', filters.joinedFrom],
    ['joined_to', filters.joinedTo],
  ];
  for (const [key, value] of entries) if (value) params.set(key, value);
  if (cursor) params.set('cursor', cursor);
  return params;
}

export function accountListApiSearchParams(
  filters: AccountListFilters,
  limit = 20,
): URLSearchParams {
  const params = new URLSearchParams({ limit: String(limit) });
  const entries: Array<[string, string]> = [
    ['q', filters.q.trim()],
    ['status', filters.status],
    ['plan_id', filters.planId],
    ['subscription_status', filters.subscriptionStatus],
    ['tag', filters.tag.trim()],
    [
      'joined_from',
      filters.joinedFrom ? `${filters.joinedFrom}T00:00:00.000Z` : '',
    ],
    ['joined_to', filters.joinedTo ? `${filters.joinedTo}T23:59:59.999Z` : ''],
    ['cursor', filters.cursor],
  ];
  for (const [key, value] of entries) if (value) params.set(key, value);
  return params;
}
