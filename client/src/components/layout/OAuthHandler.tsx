import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import toast from 'react-hot-toast';

function parseTgResult(hash: string) {
  const params = new URLSearchParams(hash);
  let raw = params.get('tgAuthResult');
  if (!raw) return null;
  try {
    const json = atob(raw);
    return JSON.parse(json);
  } catch {
    try {
      return JSON.parse(decodeURIComponent(raw));
    } catch {
      return null;
    }
  }
}

export function OAuthHandler() {
  const location = useLocation();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    const hash = window.location.hash.slice(1);
    if (!hash) return;

    const data = parseTgResult(hash);
    if (!data || !data.id) return;

    done.current = true;
    window.location.hash = '';

    if (localStorage.getItem('token')) {
      api.auth.link('telegram', { id: String(data.id) })
        .then((updated) => { useAuthStore.getState().setUser(updated); toast.success('Аккаунт привязан'); })
        .catch((err: any) => toast.error(err.message));
    } else {
      api.auth.oauth('telegram', data)
        .then((res) => { useAuthStore.getState().setAuth(res.user, res.token); })
        .catch((err: any) => toast.error(err.message));
    }
  }, [location]);

  return null;
}
