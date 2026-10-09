/**
 * Single source of truth for the auth credentials.
 *
 * Logging in with "remember me" off stores them in sessionStorage, but api.ts
 * used to read localStorage only. Every request then went out without an
 * Authorization header, the app believed it was signed in, and each page showed
 * "Требуется авторизация".
 *
 * Access tokens now live 15 minutes, so a refresh token is issued alongside them
 * and swapped in transparently when a request comes back 401. "Remember me"
 * decides the storage for both, or neither would survive a reload.
 */

const ACCESS_KEY = 'token';
const REFRESH_KEY = 'refreshToken';

function stores(): Storage[] {
  return [localStorage, sessionStorage];
}

export function getToken(): string | null {
  for (const store of stores()) {
    const value = store.getItem(ACCESS_KEY);
    if (value) return value;
  }
  return null;
}

export function getRefreshToken(): string | null {
  for (const store of stores()) {
    const value = store.getItem(REFRESH_KEY);
    if (value) return value;
  }
  return null;
}

/** Writes to the requested store and clears the other, mirroring the login flow. */
export function setTokens(access: string, refresh: string, remember: boolean): void {
  const [local, session] = stores();
  const target = remember ? local : session;
  const other = remember ? session : local;

  target.setItem(ACCESS_KEY, access);
  target.setItem(REFRESH_KEY, refresh);
  other.removeItem(ACCESS_KEY);
  other.removeItem(REFRESH_KEY);
}

export function setAccessToken(access: string): void {
  for (const store of stores()) {
    if (store.getItem(ACCESS_KEY)) {
      store.setItem(ACCESS_KEY, access);
      return;
    }
  }
}

export function clearTokens(): void {
  for (const store of stores()) {
    store.removeItem(ACCESS_KEY);
    store.removeItem(REFRESH_KEY);
  }
}

/** Called when a refresh fails, so the app falls back to the login screen. */
export function onSessionLost(listener: () => void): void {
  sessionLost = listener;
}

let sessionLost: (() => void) | null = null;

export function notifySessionLost(): void {
  clearTokens();
  sessionLost?.();
}