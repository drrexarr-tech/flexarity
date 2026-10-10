import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { Plus, UserCheck } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import type { TaskColumn, Task } from '@/types';

function ColumnDropArea({ column, children }: { column: TaskColumn; children: React.ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({ id: `column-${column.id}` });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex w-[85vw] sm:w-80 shrink-0 flex-col rounded-xl border bg-muted/30 transition-colors',
        isOver && 'bg-primary/5 border-primary/50'
      )}
    >
      {children}
    </div>
  );
}

function AssignedDropArea({ children }: { children: React.ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({ id: 'assigned-column' });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'w-[85vw] sm:w-80 shrink-0 flex-col rounded-xl border bg-amber-50 dark:bg-amber-950/20',
        isOver && 'bg-primary/5 border-primary/50'
      )}
    >
      {children}
    </div>
  );
}

interface Props {
  columns: TaskColumn[];
  assignedTasks?: any[];
  onCreateTask: (data: any) => Promise<void>;
  onUpdateTask: (id: string, data: any) => Promise<void>;
  onDeleteTask: (id: string) => Promise<void>;
  onReorder: (items: { id: string; order: number; columnId: string }[]) => Promise<void>;
  onRefresh: () => Promise<void>;
}

export function KanbanBoard({ columns, assignedTasks, onCreateTask, onUpdateTask, onDeleteTask, onReorder, onRefresh }: Props) {
  const [localColumns, setLocalColumns] = useState<TaskColumn[]>(Array.isArray(columns) ? columns : []);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [createDialog, setCreateDialog] = useState<string | null>(null);

  /**
   * Where each task sat before it was checked off.
   *
   * A task moved to "Готово" disappears from the column it left, so its card
   * unmounts and any state kept on the card is gone. Unchecking it later used
   * to fall back to the first non-done column, which is wrong whenever the task
   * started further along. The board outlives the card, so it keeps the map.
   */
  const [restoreColumns, setRestoreColumns] = useState<Record<string, string>>({});

  const rememberColumn = useCallback((taskId: string, columnId: string) => {
    setRestoreColumns((prev) => (prev[taskId] === columnId ? prev : { ...prev, [taskId]: columnId }));
  }, []);

  // A dragged task also changes column; record it so an uncheck still restores
  // somewhere sensible.
  const rememberColumnFor = useCallback(
    (taskId: string, fromColumnId: string | undefined, toColumnId: string) => {
      if (!fromColumnId || fromColumnId === toColumnId) return;
      const done = localColumns.find((c) => c.id === toColumnId && c.title === 'Готово');
      if (done) rememberColumn(taskId, fromColumnId);
    },
    [localColumns, rememberColumn]
  );

  const assignedTaskIds = useMemo(() => (assignedTasks || []).map((t: any) => t.id), [assignedTasks]);

  useEffect(() => {
    setLocalColumns(columns);
  }, [columns]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  function findColumn(id: string): TaskColumn | undefined {
    for (const col of localColumns) {
      if (col.id === id) return col;
      if (col.tasks.some((t) => t.id === id)) return col;
    }
    return undefined;
  }

  function isAssignedTask(id: string) {
    return assignedTasks?.some((t: any) => t.id === id);
  }

  function handleDragStart(event: DragStartEvent) {
    const { active } = event;
    if (isAssignedTask(active.id as string)) {
      const task = assignedTasks?.find((t: any) => t.id === active.id);
      if (task) setActiveTask(task);
      return;
    }
    const column = findColumn(active.id as string);
    if (column) {
      const task = column.tasks.find((t) => t.id === active.id);
      if (task) setActiveTask(task);
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveTask(null);

    if (!over) return;

    const overStr = over.id as string;
    let overColId: string | null = null;
    if (overStr.startsWith('column-')) {
      overColId = overStr.replace('column-', '');
    } else if (overStr === 'assigned-column') {
      return;
    } else {
      const col = findColumn(overStr);
      if (col) overColId = col.id;
    }

    if (!overColId) return;

    const activeId = active.id as string;
    const activeCol = findColumn(activeId);

    // Get source column for own tasks, or null for assigned tasks
    const isOwn = activeCol != null;
    const srcColId = activeCol?.id;

    if (srcColId === overColId && activeId === overStr) return;

    const updatedColumns = localColumns.map((col) => ({
      ...col,
      tasks: [...col.tasks],
    }));

    if (isOwn) {
      const srcCol = updatedColumns.find((c) => c.id === srcColId);
      if (!srcCol) return;
      const taskIndex = srcCol.tasks.findIndex((t) => t.id === activeId);
      if (taskIndex < 0) return;
      const [moved] = srcCol.tasks.splice(taskIndex, 1);
      rememberColumnFor(activeId, moved.columnId, overColId);
      moved.columnId = overColId;

      const dstCol = updatedColumns.find((c) => c.id === overColId);
      if (!dstCol) return;

      if (overStr === `column-${overColId}`) {
        dstCol.tasks.push(moved);
      } else {
        const overIndex = dstCol.tasks.findIndex((t) => t.id === overStr);
        dstCol.tasks.splice(overIndex >= 0 ? overIndex : dstCol.tasks.length, 0, moved);
      }

      const items: { id: string; order: number; columnId: string }[] = [];
      updatedColumns.forEach((col) => {
        col.tasks.forEach((t, i) => {
          items.push({ id: t.id, order: i, columnId: col.id });
        });
      });

      setLocalColumns(updatedColumns);
      await onReorder(items);
    } else {
      const task = assignedTasks?.find((t: any) => t.id === activeId);
      if (!task) return;
      rememberColumnFor(activeId, task.columnId, overColId);
      await onUpdateTask(activeId, { columnId: overColId });
    }
    onRefresh();
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {assignedTasks && assignedTasks.length > 0 && (
          <AssignedDropArea>
            <div className="flex items-center gap-2 border-b px-4 py-3">
              <UserCheck className="h-4 w-4 text-amber-600" />
              <h3 className="font-semibold text-sm">Назначено мне</h3>
              <span className="text-xs text-muted-foreground">{assignedTasks.length}</span>
            </div>
            <ScrollArea className="flex-1 p-3">
              <SortableContext items={assignedTaskIds} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {assignedTasks.map((task: any) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      columns={columns}
                      onUpdate={onUpdateTask}
                      onDelete={onDeleteTask}
                      restoreColumnId={restoreColumns[task.id]}
                      onRememberColumn={rememberColumn}
                    />
                  ))}
                </div>
              </SortableContext>
            </ScrollArea>
          </AssignedDropArea>
        )}
        {localColumns.map((column) => (
          <ColumnDropArea key={column.id} column={column}>
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
              <Dialog open={createDialog === column.id} onOpenChange={(o) => setCreateDialog(o ? column.id : null)}>
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
                      await onCreateTask({ ...data, columnId: column.id });
                      setCreateDialog(null);
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
                      restoreColumnId={restoreColumns[task.id]}
                      onRememberColumn={rememberColumn}
                    />
                  ))}
                </div>
              </SortableContext>
            </ScrollArea>
          </ColumnDropArea>
        ))}
      </div>

      <DragOverlay>
        {activeTask && (
          <Card className="w-72 opacity-90 shadow-xl">
            <CardContent className="p-3">
              <p className="text-sm font-medium">{activeTask.title}</p>
            </CardContent>
          </Card>
        )}
      </DragOverlay>
    </DndContext>
  );
}
