/**
 * Single source of truth for the auth token.
 *
 * Logging in with "remember me" off stores the token in sessionStorage, but
 * api.ts used to read localStorage only. Every request then went out without an
 * Authorization header, the app believed it was signed in, and each page showed
 * "Требуется авторизация". This accessor is the fix.
 */
export function getToken(): string | null {
  return localStorage.getItem('token') ?? sessionStorage.getItem('token');
}