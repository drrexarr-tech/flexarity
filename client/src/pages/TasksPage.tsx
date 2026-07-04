import { useEffect, useState, useCallback } from 'react';
import { Plus, List, Columns } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { TaskForm } from '@/components/tasks/TaskForm';
import { KanbanBoard } from '@/components/tasks/KanbanBoard';
import { TaskListView } from '@/components/tasks/TaskListView';
import type { TaskColumn } from '@/types';
import toast from 'react-hot-toast';

export function TasksPage() {
  const [columns, setColumns] = useState<TaskColumn[]>([]);
  const [assignedTasks, setAssignedTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.tasks.getColumns();
      setColumns(data.columns || data);
      setAssignedTasks(data.assignedTasks || []);
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
    try {
      await api.tasks.delete(id);
      toast.success('Задача удалена');
      load();
    } catch (err: any) {
      toast.error(err.message);
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Планировщик задач</h1>
          <p className="text-sm text-muted-foreground lg:text-base">Управляйте своими задачами</p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" /> Новая задача
            </Button>
          </DialogTrigger>
          <DialogContent className="w-[95vw] max-w-md sm:w-full">
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

      <Tabs defaultValue="kanban">
        <div className="overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0">
          <TabsList>
            <TabsTrigger value="kanban">
              <Columns className="mr-2 h-4 w-4" /> Канбан
            </TabsTrigger>
            <TabsTrigger value="list">
              <List className="mr-2 h-4 w-4" /> Список
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="kanban" className="mt-4">
          <div className="-mx-4 px-4 lg:mx-0 lg:px-0">
            <KanbanBoard
              columns={columns}
              assignedTasks={assignedTasks}
              onCreateTask={handleCreateTask}
              onUpdateTask={handleUpdateTask}
              onDeleteTask={handleDeleteTask}
              onReorder={handleReorder}
              onRefresh={load}
            />
          </div>
        </TabsContent>

        <TabsContent value="list" className="mt-4">
          <TaskListView
            columns={columns}
            assignedTasks={assignedTasks}
            onUpdateTask={handleUpdateTask}
            onDeleteTask={handleDeleteTask}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
