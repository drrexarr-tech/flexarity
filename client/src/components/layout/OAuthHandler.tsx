import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import toast from 'react-hot-toast';

export function OAuthHandler() {
  const location = useLocation();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
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
    done.current = true;
    window.location.hash = '';

    if (localStorage.getItem('token')) {
      api.auth.link(provider as any, { id: data.id })
        .then((updated) => { useAuthStore.getState().setUser(updated); toast.success('Аккаунт привязан'); })
        .catch((err: any) => toast.error(err.message));
    } else {
      api.auth.oauth(provider as any, data)
        .then((res) => { useAuthStore.getState().setAuth(res.user, res.token); })
        .catch((err: any) => toast.error(err.message));
    }
  }, [location]);

  return null;
}
