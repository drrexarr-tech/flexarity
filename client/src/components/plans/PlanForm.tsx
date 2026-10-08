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
import type { Plan } from '@/types';
import toast from 'react-hot-toast';

const schema = z.object({
  title: z.string().min(1, 'Название обязательно'),
  description: z.string().optional(),
  targetAmount: z.coerce.number().min(0, 'Сумма не может быть отрицательной'),
  deadline: z.string().optional(),
  visibility: z.enum(['private', 'family', 'public']).default('private'),
  familyId: z.string().optional(),
});

const palette = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f97316', '#eab308', '#22c55e', '#06b6d4',
];

interface Props {
  plan?: Plan | null;
  onSuccess: () => void;
}

export function PlanForm({ plan, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [families, setFamilies] = useState<any[]>([]);
  const [color, setColor] = useState(plan?.color || palette[0]);
  const isEdit = !!plan;

  useEffect(() => {
    api.family.getAll().then(setFamilies).catch(() => {});
  }, []);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: plan
      ? {
          title: plan.title,
          description: plan.description || '',
          targetAmount: plan.targetAmount || 0,
          deadline: plan.deadline ? plan.deadline.slice(0, 10) : '',
          visibility: plan.visibility || 'private',
          familyId: plan.familyId || undefined,
        }
      : {
          title: '',
          description: '',
          targetAmount: 0,
          deadline: '',
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
        deadline: data.deadline || null,
        color,
      };
      if (data.visibility !== 'family') delete payload.familyId;

      if (isEdit && plan) {
        await api.plans.update(plan.id, payload);
        toast.success('План обновлён');
      } else {
        await api.plans.create(payload);
        toast.success('План создан');
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
        <Label htmlFor="plan-title">Название</Label>
        <Input id="plan-title" placeholder="Например: Отпуск летом" {...form.register('title')} />
        {form.formState.errors.title && (
          <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="plan-desc">Описание</Label>
        <Textarea id="plan-desc" rows={3} placeholder="Зачем нужна эта цель" {...form.register('description')} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="plan-target">Цель (₽)</Label>
          <Input id="plan-target" type="number" min={0} {...form.register('targetAmount')} />
          {form.formState.errors.targetAmount && (
            <p className="text-xs text-destructive">{form.formState.errors.targetAmount.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="plan-deadline">Срок</Label>
          <Input id="plan-deadline" type="date" className="[color-scheme:light_dark]" {...form.register('deadline')} />
        </div>
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
        {loading ? 'Сохранение...' : isEdit ? 'Сохранить' : 'Создать план'}
      </Button>
    </form>
  );
}
