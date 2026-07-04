import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import toast from 'react-hot-toast';

export function OAuthHandler() {
  const [processed, setProcessed] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (processed) return;
    const hash = window.location.hash.slice(1);
    if (!hash) return;

    const params = new URLSearchParams(hash);
    let provider: string | null = null;
    let data: any = null;

    if (params.has('tgAuthResult')) {
      provider = 'telegram';
      try { data = JSON.parse(decodeURIComponent(params.get('tgAuthResult')!)); }
      catch { return; }
    } else if (params.has('id')) {
      provider = 'telegram';
      data = Object.fromEntries(params.entries());
    }

    if (!provider || !data) return;
    setProcessed(true);

    window.location.hash = '';

    const existingToken = localStorage.getItem('token');

    if (existingToken) {
      api.auth.link(provider as any, { id: data.id })
        .then((updated) => {
          useAuthStore.getState().setUser(updated);
          toast.success('Аккаунт привязан');
        })
        .catch((err: any) => toast.error(err.message));
    } else {
      api.auth.oauth(provider as any, data)
        .then((res) => {
          useAuthStore.getState().setAuth(res.user, res.token);
          toast.success('Вход выполнен');
        })
        .catch((err: any) => toast.error(err.message));
    }
  }, []);

  return null;
}
