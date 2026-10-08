import type { EntitlementDto } from './account-contract';

export type ProtectedFeatureAuthorization =
  | { readonly ok: true; readonly entitlement: EntitlementDto }
  | {
      readonly ok: false;
      readonly code:
        | 'ACCOUNT_SUSPENDED'
        | 'ENTITLEMENT_REQUIRED'
        | 'AUTHORIZATION_UNAVAILABLE';
      readonly requestId: string | null;
    };

function requestIdFromError(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const value = (error as { readonly requestId?: unknown }).requestId;
  return typeof value === 'string' ? value : null;
}

export async function authorizeProtectedFeature(input: {
  readonly getSubscription: () => Promise<EntitlementDto>;
  readonly feature?: string;
}): Promise<ProtectedFeatureAuthorization> {
  try {
    const entitlement = await input.getSubscription();
    if (entitlement.effective_status !== 'active') {
      return {
        ok: false,
        code:
          entitlement.effective_status === 'suspended'
            ? 'ACCOUNT_SUSPENDED'
            : 'ENTITLEMENT_REQUIRED',
        requestId: null,
      };
    }
    if (input.feature && entitlement.features[input.feature] !== true) {
      return { ok: false, code: 'ENTITLEMENT_REQUIRED', requestId: null };
    }
    return { ok: true, entitlement };
  } catch (error) {
    return {
      ok: false,
      code: 'AUTHORIZATION_UNAVAILABLE',
      requestId: requestIdFromError(error),
    };
  }
}
