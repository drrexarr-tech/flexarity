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

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

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
        method: 'POST',
        body: JSON.stringify(data),
      }),
    register: (data: { email: string; password: string; name: string }) =>
      request<{ token: string; user: { id: string; email: string; name: string } }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    me: () => request<{ id: string; email: string; name: string }>('/auth/me'),
  },
  recipes: {
    getAll: () => request<any[]>('/recipes'),
    getById: (id: string) => request<any>(`/recipes/${id}`),
    create: (data: any) =>
      request<any>('/recipes', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      request<any>(`/recipes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<any>(`/recipes/${id}`, { method: 'DELETE' }),
  },
  tasks: {
    getColumns: () => request<any[]>('/tasks/columns'),
    createColumn: (data: any) =>
      request<any>('/tasks/columns', { method: 'POST', body: JSON.stringify(data) }),
    updateColumn: (id: string, data: any) =>
      request<any>(`/tasks/columns/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteColumn: (id: string) =>
      request<any>(`/tasks/columns/${id}`, { method: 'DELETE' }),
    getAll: () => request<any[]>('/tasks'),
    create: (data: any) =>
      request<any>('/tasks', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      request<any>(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<any>(`/tasks/${id}`, { method: 'DELETE' }),
    reorder: (items: { id: string; order: number; columnId: string }[]) =>
      request<any>('/tasks/reorder/all', {
        method: 'PUT',
        body: JSON.stringify({ items }),
      }),
  },
};
