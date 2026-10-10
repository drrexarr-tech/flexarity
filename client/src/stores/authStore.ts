import { create } from 'zustand';
import type { User } from '@/types';
import { getToken, getRefreshToken, setTokens, clearTokens, onSessionLost } from '@/lib/token';
import { api } from '@/lib/api';

/** The store the credentials currently live in, so both stay in step. */
function tokenStore(): Storage {
  return localStorage.getItem('token') ? localStorage : sessionStorage;
}

/**
 * The cached user has to sit in the same store as the tokens. Leaving it behind
 * is what made every reload look like a sign-out: init() needs both, and a
 * half-populated storage is read as no session at all.
 */
function persistUser(user: User, store: Storage): void {
  const other = store === localStorage ? sessionStorage : localStorage;
  store.setItem('user', JSON.stringify(user));
  other.removeItem('user');
}

/** Older sessions stored the string "undefined" instead of null. */
function normalizeUser(user: User): User {
  if (user.telegramId === ('undefined' as unknown)) user.telegramId = null;
  if (user.vkId === ('undefined' as unknown)) user.vkId = null;
  return user;
}

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
  setAuth: (user: User, token: string, refreshToken: string, remember?: boolean) => void;
  setUser: (user: User) => void;
  logout: () => void;
  init: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isInitialized: false,
  setAuth: (user, token, refreshToken, remember = true) => {
    setTokens(token, refreshToken, remember);
    persistUser(user, remember ? localStorage : sessionStorage);
    localStorage.setItem('userId', user.id);
    set({ user, token, isAuthenticated: true, isInitialized: true });
  },
  setUser: (user) => {
    persistUser(user, tokenStore());
    set({ user });
  },
  logout: () => {
    void purgeCaches();
    purgeLocalSecrets();
    clearTokens();
    localStorage.removeItem('user');
    sessionStorage.removeItem('user');
    set({ user: null, token: null, isAuthenticated: false, isInitialized: true });
  },
  init: () => {
    const token = getToken();
    const userStr = localStorage.getItem('user') ?? sessionStorage.getItem('user');

    if (userStr) {
      try {
        const user = normalizeUser(JSON.parse(userStr));
        if (token) {
          set({ user, token, isAuthenticated: true, isInitialized: true });
          return;
        }
      } catch {
        // Unreadable cache is not a reason to throw away a valid token.
        localStorage.removeItem('user');
        sessionStorage.removeItem('user');
      }
    }

    if (!token) {
      set({ isInitialized: true });
      return;
    }

    // A token with no cached user. Every session created before setAuth started
    // persisting the user is in exactly this state, so rebuild the profile from
    // the server instead of treating a valid credential as a signed-out one.
    void api.auth
      .me()
      .then((profile) => {
        const user = normalizeUser(profile as unknown as User);
        persistUser(user, tokenStore());
        set({ user, token, isAuthenticated: true, isInitialized: true });
      })
      .catch(() => {
        // Two very different failures land here. A rejected refresh clears the
        // tokens, and the session really is over. A network blip leaves them
        // in place, and redirecting to the login form then is the exact
        // "refreshed the page and got logged out" bug this path exists to
        // repair. Fall back to the id cached at sign-in so the shell still
        // renders and individual requests can report the outage themselves.
        if (!getToken()) {
          set({ isInitialized: true });
          return;
        }
        const id = localStorage.getItem('userId');
        set({
          user: id ? ({ id, email: '', name: '' } as User) : null,
          token,
          isAuthenticated: Boolean(id),
          isInitialized: true,
        });
      });
  },
}));

// A refresh that fails is a lost session: clear it here rather than letting
// every page render an authenticated shell that fails to load data.
onSessionLost(() => {
  useAuthStore.getState().logout();
});

export { getRefreshToken };