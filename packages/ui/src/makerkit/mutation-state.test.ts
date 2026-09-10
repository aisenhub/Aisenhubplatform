import { describe, expect, it } from 'vitest';

import { mutationStateLabel } from './mutation-state';

describe('mutationStateLabel', () => {
  it('keeps accepted and unknown outcomes distinct from success', () => {
    expect(mutationStateLabel('accepted')).toBe('已受理');
    expect(mutationStateLabel('unknown_outcome')).toBe('结果待确认');
    expect(mutationStateLabel('success')).toBe('已完成');
  });
});
