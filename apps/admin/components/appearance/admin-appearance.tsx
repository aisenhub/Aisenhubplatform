'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  ADMIN_APPEARANCE_STORAGE_KEY,
  defaultAppearancePreference,
  normalizeAppearancePreference,
  resolveAppearanceTheme,
  type AppearanceAccent,
  type AppearanceMode,
  type AppearancePreference,
  type AppearanceSurface,
  type ResolvedAppearanceTheme,
} from './appearance-model';

type AdminAppearanceContextValue = AppearancePreference & {
  resolvedTheme: ResolvedAppearanceTheme;
  settingsOpen: boolean;
  setMode: (mode: AppearanceMode) => void;
  setAccent: (accent: AppearanceAccent) => void;
  setSurface: (surface: AppearanceSurface) => void;
  setSettingsOpen: (open: boolean) => void;
  openSettings: () => void;
};

const AdminAppearanceContext =
  createContext<AdminAppearanceContextValue | null>(null);

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function readInitialPreference(): AppearancePreference {
  if (typeof document === 'undefined') return defaultAppearancePreference;

  const root = document.documentElement;
  return normalizeAppearancePreference({
    mode: root.dataset.themeMode,
    accent: root.dataset.accent,
    surface: root.dataset.surface,
  });
}

function applyAppearance(
  preference: AppearancePreference,
  systemIsDark: boolean,
): ResolvedAppearanceTheme {
  const theme = resolveAppearanceTheme(preference.mode, systemIsDark);
  const root = document.documentElement;

  root.dataset.theme = theme;
  root.dataset.themeMode = preference.mode;
  root.dataset.accent = preference.accent;
  root.dataset.surface = preference.surface;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;

  return theme;
}

export function AdminAppearanceProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<AppearancePreference>(
    readInitialPreference,
  );
  const [resolvedTheme, setResolvedTheme] =
    useState<ResolvedAppearanceTheme>('light');
  const [settingsOpen, setSettingsOpen] = useState(false);

  const updatePreference = useCallback((next: AppearancePreference) => {
    setPreference(next);
    const nextTheme = applyAppearance(next, systemPrefersDark());
    setResolvedTheme(nextTheme);
    try {
      window.localStorage.setItem(
        ADMIN_APPEARANCE_STORAGE_KEY,
        JSON.stringify(next),
      );
    } catch {
      // Appearance remains usable for the current page even when the browser
      // blocks persistent storage. Persistence is a preference, not a gate.
    }
  }, []);

  useEffect(() => {
    const rootPreference = readInitialPreference();
    setPreference(rootPreference);
    setResolvedTheme(applyAppearance(rootPreference, systemPrefersDark()));
  }, []);

  useEffect(() => {
    if (preference.mode !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemThemeChange = (event: MediaQueryListEvent) => {
      setResolvedTheme(applyAppearance(preference, event.matches));
    };
    media.addEventListener('change', onSystemThemeChange);
    return () => media.removeEventListener('change', onSystemThemeChange);
  }, [preference]);

  const value = useMemo<AdminAppearanceContextValue>(
    () => ({
      ...preference,
      resolvedTheme,
      settingsOpen,
      setMode: (mode) => updatePreference({ ...preference, mode }),
      setAccent: (accent) => updatePreference({ ...preference, accent }),
      setSurface: (surface) => updatePreference({ ...preference, surface }),
      setSettingsOpen,
      openSettings: () => setSettingsOpen(true),
    }),
    [preference, resolvedTheme, settingsOpen, updatePreference],
  );

  return (
    <AdminAppearanceContext.Provider value={value}>
      {children}
    </AdminAppearanceContext.Provider>
  );
}

export function useAdminAppearance(): AdminAppearanceContextValue {
  const context = useContext(AdminAppearanceContext);
  if (!context) {
    throw new Error(
      'useAdminAppearance must be used inside AdminAppearanceProvider.',
    );
  }
  return context;
}
