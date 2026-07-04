import { useState, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { TaskCard } from './TaskCard';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { TaskForm } from './TaskForm';
import type { TaskColumn, Task } from '@/types';

interface Props {
  columns: TaskColumn[];
  onUpdateTask: (id: string, data: any) => Promise<void>;
  onDeleteTask: (id: string) => Promise<void>;
  onReorder: (items: { id: string; order: number; columnId: string }[]) => Promise<void>;
  onRefresh: () => Promise<void>;
}

export function KanbanBoard({ columns, onUpdateTask, onDeleteTask, onReorder, onRefresh }: Props) {
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  function findColumn(id: string): TaskColumn | undefined {
    if (columns.some((c) => c.id === id)) return columns.find((c) => c.id === id);
    for (const col of columns) {
      if (col.tasks.some((t) => t.id === id)) return col;
    }
    return undefined;
  }

  function handleDragStart(event: DragStartEvent) {
    const { active } = event;
    const column = findColumn(active.id as string);
    if (column) {
      const task = column.tasks.find((t) => t.id === active.id);
      if (task) setActiveTask(task);
    }
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeCol = findColumn(active.id as string);
    const overCol = findColumn(over.id as string);
    if (!activeCol || !overCol || activeCol.id === overCol.id) return;

    const task = activeCol.tasks.find((t) => t.id === active.id);
    if (task) {
      activeCol.tasks = activeCol.tasks.filter((t) => t.id !== active.id);
      overCol.tasks = [...overCol.tasks, { ...task, columnId: overCol.id }];
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveTask(null);

    if (!over) return;

    const activeCol = findColumn(active.id as string);
    const overCol = findColumn(over.id as string);
    if (!activeCol || !overCol) return;

    const task = activeCol.tasks.find((t) => t.id === active.id);
    if (!task) return;

    const newColumnId = overCol.id;
    const items: { id: string; order: number; columnId: string }[] = [];

    const targetTasks = overCol.tasks.map((t) => ({ ...t }));
    const activeIndex = targetTasks.findIndex((t) => t.id === active.id);

    if (over.id === overCol.id) {
      if (activeIndex >= 0) targetTasks.splice(activeIndex, 1);
      targetTasks.push({ ...task, columnId: newColumnId });
    } else {
      const overIndex = targetTasks.findIndex((t) => t.id === over.id);
      if (activeIndex >= 0) targetTasks.splice(activeIndex, 1);
      const newOverIndex = targetTasks.findIndex((t) => t.id === over.id);
      targetTasks.splice(newOverIndex >= 0 ? newOverIndex : targetTasks.length, 0, {
        ...task,
        columnId: newColumnId,
      });
    }

    targetTasks.forEach((t, i) => {
      items.push({ id: t.id, order: i, columnId: t.columnId });
    });

    await onReorder(items);
    onRefresh();
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((column) => (
          <div
            key={column.id}
            className="flex w-[85vw] sm:w-80 shrink-0 flex-col rounded-xl border bg-muted/30"
          >
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2">
                {column.color && (
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: column.color }}
                  />
                )}
                <h3 className="font-semibold">{column.title}</h3>
                <span className="text-xs text-muted-foreground">
                  {column.tasks.length}
                </span>
              </div>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <Plus className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Создать задачу</DialogTitle>
                  </DialogHeader>
                  <TaskForm
                    columns={columns}
                    defaultColumnId={column.id}
                    onSubmit={async (data) => {
                      await onUpdateTask('', { ...data, columnId: column.id });
                    }}
                  />
                </DialogContent>
              </Dialog>
            </div>

            <ScrollArea className="flex-1 p-3">
              <SortableContext
                items={column.tasks.map((t) => t.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {column.tasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      columns={columns}
                      onUpdate={onUpdateTask}
                      onDelete={onDeleteTask}
                    />
                  ))}
                </div>
              </SortableContext>
            </ScrollArea>
          </div>
        ))}
      </div>

      <DragOverlay>
        {activeTask && (
          <Card className="w-72 opacity-90">
            <CardContent className="p-3">
              <p className="text-sm font-medium">{activeTask.title}</p>
            </CardContent>
          </Card>
        )}
      </DragOverlay>
    </DndContext>
  );
}
