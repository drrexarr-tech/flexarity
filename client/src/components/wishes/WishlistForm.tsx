import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { Wishlist } from '@/types';
import toast from 'react-hot-toast';

const schema = z.object({
  title: z.string().min(1, 'Название обязательно'),
  description: z.string().optional(),
  visibility: z.enum(['private', 'family', 'public']).default('private'),
  familyId: z.string().optional(),
});

interface Props {
  wishlist?: Wishlist | null;
  onSuccess: () => void;
}

export function WishlistForm({ wishlist, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [families, setFamilies] = useState<any[]>([]);
  const isEdit = !!wishlist;

  useEffect(() => {
    api.family.getAll().then(setFamilies).catch(() => {});
  }, []);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: wishlist
      ? {
          title: wishlist.title,
          description: wishlist.description || '',
          visibility: wishlist.visibility || 'private',
          familyId: wishlist.familyId || undefined,
        }
      : {
          title: '',
          description: '',
          visibility: 'private',
          familyId: undefined,
        },
  });

  const visibility = form.watch('visibility');

  async function onSubmit(data: z.infer<typeof schema>) {
    setLoading(true);
    try {
      const payload: any = { ...data, description: data.description || null };
      if (data.visibility !== 'family') delete payload.familyId;

      if (isEdit && wishlist) {
        await api.wishes.update(wishlist.id, payload);
        toast.success('Список обновлён');
      } else {
        await api.wishes.create(payload);
        toast.success('Список создан');
      }
      onSuccess();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="wishlist-title">Название</Label>
        <Input id="wishlist-title" placeholder="Например: Подарки на день рождения" {...form.register('title')} />
        {form.formState.errors.title && (
          <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="wishlist-desc">Описание</Label>
        <Textarea id="wishlist-desc" rows={3} placeholder="Необязательно" {...form.register('description')} />
      </div>

      <div className="space-y-2">
        <Label>Видимость</Label>
        <Select
          value={form.watch('visibility')}
          onValueChange={(v) => form.setValue('visibility', v as any)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="private">Только я</SelectItem>
            <SelectItem value="family">Семья</SelectItem>
            <SelectItem value="public">Публичный</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {visibility === 'family' && families.length > 0 && (
        <div className="space-y-2">
          <Label>Выберите семью</Label>
          <Select
            value={form.watch('familyId') || ''}
            onValueChange={(v) => form.setValue('familyId', v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Выберите семью" />
            </SelectTrigger>
            <SelectContent>
              {families.map((f) => (
                <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? 'Сохранение...' : isEdit ? 'Сохранить' : 'Создать список'}
      </Button>
    </form>
  );
}
