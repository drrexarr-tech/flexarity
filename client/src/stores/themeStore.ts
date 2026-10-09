import { create } from 'zustand';

const DARK = '#0f172a';
const LIGHT = '#ffffff';

/** Keep the browser/OS chrome in step with the app, as PWA install requires. */
function applyTheme(isDark: boolean) {
  document.documentElement.classList.toggle('dark', isDark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', isDark ? DARK : LIGHT);
}

interface ThemeState {
  isDark: boolean;
  toggle: () => void;
  init: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  isDark: true,
  toggle: () => {
    const next = !get().isDark;
    localStorage.setItem('theme', next ? 'dark' : 'light');
    applyTheme(next);
    set({ isDark: next });
  },
  init: () => {
    const saved = localStorage.getItem('theme');
    const isDark = saved ? saved === 'dark' : true;
    applyTheme(isDark);
    set({ isDark });
  },
}));
