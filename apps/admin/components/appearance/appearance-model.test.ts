import { describe, expect, it } from 'vitest';

import {
  defaultAppearancePreference,
  normalizeAppearancePreference,
  resolveAppearanceTheme,
} from './appearance-model';

describe('appearance model', () => {
  it('normalizes persisted preferences without accepting unknown values', () => {
    expect(
      normalizeAppearancePreference({
        mode: 'dark',
        accent: 'violet',
        surface: 'warm',
      }),
    ).toEqual({ mode: 'dark', accent: 'violet', surface: 'warm' });

    expect(
      normalizeAppearancePreference({
        mode: 'sepia',
        accent: 'green',
        surface: 'glass',
      }),
    ).toEqual(defaultAppearancePreference);
  });

  it('resolves system mode without changing explicit modes', () => {
    expect(resolveAppearanceTheme('system', true)).toBe('dark');
    expect(resolveAppearanceTheme('system', false)).toBe('light');
    expect(resolveAppearanceTheme('light', true)).toBe('light');
    expect(resolveAppearanceTheme('dark', false)).toBe('dark');
  });
});
