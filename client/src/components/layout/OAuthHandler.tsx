import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import toast from 'react-hot-toast';

let savedHash = '';
const match = window.location.hash.match(/[#&]tgAuthResult=([^&]+)/);
if (match) {
  savedHash = match[1];
  window.location.hash = '';
}

export function OAuthHandler() {
  const navigate = useNavigate();
  const done = useRef(false);

  useEffect(() => {
    if (done.current || !savedHash) return;
    done.current = true;

    let data: any;
    try {
      const json = atob(savedHash.replace(/-/g, '+').replace(/_/g, '/'));
      data = JSON.parse(json);
    } catch {
      try {
        data = JSON.parse(decodeURIComponent(savedHash));
      } catch {
        return;
      }
    }
    if (!data || !data.id) return;

    if (localStorage.getItem('token')) {
      api.auth.link('telegram', { id: String(data.id) })
        .then((updated) => { useAuthStore.getState().setUser(updated); toast.success('Аккаунт привязан'); })
        .catch((err: any) => toast.error(err.message));
    } else {
      api.auth.oauth('telegram', data)
        .then((res) => { useAuthStore.getState().setAuth(res.user, res.token); navigate('/', { replace: true }); })
        .catch((err: any) => toast.error(err.message));
    }
  }, [navigate]);

  return null;
}
