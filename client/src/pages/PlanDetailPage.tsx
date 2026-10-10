import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Trash2, Edit3, Plus, TrendingUp, TrendingDown, Users, X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PlanForm } from '@/components/plans/PlanForm';
import { useAuthStore } from '@/stores/authStore';
import type { Plan } from '@/types';
import { formatMoney, formatDate, daysUntil, cn } from '@/lib/utils';
import toast from 'react-hot-toast';

export function PlanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [entryOpen, setEntryOpen] = useState(false);
  const [entryType, setEntryType] = useState<'income' | 'expense'>('income');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [savingEntry, setSavingEntry] = useState(false);
  const [deleteEntryId, setDeleteEntryId] = useState<string | null>(null);

  async function load() {
    if (!id) return;
    try {
      setPlan(await api.plans.getById(id));
    } catch (err: any) {
      toast.error(err.message);
      navigate('/plans');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  async function handleDelete() {
    if (!plan) return;
    try {
      await api.plans.delete(plan.id);
      toast.success('План удалён');
      navigate('/plans');
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  function openEntry(type: 'income' | 'expense') {
    setEntryType(type);
    setAmount('');
    setNote('');
    setDate(new Date().toISOString().slice(0, 10));
    setEntryOpen(true);
  }

  async function handleAddEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!plan) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error('Введите сумму больше нуля');
      return;
    }
    setSavingEntry(true);
    try {
      await api.plans.addEntry(plan.id, {
        amount: Math.round(value),
        type: entryType,
        note: note || undefined,
        date: date || undefined,
      });
      setEntryOpen(false);
      load();
      toast.success(entryType === 'income' ? 'Пополнение добавлено' : 'Трата добавлена');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingEntry(false);
    }
  }

  async function handleDeleteEntry(entryId: string) {
    if (!plan) return;
    const id = entryId;
    setDeleteEntryId(null);
    try {
      await api.plans.deleteEntry(plan.id, id);
      load();
      toast.success('Запись удалена');
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

  if (!plan) return null;

  const days = plan.deadline ? daysUntil(plan.deadline) : null;
  const overdue = days !== null && days < 0;
  const accent = plan.color || 'hsl(var(--primary))';

  return (
    <div className="mx-auto max-w-3xl space-y-4 lg:space-y-6">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/plans')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Назад
        </Button>
        {plan.canEdit ? (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Edit3 className="mr-2 h-4 w-4" /> Изменить
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="mr-2 h-4 w-4" /> Удалить
            </Button>
          </div>
        ) : (
          <Badge variant="outline">
            <Users className="mr-1 h-3 w-3" /> Только просмотр
          </Badge>
        )}
      </div>

      <Card>
        <CardContent className="p-4 lg:p-6">
          <div className="flex items-start gap-2">
            <span className="mt-2 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: accent }} />
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">{plan.title}</h1>
              {plan.description && (
                <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
              )}
            </div>
          </div>

          <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${plan.percent}%`, backgroundColor: accent }}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-2xl font-bold" style={{ color: accent }}>
              {formatMoney(plan.saved)}
            </span>
            <span className="text-sm text-muted-foreground">из {formatMoney(plan.targetAmount)}</span>
            <Badge variant="secondary">{plan.percent}%</Badge>
          </div>

          {plan.remaining > 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
              Осталось накопить {formatMoney(plan.remaining)}
            </p>
          )}

          {days !== null && (
            <p className={cn('mt-2 text-sm', overdue ? 'text-destructive' : 'text-muted-foreground')}>
              {overdue
                ? `Срок прошёл ${Math.abs(days)} дн. назад`
                : days === 0
                  ? 'Срок сегодня'
                  : `До срока ${days} дн. (${formatDate(plan.deadline!)})`}
            </p>
          )}

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5" /> Пополнения
              </div>
              <p className="mt-1 text-lg font-semibold">{formatMoney(plan.income)}</p>
            </div>
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <TrendingDown className="h-3.5 w-3.5" /> Траты
              </div>
              <p className="mt-1 text-lg font-semibold">{formatMoney(plan.expense)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => openEntry('income')}>
          <TrendingUp className="mr-2 h-4 w-4" /> Отложить
        </Button>
        <Button variant="outline" onClick={() => openEntry('expense')}>
          <TrendingDown className="mr-2 h-4 w-4" /> Потратить
        </Button>
      </div>

      <Separator />

      <div>
        <h2 className="mb-3 text-lg font-semibold">
          История {plan.entries?.length ? `(${plan.entries.length})` : ''}
        </h2>
        {!plan.entries?.length ? (
          <div className="flex flex-col items-center py-12 text-muted-foreground">
            <p className="text-sm">Записей пока нет</p>
            <p className="text-xs">Добавьте первое пополнение или трату</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {plan.entries.map((entry) => {
              const isIncome = entry.type === 'income';
              const mine = entry.userId === currentUser?.id;
              return (
                <div key={entry.id} className="group flex items-center gap-3 rounded-lg border px-3 py-2">
                  <div
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                      isIncome ? 'bg-green-500/10' : 'bg-destructive/10'
                    )}
                  >
                    {isIncome
                      ? <TrendingUp className="h-4 w-4 text-green-500" />
                      : <TrendingDown className="h-4 w-4 text-destructive" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      {entry.note || (isIncome ? 'Пополнение' : 'Трата')}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatDate(entry.date)}
                      {!mine && entry.user && ` · ${entry.user.name}`}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 text-sm font-semibold tabular-nums',
                      isIncome ? 'text-green-500' : 'text-destructive'
                    )}
                  >
                    {isIncome ? '+' : '−'}{formatMoney(entry.amount)}
                  </span>
                  {mine && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-destructive opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                      onClick={() => setDeleteEntryId(entry.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg sm:w-full">
          <DialogHeader>
            <DialogTitle>Редактировать план</DialogTitle>
          </DialogHeader>
          <PlanForm plan={plan} onSuccess={() => { setEditOpen(false); load(); }} />
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Удалить план?"
        description="Вместе с ним удалятся все записи. Это нельзя отменить."
        onConfirm={async () => { await handleDelete(); }}
      />

      <ConfirmDialog
        className="max-w-sm"
        open={!!deleteEntryId}
        onOpenChange={(next) => { if (!next) setDeleteEntryId(null); }}
        title="Удалить запись?"
        description="Это действие нельзя отменить."
        onConfirm={async () => { if (deleteEntryId) await handleDeleteEntry(deleteEntryId); }}
      />

      <Dialog open={entryOpen} onOpenChange={setEntryOpen}>
        <DialogContent className="max-w-sm sm:w-full">
          <form onSubmit={handleAddEntry}>
            <DialogHeader>
              <DialogTitle>{entryType === 'income' ? 'Отложить деньги' : 'Записать трату'}</DialogTitle>
              <DialogDescription>
                {entryType === 'income'
                  ? 'Пополнение увеличит накопленное'
                  : 'Трата уменьшит накопленное'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Тип</Label>
                <Select value={entryType} onValueChange={(v) => setEntryType(v as 'income' | 'expense')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="income">Пополнение</SelectItem>
                    <SelectItem value="expense">Трата</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="entry-amount">Сумма (₽)</Label>
                <Input
                  id="entry-amount"
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  autoFocus
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="entry-note">Заметка</Label>
                <Input
                  id="entry-note"
                  placeholder="Необязательно"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="entry-date">Дата</Label>
                <DatePicker id="entry-date" value={date} onChange={setDate} />
              </div>
            </div>

            <DialogFooter className="flex gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setEntryOpen(false)}>Отмена</Button>
              <Button type="submit" disabled={savingEntry}>
                {savingEntry ? 'Сохранение...' : 'Добавить'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
