import { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Camera, CheckCheck, Unlink, X } from 'lucide-react';
import toast from 'react-hot-toast';

export function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const fileRef = useRef<HTMLInputElement>(null);
  const cropImgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const [cropDialog, setCropDialog] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropDataUrl, setCropDataUrl] = useState('');
  const [cropPos, setCropPos] = useState({ x: 0.5, y: 0.5 });
  const [cropR, setCropR] = useState(72);
  function handleMouseDown(e: React.MouseEvent<HTMLImageElement>) {
    e.preventDefault();
    const img = cropImgRef.current;
    if (!img) return;
    const rect = img.getBoundingClientRect();
    const maxR = Math.min(72, rect.width / 2, rect.height / 2);
    setCropR(maxR);
    const rX = maxR / Math.max(rect.width, 1);
    const rY = maxR / Math.max(rect.height, 1);
    const fits = rX <= 0.5 && rY <= 0.5;
    const clickX = (e.clientX - rect.left) / rect.width;
    const clickY = (e.clientY - rect.top) / rect.height;

    if (fits) {
      const dx = (clickX - cropPos.x) / rX;
      const dy = (clickY - cropPos.y) / rY;
      if (dx * dx + dy * dy > 1) return;
    }

    function move(ev: MouseEvent) {
      const rawX = (ev.clientX - rect.left) / rect.width;
      const rawY = (ev.clientY - rect.top) / rect.height;
      setCropPos({
        x: fits ? Math.max(rX, Math.min(1 - rX, rawX)) : 0.5,
        y: fits ? Math.max(rY, Math.min(1 - rY, rawY)) : 0.5,
      });
    }

    function up() {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    }

    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }

  function drawPreview() {
    const img = cropImgRef.current;
    const canvas = previewRef.current;
    if (!img || !canvas || !img.naturalWidth) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const side = 200;
    canvas.width = side;
    canvas.height = side;
    const cropSize = Math.min(img.naturalWidth, img.naturalHeight) * 0.7;
    const sx = img.naturalWidth * cropPos.x - cropSize / 2;
    const sy = img.naturalHeight * cropPos.y - cropSize / 2;
    ctx.clearRect(0, 0, side, side);
    ctx.save();
    ctx.beginPath();
    ctx.arc(side / 2, side / 2, side / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, sx, sy, cropSize, cropSize, 0, 0, side, side);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(side / 2, side / 2, side / 2, 0, Math.PI * 2);
    ctx.strokeStyle = 'hsl(var(--primary))';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  const [previewKey, setPreviewKey] = useState(0);

  useEffect(() => {
    if (!cropDialog || !cropImgRef.current || !previewRef.current) return;
    if (!cropImgRef.current.naturalWidth) return;
    drawPreview();
  }, [cropDialog, cropDataUrl, cropPos, previewKey]);

  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [dateOfBirth, setDateOfBirth] = useState(user?.dateOfBirth?.slice(0, 10) || '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await api.auth.updateProfile({ name, email: email || undefined, dateOfBirth: dateOfBirth || undefined });
      setUser(updated);
      toast.success('Профиль обновлён');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) { toast.error('Только изображения'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCropFile(f);
      setCropDataUrl(ev.target!.result as string);
      setCropDialog(true);
    };
    reader.readAsDataURL(f);
    e.target.value = '';
  }

  function doCrop() {
    const img = cropImgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas || !cropFile) return;

    const scaleX = img.naturalWidth / (cropImgRef.current?.getBoundingClientRect().width || 1);
    const scaleY = img.naturalHeight / (cropImgRef.current?.getBoundingClientRect().height || 1);
    const natCropR = cropR * Math.min(scaleX, scaleY);
    const natCropX = img.naturalWidth * cropPos.x;
    const natCropY = img.naturalHeight * cropPos.y;
    const sx = natCropX - natCropR;
    const sy = natCropY - natCropR;
    const size = natCropR * 2;

    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.beginPath();
    ctx.arc(128, 128, 128, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, sx, sy, size, size, 0, 0, 256, 256);

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      setCropDialog(false);
      setUploading(true);
      try {
        const croppedFile = new File([blob], cropFile.name, { type: 'image/png' });
        const updated = await api.auth.uploadAvatar(croppedFile);
        setUser(updated);
        toast.success('Аватарка обновлена');
      } catch (err: any) {
        toast.error(err.message);
      } finally {
        setUploading(false);
      }
    }, 'image/png');
  }

  async function handleDeleteAvatar() {
    try {
      const updated = await api.auth.updateProfile({ avatarUrl: null });
      setUser(updated);
      toast.success('Аватарка удалена');
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function handleUnlink(provider: 'telegram' | 'vk') {
    if (!confirm(`Отвязать ${provider === 'telegram' ? 'Telegram' : 'VK'}?`)) return;
    try {
      const updated = await api.auth.link(provider, { remove: true });
      setUser(updated);
      toast.success(`${provider === 'telegram' ? 'Telegram' : 'VK'} отвязан`);
    } catch (err: any) { toast.error(err.message); }
  }

  const avatarUrl = user?.avatarUrl
    ? (user.avatarUrl.startsWith('data:') || user.avatarUrl.startsWith('http') || user.avatarUrl.startsWith('/') ? user.avatarUrl : `/api/upload/file/${user.avatarUrl}`)
    : null;

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-bold lg:text-3xl">Профиль</h1>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative group">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground overflow-hidden">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  user?.name?.[0]?.toUpperCase() || '?'
                )}
              </div>
              <button
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                <Camera className="h-5 w-5 text-white" />
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
            </div>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-xl">{user?.name}</CardTitle>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
            {avatarUrl && (
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-destructive" onClick={handleDeleteAvatar} title="Удалить аватарку">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Имя</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Дата рождения</Label>
            <Input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className="[color-scheme:light_dark]" />
          </div>
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </CardContent>
      </Card>

      <Dialog open={cropDialog} onOpenChange={setCropDialog}>
        <DialogContent className="w-[90vw] max-w-sm">
          <DialogHeader>
            <DialogTitle>Обрезка аватарки</DialogTitle>
            <DialogDescription>Кликните на изображении, чтобы выбрать область</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4">
            <div className="relative cursor-crosshair w-fit" onMouseDown={handleMouseDown}>
              <img ref={cropImgRef} src={cropDataUrl} alt="" className="max-w-full max-h-[35vh] rounded-md" onLoad={() => {
                setPreviewKey(k => k + 1);
                const img = cropImgRef.current;
                if (img) {
                  const rect = img.getBoundingClientRect();
                  setCropR(Math.min(72, rect.width / 2, rect.height / 2));
                }
              }} />
              <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(circle at ${cropPos.x * 100}% ${cropPos.y * 100}%, transparent ${cropR}px, rgba(0,0,0,0.45) ${cropR}px)` }}>
                <div className="absolute rounded-full border-4 border-primary pointer-events-none" style={{ width: cropR * 2, height: cropR * 2, left: `calc(${cropPos.x * 100}% - ${cropR}px)`, top: `calc(${cropPos.y * 100}% - ${cropR}px)` }} />
              </div>
            </div>
            <canvas ref={canvasRef} width={256} height={256} className="hidden" />
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-2">Результат:</p>
              <canvas ref={previewRef} width={200} height={200} className="rounded-full border-2 border-border mx-auto" style={{ width: 100, height: 100 }} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCropDialog(false)}>Отмена</Button>
            <Button onClick={doCrop} disabled={uploading}>
              {uploading ? 'Загрузка...' : 'Сохранить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader><CardTitle className="text-lg">Привязанные аккаунты</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
            <div className="flex items-center gap-3">
              <svg className="h-5 w-5 text-blue-500" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
              <div>
                <p className="text-sm font-medium">Telegram</p>
                {user?.telegramId ? (
                  <p className="text-xs text-green-600 flex items-center gap-1"><CheckCheck className="h-3 w-3" /> ID: {user.telegramId === 'undefined' ? 'ошибка' : user.telegramId}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Не привязан</p>
                )}
              </div>
            </div>
            {user?.telegramId ? (
              <Button variant="outline" size="sm" className="text-destructive" onClick={() => handleUnlink('telegram')}>
                <Unlink className="h-3 w-3 mr-1" /> Отвязать
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => { window.location.href = 'https://oauth.telegram.org/auth?bot_id=8418868047&origin=' + encodeURIComponent(window.location.origin); }}>
                Привязать
              </Button>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
            <div className="flex items-center gap-3">
              <svg className="h-5 w-5 text-blue-600" viewBox="0 0 24 24" fill="currentColor"><path d="M15.684 0H8.316C3.731 0 0 3.731 0 8.316v7.368C0 20.269 3.731 24 8.316 24h7.368C20.269 24 24 20.269 24 15.684V8.316C24 3.731 20.269 0 15.684 0zm3.366 16.742h-1.564c-.607 0-.801-.505-1.923-1.661-.967-.992-1.387-1.12-1.624-1.12-.33 0-.426.127-.426.5v1.323c0 .36-.122.567-1.077.567-1.584 0-3.34-.979-4.584-2.807-1.706-2.189-2.163-3.823-2.163-4.161 0-.19.075-.361.553-.361h1.575c.416 0 .569.19.727.657.619 2.014 1.649 3.781 2.07 3.781.162 0 .242-.08.242-.521v-2.004c-.07-1.036-.626-1.122-.626-1.493 0-.19.153-.361.38-.361H12.1c.332 0 .437.166.437.525V10.66c0 .35.127.473.22.473.177 0 .331-.123.65-.442 1.089-1.238 1.863-3.147 1.863-3.147.093-.198.233-.294.445-.294h1.564c.443 0 .546.233.443.563-.166.555-1.84 3.315-1.84 3.315-.148.26-.206.39 0 .691.15.242.993.973 1.494 1.566.566.673.995 1.244.995 1.692.004.637-.332.955-.835.955z"/></svg>
              <div>
                <p className="text-sm font-medium">VK</p>
                {user?.vkId ? (
                  <p className="text-xs text-green-600 flex items-center gap-1"><CheckCheck className="h-3 w-3" /> ID: {user.vkId === 'undefined' ? 'ошибка' : user.vkId}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Не привязан</p>
                )}
              </div>
            </div>
            {user?.vkId ? (
              <Button variant="outline" size="sm" className="text-destructive" onClick={() => handleUnlink('vk')}>
                <Unlink className="h-3 w-3 mr-1" /> Отвязать
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">Нет VK приложения</p>
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
