export const PLATFORM_OVERVIEW_PERIODS = [7, 30, 90] as const;

export type PlatformOverviewPeriod = (typeof PLATFORM_OVERVIEW_PERIODS)[number];

export type PlatformOverviewMetrics = {
  platform_id: string;
  period_days: number;
  period_start: string;
  period_end: string;
  previous_start: string;
  total_accounts: number | string;
  active_accounts: number | string;
  suspended_accounts: number | string;
  closed_accounts: number | string;
  new_accounts: number | string;
  previous_new_accounts: number | string;
  period_closed_accounts: number | string;
  previous_closed_accounts: number | string;
  net_accounts: number | string;
  previous_net_accounts: number | string;
  active_paid_accounts: number | string;
  orders: number | string;
  previous_orders: number | string;
  granted_orders: number | string;
  previous_granted_orders: number | string;
  attention_orders: number | string;
  previous_attention_orders: number | string;
  pending_config_reviews: number | string;
};

export function platformOverviewPeriod(
  value: string | null,
): PlatformOverviewPeriod {
  const parsed = Number(value);
  return PLATFORM_OVERVIEW_PERIODS.includes(parsed as PlatformOverviewPeriod)
    ? (parsed as PlatformOverviewPeriod)
    : 30;
}

export function metricNumber(
  value: number | string | null | undefined,
): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function comparisonLabel(
  current: number | string,
  previous: number | string,
): string {
  const delta = metricNumber(current) - metricNumber(previous);
  if (delta === 0) return '与上一周期持平';
  return `较上一周期 ${delta > 0 ? '+' : ''}${delta}`;
}

export function comparisonTone(
  current: number | string,
  previous: number | string,
  lowerIsBetter = false,
): 'neutral' | 'success' | 'warning' {
  const delta = metricNumber(current) - metricNumber(previous);
  if (delta === 0) return 'neutral';
  if (lowerIsBetter) return delta < 0 ? 'success' : 'warning';
  return delta > 0 ? 'success' : 'warning';
}
