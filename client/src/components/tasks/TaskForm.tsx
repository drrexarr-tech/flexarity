import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import type { Task, TaskColumn } from '@/types';

const schema = z.object({
  title: z.string().min(1, 'Название обязательно'),
  description: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  dueDate: z.string().optional(),
  columnId: z.string().min(1, 'Колонка обязательна'),
  visibility: z.enum(['private', 'family', 'public']).default('private'),
  familyId: z.string().optional(),
  assigneeId: z.string().optional(),
});

interface Props {
  columns: TaskColumn[];
  onSubmit: (data: any) => Promise<void>;
  defaultColumnId?: string;
  task?: Task | null;
}

export function TaskForm({ columns, onSubmit, defaultColumnId, task }: Props) {
  const [loading, setLoading] = useState(false);
  const [families, setFamilies] = useState<any[]>([]);
  const [familyMembers, setFamilyMembers] = useState<any[]>([]);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    api.family.getAll().then(async (fams) => {
      setFamilies(fams);
      const allMembers: any[] = [];
      for (const f of fams) {
        if (f.members) allMembers.push(...f.members.map((m: any) => ({ ...m.user, familyName: f.name })));
      }
      setFamilyMembers(allMembers);
    }).catch(() => {});
  }, []);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: task
      ? {
          title: task.title,
          description: task.description || '',
          priority: task.priority || undefined,
          dueDate: task.dueDate ? task.dueDate.slice(0, 16) : '',
          columnId: task.columnId,
          visibility: task.visibility || 'private',
          familyId: task.familyId || undefined,
          assigneeId: task.assigneeId || (task.assignee?.id) || undefined,
        }
      : {
          title: '',
          description: '',
          priority: undefined,
          dueDate: '',
          columnId: defaultColumnId || columns[0]?.id || '',
          visibility: 'private',
          familyId: undefined,
          assigneeId: user?.id || undefined,
        },
  });

  const visibility = form.watch('visibility');

  async function handleSubmit(data: z.infer<typeof schema>) {
    setLoading(true);
    try {
      const payload: any = { ...data };
      if (data.visibility !== 'family') delete payload.familyId;
      await onSubmit(payload);
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

      <div className="space-y-2">
        <Label>Исполнитель</Label>
        <Select
          value={form.watch('assigneeId') || ''}
          onValueChange={(v) => form.setValue('assigneeId', v || undefined)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Выберите исполнителя" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={user?.id || ''}>Я ({user?.name})</SelectItem>
            {familyMembers
              .filter((m: any) => m.id !== user?.id)
              .map((m: any) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name} ({m.familyName})
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
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
        {loading ? 'Сохранение...' : task ? 'Сохранить' : 'Создать задачу'}
      </Button>
    </form>
  );
}
