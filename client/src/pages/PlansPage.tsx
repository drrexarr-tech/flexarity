import { useEffect, useState } from 'react';
import { Plus, Trash2, Edit3, PiggyBank, Target, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { PlanForm } from '@/components/plans/PlanForm';
import type { Plan } from '@/types';
import { formatMoney, daysUntil } from '@/lib/utils';
import toast from 'react-hot-toast';

export function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const navigate = useNavigate();

  async function load() {
    try {
      setPlans(await api.plans.getAll());
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleDelete(id: string) {
    try {
      await api.plans.delete(id);
      setPlans((prev) => prev.filter((p) => p.id !== id));
      toast.success('План удалён');
    } catch (err: any) {
      toast.error(err.message);
    }
    setDeleteTarget(null);
  }

  const totalSaved = plans.reduce((sum, p) => sum + p.saved, 0);
  const totalTarget = plans.reduce((sum, p) => sum + p.targetAmount, 0);
  const overallPercent = totalTarget > 0
    ? Math.max(0, Math.min(100, Math.round((totalSaved / totalTarget) * 100)))
    : 0;

  return (
    <div className="space-y-4 lg:space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Планы</h1>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="mr-1 h-3.5 w-3.5" /> Новый план</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg sm:w-full">
              <DialogHeader>
                <DialogTitle>{editing ? 'Редактировать план' : 'Новый план'}</DialogTitle>
              </DialogHeader>
              <PlanForm
                plan={editing}
                onSuccess={() => {
                  setEditing(null);
                  setDialogOpen(false);
                  load();
                }}
              />
            </DialogContent>
          </Dialog>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Копим на важное и считаем бюджет</p>
      </div>

      {plans.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <PiggyBank className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Всего накоплено</span>
              </div>
              <span className="text-sm font-semibold">{formatMoney(totalSaved)}</span>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${overallPercent}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {overallPercent}% от {formatMoney(totalTarget)}
            </p>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : plans.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-muted-foreground">
          <Target className="mb-3 h-10 w-10" />
          <p className="text-lg">Планов пока нет</p>
          <p className="text-sm">Создайте первую цель</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => {
            const days = plan.deadline ? daysUntil(plan.deadline) : null;
            const overdue = days !== null && days < 0;
            return (
              <Card
                key={plan.id}
                className="group cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => navigate(`/plans/${plan.id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2">
                      <span
                        className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: plan.color || 'hsl(var(--primary))' }}
                      />
                      <h3 className="truncate font-medium">{plan.title}</h3>
                    </div>
                    <div className="flex shrink-0 gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditing(plan);
                          setDialogOpen(true);
                        }}
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(plan.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {plan.description && (
                    <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{plan.description}</p>
                  )}

                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${plan.percent}%`,
                        backgroundColor: plan.color || 'hsl(var(--primary))',
                      }}
                    />
                  </div>

                  <div className="mt-2 flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold">{formatMoney(plan.saved)}</span>
                    <span className="text-xs text-muted-foreground">
                      из {formatMoney(plan.targetAmount)}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="text-[10px]">{plan.percent}%</Badge>
                    {plan.remaining > 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        осталось {formatMoney(plan.remaining)}
                      </span>
                    )}
                    {days !== null && (
                      <span className={`text-[10px] ${overdue ? 'text-destructive' : 'text-muted-foreground'}`}>
                        {overdue
                          ? `срок прошёл ${Math.abs(days)} дн. назад`
                          : days === 0
                            ? 'срок сегодня'
                            : `осталось ${days} дн.`}
                      </span>
                    )}
                    {plan.visibility !== 'private' && (
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Users className="h-3 w-3" />
                        {plan.visibility === 'family' ? 'Семья' : 'Общий'}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Удалить план?</DialogTitle>
            <DialogDescription>Вместе с ним удалятся все записи. Это нельзя отменить.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Отмена</Button>
            <Button variant="destructive" onClick={() => deleteTarget && handleDelete(deleteTarget)}>Удалить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
