import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, X } from 'lucide-react';

export function InvitePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const user = useAuthStore((s) => s.user);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isInitialized || !token) return;
    if (!user) { navigate('/login'); return; }
  }, [token, user, isInitialized, navigate]);

  async function handleAccept() {
    if (!token) return;
    setStatus('loading');
    try {
      await api.family.acceptInvite(token);
      setStatus('success');
    } catch (err: any) {
      setError(err.message);
      setStatus('error');
    }
  }

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <X className="h-12 w-12 text-destructive" />
            <p className="text-lg">Неверная ссылка приглашения</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <Check className="h-12 w-12 text-green-500" />
            <p className="text-lg">Вы присоединились к семье!</p>
            <Button onClick={() => navigate('/family')}>Перейти к семьям</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Приглашение в семью</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          {status === 'error' && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={handleAccept} disabled={status === 'loading'} className="w-full">
            {status === 'loading' ? 'Принятие...' : 'Принять приглашение'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
