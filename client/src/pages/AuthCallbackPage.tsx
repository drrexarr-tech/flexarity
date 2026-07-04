import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import toast from 'react-hot-toast';

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [status, setStatus] = useState('Обработка...');
  const [searchParams] = useSearchParams();

  useEffect(() => {
    async function handle() {
      const hash = window.location.hash.slice(1);
      const params = new URLSearchParams(hash);

      let provider: string | null = null;
      let data: any = null;

      if (params.has('tgAuthResult')) {
        provider = 'telegram';
        try { data = JSON.parse(decodeURIComponent(params.get('tgAuthResult')!)); }
        catch { setStatus('Ошибка обработки Telegram'); return; }
      } else if (params.has('payload')) {
        provider = 'vk';
        const payload = params.get('payload');
        if (payload) {
          try { data = JSON.parse(decodeURIComponent(payload)); }
          catch { data = { payload }; }
        }
      } else if (params.has('id')) {
        provider = 'telegram';
        data = Object.fromEntries(params.entries());
      }

      if (!provider || !data) {
        setStatus('Не удалось войти через соцсеть');
        setTimeout(() => navigate('/login'), 2000);
        return;
      }

      const existingToken = localStorage.getItem('token');

      try {
        if (existingToken) {
          const updated = await api.auth.link(provider as any, { id: data.id });
          useAuthStore.getState().setUser(updated);
          toast.success('Аккаунт привязан');
          navigate('/profile');
        } else {
          const res = await api.auth.oauth(provider as any, data);
          setAuth(res.user, res.token);
          toast.success('Вход выполнен');
          navigate('/');
        }
      } catch (err: any) {
        setStatus(err.message);
        toast.error(err.message);
      }
    }

    handle();
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <p className="text-sm text-muted-foreground">{status}</p>
    </div>
  );
}
