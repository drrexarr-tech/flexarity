import type { Plan, PlanEntry, Wishlist, WishItem, CalendarEvent, CalendarMonth, UpcomingItem, ShoppingItem } from '@/types';
import { getToken, getRefreshToken, setAccessToken, setTokens, notifySessionLost } from './token';

const API_URL = '/api';

const REFRESH_PATHS = ['/auth/refresh', '/auth/login', '/auth/register', '/auth/oauth', '/auth/login/2fa'];

/**
 * Swapping the access token is shared by every caller. Without the promise the
 * six simultaneous requests a page load fires would each burn the same
 * single-use refresh token, and all but the first would be rejected.
 */
let refreshInFlight: Promise<RefreshOutcome> | null = null;

/**
 * 'refreshed' - new credentials stored.
 * 'rejected'  - the server said no; the session is genuinely gone.
 * 'unavailable' - the server could not be asked. A deploy restarts the API
 *   container, and a flaky connection looks the same from here. Both used to be
 *   treated as a dead session, which signed people out on every reload that
 *   happened to land during a deploy.
 */
type RefreshOutcome = 'refreshed' | 'rejected' | 'unavailable';

async function refreshAccessToken(): Promise<RefreshOutcome> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return 'rejected';

  // A deploy or a brief outage is common enough to be worth one short retry.
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      await new Promise((r) => setTimeout(r, 600));
      continue;
    }

    // 5xx means the server is restarting or broken, not that the token is bad.
    if (res.status >= 500) {
      await new Promise((r) => setTimeout(r, 600));
      continue;
    }
    if (!res.ok) return 'rejected';

    const data = await res.json();
    const remember = !!localStorage.getItem('token');
    setTokens(data.token, data.refreshToken, remember);
    return 'refreshed';
  }

  return 'unavailable';
}

  /** fetch rejects with an English TypeError when the network is down. */
  function networkError() {
    return new Error(
      typeof navigator !== 'undefined' && navigator.onLine === false
        ? 'Нет подключения к сети'
        : 'Сервер недоступен, попробуйте позже'
    );
  }

  async function request<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res: Response;
  const method = (options.method || 'GET').toUpperCase();
  const isRead = method === 'GET' || method === 'HEAD';

  try {
    res = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    // A pooled connection the server has already closed fails this way, and so
    // does a phone losing signal for a moment - both are ordinary on mobile
    // data, and both look identical to the user: the list came back empty.
    // Worth one more try for a read.
    if (isRead && retry) {
      await new Promise((r) => setTimeout(r, 250));
      try {
        res = await fetch(`${API_URL}${path}`, { ...options, headers });
      } catch {
        throw networkError();
      }
    } else if (method === 'DELETE' && retry) {
      // This one needs more care, because the outcome is genuinely unknown: the
      // server may have deleted the row and lost the reply on the way back. A
      // second DELETE settles it either way - it either removes it, or answers
      // 404 because the first one already did. Without this the row is deleted
      // and the user is shown a red toast.
      await new Promise((r) => setTimeout(r, 250));
      try {
        res = await fetch(`${API_URL}${path}`, { ...options, headers });
      } catch {
        throw networkError();
      }
      if (res.status === 404) {
        return { message: 'Уже удалено' } as T;
      }
    } else {
      throw networkError();
    }
  }

  // The proxy can answer before the API has finished starting, or while it is
  // being replaced during a deploy. Both are brief and both are worth a second
  // try for a read, rather than an empty list and a toast.
  if (res.status === 502 || res.status === 503 || res.status === 504) {
    if (isRead && retry) {
      await new Promise((r) => setTimeout(r, 400));
      return request<T>(path, options, false);
    }
  }

  // The access token lives 15 minutes, so an expired one is expected rather
  // than exceptional: redeem the refresh token once and replay the request.
  // This also runs for a tab still holding a bundle from before the refresh
  // flow existed, which otherwise surfaced the server's raw "Недействительный
  // токен" instead of returning the user to the login screen.
  if (res.status === 401 && !REFRESH_PATHS.some((p) => path.startsWith(p))) {
    if (retry) {
      refreshInFlight = refreshInFlight ?? refreshAccessToken();
      const outcome = await refreshInFlight.finally(() => { refreshInFlight = null; });
      if (outcome === 'refreshed') return request<T>(path, options, false);
      // The server could not answer. Keep the session: it is still valid, and
      // signing the user out here is how a reload during a deploy turned into a
      // login prompt.
      if (outcome === 'unavailable') {
        throw new Error(
          typeof navigator !== 'undefined' && navigator.onLine === false
            ? 'Нет подключения к интернету'
            : 'Сервер недоступен, попробуйте позже'
        );
      }
    }
    notifySessionLost();
    throw new Error('Сессия истекла, войдите заново');
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Ошибка запроса' }));
    // Carry the status. A delete of something already gone answers 404, and
    // that is not a failure the user should be shown an error for - but the
    // message alone cannot tell 404 apart from a real rejection.
    const err = new Error(error.error || `HTTP ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }

  return res.json();
}

export interface AuthResult {
  token: string;
  refreshToken: string;
  user: { id: string; email: string; name: string; totpEnabled?: boolean };
}

/** The password was right but a second factor is still owed. */
export interface TwoFactorRequired {
  requiresTwoFactor: true;
  twoFactorToken: string;
  user: { id: string; email: string; name: string };
}

export const api = {
  auth: {
    login: (data: { email: string; password: string }) =>
      request<AuthResult | TwoFactorRequired>('/auth/login', {
        method: 'POST', body: JSON.stringify(data),
      }),
    loginTwoFactor: (data: { twoFactorToken: string; code: string }) =>
      request<AuthResult>('/auth/login/2fa', {
        method: 'POST', body: JSON.stringify(data),
      }),
    register: (data: { email: string; password: string; name: string }) =>
      request<AuthResult>('/auth/register', {
        method: 'POST', body: JSON.stringify(data),
      }),
    logout: (refreshToken: string | null) =>
      request<any>('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) }),
    logoutAll: () => request<any>('/auth/logout-all', { method: 'POST' }),
    setupTwoFactor: () => request<{ secret: string; otpauthUri: string }>('/auth/2fa/setup', { method: 'POST' }),
    enableTwoFactor: (code: string) =>
      request<any>('/auth/2fa/enable', { method: 'POST', body: JSON.stringify({ code }) }),
    disableTwoFactor: (data: { password: string; code: string }) =>
      request<any>('/auth/2fa/disable', { method: 'POST', body: JSON.stringify(data) }),
    changePassword: (data: { currentPassword: string; newPassword: string }) =>
      request<any>('/auth/password', { method: 'PUT', body: JSON.stringify(data) }),
    me: () => request<{ id: string; email: string; name: string; totpEnabled: boolean }>('/auth/me'),
    oauth: (provider: 'telegram', data: any) =>
      request<AuthResult>('/auth/oauth', {
        method: 'POST', body: JSON.stringify({ provider, data }),
      }),
    link: (provider: 'telegram', data: any) =>
      request<any>('/auth/link', { method: 'POST', body: JSON.stringify({ provider, data }) }),
    updateProfile: (data: any) =>
      request<any>('/auth/profile', { method: 'PUT', body: JSON.stringify(data) }),
    setPublicKey: (publicKey: string) =>
      request<any>('/auth/public-key', { method: 'PUT', body: JSON.stringify({ publicKey }) }),
    getPublicKey: (userId: string) =>
      request<{ publicKey: string }>(`/auth/public-key/${userId}`),
    uploadAvatar: (file: File) => {
      const formData = new FormData();
      formData.append('avatar', file);
      const token = getToken();
      return fetch('/api/upload/avatar', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      }).then((r) => r.json());
    },
  uploadImage: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const token = getToken();
      return fetch('/api/upload/image', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      }).then((r) => r.json());
    },
  },
  uploadImage: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const token = getToken();
      return fetch('/api/upload/image', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      }).then((r) => r.json());
    },
  uploadAudio: (blob: Blob) => {
      const formData = new FormData();
      formData.append('file', blob, 'audio.webm');
      const token = getToken();
      return fetch('/api/upload/audio', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      }).then((r) => r.json());
    },
  recipes: {
    getAll: () => request<any[]>('/recipes'),
    getById: (id: string) => request<any>(`/recipes/${id}`),
    import: (url: string) =>
      request<{
        title: string;
        ingredients: string[];
        instructions: string[];
        cookingTime?: number;
        source: 'json-ld' | 'microdata' | 'heuristic';
        charset: string;
        charsetGuessed: boolean;
      }>('/recipes/import', { method: 'POST', body: JSON.stringify({ url }) }),
    create: (data: any) => request<any>('/recipes', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => request<any>(`/recipes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request<any>(`/recipes/${id}`, { method: 'DELETE' }),
  },
  plans: {
    getAll: () => request<Plan[]>('/plans'),
    getById: (id: string) => request<Plan>(`/plans/${id}`),
    create: (data: any) => request<Plan>('/plans', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => request<Plan>(`/plans/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request<any>(`/plans/${id}`, { method: 'DELETE' }),
    addEntry: (id: string, data: any) =>
      request<PlanEntry>(`/plans/${id}/entries`, { method: 'POST', body: JSON.stringify(data) }),
    deleteEntry: (id: string, entryId: string) =>
      request<any>(`/plans/${id}/entries/${entryId}`, { method: 'DELETE' }),
  },
  wishes: {
    getAll: () => request<Wishlist[]>('/wishes'),
    getById: (id: string) => request<Wishlist>(`/wishes/${id}`),
    recipients: () => request<{ id: string; name: string }[]>('/wishes/recipients'),
    create: (data: any) => request<Wishlist>('/wishes', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => request<Wishlist>(`/wishes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request<any>(`/wishes/${id}`, { method: 'DELETE' }),
    addItem: (id: string, data: any) =>
      request<WishItem>(`/wishes/${id}/items`, { method: 'POST', body: JSON.stringify(data) }),
    updateItem: (id: string, itemId: string, data: any) =>
      request<WishItem>(`/wishes/${id}/items/${itemId}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteItem: (id: string, itemId: string) =>
      request<any>(`/wishes/${id}/items/${itemId}`, { method: 'DELETE' }),
  },
  calendar: {
    getMonth: (from: string, to: string) =>
      request<CalendarMonth>(`/calendar/events?from=${from}&to=${to}`),
    getUpcoming: (days = 90) => request<UpcomingItem[]>(`/calendar/upcoming?days=${days}`),
    create: (data: any) => request<CalendarEvent>('/calendar', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      request<CalendarEvent>(`/calendar/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request<any>(`/calendar/${id}`, { method: 'DELETE' }),
  },
  shopping: {
    getAll: () => request<ShoppingItem[]>('/shopping'),
    create: (data: any) => request<ShoppingItem>('/shopping', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      request<ShoppingItem>(`/shopping/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request<any>(`/shopping/${id}`, { method: 'DELETE' }),
    clearDone: () => request<{ removed: number }>('/shopping/clear-done', { method: 'POST' }),
  },
  tasks: {
    getColumns: () => request<{ columns: any[]; assignedTasks: any[]; familyTasks: any[] }>('/tasks/columns'),
    createColumn: (data: any) => request<any>('/tasks/columns', { method: 'POST', body: JSON.stringify(data) }),
    updateColumn: (id: string, data: any) => request<any>(`/tasks/columns/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteColumn: (id: string) => request<any>(`/tasks/columns/${id}`, { method: 'DELETE' }),
    getAll: () => request<any[]>('/tasks'),
    create: (data: any) => request<any>('/tasks', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => request<any>(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request<any>(`/tasks/${id}`, { method: 'DELETE' }),
    reorder: (items: { id: string; order: number; columnId: string }[]) =>
      request<any>('/tasks/reorder/all', { method: 'PUT', body: JSON.stringify({ items }) }),
  },
  family: {
    getAll: () => request<any[]>('/family'),
    create: (name: string) => request<any>('/family', { method: 'POST', body: JSON.stringify({ name }) }),
    invite: (familyId: string, email: string) =>
      request<any>(`/family/${familyId}/invite`, { method: 'POST', body: JSON.stringify({ email }) }),
    acceptInvite: (token: string) =>
      request<any>('/family/invite/accept', { method: 'POST', body: JSON.stringify({ token }) }),
    removeMember: (familyId: string, userId: string) =>
      request<any>(`/family/${familyId}/member/${userId}`, { method: 'DELETE' }),
    cancelInvite: (familyId: string, inviteId: string) =>
      request<any>(`/family/${familyId}/invite/${inviteId}`, { method: 'DELETE' }),
    leave: (familyId: string) => request<any>(`/family/${familyId}/leave`, { method: 'DELETE' }),
  },
  chat: {
    getAll: () => request<any[]>('/chat'),
    create: (participantId: string, encryptedKeys?: Record<string, string>) =>
      request<any>('/chat', { method: 'POST', body: JSON.stringify({ participantId, encryptedKeys }) }),
    delete: (chatId: string) => request<any>(`/chat/${chatId}`, { method: 'DELETE' }),
    deleteChat: (chatId: string) => request<any>(`/chat/${chatId}/delete`, { method: 'DELETE' }),
    enableEncryption: (chatId: string, encryptedKeys: Record<string, string>) =>
      request<any>(`/chat/${chatId}/encrypt`, { method: 'PUT', body: JSON.stringify({ encryptedKeys }) }),
    getMessages: (chatId: string) => request<any[]>(`/chat/${chatId}/messages`),
    sendMessage: (chatId: string, content: string, audio?: string, audioDuration?: number, image?: string) =>
      request<any>(`/chat/${chatId}/messages`, { method: 'POST', body: JSON.stringify({ content, audio, audioDuration, image }) }),
    deleteMessage: (chatId: string, messageId: string) =>
      request<any>(`/chat/${chatId}/messages/${messageId}`, { method: 'DELETE' }),
    searchUsers: (q: string) => request<any[]>(`/chat/search/users?q=${encodeURIComponent(q)}`),
    searchParticipants: (q: string) => request<any[]>(`/chat/search/participants?q=${encodeURIComponent(q)}`),
  },
  notes: {
    getAll: (skip = 0, take = 20) => request<{ notes: any[]; total: number; skip: number; take: number }>(`/notes?skip=${skip}&take=${take}`),
    create: (data: any) => request<any>('/notes', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => request<any>(`/notes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request<any>(`/notes/${id}`, { method: 'DELETE' }),
  },
  notifications: {
    getAll: () => request<any[]>('/notifications'),
    getUnreadCount: () => request<{ count: number }>('/notifications/unread-count'),
    markRead: (id: string) => request<any>(`/notifications/${id}/read`, { method: 'PUT' }),
    markAllRead: () => request<any>('/notifications/read-all', { method: 'PUT' }),
  },
  push: {
    publicKey: () => request<{ key: string; enabled: boolean }>('/push/public-key'),
    subscribe: (sub: { endpoint: string; keys: { p256dh: string; auth: string } }) =>
      request<{ ok: boolean; id: string }>('/push/subscribe', {
        method: 'POST',
        body: JSON.stringify(sub),
      }),
    unsubscribe: (endpoint: string) =>
      request<{ ok: boolean }>('/push/subscribe', {
        method: 'DELETE',
        body: JSON.stringify({ endpoint }),
      }),
    sendTest: () =>
      request<{ delivered: number; known: number }>('/push/test', { method: 'POST' }),
    status: () =>
      request<{
        configured: boolean;
        devices: number;
        lastSentAt: string | null;
        registeredAt: string | null;
      }>('/push/status'),
  },
};
