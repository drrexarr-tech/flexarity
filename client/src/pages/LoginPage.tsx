import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';

const loginSchema = z.object({
  email: z.string().email('Некорректный email'),
  password: z.string().min(1, 'Введите пароль'),
});

const registerSchema = z.object({
  name: z.string().min(2, 'Минимум 2 символа'),
  email: z.string().email('Некорректный email'),
  password: z.string().min(6, 'Минимум 6 символов'),
});

export function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (isAuthenticated) navigate('/', { replace: true });
  }, [isAuthenticated, navigate]);

  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
  });

  const registerForm = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
  });

  async function onLogin(data: z.infer<typeof loginSchema>) {
    setLoading(true);
    setError('');
    try {
      const res = await api.auth.login(data);
      setAuth(res.user, res.token, rememberMe);
      navigate('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function onRegister(data: z.infer<typeof registerSchema>) {
    setLoading(true);
    setError('');
    try {
      const res = await api.auth.register(data);
      setAuth(res.user, res.token, rememberMe);
      navigate('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <span className="text-xl font-bold text-primary-foreground">F</span>
          </div>
          <CardTitle>Добро пожаловать в Flex</CardTitle>
          <CardDescription>Ваш персональный сборник приложений</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Вход</TabsTrigger>
              <TabsTrigger value="register">Регистрация</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input id="login-email" type="email" {...loginForm.register('email')} />
                  {loginForm.formState.errors.email && (
                    <p className="text-xs text-destructive">{loginForm.formState.errors.email.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Пароль</Label>
                  <Input id="login-password" type="password" {...loginForm.register('password')} />
                  {loginForm.formState.errors.password && (
                    <p className="text-xs text-destructive">{loginForm.formState.errors.password.message}</p>
                  )}
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                  <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
                  Запомнить меня
                </label>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Вход...' : 'Войти'}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="register">
              <form onSubmit={registerForm.handleSubmit(onRegister)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reg-name">Имя</Label>
                  <Input id="reg-name" {...registerForm.register('name')} />
                  {registerForm.formState.errors.name && (
                    <p className="text-xs text-destructive">{registerForm.formState.errors.name.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-email">Email</Label>
                  <Input id="reg-email" type="email" {...registerForm.register('email')} />
                  {registerForm.formState.errors.email && (
                    <p className="text-xs text-destructive">{registerForm.formState.errors.email.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-password">Пароль</Label>
                  <Input id="reg-password" type="password" {...registerForm.register('password')} />
                  {registerForm.formState.errors.password && (
                    <p className="text-xs text-destructive">{registerForm.formState.errors.password.message}</p>
                  )}
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                  <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
                  Запомнить меня
                </label>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Регистрация...' : 'Зарегистрироваться'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="relative my-6">
            <Separator />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
              или
            </span>
          </div>

          <div className="space-y-2">
            <Button variant="outline" className="w-full" onClick={() => {
              const origin = encodeURIComponent(window.location.origin);
              window.location.href = `https://oauth.telegram.org/auth?bot_id=8418868047&origin=${origin}`;
            }}>
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
              Войти через Telegram
            </Button>
            <Button variant="outline" className="w-full" disabled>
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M15.684 0H8.316C3.731 0 0 3.731 0 8.316v7.368C0 20.269 3.731 24 8.316 24h7.368C20.269 24 24 20.269 24 15.684V8.316C24 3.731 20.269 0 15.684 0zm3.366 16.742h-1.564c-.607 0-.801-.505-1.923-1.661-.967-.992-1.387-1.12-1.624-1.12-.33 0-.426.127-.426.5v1.323c0 .36-.122.567-1.077.567-1.584 0-3.34-.979-4.584-2.807-1.706-2.189-2.163-3.823-2.163-4.161 0-.19.075-.361.553-.361h1.575c.416 0 .569.19.727.657.619 2.014 1.649 3.781 2.07 3.781.162 0 .242-.08.242-.521v-2.004c-.07-1.036-.626-1.122-.626-1.493 0-.19.153-.361.38-.361H12.1c.332 0 .437.166.437.525V10.66c0 .35.127.473.22.473.177 0 .331-.123.65-.442 1.089-1.238 1.863-3.147 1.863-3.147.093-.198.233-.294.445-.294h1.564c.443 0 .546.233.443.563-.166.555-1.84 3.315-1.84 3.315-.148.26-.206.39 0 .691.15.242.993.973 1.494 1.566.566.673.995 1.244.995 1.692.004.637-.332.955-.835.955z"/></svg>
              VK ID (недоступно)
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
