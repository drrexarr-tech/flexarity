const API_URL = '/api';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Ошибка запроса' }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }

  return res.json();
}

export const api = {
  auth: {
    login: (data: { email: string; password: string }) =>
      request<{ token: string; user: { id: string; email: string; name: string } }>('/auth/login', {
        method: 'POST', body: JSON.stringify(data),
      }),
    register: (data: { email: string; password: string; name: string }) =>
      request<{ token: string; user: { id: string; email: string; name: string } }>('/auth/register', {
        method: 'POST', body: JSON.stringify(data),
      }),
    me: () => request<{ id: string; email: string; name: string }>('/auth/me'),
    oauth: (provider: 'telegram' | 'vk', data: any) =>
      request<{ token: string; user: { id: string; email: string; name: string } }>('/auth/oauth', {
        method: 'POST', body: JSON.stringify({ provider, data }),
      }),
    link: (provider: 'telegram' | 'vk', data: any) =>
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
      const token = localStorage.getItem('token');
      return fetch('/api/upload/avatar', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      }).then((r) => r.json());
    },
  },
  recipes: {
    getAll: () => request<any[]>('/recipes'),
    getById: (id: string) => request<any>(`/recipes/${id}`),
    create: (data: any) => request<any>('/recipes', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => request<any>(`/recipes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request<any>(`/recipes/${id}`, { method: 'DELETE' }),
  },
  tasks: {
    getColumns: () => request<any[]>('/tasks/columns'),
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
    getMessages: (chatId: string) => request<any[]>(`/chat/${chatId}/messages`),
    sendMessage: (chatId: string, content: string, audio?: string, audioDuration?: number) =>
      request<any>(`/chat/${chatId}/messages`, { method: 'POST', body: JSON.stringify({ content, audio, audioDuration }) }),
    searchUsers: (q: string) => request<any[]>(`/chat/search/users?q=${encodeURIComponent(q)}`),
    searchParticipants: (q: string) => request<any[]>(`/chat/search/participants?q=${encodeURIComponent(q)}`),
  },
  notes: {
    getAll: () => request<any[]>('/notes'),
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
};
