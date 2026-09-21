const DEFAULT_ACCOUNT_API_TIMEOUT_MS = 5_000;
const MAX_ACCOUNT_API_TIMEOUT_MS = 30_000;

export function accountApiTimeoutMs(): number {
  const configured = Number.parseInt(
    process.env.ACCOUNT_API_TIMEOUT_MS ?? '',
    10,
  );
  return Number.isSafeInteger(configured) && configured > 0
    ? Math.min(configured, MAX_ACCOUNT_API_TIMEOUT_MS)
    : DEFAULT_ACCOUNT_API_TIMEOUT_MS;
}

export function accountApiSignal(): AbortSignal {
  return AbortSignal.timeout(accountApiTimeoutMs());
}
