import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, Cake, CalendarDays, Trash2, Edit3, Clock,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { CalendarEventForm } from '@/components/calendar/CalendarEventForm';
import { useAuthStore } from '@/stores/authStore';
import type { CalendarEvent, Birthday, UpcomingItem } from '@/types';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function sameDay(a: Date, b: Date) {
  return dateKey(a) === dateKey(b);
}

function shortDate(d: Date) {
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

function fullDate(d: Date) {
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function countdownLabel(days: number) {
  if (days === 0) return 'сегодня';
  if (days === 1) return 'завтра';
  if (days === 2) return 'послезавтра';
  const mod10 = days % 10;
  const mod100 = days % 100;
  if (mod10 === 1 && mod100 !== 11) return `через ${days} день`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `через ${days} дня`;
  return `через ${days} дней`;
}

interface Cell {
  date: Date;
  inMonth: boolean;
}

export function CalendarPage() {
  const currentUser = useAuthStore((s) => s.user);
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState<Date>(today);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [birthdays, setBirthdays] = useState<Birthday[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const cells = useMemo<Cell[]>(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(year, month, 1 - offset);
    return Array.from({ length: 42 }, (_, i) => {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      return { date, inMonth: date.getMonth() === month };
    });
  }, [cursor]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const k = dateKey(new Date(e.date));
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(e);
    }
    return map;
  }, [events]);

  const birthdaysByDay = useMemo(() => {
    const map = new Map<string, Birthday[]>();
    for (const b of birthdays) {
      const k = dateKey(new Date(b.date));
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(b);
    }
    return map;
  }, [birthdays]);

  const load = useCallback(async () => {
    try {
      const from = cells[0].date;
      const to = cells[cells.length - 1].date;
      const [month, up] = await Promise.all([
        api.calendar.getMonth(from.toISOString(), to.toISOString()),
        api.calendar.getUpcoming(120),
      ]);
      setEvents(month.events);
      setBirthdays(month.birthdays);
      setUpcoming(up);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [cells]);

  useEffect(() => { load(); }, [load]);

  function shiftMonth(delta: number) {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));
  }

  function goToday() {
    const now = new Date();
    setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelected(now);
  }

  async function handleDelete() {
    const id = deleteTarget;
    setDeleteTarget(null);
    if (!id) return;
    try {
      await api.calendar.delete(id);
      toast.success('Событие удалено');
      load();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  function openAdd(date?: Date) {
    setEditing(null);
    setFormOpen(true);
    if (date) setSelected(date);
  }

  const selectedKey = dateKey(selected);
  const dayEvents = eventsByDay.get(selectedKey) ?? [];
  const dayBirthdays = birthdaysByDay.get(selectedKey) ?? [];
  const isToday = sameDay(selected, today);

  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Календарь</h1>
          <p className="mt-1 text-sm text-muted-foreground">События и ближайшие даты</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={goToday}>Сегодня</Button>
          <Button size="sm" onClick={() => openAdd(selected)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Событие
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Month grid */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between p-4">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => shiftMonth(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <CardTitle className="text-base lg:text-lg">
              {cursor.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
            </CardTitle>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => shiftMonth(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="p-3 pt-0 lg:p-4 lg:pt-0">
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS.map((w) => (
                <div key={w} className="pb-1 text-center text-[11px] font-medium text-muted-foreground">
                  {w}
                </div>
              ))}

              {cells.map((cell) => {
                const key = dateKey(cell.date);
                const dayEv = eventsByDay.get(key) ?? [];
                const dayBd = birthdaysByDay.get(key) ?? [];
                const isSelected = key === selectedKey;
                const isCurrentMonth = cell.inMonth;
                const isCellToday = sameDay(cell.date, today);

                return (
                  <button
                    key={key}
                    onClick={() => setSelected(cell.date)}
                    className={cn(
                      'flex min-h-[54px] flex-col items-start gap-1 rounded-lg border p-1.5 text-left transition-colors lg:min-h-[68px]',
                      isSelected ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted/60',
                      !isCurrentMonth && 'opacity-40'
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-5 w-5 items-center justify-center rounded-full text-xs',
                        isCellToday && 'bg-primary text-[10px] font-semibold text-primary-foreground'
                      )}
                    >
                      {cell.date.getDate()}
                    </span>

                    <div className="flex w-full flex-wrap gap-0.5">
                      {dayBd.map((b) => (
                        <span
                          key={`b-${b.id}`}
                          className="flex h-4 max-w-full items-center gap-0.5 truncate rounded bg-pink-500/15 px-1 text-[9px] font-medium text-pink-500"
                        >
                          <Cake className="h-2.5 w-2.5 shrink-0" />
                          {b.name.split(' ')[0]}
                        </span>
                      ))}
                      {dayEv.slice(0, 3).map((e) => (
                        <span
                          key={e.id}
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: e.color || 'hsl(var(--primary))' }}
                        />
                      ))}
                      {dayEv.length > 3 && (
                        <span className="text-[9px] leading-none text-muted-foreground">
                          +{dayEv.length - 3}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Selected day */}
        <Card className="lg:col-span-1">
          <CardHeader className="p-4">
            <CardTitle className="text-base">
              {isToday ? 'Сегодня' : fullDate(selected)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0">
            {!dayBirthdays.length && !dayEvents.length && !loading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                На этот день ничего не запланировано
              </p>
            ) : (
              <>
                {dayBirthdays.map((b) => (
                  <div key={b.id} className="flex items-center gap-2 rounded-lg border border-pink-500/30 bg-pink-500/5 px-3 py-2">
                    <Cake className="h-4 w-4 shrink-0 text-pink-500" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{b.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        исполняется {b.age} {(() => {
                          const last = b.age % 10;
                          const hund = b.age % 100;
                          if (last === 1 && hund !== 11) return 'год';
                          if (last >= 2 && last <= 4 && (hund < 10 || hund >= 20)) return 'года';
                          return 'лет';
                        })()}
                      </p>
                    </div>
                  </div>
                ))}

                {dayEvents.map((e) => (
                  <div key={e.id} className="group flex items-start gap-2 rounded-lg border px-3 py-2">
                    <span
                      className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: e.color || 'hsl(var(--primary))' }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{e.title}</p>
                      {e.time && (
                        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Clock className="h-3 w-3" /> {e.time}
                        </p>
                      )}
                      {e.description && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{e.description}</p>
                      )}
                    </div>
                    {e.userId === currentUser?.id && (
                      <div className="flex shrink-0 gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => { setEditing(e); setFormOpen(true); }}
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => setDeleteTarget(e.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}

            <Button variant="outline" size="sm" className="w-full" onClick={() => openAdd(selected)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Добавить на этот день
            </Button>
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* Upcoming */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Ближайшие даты</h2>
        </div>

        {!upcoming.length ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            В ближайшие 4 месяца ничего не запланировано
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((item) => (
              <Card key={`${item.kind}-${item.id}-${item.date}`} className="py-3">
                <CardContent className="flex items-center gap-3 p-3">
                  <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg border">
                    <span className="text-sm font-semibold leading-none">
                      {new Date(item.date).getDate()}
                    </span>
                    <span className="mt-0.5 text-[9px] uppercase text-muted-foreground">
                      {new Date(item.date).toLocaleDateString('ru-RU', { month: 'short' }).replace('.', '')}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                      {item.kind === 'birthday' && <Cake className="h-3.5 w-3.5 shrink-0 text-pink-500" />}
                      {item.title}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {shortDate(new Date(item.date))}
                      {item.time && ` · ${item.time}`}
                      {item.age !== undefined && ` · ${item.age} лет`}
                    </p>
                  </div>

                  <Badge
                    variant={item.daysLeft <= 3 ? 'default' : 'secondary'}
                    className="shrink-0 text-[10px]"
                  >
                    {countdownLabel(item.daysLeft)}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg sm:w-full">
          <DialogHeader>
            <DialogTitle>{editing ? 'Редактировать событие' : 'Новое событие'}</DialogTitle>
          </DialogHeader>
          <CalendarEventForm
            event={editing}
            defaultDate={selectedKey}
            onSuccess={() => { setFormOpen(false); setEditing(null); load(); }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Удалить событие?</DialogTitle>
            <DialogDescription>Это действие нельзя отменить.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Отмена</Button>
            <Button variant="destructive" onClick={handleDelete}>Удалить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
