import { create } from 'zustand';
import type { User } from '@/types';
import { getToken } from '@/lib/token';

/** Crypto material must not survive a sign-out on a shared device. */
function purgeLocalSecrets() {
  localStorage.removeItem('userId');
  for (const key of ['flex_private_key', 'flex_pubkey', 'flex_pubkey_sent']) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }
}

/**
 * Drop every cache the service worker owns. Without this a signed-out user's
 * runtime cache survives on the device and the next person to sign in can be
 * served their data while offline.
 */
async function purgeCaches() {
  if (typeof caches === 'undefined') return;
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  } catch {
    // A failed purge must not prevent the local sign-out.
  }
}

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
    void purgeCaches();
    purgeLocalSecrets();
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    set({ user: null, token: null, isAuthenticated: false, isInitialized: true });
  },
  init: () => {
    let token = getToken();
    let userStr = localStorage.getItem('user') ?? sessionStorage.getItem('user');
    if (!token || !userStr) {
      token = getToken();
      userStr = localStorage.getItem('user') ?? sessionStorage.getItem('user');
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
