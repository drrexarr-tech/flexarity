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
import type { CalendarEvent } from '@/types';
import toast from 'react-hot-toast';

const schema = z.object({
  title: z.string().min(1, 'Название обязательно'),
  description: z.string().optional(),
  date: z.string().min(1, 'Дата обязательна'),
  time: z.string().optional(),
  visibility: z.enum(['private', 'family', 'public']).default('private'),
  familyId: z.string().optional(),
});

const palette = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f97316', '#eab308', '#22c55e', '#06b6d4',
];

function toDateInput(value: string | Date) {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface Props {
  event?: CalendarEvent | null;
  defaultDate?: string;
  onSuccess: () => void;
}

export function CalendarEventForm({ event, defaultDate, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [families, setFamilies] = useState<any[]>([]);
  const [color, setColor] = useState(event?.color || palette[0]);
  const isEdit = !!event;

  useEffect(() => {
    api.family.getAll().then(setFamilies).catch(() => {});
  }, []);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: event
      ? {
          title: event.title,
          description: event.description || '',
          date: toDateInput(event.date),
          time: event.time || '',
          visibility: event.visibility || 'private',
          familyId: event.familyId || undefined,
        }
      : {
          title: '',
          description: '',
          date: defaultDate || toDateInput(new Date()),
          time: '',
          visibility: 'private',
          familyId: undefined,
        },
  });

  const visibility = form.watch('visibility');

  async function onSubmit(data: z.infer<typeof schema>) {
    setLoading(true);
    try {
      const payload: any = {
        ...data,
        description: data.description || null,
        time: data.time || null,
        color,
      };
      if (data.visibility !== 'family') delete payload.familyId;

      if (isEdit && event) {
        await api.calendar.update(event.id, payload);
        toast.success('Событие обновлено');
      } else {
        await api.calendar.create(payload);
        toast.success('Событие создано');
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
        <Label htmlFor="event-title">Название</Label>
        <Input id="event-title" placeholder="Например: День рождения Ани" {...form.register('title')} />
        {form.formState.errors.title && (
          <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="event-date">Дата</Label>
          <Input id="event-date" type="date" className="[color-scheme:light_dark]" {...form.register('date')} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="event-time">Время</Label>
          <Input id="event-time" type="time" className="[color-scheme:light_dark]" {...form.register('time')} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="event-desc">Описание</Label>
        <Textarea id="event-desc" rows={3} placeholder="Необязательно" {...form.register('description')} />
      </div>

      <div className="space-y-2">
        <Label>Цвет</Label>
        <div className="flex flex-wrap gap-2">
          {palette.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`h-7 w-7 rounded-full border-2 transition-transform ${color === c ? 'scale-110 border-foreground' : 'border-transparent'}`}
              style={{ backgroundColor: c }}
              aria-label={`Цвет ${c}`}
            />
          ))}
        </div>
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
        {loading ? 'Сохранение...' : isEdit ? 'Сохранить' : 'Создать событие'}
      </Button>
    </form>
  );
}
