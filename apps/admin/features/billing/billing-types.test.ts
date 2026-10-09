import { describe, expect, it } from 'vitest';

import {
  billingTone,
  formatDate,
  timelineSourceLabel,
  timelineSummary,
  type BillingTimelineEvent,
} from './billing-types';

describe('billing-types utilities', () => {
  it('maps order/settlement statuses to appropriate badge tones', () => {
    expect(billingTone('granted')).toBe('success');
    expect(billingTone('finalized')).toBe('success');
    expect(billingTone('manual_review')).toBe('warning');
    expect(billingTone('review_required')).toBe('warning');
    expect(billingTone('pending')).toBe('info');
    expect(billingTone('retryable')).toBe('info');
    expect(billingTone('rejected')).toBe('danger');
    expect(billingTone('blocked')).toBe('danger');
    expect(billingTone('unknown_status')).toBe('unknown');
    expect(billingTone(null)).toBe('unknown');
  });

  it('translates timeline event sources', () => {
    expect(timelineSourceLabel('billing_order')).toBe('订单');
    expect(timelineSourceLabel('checkout')).toBe('Checkout');
    expect(timelineSourceLabel('provider_webhook')).toBe('Provider Webhook');
    expect(timelineSourceLabel('processing_job')).toBe('后台任务');
    expect(timelineSourceLabel('settlement')).toBe('中央结算');
    expect(timelineSourceLabel('entitlement')).toBe('权益账本');
    expect(timelineSourceLabel('custom_source')).toBe('custom_source');
  });

  it('formats timeline events with lease, reason, attempts and codes', () => {
    const event: BillingTimelineEvent = {
      source: 'processing_job',
      event_type: 'job_lease_acquired',
      event_at: '2026-10-09T10:00:00Z',
      provider_event_at: null,
      received_at: null,
      status: 'active',
      state: 'running',
      code: 'LOCK_OK',
      details: {
        job_health: 'active',
        reason: 'scheduled_pickup',
        attempts: 2,
        max_attempts: 5,
        payload_hash_prefix: 'abcdef12',
      },
    };

    const summary = timelineSummary(event);
    expect(summary).toContain('租约有效');
    expect(summary).toContain('active · running · LOCK_OK');
    expect(summary).toContain('原因：scheduled_pickup');
    expect(summary).toContain('尝试 2/5');
    expect(summary).toContain('Hash：abcdef12…');
  });

  it('gracefully handles missing or empty timeline details', () => {
    const emptyEvent: BillingTimelineEvent = {
      source: 'billing_order',
      event_type: 'order_created',
      event_at: '2026-10-09T10:00:00Z',
      provider_event_at: null,
      received_at: null,
      status: null,
      state: null,
      code: null,
      details: {},
    };

    expect(timelineSummary(emptyEvent)).toBe('—');
  });

  it('formats dates with fallback for null or undefined', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate('2026-10-09T10:00:00Z')).not.toBe('—');
  });
});
