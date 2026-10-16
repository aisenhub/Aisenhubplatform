import { describe, expect, it } from 'vitest';

import {
  nextPlatformOptionIndex,
  platformOptionDomId,
} from './platform-switcher-model';

describe('PlatformSwitcher keyboard model', () => {
  it('wraps arrow navigation and supports Home/End', () => {
    expect(nextPlatformOptionIndex(-1, 3, 'ArrowDown')).toBe(0);
    expect(nextPlatformOptionIndex(-1, 3, 'ArrowUp')).toBe(2);
    expect(nextPlatformOptionIndex(2, 3, 'ArrowDown')).toBe(0);
    expect(nextPlatformOptionIndex(0, 3, 'ArrowUp')).toBe(2);
    expect(nextPlatformOptionIndex(1, 3, 'Home')).toBe(0);
    expect(nextPlatformOptionIndex(1, 3, 'End')).toBe(2);
    expect(nextPlatformOptionIndex(0, 0, 'ArrowDown')).toBe(-1);
  });

  it('derives stable aria option ids from platform ids', () => {
    expect(platformOptionDomId('platform-1')).toBe(
      'platform-switcher-option-platform-1',
    );
  });
});
