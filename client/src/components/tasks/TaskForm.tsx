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
  visibility: z.enum(['private', 'family']).default('private'),
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
          visibility: task.visibility === ('public' as string) ? 'private' : task.visibility || 'private',
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

  /**
   * The due date used to derive the checkbox from the field: checked={!dueDate},
   * with onChange writing '' or undefined. Both are falsy, so !dueDate was true
   * either way - the box could not be unticked, and because the date input was
   * disabled whenever the field was empty, a due date could not be entered on a
   * new task at all. The checkbox now owns its own state and writes the field.
   */
  const [noDueDate, setNoDueDate] = useState(!task?.dueDate);

  function defaultDueDateValue(): string {
    const d = new Date();
    d.setHours(18, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  async function handleSubmit(data: z.infer<typeof schema>) {
    setLoading(true);
    try {
      const payload: any = { ...data };
      // Send null rather than dropping the key. Omitting it means "leave
      // unchanged" to the server, so clearing a due date used to save and then
      // reappear on the next load.
      if (!payload.dueDate) payload.dueDate = null;
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
            <SelectItem value={user?.id || ''}>{user?.name}</SelectItem>
            {familyMembers
              .filter((m: any) => m.id !== user?.id)
              .map((m: any) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
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
        <div className="flex items-center gap-2">
          <Label htmlFor="task-due">Срок выполнения</Label>
          <label className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={noDueDate}
              onChange={(e) => {
                const checked = e.target.checked;
                setNoDueDate(checked);
                // Turning the box on clears the date; turning it off has to put
                // one in, or the field below stays disabled and empty.
                form.setValue('dueDate', checked ? '' : defaultDueDateValue());
              }}
            />
            Без срока
          </label>
        </div>
        <Input
          id="task-due"
          type="datetime-local"
          {...form.register('dueDate')}
          disabled={noDueDate}
        />
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

      {/* Sticky: the form is seven blocks tall on a phone, and the button used to
            be the one thing off-screen - the sheet scrolls, but with the submit out
            of sight it reads as "stuck, will not scroll".
            Note the braces: a // comment inside JSX is a text node, not a comment,
            and it was being rendered into the form as visible prose. */}
        <Button type="submit" className="sticky bottom-0 z-10 w-full bg-background" disabled={loading}>
        {loading ? 'Сохранение...' : task ? 'Сохранить' : 'Создать задачу'}
      </Button>
    </form>
  );
}
