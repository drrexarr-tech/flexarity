import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { TaskColumn } from '@/types';

const schema = z.object({
  title: z.string().min(1, 'Название обязательно'),
  description: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  dueDate: z.string().optional(),
  columnId: z.string().min(1, 'Колонка обязательна'),
});

interface Props {
  columns: TaskColumn[];
  onSubmit: (data: any) => Promise<void>;
  defaultColumnId?: string;
}

export function TaskForm({ columns, onSubmit, defaultColumnId }: Props) {
  const [loading, setLoading] = useState(false);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: '',
      description: '',
      priority: undefined,
      dueDate: '',
      columnId: defaultColumnId || columns[0]?.id || '',
    },
  });

  async function handleSubmit(data: z.infer<typeof schema>) {
    setLoading(true);
    try {
      await onSubmit(data);
      form.reset();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="task-title">Название</Label>
        <Input id="task-title" {...form.register('title')} />
        {form.formState.errors.title && (
          <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="task-desc">Описание</Label>
        <Textarea id="task-desc" rows={3} {...form.register('description')} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Приоритет</Label>
          <Select
            value={form.watch('priority') || ''}
            onValueChange={(v) => form.setValue('priority', v as any)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Выберите приоритет" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Низкий</SelectItem>
              <SelectItem value="medium">Средний</SelectItem>
              <SelectItem value="high">Высокий</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Колонка</Label>
          <Select
            value={form.watch('columnId')}
            onValueChange={(v) => form.setValue('columnId', v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Выберите колонку" />
            </SelectTrigger>
            <SelectContent>
              {columns.map((col) => (
                <SelectItem key={col.id} value={col.id}>
                  {col.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="task-due">Срок выполнения</Label>
        <Input id="task-due" type="datetime-local" {...form.register('dueDate')} />
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? 'Создание...' : 'Создать задачу'}
      </Button>
    </form>
  );
}
