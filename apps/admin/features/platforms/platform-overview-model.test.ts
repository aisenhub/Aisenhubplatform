import { describe, expect, it } from 'vitest';

import {
  comparisonLabel,
  comparisonTone,
  metricNumber,
  platformOverviewPeriod,
} from './platform-overview-model';

describe('platform overview model', () => {
  it('accepts only the supported overview periods', () => {
    expect(platformOverviewPeriod('7')).toBe(7);
    expect(platformOverviewPeriod('90')).toBe(90);
    expect(platformOverviewPeriod('14')).toBe(30);
    expect(platformOverviewPeriod(null)).toBe(30);
  });

  it('normalizes PostgreSQL bigint values without inventing NaN metrics', () => {
    expect(metricNumber('12')).toBe(12);
    expect(metricNumber(3)).toBe(3);
    expect(metricNumber('invalid')).toBe(0);
  });

  it('describes absolute period deltas', () => {
    expect(comparisonLabel(9, 4)).toBe('较上一周期 +5');
    expect(comparisonLabel(2, 5)).toBe('较上一周期 -3');
    expect(comparisonLabel(4, 4)).toBe('与上一周期持平');
  });

  it('allows attention metrics to treat decreases as improvement', () => {
    expect(comparisonTone(2, 5, true)).toBe('success');
    expect(comparisonTone(6, 5, true)).toBe('warning');
    expect(comparisonTone(6, 5)).toBe('success');
  });
});
