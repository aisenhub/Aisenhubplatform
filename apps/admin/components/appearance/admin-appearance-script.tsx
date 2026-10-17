import {
  ADMIN_APPEARANCE_STORAGE_KEY,
  defaultAppearancePreference,
} from './appearance-model';

const appearanceInitScript = `(() => {
  const root = document.documentElement;
  const fallback = ${JSON.stringify(defaultAppearancePreference)};
  let saved = fallback;
  try {
    const raw = localStorage.getItem(${JSON.stringify(ADMIN_APPEARANCE_STORAGE_KEY)});
    if (raw) {
      const parsed = JSON.parse(raw);
      saved = {
        mode: ['system','light','dark'].includes(parsed?.mode) ? parsed.mode : fallback.mode,
        accent: ['blue','indigo','violet','azure'].includes(parsed?.accent) ? parsed.accent : fallback.accent,
        surface: ['neutral','cool','warm'].includes(parsed?.surface) ? parsed.surface : fallback.surface,
      };
    }
  } catch {}
  const dark = saved.mode === 'dark' || (saved.mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  root.dataset.theme = dark ? 'dark' : 'light';
  root.dataset.themeMode = saved.mode;
  root.dataset.accent = saved.accent;
  root.dataset.surface = saved.surface;
  root.classList.toggle('dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
})();`;

export function AdminAppearanceInitScript() {
  return <script dangerouslySetInnerHTML={{ __html: appearanceInitScript }} />;
}
