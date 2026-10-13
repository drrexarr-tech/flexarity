import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ShoppingCart, Plus, Trash2, Check, X, Pencil, Eraser, ChevronDown,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuthStore } from '@/stores/authStore';
import type { ShoppingItem } from '@/types';
import { formatMoney, cn } from '@/lib/utils';
import toast from 'react-hot-toast';

// "Хозтовары" and "Для дома" were the same shelf split across two labels, and
// splitting "Лекарства" away from the pharmacy it is bought at only made the
// list longer. Categories are free-form on the server, so existing rows keep
// whatever they were tagged with and still render under their own group.
const CATEGORIES = ['Продукты', 'Аптека', 'Хозтовары', 'Гигиена', 'Другое'];
const UNITS = ['шт', 'кг', 'г', 'л', 'мл', 'уп'];

/**
 * Items already in the database carry the old labels. Merging the categories
 * without this would leave the list showing "Для дома" and "Хозтовары" as two
 * separate groups, which is the thing being removed. Read-side only: the stored
 * value is left alone, so nothing is rewritten under the user.
 */
const LEGACY_CATEGORIES: Record<string, string> = {
  'Напитки': 'Продукты',
  'Лекарства': 'Аптека',
  'Для дома': 'Хозтовары',
};

function normaliseCategory(value: string | null | undefined): string {
  if (!value) return 'Другое';
  return LEGACY_CATEGORIES[value] ?? value;
}

export function ShoppingPage() {
  const currentUser = useAuthStore((s) => s.user);
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [quick, setQuick] = useState('');
  const quickInputRef = useRef<HTMLInputElement>(null);
  const [quickCategory, setQuickCategory] = useState<string>('Продукты');
  const [familyId, setFamilyId] = useState<string>('');
  const [families, setFamilies] = useState<any[]>([]);
  const [adding, setAdding] = useState(false);
  const [showDone, setShowDone] = useState(true);

  const [editing, setEditing] = useState<ShoppingItem | null>(null);
// No confirmation step any more, so the guard is all that stands between a
// double tap and two DELETEs. Per id, so removing one row does not block
// removing the next while the first is in flight.
const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
const [clearing, setClearing] = useState(false);

  const [formTitle, setFormTitle] = useState('');
  const [formQty, setFormQty] = useState('');
  const [formUnit, setFormUnit] = useState('шт');
  const [formPrice, setFormPrice] = useState('');
  const [formCategory, setFormCategory] = useState('Продукты');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await api.shopping.getAll());
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.family.getAll().then((f) => {
      setFamilies(f);
      if (f.length) setFamilyId(f[0].id);
    }).catch(() => {});
  }, []);

  async function quickAdd() {
    const title = quick.trim();
    if (!title || adding) return;
    setAdding(true);
    try {
      await api.shopping.create({ title, category: quickCategory, familyId: familyId || undefined });
      setQuick('');
      // Put the keyboard away once the item is in. Leaving it up covers the
      // list the item was just added to, and the field empties anyway - so the
      // next item is added by tapping the field again, not by a keyboard that
      // is blocking the result.
      quickInputRef.current?.blur();
      load();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setAdding(false);
    }
  }

  async function toggleDone(item: ShoppingItem) {
    try {
      await api.shopping.update(item.id, { done: !item.done });
      load();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function handleDelete(id: string) {
    if (deletingIds.has(id)) return;
    setDeletingIds((prev) => new Set(prev).add(id));
    try {
      await api.shopping.delete(id);
      await load();
      toast.success('Товар удалён');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function handleClearDone() {
    if (clearing) return;
    setClearing(true);
    try {
      const { removed } = await api.shopping.clearDone();
      await load();
      toast.success(removed ? `Удалено позиций: ${removed}` : 'Купленного пока нет');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setClearing(false);
    }
  }

  function openEdit(item: ShoppingItem) {
    setFormTitle(item.title);
    setFormQty(item.quantity != null ? String(item.quantity) : '');
    setFormUnit(item.unit || 'шт');
    setFormPrice(item.price != null ? String(item.price) : '');
    setFormCategory(item.category || 'Другое');
    setEditing(item);
  }

  async function handleSaveEdit() {
    if (!editing || !formTitle.trim()) return;
    setSaving(true);
    try {
      await api.shopping.update(editing.id, {
        title: formTitle.trim(),
        quantity: formQty ? Number(formQty) : null,
        unit: formUnit || null,
        price: formPrice ? Number(formPrice) : null,
        category: formCategory,
      });
      setEditing(null);
      load();
      toast.success('Сохранено');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  const pending = useMemo(() => items.filter((i) => !i.done), [items]);
  const bought = useMemo(() => items.filter((i) => i.done), [items]);

  const visiblePending = useMemo(() => {
    if (filter === 'all') return pending;
    if (filter === 'mine') return pending.filter((i) => i.userId === currentUser?.id);
    return pending.filter((i) => normaliseCategory(i.category) === filter);
  }, [pending, filter, currentUser]);

  const grouped = useMemo(() => {
    const map = new Map<string, ShoppingItem[]>();
    for (const item of visiblePending) {
      const key = normaliseCategory(item.category);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ru'));
  }, [visiblePending]);

  const totalEstimate = visiblePending.reduce((s, i) => s + (i.price ?? 0), 0);
  const boughtTotal = bought.reduce((s, i) => s + (i.price ?? 0), 0);

  const tabs = useMemo(() => {
    const used = new Set(items.map((i) => normaliseCategory(i.category)));
    return ['all', 'mine', ...CATEGORIES.filter((c) => used.has(c))];
  }, [items]);

  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Список покупок</h1>
          <p className="mt-1 text-sm text-muted-foreground">Общий список для всей семьи</p>
        </div>
        <div className="flex gap-2">
          {bought.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => { void handleClearDone(); }}>
              <Eraser className="mr-1 h-3.5 w-3.5" /> Очистить купленное
            </Button>
          )}
        </div>
      </div>

      {/* Quick add */}
      <Card>
        <CardContent className="p-3">
          <div className="flex gap-2">
            <Input
              ref={quickInputRef}
              value={quick}
              onChange={(e) => setQuick(e.target.value)}
              onKeyDown={(e) => {
                // Still useful with a hardware keyboard, but the software
                // keyboard on iOS has no Enter key, so the hint used to name a
                // key the installed app cannot press. The button does the job.
                if (e.key === 'Enter') {
                  e.preventDefault();
                  quickAdd();
                }
              }}
              placeholder="Что купить?"
              inputMode="text"
              enterKeyHint="done"
              disabled={adding}
            />
            <Button onClick={quickAdd} disabled={adding || !quick.trim()}>
              <Plus className="mr-1 h-4 w-4" /> Добавить
            </Button>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Select value={quickCategory} onValueChange={setQuickCategory}>
              <SelectTrigger className="h-8 w-[150px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {families.length > 0 && (
              <Select value={familyId} onValueChange={setFamilyId}>
                <SelectTrigger className="h-8 w-[150px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Только я</SelectItem>
                  {families.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      {tabs.length > 2 && (
        <div className="overflow-x-auto">
          <Tabs value={filter} onValueChange={setFilter}>
            <TabsList>
              <TabsTrigger value="all">Все</TabsTrigger>
              <TabsTrigger value="mine">Добавил я</TabsTrigger>
              {tabs.slice(2).map((c) => (
                <TabsTrigger key={c} value={c}>{c}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="secondary">Осталось: {pending.length}</Badge>
              {totalEstimate > 0 && <span>Примерно на {formatMoney(totalEstimate)}</span>}
            </div>
          )}

          {!pending.length ? (
            <div className="flex flex-col items-center py-16 text-muted-foreground">
              <ShoppingCart className="mb-3 h-10 w-10" />
              <p className="text-lg">Список пуст</p>
              <p className="text-sm">Добавьте первый товар</p>
            </div>
          ) : (
            <div className="space-y-5">
              {grouped.map(([category, groupItems]) => (
                <div key={category}>
                  <h2 className="mb-2 text-sm font-semibold">
                    {category}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {groupItems.length}
                    </span>
                  </h2>
                  <div className="space-y-1.5">
                    {groupItems.map((item) => (
                      <div key={item.id} className="group flex items-center gap-3 rounded-lg border px-3 py-2">
                        <button
                          onClick={() => toggleDone(item)}
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-muted-foreground/40 transition-colors hover:border-primary"
                          aria-label="Отметить купленным"
                        >
                          <Check className="h-3 w-3 text-transparent" />
                        </button>

                        <span className="min-w-0 flex-1 truncate text-sm">{item.title}</span>

                        {item.quantity != null && (
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {item.quantity} {item.unit}
                          </span>
                        )}

                        {item.price != null && (
                          <span className="shrink-0 text-sm font-semibold tabular-nums">
                            {formatMoney(item.price)}
                          </span>
                        )}

                        {item.userId !== currentUser?.id && item.user && (
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {item.user.name.split(' ')[0]}
                          </span>
                        )}

                        <div className="flex shrink-0 gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => openEdit(item)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => handleDelete(item.id)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {bought.length > 0 && (
            <div>
              <button
                onClick={() => setShowDone((v) => !v)}
                className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground"
              >
                <ChevronDown className={cn('h-4 w-4 transition-transform', !showDone && '-rotate-90')} />
                Куплено: {bought.length}
                {boughtTotal > 0 && <span className="font-normal">· {formatMoney(boughtTotal)}</span>}
              </button>

              {showDone && (
                <div className="mt-2 space-y-1.5">
                  {bought.map((item) => (
                    <div key={item.id} className="group flex items-center gap-3 rounded-lg border border-dashed px-3 py-2">
                      <button
                        onClick={() => toggleDone(item)}
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-primary text-primary-foreground"
                        aria-label="Вернуть в список"
                      >
                        <Check className="h-3 w-3" />
                      </button>

                      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground line-through">
                        {item.title}
                      </span>

                      {item.buyer && item.buyerId !== currentUser?.id && (
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          купил {item.buyer.name.split(' ')[0]}
                        </span>
                      )}

                      {item.price != null && (
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {formatMoney(item.price)}
                        </span>
                      )}

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-destructive opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                        onClick={() => handleDelete(item.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(next) => { if (!next) setEditing(null); }}>
        <DialogContent className="max-w-sm sm:w-full">
          <DialogHeader>
            <DialogTitle>Изменить товар</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sh-title">Название</Label>
              <Input id="sh-title" value={formTitle} onChange={(e) => setFormTitle(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="sh-qty">Количество</Label>
                <Input
                  id="sh-qty"
                  type="number"
                  min={0}
                  step="any"
                  value={formQty}
                  onChange={(e) => setFormQty(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Ед.</Label>
                <Select value={formUnit} onValueChange={setFormUnit}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map((u) => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sh-price">
                Цена, ₽
                <span className="ml-1 font-normal text-muted-foreground">— необязательно</span>
              </Label>
              <Input
                id="sh-price"
                type="number"
                min={0}
                inputMode="numeric"
                placeholder="Можно пропустить"
                value={formPrice}
                onChange={(e) => setFormPrice(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Нужна, только если хотите видеть итоговую сумму. Список работает и без неё.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Категория</Label>
              <Select value={formCategory} onValueChange={setFormCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEditing(null)}>Отмена</Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
