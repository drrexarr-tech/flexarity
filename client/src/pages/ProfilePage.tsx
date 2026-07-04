import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import toast from 'react-hot-toast';

export function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const [name, setName] = useState(user?.name || '');
  const [dateOfBirth, setDateOfBirth] = useState(user?.dateOfBirth?.slice(0, 10) || '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await api.auth.updateProfile({ name, dateOfBirth: dateOfBirth || undefined });
      setUser(updated);
      toast.success('Профиль обновлён');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleLinkTelegram() {
    const telegramId = prompt('Введите ID Telegram (число):');
    if (!telegramId) return;
    try {
      const updated = await api.auth.link('telegram', { id: telegramId });
      setUser(updated);
      toast.success('Telegram привязан');
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function handleLinkVK() {
    const vkId = prompt('Введите ID VK (число):');
    if (!vkId) return;
    try {
      const updated = await api.auth.link('vk', { id: vkId });
      setUser(updated);
      toast.success('VK привязан');
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-bold lg:text-3xl">Профиль</h1>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground overflow-hidden">
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                user?.name?.[0]?.toUpperCase() || '?'
              )}
            </div>
            <div>
              <CardTitle className="text-xl">{user?.name}</CardTitle>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Имя</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Дата рождения</Label>
            <Input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
          </div>
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Привязанные аккаунты</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
            <div className="flex items-center gap-3">
              <svg className="h-5 w-5 text-blue-500" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
              <div>
                <p className="text-sm font-medium">Telegram</p>
                <p className="text-xs text-muted-foreground">{user?.telegramId ? 'Привязан' : 'Не привязан'}</p>
              </div>
            </div>
            {!user?.telegramId && (
              <Button variant="outline" size="sm" onClick={handleLinkTelegram}>Привязать</Button>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
            <div className="flex items-center gap-3">
              <svg className="h-5 w-5 text-blue-600" viewBox="0 0 24 24" fill="currentColor"><path d="M15.684 0H8.316C3.731 0 0 3.731 0 8.316v7.368C0 20.269 3.731 24 8.316 24h7.368C20.269 24 24 20.269 24 15.684V8.316C24 3.731 20.269 0 15.684 0zm3.366 16.742h-1.564c-.607 0-.801-.505-1.923-1.661-.967-.992-1.387-1.12-1.624-1.12-.33 0-.426.127-.426.5v1.323c0 .36-.122.567-1.077.567-1.584 0-3.34-.979-4.584-2.807-1.706-2.189-2.163-3.823-2.163-4.161 0-.19.075-.361.553-.361h1.575c.416 0 .569.19.727.657.619 2.014 1.649 3.781 2.07 3.781.162 0 .242-.08.242-.521v-2.004c-.07-1.036-.626-1.122-.626-1.493 0-.19.153-.361.38-.361H12.1c.332 0 .437.166.437.525V10.66c0 .35.127.473.22.473.177 0 .331-.123.65-.442 1.089-1.238 1.863-3.147 1.863-3.147.093-.198.233-.294.445-.294h1.564c.443 0 .546.233.443.563-.166.555-1.84 3.315-1.84 3.315-.148.26-.206.39 0 .691.15.242.993.973 1.494 1.566.566.673.995 1.244.995 1.692.004.637-.332.955-.835.955z"/></svg>
              <div>
                <p className="text-sm font-medium">VK</p>
                <p className="text-xs text-muted-foreground">{user?.vkId ? 'Привязан' : 'Не привязан'}</p>
              </div>
            </div>
            {!user?.vkId && (
              <Button variant="outline" size="sm" onClick={handleLinkVK}>Привязать</Button>
            )}
          </div>

          <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-muted text-[10px] font-bold">@</div>
            <div>
              <p className="text-sm font-medium">Email</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
