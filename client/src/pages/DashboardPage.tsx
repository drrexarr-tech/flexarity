import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  BookOpen, CheckSquare, Users, MessageSquare, StickyNote, PiggyBank, Gift,
  CalendarDays, ShoppingCart, ArrowRight, Cake, Check, ListTodo, TrendingUp,
} from 'lucide-react';
import { LuxuryBackdrop } from '@/components/dashboard/LuxuryBackdrop';
import { RevealGroup, RevealItem, StatTile } from '@/components/dashboard/Motion';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Plan, ShoppingItem, Task, UpcomingItem } from '@/types';
import { cn, formatDate, formatMoney, daysUntil } from '@/lib/utils';

const apps = [
  { title: 'Рецепты', icon: BookOpen, path: '/recipes', color: 'from-orange-500 to-red-500' },
  { title: 'Задачи', icon: CheckSquare, path: '/tasks', color: 'from-blue-500 to-indigo-500' },
  { title: 'Заметки', icon: StickyNote, path: '/notes', color: 'from-yellow-500 to-amber-500' },
  { title: 'Планы', icon: PiggyBank, path: '/plans', color: 'from-emerald-500 to-teal-500' },
  { title: 'Хотелки', icon: Gift, path: '/wishes', color: 'from-rose-500 to-pink-500' },
  { title: 'Календарь', icon: CalendarDays, path: '/calendar', color: 'from-cyan-500 to-blue-500' },
  { title: 'Покупки', icon: ShoppingCart, path: '/shopping', color: 'from-lime-500 to-green-500' },
  { title: 'Семья', icon: Users, path: '/family', color: 'from-violet-500 to-purple-500' },
  { title: 'Чаты', icon: MessageSquare, path: '/chats', color: 'from-fuchsia-500 to-pink-500' },
];

const DONE_COLUMN = 'Готово';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Доброй ночи';
  if (hour < 12) return 'Доброе утро';
  if (hour < 18) return 'Добрый день';
  return 'Добрый вечер';
}

function SectionHead({ title, count, onMore, icon }: {
  title: string;
  count?: number;
  onMore?: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <CardHeader className="flex flex-row items-center justify-between p-4 pb-2">
      <CardTitle className="flex items-center gap-2 text-sm font-medium">
        {icon}
        {title}
        {count !== undefined && count > 0 && (
          <Badge variant="secondary" className="text-[10px]">{count}</Badge>
        )}
      </CardTitle>
      {onMore && (
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onMore}>
          Все <ArrowRight className="ml-1 h-3 w-3" />
        </Button>
      )}
    </CardHeader>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 pb-4 text-xs text-muted-foreground">{children}</p>;
}

export function DashboardPage() {
  const navigate = useNavigate();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [shopping, setShopping] = useState<ShoppingItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyItem, setBusyItem] = useState<string | null>(null);

  const load = useCallback(async () => {
    // One failing endpoint must not blank the whole page, so settle them all.
    const [tasksRes, datesRes, plansRes, shoppingRes, unreadRes] = await Promise.allSettled([
      api.tasks.getAll() as Promise<Task[]>,
      api.calendar.getUpcoming(60),
      api.plans.getAll(),
      api.shopping.getAll(),
      api.notifications.getUnreadCount(),
    ]);

    if (tasksRes.status === 'fulfilled' && Array.isArray(tasksRes.value)) setTasks(tasksRes.value);
    if (datesRes.status === 'fulfilled' && Array.isArray(datesRes.value)) setUpcoming(datesRes.value);
    if (plansRes.status === 'fulfilled' && Array.isArray(plansRes.value)) setPlans(plansRes.value);
    if (shoppingRes.status === 'fulfilled' && Array.isArray(shoppingRes.value)) setShopping(shoppingRes.value);
    if (unreadRes.status === 'fulfilled') setUnread(unreadRes.value?.count ?? 0);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // The dashboard is glanced at and left open, so refresh whenever the user
  // comes back to the tab instead of showing whatever was there on mount.
  useEffect(() => {
    const onFocus = () => { void load(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  // Anything with a due date that is not already in the finished column.
  const dueTasks = tasks
    .filter((t) => t.dueDate && t.column?.title !== DONE_COLUMN)
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
    .slice(0, 5);

  const overdueCount = dueTasks.filter((t) => daysUntil(t.dueDate!) < 0).length;

  const pendingShopping = shopping.filter((i) => !i.done);
  const activePlans = plans.filter((p) => p.remaining > 0).slice(0, 3);

  async function toggleItem(item: ShoppingItem) {
    setBusyItem(item.id);
    try {
      await api.shopping.update(item.id, { done: !item.done });
      // Reflect it locally first; the dashboard should feel instant.
      setShopping((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i))
      );
    } catch (err: any) {
      load();
    } finally {
      setBusyItem(null);
    }
  }

  const today = new Date().toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <div className="space-y-4 lg:space-y-6">
      <LuxuryBackdrop />

      <RevealGroup>
        <RevealItem>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="bg-gradient-to-br from-foreground via-foreground to-foreground/55 bg-clip-text text-2xl font-semibold tracking-tight text-transparent lg:text-4xl">
                {greeting()}
              </h1>
              <p className="mt-1.5 text-sm capitalize text-muted-foreground lg:text-base">{today}</p>
            </div>
            {unread > 0 && (
              <Badge
                variant="secondary"
                className="cursor-pointer text-[10px]"
                onClick={() => navigate('/chats')}
              >
                {unread > 9 ? '9+' : unread} новых
              </Badge>
            )}
          </div>
        </RevealItem>

        <RevealItem>
          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <StatTile
              label="Сроки"
              value={dueTasks.length}
              icon={ListTodo}
              accent="linear-gradient(135deg,#3B82F6,#6366F1)"
              hint={overdueCount > 0 ? `Просрочено ${overdueCount}` : 'Ближайшие задачи'}
              onClick={() => navigate('/tasks')}
            />
            <StatTile
              label="Даты"
              value={upcoming.length}
              icon={CalendarDays}
              accent="linear-gradient(135deg,#F59E0B,#EF4444)"
              hint="Ближайшие даты"
              onClick={() => navigate('/calendar')}
            />
            <StatTile
              label="Покупки"
              value={pendingShopping.length}
              icon={ShoppingCart}
              accent="linear-gradient(135deg,#10B981,#14B8A6)"
              hint="Не куплено"
              onClick={() => navigate('/shopping')}
            />
            <StatTile
              label="Планы"
              value={activePlans.length}
              icon={TrendingUp}
              accent="linear-gradient(135deg,#8B5CF6,#6366F1)"
              hint="Активные цели"
              onClick={() => navigate('/plans')}
            />
          </div>
        </RevealItem>

        <RevealItem className="mt-4 lg:mt-6">
          <div className="grid gap-3 lg:grid-cols-2 lg:gap-4">
        {/* Tasks due */}
        <Card>
          <SectionHead
            title="Сроки"
            count={dueTasks.length}
            onMore={() => navigate('/tasks')}
            icon={<ListTodo className="h-4 w-4 text-muted-foreground" />}
          />
          <CardContent className="px-4 pb-4">
            {loading ? (
              <p className="py-3 text-xs text-muted-foreground">Загрузка...</p>
            ) : !dueTasks.length ? (
              <Empty>Ничего не запланировано на сегодня.</Empty>
            ) : (
              <div className="space-y-1">
                {overdueCount > 0 && (
                  <p className="pb-1 text-[11px] font-medium text-destructive">
                    Просрочено: {overdueCount}
                  </p>
                )}
                {dueTasks.map((task) => {
                  const days = daysUntil(task.dueDate!);
                  return (
                    <button
                      key={task.id}
                      onClick={() => navigate('/tasks')}
                      className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-muted/60"
                    >
                      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', days < 0 ? 'bg-destructive' : 'bg-primary')} />
                      <span className="min-w-0 flex-1 truncate text-sm">{task.title}</span>
                      <span className={cn('shrink-0 text-[10px]', days < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                        {days < 0
                          ? `просрочено ${Math.abs(days)} дн.`
                          : days === 0
                            ? 'сегодня'
                            : `${days} дн.`}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming dates */}
        <Card>
          <SectionHead
            title="Ближайшие даты"
            count={upcoming.length}
            onMore={() => navigate('/calendar')}
            icon={<Cake className="h-4 w-4 text-muted-foreground" />}
          />
          <CardContent className="px-4 pb-4">
            {loading ? (
              <p className="py-3 text-xs text-muted-foreground">Загрузка...</p>
            ) : !upcoming.length ? (
              <Empty>В ближайшие два месяца пусто.</Empty>
            ) : (
              <div className="space-y-1">
                {upcoming.slice(0, 5).map((item) => (
                  <button
                    key={`${item.kind}-${item.id}-${item.date}`}
                    onClick={() => navigate('/calendar')}
                    className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-muted/60"
                  >
                    {item.kind === 'birthday' ? (
                      <Cake className="h-3.5 w-3.5 shrink-0 text-pink-500" />
                    ) : (
                      <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm">{item.title}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {formatDate(item.date)}
                      {item.daysLeft > 0 && ` · ${item.daysLeft} дн.`}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Plans progress */}
        <Card>
          <SectionHead
            title="Планы"
            count={activePlans.length}
            onMore={() => navigate('/plans')}
            icon={<PiggyBank className="h-4 w-4 text-muted-foreground" />}
          />
          <CardContent className="space-y-3 px-4 pb-4">
            {loading ? (
              <p className="py-3 text-xs text-muted-foreground">Загрузка...</p>
            ) : !activePlans.length ? (
              <Empty>Все цели достигнуты или планов нет.</Empty>
            ) : (
              activePlans.map((plan) => (
                <button
                  key={plan.id}
                  onClick={() => navigate(`/plans/${plan.id}`)}
                  className="block w-full text-left"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm">{plan.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{plan.percent}%</span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${plan.percent}%`, backgroundColor: plan.color || 'hsl(var(--primary))' }}
                    />
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {formatMoney(plan.saved)} из {formatMoney(plan.targetAmount)}
                  </p>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        {/* Shopping quick list */}
        <Card>
          <SectionHead
            title="Купить"
            count={pendingShopping.length}
            onMore={() => navigate('/shopping')}
            icon={<ShoppingCart className="h-4 w-4 text-muted-foreground" />}
          />
          <CardContent className="px-4 pb-4">
            {loading ? (
              <p className="py-3 text-xs text-muted-foreground">Загрузка...</p>
            ) : !pendingShopping.length ? (
              <Empty>Список покупок пуст.</Empty>
            ) : (
              <div className="space-y-0.5">
                {pendingShopping.slice(0, 6).map((item) => (
                  <div key={item.id} className="group flex items-center gap-2 rounded-md px-1 py-0.5">
                    <button
                      onClick={() => toggleItem(item)}
                      disabled={busyItem === item.id}
                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 border-muted-foreground/40 transition-colors hover:border-primary"
                      aria-label="Отметить купленным"
                    >
                      <Check className="h-2.5 w-2.5 text-transparent" />
                    </button>
                    <button
                      onClick={() => navigate('/shopping')}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <span className="truncate text-sm">{item.title}</span>
                      {item.price != null && (
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {formatMoney(item.price)}
                        </span>
                      )}
                    </button>
                  </div>
                ))}
                {pendingShopping.length > 6 && (
                  <p className="pt-1 text-[10px] text-muted-foreground">
                    и ещё {pendingShopping.length - 6}...
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
          </div>
        </RevealItem>

        <RevealItem>
          <div className="mt-4 lg:mt-6">
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">Приложения</h2>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
              {apps.map((app) => (
                <motion.button
                  key={app.path}
                  onClick={() => navigate(app.path)}
                  whileHover={{ y: -3 }}
                  whileTap={{ scale: 0.97 }}
                  transition={{ type: 'spring', stiffness: 340, damping: 22 }}
                  className="group flex flex-col items-center gap-1.5 rounded-xl border bg-card/60 p-2.5 backdrop-blur-sm transition-colors hover:border-primary/40"
                >
                  <span className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br shadow-sm ${app.color}`}>
                    <app.icon className="h-4 w-4 text-white" />
                  </span>
                  <span className="w-full truncate text-center text-[10px] font-medium">{app.title}</span>
                </motion.button>
              ))}
            </div>
          </div>
        </RevealItem>
      </RevealGroup>
    </div>
  );
}