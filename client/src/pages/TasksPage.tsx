import { useEffect, useState, useCallback } from 'react';
import { useSingleFlight } from '@/lib/useSingleFlight';
import { Plus, List, Columns } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { TaskForm } from '@/components/tasks/TaskForm';
import { KanbanBoard } from '@/components/tasks/KanbanBoard';
import { TaskListView } from '@/components/tasks/TaskListView';
import { Fab } from '@/components/ui/fab';
import type { TaskColumn } from '@/types';
import toast from 'react-hot-toast';

export function TasksPage() {
  const run = useSingleFlight();
  const [columns, setColumns] = useState<TaskColumn[]>([]);
  const [assignedTasks, setAssignedTasks] = useState<any[]>([]);
  const [familyTasks, setFamilyTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.tasks.getColumns();
      setColumns(Array.isArray(data.columns) ? data.columns : Array.isArray(data) ? data : []);
      setAssignedTasks(Array.isArray(data.assignedTasks) ? data.assignedTasks : []);
      setFamilyTasks(Array.isArray(data.familyTasks) ? data.familyTasks : []);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreateTask(data: any) {
    try {
      await api.tasks.create(data);
      toast.success('Задача создана');
      load();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function handleUpdateTask(id: string, data: any) {
    try {
      await api.tasks.update(id, data);
      load();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function handleDeleteTask(id: string) {
    // No confirmation step: the tap deletes. run() is the double-tap guard.
    try {
      await run(id, async () => {
        await api.tasks.delete(id);
        toast.success('Задача удалена');
      });
    } catch (err: any) {
      // 404 means it is already gone, which is the outcome that was asked for.
      // Showing "Задача не найдена" for that is noise, and a stale list kept a
      // row that had in fact been removed - which is where the confusing
      // "deleted, came back, error" report came from.
      if (err?.status === 404) {
        toast.success('Задача удалена');
      } else {
        toast.error(err?.message || 'Не удалось удалить задачу');
      }
    } finally {
      // Exactly one refresh, whatever happened. Refreshing before the request
      // and again in the catch made the row jump out and back.
      await load();
    }
  }


  async function handleReorder(items: { id: string; order: number; columnId: string }[]) {
    try {
      await api.tasks.reorder(items);
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Планировщик задач</h1>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-1 h-3.5 w-3.5" /> Новая задача
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-md sm:w-full">
            <DialogHeader>
              <DialogTitle>Создать задачу</DialogTitle>
            </DialogHeader>
            <TaskForm
              columns={columns}
              onSubmit={async (data) => {
                await handleCreateTask(data);
                setCreateDialogOpen(false);
              }}
            />
          </DialogContent>
        </Dialog>
      </div>
      </div>
      <p className="text-sm text-muted-foreground">Управляйте своими задачами</p>

      {/* List first and default. The board is a horizontally scrolling strip that
          was the landing tab, so the phone opened on something you have to
          swipe sideways to read. Kanban now sits below it. */}
      <Tabs defaultValue="list">
        <div className="overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0">
          <TabsList>
            <TabsTrigger value="list">
              <List className="mr-2 h-4 w-4" /> Список
            </TabsTrigger>
            <TabsTrigger value="kanban">
              <Columns className="mr-2 h-4 w-4" /> Канбан
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="list" className="mt-4">
          <TaskListView
            columns={columns}
            assignedTasks={assignedTasks}
            familyTasks={familyTasks}
            onUpdateTask={handleUpdateTask}
            onDeleteTask={handleDeleteTask}
          />
        </TabsContent>

        <TabsContent value="kanban" className="mt-4">
          <div className="-mx-4 px-4 lg:mx-0 lg:px-0">
            <KanbanBoard
              columns={columns}
              assignedTasks={assignedTasks}
            familyTasks={familyTasks}
              onCreateTask={handleCreateTask}
              onUpdateTask={handleUpdateTask}
              onDeleteTask={handleDeleteTask}
              onReorder={handleReorder}
              onRefresh={load}
            />
          </div>
        </TabsContent>
      </Tabs>

      <Fab onClick={() => setCreateDialogOpen(true)} label="Новая задача" />

    </div>
  );
}
