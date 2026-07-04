import { useState } from 'react';
import { Calendar, Trash2, Edit3, ChevronDown, ChevronRight, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { TaskForm } from './TaskForm';
import type { TaskColumn, Task } from '@/types';
import { cn, formatDate } from '@/lib/utils';

interface Props {
  columns: TaskColumn[];
  assignedTasks?: any[];
  onUpdateTask: (id: string, data: any) => Promise<void>;
  onDeleteTask: (id: string) => Promise<void>;
}

const priorityColors = {
  low: 'text-green-500',
  medium: 'text-yellow-500',
  high: 'text-red-500',
};
const priorityLabels = { low: 'Низкий', medium: 'Средний', high: 'Высокий' };

export function TaskListView({ columns, assignedTasks, onUpdateTask, onDeleteTask }: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const allTasks = Array.isArray(columns)
    ? columns.flatMap((col) =>
        Array.isArray(col.tasks)
          ? col.tasks.map((t) => ({ ...t, columnTitle: col.title, columnColor: col.color }))
          : []
      )
    : [];

  return (
    <div className="space-y-4">
      {assignedTasks && assignedTasks.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-800">
          <CardContent className="p-0">
            <div className="flex items-center gap-2 px-4 py-3 font-semibold text-amber-700 dark:text-amber-400">
              <UserCheck className="h-4 w-4" />
              Назначено мне
              <span className="text-xs text-muted-foreground">{assignedTasks.length}</span>
            </div>
            <div className="divide-y">
              {assignedTasks.map((task: any) => (
                <div key={task.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{task.title}</p>
                      {task.priority && (
                        <Badge variant="outline" className={cn('text-[10px]', priorityColors[task.priority])}>
                          {priorityLabels[task.priority]}
                        </Badge>
                      )}
                    </div>
                    {task.description && <p className="text-xs text-muted-foreground line-clamp-1">{task.description}</p>}
                    {task.assignee && (
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <div className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/20 text-[7px] font-medium text-primary">
                          {task.assignee.name[0]?.toUpperCase()}
                        </div>
                        <span className="text-xs text-muted-foreground/60">от {task.user?.name || task.assignee.name}</span>
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      {columns.map((column) => {
        const isCollapsed = collapsed[column.id];
        return (
          <Card key={column.id}>
            <CardContent className="p-0">
              <button
                className="flex w-full items-center gap-2 px-4 py-3 text-left font-semibold hover:bg-muted/50"
                onClick={() => toggleCollapse(column.id)}
              >
                {isCollapsed ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
                {column.color && (
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: column.color }}
                  />
                )}
                {column.title}
                <span className="text-xs text-muted-foreground">
                  {column.tasks.length}
                </span>
              </button>

              {!isCollapsed && (
                <div className="divide-y">
                  {column.tasks.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                      Нет задач
                    </p>
                  ) : (
                    column.tasks.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30"
                      >
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{task.title}</p>
                            {task.priority && (
                              <Badge
                                variant="outline"
                                className={cn('text-[10px]', priorityColors[task.priority])}
                              >
                                {priorityLabels[task.priority]}
                              </Badge>
                            )}
                          </div>
                          {task.description && (
                            <p className="text-xs text-muted-foreground line-clamp-1">
                              {task.description}
                            </p>
                          )}
                          {task.assignee && (
                            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              <div className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary/20 text-[6px] font-medium text-primary">
                                {task.assignee.name[0]?.toUpperCase()}
                              </div>
                              {task.assignee.name}
                            </span>
                          )}
                          {task.dueDate && (
                            <span
                              className={cn(
                                'flex items-center gap-1 text-[10px]',
                                new Date(task.dueDate) < new Date()
                                  ? 'text-destructive'
                                  : 'text-muted-foreground'
                              )}
                            >
                              <Calendar className="h-3 w-3" />
                              {formatDate(task.dueDate)}
                            </span>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <Edit3 className="h-3.5 w-3.5" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Редактировать задачу</DialogTitle>
                              </DialogHeader>
                              <TaskForm
                                columns={columns}
                                defaultColumnId={task.columnId}
                                onSubmit={async (data) => {
                                  await onUpdateTask(task.id, data);
                                }}
                              />
                            </DialogContent>
                          </Dialog>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => onDeleteTask(task.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
