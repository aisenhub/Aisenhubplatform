import { describe, expect, it } from 'vitest';

import {
  auditActionLabel,
  buildAttentionItems,
  countFailureSignals,
  deriveSystemHealth,
  platformStats,
  recentChangedPlatforms,
  type OverviewAuditEntry,
  type OverviewBillingMetrics,
  type OverviewDeletionJob,
  type OverviewPlatform,
} from './admin-overview-model';

const billing = (
  overrides: Partial<OverviewBillingMetrics> = {},
): OverviewBillingMetrics => ({
  pending_count: 0,
  processing_count: 0,
  retryable_count: 0,
  completed_count: 0,
  manual_review_count: 0,
  duplicate_payment_count: 0,
  retry_budget_exhausted_count: 0,
  refund_mismatch_count: 0,
  active_alert_count: 0,
  pending_alert_delivery_count: 0,
  alerts: [],
  ...overrides,
});

const job = (
  state: string,
  id = `00000000-0000-4000-8000-00000000000${state === 'blocked' ? '1' : '2'}`,
): OverviewDeletionJob => ({
  job_id: id,
  request_id: '00000000-0000-4000-8000-000000000010',
  state,
  checkpoint: 'storage_cleanup',
  retry_count: 1,
  last_error_code: state === 'blocked' ? 'STORAGE_UNAVAILABLE' : null,
});

describe('admin overview model', () => {
  it('prioritizes blocked work and billing review as actionable items', () => {
    const items = buildAttentionItems(
      [job('retry'), job('blocked')],
      billing({
        active_alert_count: 2,
        manual_review_count: 3,
        alerts: [
          {
            alert_id: 'critical-alert',
            alert_key: 'processing_lag',
            severity: 'critical',
            status: 'active',
            occurrence_count: 1,
            delivery_status: 'delivered',
            delivery_attempts: 1,
            details: {},
          },
        ],
      }),
    );

    expect(items.map((item) => item.key)).toEqual([
      expect.stringMatching(/^job:/u),
      'billing:active-alerts',
      expect.stringMatching(/^job:/u),
      'billing:manual-review',
    ]);
    expect(items[0]?.severity).toBe('critical');
    expect(items[1]?.severity).toBe('critical');
    expect(
      items.find((item) => item.key === 'billing:manual-review')?.href,
    ).toBe('/admin/billing?status=manual_review');
  });

  it('does not report healthy when a source is missing or attention exists', () => {
    expect(
      deriveSystemHealth(['success', 'error', 'success', 'success'], 0),
    ).toEqual({
      label: '数据不完整',
      description: '1 个管理面数据源暂不可用',
      tone: 'danger',
    });
    expect(
      deriveSystemHealth(['success', 'success', 'success', 'success'], 2).label,
    ).toBe('需关注');
    expect(
      deriveSystemHealth(['success', 'success', 'success', 'success'], 0).label,
    ).toBe('正常');
  });

  it('derives platform counts and recent changed platforms without inventing history', () => {
    const platforms: OverviewPlatform[] = [
      {
        platform_id: 'p-1',
        code: 'alpha',
        name: 'Alpha',
        status: 'active',
        allow_activation: true,
      },
      {
        platform_id: 'p-2',
        code: 'beta',
        name: 'Beta',
        status: 'active',
        allow_activation: false,
      },
      {
        platform_id: 'p-3',
        code: 'legacy',
        name: 'Legacy',
        status: 'disabled',
        allow_activation: false,
      },
    ];
    const audit: OverviewAuditEntry[] = [
      { target_type: 'platform', target_id: 'p-2' },
      { target_type: 'platform', target_id: 'p-2' },
      { target_type: 'deletion_job', target_id: 'j-1' },
      { target_type: 'platform', target_id: 'p-1' },
    ];

    expect(platformStats(platforms)).toEqual({
      total: 3,
      active: 2,
      disabled: 1,
      activationPaused: 1,
    });
    expect(
      recentChangedPlatforms(audit, platforms).map(
        (platform) => platform.platform_id,
      ),
    ).toEqual(['p-2', 'p-1']);
  });

  it('keeps current technical event names readable while preserving unknown actions', () => {
    expect(auditActionLabel('platform.updated')).toBe('更新平台设置');
    expect(auditActionLabel('custom.event')).toBe('custom.event');
    expect(auditActionLabel(null)).toBe('未命名操作');
  });

  it('counts only current failure signals instead of all in-flight work', () => {
    expect(
      countFailureSignals(
        [job('blocked'), job('retry')],
        billing({ retry_budget_exhausted_count: 2, refund_mismatch_count: 1 }),
      ),
    ).toBe(4);
  });
});
