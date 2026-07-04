import { create } from 'zustand';

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
    document.documentElement.classList.toggle('dark', next);
    set({ isDark: next });
  },
  init: () => {
    const saved = localStorage.getItem('theme');
    const isDark = saved ? saved === 'dark' : true;
    document.documentElement.classList.toggle('dark', isDark);
    set({ isDark });
  },
}));
