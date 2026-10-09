import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { WishItem } from '@/types';
import toast from 'react-hot-toast';

const schema = z.object({
  title: z.string().min(1, 'Название обязательно'),
  // Number('') is 0, so an untouched field would be sent as a price of zero
  // instead of staying empty.
  price: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().min(0, 'Цена не может быть отрицательной').optional()),
  url: z.string().optional(),
  note: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  recipientId: z.string().optional(),
});

const priorityLabels = { low: 'Низкий', medium: 'Средний', high: 'Высокий' } as const;

interface Props {
  wishlistId: string;
  item?: WishItem | null;
  defaultRecipientId?: string | null;
  onSuccess: () => void;
}

export function WishItemForm({ wishlistId, item, defaultRecipientId, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [recipients, setRecipients] = useState<{ id: string; name: string }[]>([]);
  const isEdit = !!item;

  useEffect(() => {
    api.wishes.recipients().then(setRecipients).catch(() => {});
  }, []);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: item
      ? {
          title: item.title,
          price: item.price ?? undefined,
          url: item.url || '',
          note: item.note || '',
          priority: item.priority ?? undefined,
          recipientId: item.recipientId || undefined,
        }
      : {
          title: '',
          price: undefined,
          url: '',
          note: '',
          priority: undefined,
          recipientId: defaultRecipientId || undefined,
        },
  });

  async function onSubmit(data: z.infer<typeof schema>) {
    setLoading(true);
    try {
      const payload: any = {
        ...data,
        url: data.url || null,
        note: data.note || null,
      };
      if (isEdit && item) {
        await api.wishes.updateItem(wishlistId, item.id, payload);
        toast.success('Подарок обновлён');
      } else {
        await api.wishes.addItem(wishlistId, payload);
        toast.success('Подарок добавлен');
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
        <Label htmlFor="item-title">Подарок</Label>
        <Input id="item-title" placeholder="Например: Наушники" {...form.register('title')} />
        {form.formState.errors.title && (
          <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="item-price">Цена (₽)</Label>
          <Input id="item-price" type="number" min={0} placeholder="0" {...form.register('price')} />
        </div>
        <div className="space-y-2">
          <Label>Приоритет</Label>
          <Select
            value={form.watch('priority') || ''}
            onValueChange={(v) => form.setValue('priority', (v || undefined) as any)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Не указан" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">{priorityLabels.low}</SelectItem>
              <SelectItem value="medium">{priorityLabels.medium}</SelectItem>
              <SelectItem value="high">{priorityLabels.high}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="item-url">Ссылка</Label>
        <Input id="item-url" placeholder="https://..." {...form.register('url')} />
      </div>

      <div className="space-y-2">
        <Label>Для кого</Label>
        <Select
          value={form.watch('recipientId') || 'none'}
          onValueChange={(v) => form.setValue('recipientId', v === 'none' ? undefined : v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Не указан" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Не указан</SelectItem>
            {recipients.map((r) => (
              <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="item-note">Заметка</Label>
        <Input id="item-note" placeholder="Необязательно" {...form.register('note')} />
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? 'Сохранение...' : isEdit ? 'Сохранить' : 'Добавить подарок'}
      </Button>
    </form>
  );
}
