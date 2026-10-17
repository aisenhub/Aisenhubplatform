export const ADMIN_APPEARANCE_STORAGE_KEY = 'aisenhub-admin-appearance-v1';

export const appearanceModes = ['system', 'light', 'dark'] as const;
export const appearanceAccents = ['blue', 'indigo', 'violet', 'azure'] as const;
export const appearanceSurfaces = ['neutral', 'cool', 'warm'] as const;

export type AppearanceMode = (typeof appearanceModes)[number];
export type AppearanceAccent = (typeof appearanceAccents)[number];
export type AppearanceSurface = (typeof appearanceSurfaces)[number];
export type ResolvedAppearanceTheme = 'light' | 'dark';

export type AppearancePreference = {
  mode: AppearanceMode;
  accent: AppearanceAccent;
  surface: AppearanceSurface;
};

export const defaultAppearancePreference: AppearancePreference = {
  mode: 'system',
  accent: 'blue',
  surface: 'neutral',
};

function isOneOf<T extends readonly string[]>(
  value: unknown,
  allowed: T,
): value is T[number] {
  return typeof value === 'string' && allowed.includes(value);
}

export function normalizeAppearancePreference(
  value: unknown,
): AppearancePreference {
  if (!value || typeof value !== 'object') return defaultAppearancePreference;

  const candidate = value as Record<string, unknown>;
  return {
    mode: isOneOf(candidate.mode, appearanceModes)
      ? candidate.mode
      : defaultAppearancePreference.mode,
    accent: isOneOf(candidate.accent, appearanceAccents)
      ? candidate.accent
      : defaultAppearancePreference.accent,
    surface: isOneOf(candidate.surface, appearanceSurfaces)
      ? candidate.surface
      : defaultAppearancePreference.surface,
  };
}

export function resolveAppearanceTheme(
  mode: AppearanceMode,
  systemIsDark: boolean,
): ResolvedAppearanceTheme {
  if (mode === 'system') return systemIsDark ? 'dark' : 'light';
  return mode;
}
