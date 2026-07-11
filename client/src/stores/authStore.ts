import { create } from 'zustand';
import type { User } from '@/types';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isInitialized: boolean;
  setAuth: (user: User, token: string, remember?: boolean) => void;
  setUser: (user: User) => void;
  logout: () => void;
  init: () => void;
}

function getStorage(remember: boolean) {
  return remember ? localStorage : sessionStorage;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isInitialized: false,
  setAuth: (user, token, remember = true) => {
    const storage = getStorage(remember);
    storage.setItem('token', token);
    storage.setItem('user', JSON.stringify(user));
    localStorage.setItem('userId', user.id);
    if (!remember) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
    set({ user, token, isAuthenticated: true, isInitialized: true });
  },
  setUser: (user) => {
    const storage = localStorage.getItem('token') ? localStorage : sessionStorage;
    storage.setItem('user', JSON.stringify(user));
    set({ user });
  },
  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    set({ user: null, token: null, isAuthenticated: false, isInitialized: true });
  },
  init: () => {
    let token = localStorage.getItem('token');
    let userStr = localStorage.getItem('user');
    if (!token || !userStr) {
      token = sessionStorage.getItem('token');
      userStr = sessionStorage.getItem('user');
    }
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        if (user.telegramId === 'undefined' || user.vkId === 'undefined') {
          if (user.telegramId === 'undefined') user.telegramId = null;
          if (user.vkId === 'undefined') user.vkId = null;
        }
        set({ user, token, isAuthenticated: true, isInitialized: true });
        return;
      } catch {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('user');
      }
    }
    set({ isInitialized: true });
  },
}));
