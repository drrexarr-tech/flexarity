import { useState } from 'react';
import { Trash2, Edit3, GripVertical, Calendar, Check } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { TaskForm } from './TaskForm';
import type { Task, TaskColumn } from '@/types';
import { cn, formatDate } from '@/lib/utils';

interface Props {
  task: Task;
  columns: TaskColumn[];
  onUpdate: (id: string, data: any) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  /** Column to restore to when the task is unchecked, if the board knows it. */
  restoreColumnId?: string;
  /** Report the column a task is leaving, so it can be restored later. */
  onRememberColumn?: (taskId: string, columnId: string) => void;
}

const priorityColors = {
  low: 'bg-green-500/10 text-green-500 border-green-500/20',
  medium: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  high: 'bg-red-500/10 text-red-500 border-red-500/20',
};

const priorityLabels = { low: 'Низкий', medium: 'Средний', high: 'Высокий' };

export function TaskCard({
  task, columns, onUpdate, onDelete, restoreColumnId, onRememberColumn,
}: Props) {
  const currentUser = useAuthStore((s) => s.user);
  const isObserver = task.assignee && task.assignee.id !== currentUser?.id && task.userId === currentUser?.id;
  const [editing, setEditing] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: 'task', task },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date();
  const sorted = [...columns].sort((a, b) => (a.order ?? 99) - (b.order ?? 99));

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn('relative', isDragging && 'opacity-50')}
      // The whole card is the drag surface. It was only the little grip, which
      // is a 20px target you have to find deliberately before you can move a
      // card - and on a phone the rest of the card is the natural place to
      // press. Safe because PointerSensor needs 8px of movement to activate: a
      // tap on the checkbox or on edit still reaches the button underneath.
      {...attributes}
      {...listeners}
      onDoubleClick={() => {
        const editBtn = document.querySelector(`[data-task-id="${task.id}"]`);
        if (editBtn) (editBtn as HTMLButtonElement).click();
      }}
    >
      <CardContent className="p-3">
        <div className="flex items-start gap-2">
          <button
            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-primary/60 transition-colors hover:border-primary"
            onClick={(e) => {
              e.stopPropagation();
              const doneCol = columns.find((c) => c.title === 'Готово');
              if (!doneCol || !task.columnId) return;
              if (task.columnId === doneCol.id) {
                // Where it came from is passed in by the board, because this card
                // unmounts the moment it lands in "Готово" and a ref held here
                // would be gone by the time it is unchecked again.
                const target = restoreColumnId ?? sorted[0]?.id;
                if (target) onUpdate(task.id, { columnId: target });
              } else {
                onRememberColumn?.(task.id, task.columnId);
                onUpdate(task.id, { columnId: doneCol.id });
              }
            }}
          >
            {task.columnId === columns.find((c) => c.title === 'Готово')?.id && (<Check className="h-3 w-3 text-primary" />)}
          </button>
          {/* Now decorative: the card itself drags. Kept as a hint of where a
              card is grabbable, and still a drag handle for anyone who looks
              for one. */}
          <span className="mt-0.5 shrink-0 cursor-grab text-muted-foreground" aria-hidden>
            <GripVertical className="h-4 w-4" />
          </span>
          <div className="flex-1 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium">{task.title}</p>
              <div className="flex gap-1 shrink-0">
                <Dialog open={editing} onOpenChange={setEditing}>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Редактировать задачу" data-task-id={task.id} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                      <Edit3 className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Редактировать задачу</DialogTitle>
                    </DialogHeader>
                    <TaskForm
                      columns={columns}
                      defaultColumnId={task.columnId}
                      task={task}
                      onSubmit={async (data) => {
                        await onUpdate(task.id, data);
                        setEditing(false);
                      }}
                    />
                  </DialogContent>
                </Dialog>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-11 w-11 text-destructive"
                  aria-label="Удалить задачу"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {task.description && (
              <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {task.assignee && (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <div className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/20 text-[7px] font-medium text-primary">
                    {task.assignee.name[0]?.toUpperCase()}
                  </div>
                  {task.assignee.name}
                  {isObserver && <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 text-amber-600 border-amber-300">Наблюдаю</Badge>}
                </span>
              )}
              {task.user && task.user.id !== currentUser?.id && (
                <span className="text-[10px] text-muted-foreground/50">
                  от {task.user.name}
                </span>
              )}
              {task.visibility && task.visibility !== 'private' && (
                <Badge variant="outline" className="text-[10px]">
                  {/* Only two values are left: a task is yours or the family's.
                      The old third case read "Публичный" for anything that
                      was neither, which is a label that no longer means
                      anything. */}
                  Семья
                </Badge>
              )}
              {task.priority && (
                <Badge
                  variant="outline"
                  className={cn('text-[10px]', priorityColors[task.priority])}
                >
                  {priorityLabels[task.priority]}
                </Badge>
              )}
              {task.dueDate && (
                <span
                  className={cn(
                    'flex items-center gap-1 text-[10px]',
                    isOverdue ? 'text-destructive' : 'text-muted-foreground'
                  )}
                >
                  <Calendar className="h-3 w-3" />
                  {formatDate(task.dueDate)}
                </span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
