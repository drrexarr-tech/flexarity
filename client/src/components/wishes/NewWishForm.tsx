import { useState } from 'react';
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
import { Separator } from '@/components/ui/separator';
import toast from 'react-hot-toast';

const priorityLabels = { low: 'Низкий', medium: 'Средний', high: 'Высокий' } as const;

/**
 * Creates a wishlist and its first gift in one go.
 *
 * Creating a wish used to mean two dialogs and two screens of bookkeeping for
 * one idea: make the list, then tap into it, then add the thing you were
 * actually thinking about. The nesting bought nothing here - a gift always
 * belonged to a list anyway - and it meant the common case took three taps and
 * a navigation away from the page you started on.
 *
 * The gift is optional. A list with nothing in it yet is a real thing, and
 * forcing a title for it would be worse than the nesting was.
 */
const schema = z.object({
  title: z.string().min(1, 'Название обязательно'),
  description: z.string().optional(),
  giftTitle: z.string().optional(),
  recipientName: z.string().optional(),
  price: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.coerce.number().min(0, 'Цена не может быть отрицательной').optional()
  ),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  url: z.string().optional(),
});

export function NewWishForm({ onSuccess }: { onSuccess: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: '',
      description: '',
      giftTitle: '',
      recipientName: '',
      priority: undefined,
      url: '',
    },
  });

  async function onSubmit(data: z.infer<typeof schema>) {
    setLoading(true);
    setError(null);
    try {
      const list = await api.wishes.create({
        title: data.title,
        description: data.description || null,
      });

      if (data.giftTitle?.trim()) {
        await api.wishes.addItem(list.id, {
          title: data.giftTitle.trim(),
          recipientName: data.recipientName || null,
          price: data.price ?? null,
          priority: data.priority ?? null,
          url: data.url || null,
        });
      }

      toast.success('Список создан');
      onSuccess();
    } catch (err: any) {
      // Stay open with the reason in place: the list may already exist, and
      // closing would lose what was typed.
      setError(err?.message || 'Не удалось создать список');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="wish-title">Название</Label>
        <Input
          id="wish-title"
          placeholder="Например: на день рождения"
          {...form.register('title')}
        />
        {form.formState.errors.title && (
          <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="wish-desc">Описание</Label>
        <Textarea
          id="wish-desc"
          rows={2}
          placeholder="Необязательно"
          {...form.register('description')}
        />
      </div>

      <Separator />

      {/* The gift is what people actually came here to write down, so it leads:
          "Первый подарок" read as a second, optional thing bolted onto a form
          that was really about the list, and people did not know which half was
          the real one. Name it for what it is and keep it obviously optional. */}
      <p className="text-sm text-muted-foreground">
        Подарок можно добавить сейчас или позже — список создастся в любом случае.
      </p>

      <div className="space-y-2">
        <Label htmlFor="wish-gift">Что подарить</Label>
        <Input
          id="wish-gift"
          placeholder="Например: наушники"
          {...form.register('giftTitle')}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="wish-for">Для кого</Label>
          <Input id="wish-for" placeholder="Например: мама" {...form.register('recipientName')} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="wish-price">Цена</Label>
          <Input id="wish-price" type="number" min={0} placeholder="0" {...form.register('price')} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Приоритет</Label>
        <Select
          value={form.watch('priority') || 'none'}
          onValueChange={(v) => form.setValue('priority', v === 'none' ? undefined : (v as any))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Не указан" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Не указан</SelectItem>
            {(Object.keys(priorityLabels) as Array<keyof typeof priorityLabels>).map((k) => (
              <SelectItem key={k} value={k}>
                {priorityLabels[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="wish-url">Ссылка</Label>
        <Input id="wish-url" placeholder="https://..." {...form.register('url')} />
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <Button type="submit" className="sticky bottom-0 z-10 w-full bg-background" disabled={loading}>
        {loading ? 'Создание...' : 'Создать список'}
      </Button>
    </form>
  );
}