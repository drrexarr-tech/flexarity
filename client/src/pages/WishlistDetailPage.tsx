import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Trash2, Edit3, Plus, Gift, Users, ExternalLink, X, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { WishlistForm } from '@/components/wishes/WishlistForm';
import { WishItemForm } from '@/components/wishes/WishItemForm';
import { useAuthStore } from '@/stores/authStore';
import type { Wishlist } from '@/types';
import { formatMoney, cn } from '@/lib/utils';
import toast from 'react-hot-toast';

const priorityColors = {
  low: 'bg-green-500/10 text-green-500 border-green-500/20',
  medium: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  high: 'bg-red-500/10 text-red-500 border-red-500/20',
};
const priorityLabels = { low: 'Низкий', medium: 'Средний', high: 'Высокий' };

export function WishlistDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);
  const [list, setList] = useState<Wishlist | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [itemOpen, setItemOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [defaultRecipient, setDefaultRecipient] = useState<string | null>(null);
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);

  async function load() {
    if (!id) return;
    try {
      setList(await api.wishes.getById(id));
    } catch (err: any) {
      toast.error(err.message);
      navigate('/wishes');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  async function handleDelete() {
    if (!list) return;
    try {
      await api.wishes.delete(list.id);
      toast.success('Список удалён');
      navigate('/wishes');
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  function openAdd(recipientId: string | null = null) {
    setEditingItem(null);
    setDefaultRecipient(recipientId);
    setItemOpen(true);
  }

  async function toggleBought(itemId: string, bought: boolean) {
    if (!list) return;
    try {
      await api.wishes.updateItem(list.id, itemId, { bought });
      load();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function handleDeleteItem(itemId: string) {
    if (!list) return;
    const item = itemId;
    setDeleteItemId(null);
    try {
      await api.wishes.deleteItem(list.id, item);
      load();
      toast.success('Подарок удалён');
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; items: NonNullable<Wishlist['items']> }>();
    for (const item of list?.items ?? []) {
      const key = item.recipientId || 'none';
      if (!map.has(key)) {
        map.set(key, { label: item.recipient?.name || 'Без получателя', items: [] });
      }
      map.get(key)!.items.push(item);
    }
    return [...map.entries()];
  }, [list]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!list) return null;

  const progress = list.itemCount ? (list.boughtCount / list.itemCount) * 100 : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-4 lg:space-y-6">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/wishes')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Назад
        </Button>
        {list.canEdit ? (
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
            <Gift className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">{list.title}</h1>
              {list.description && (
                <p className="mt-1 text-sm text-muted-foreground">{list.description}</p>
              )}
            </div>
          </div>

          <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>

          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-2xl font-bold">{list.boughtCount} из {list.itemCount}</span>
            <span className="text-sm text-muted-foreground">куплено</span>
          </div>

          {list.totalPrice > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Всего на подарки</p>
                <p className="mt-1 text-lg font-semibold">{formatMoney(list.totalPrice)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Осталось купить</p>
                <p className="mt-1 text-lg font-semibold">{formatMoney(list.unboughtTotal)}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Button onClick={() => openAdd(null)}>
        <Plus className="mr-2 h-4 w-4" /> Добавить подарок
      </Button>

      <Separator />

      {!list.items?.length ? (
        <div className="flex flex-col items-center py-12 text-muted-foreground">
          <Gift className="mb-2 h-8 w-8" />
          <p className="text-sm">Подарков пока нет</p>
          <p className="text-xs">Добавьте первый</p>
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(([key, group]) => (
            <div key={key}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">{group.label}</h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {group.items.filter((i) => i.bought).length} из {group.items.length}
                  </span>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openAdd(key === 'none' ? null : key)}>
                    <Plus className="mr-1 h-3 w-3" /> Подарок
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                {group.items.map((item) => {
                  const mine = item.ownerId === currentUser?.id;
                  return (
                    <div key={item.id} className="group flex items-start gap-3 rounded-lg border px-3 py-2">
                      <button
                        onClick={() => toggleBought(item.id, !item.bought)}
                        className={cn(
                          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                          item.bought
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-muted-foreground/40 hover:border-primary'
                        )}
                        aria-label={item.bought ? 'Отметить как не купленный' : 'Отметить как купленный'}
                      >
                        {item.bought && <Check className="h-3 w-3" />}
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className={cn('text-sm', item.bought && 'text-muted-foreground line-through')}>
                            {item.url ? (
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {item.title}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : item.title}
                          </p>
                          {item.priority && (
                            <Badge variant="outline" className={cn('text-[9px]', priorityColors[item.priority])}>
                              {priorityLabels[item.priority]}
                            </Badge>
                          )}
                        </div>
                        {item.note && (
                          <p className="mt-0.5 text-[11px] text-muted-foreground">{item.note}</p>
                        )}
                        {!mine && item.owner && (
                          <p className="mt-0.5 text-[11px] text-muted-foreground/70">от {item.owner.name}</p>
                        )}
                      </div>

                      {item.price !== null && (
                        <span className="shrink-0 text-sm font-semibold tabular-nums">
                          {formatMoney(item.price)}
                        </span>
                      )}

                      {mine && (
                        <div className="flex shrink-0 gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => {
                              setEditingItem(item);
                              setDefaultRecipient(null);
                              setItemOpen(true);
                            }}
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => setDeleteItemId(item.id)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="w-[95vw] max-w-lg sm:w-full">
          <DialogHeader>
            <DialogTitle>Редактировать список</DialogTitle>
          </DialogHeader>
          <WishlistForm wishlist={list} onSuccess={() => { setEditOpen(false); load(); }} />
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="w-[90vw] max-w-sm">
          <DialogHeader>
            <DialogTitle>Удалить список?</DialogTitle>
            <DialogDescription>Вместе с ним удалятся все подарки. Это нельзя отменить.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Отмена</Button>
            <Button variant="destructive" onClick={handleDelete}>Удалить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteItemId} onOpenChange={() => setDeleteItemId(null)}>
        <DialogContent className="w-[90vw] max-w-sm">
          <DialogHeader>
            <DialogTitle>Удалить подарок?</DialogTitle>
            <DialogDescription>Это действие нельзя отменить.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteItemId(null)}>Отмена</Button>
            <Button variant="destructive" onClick={() => deleteItemId && handleDeleteItem(deleteItemId)}>
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={itemOpen} onOpenChange={setItemOpen}>
        <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto sm:w-full">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Редактировать подарок' : 'Новый подарок'}</DialogTitle>
          </DialogHeader>
          <WishItemForm
            wishlistId={list.id}
            item={editingItem}
            defaultRecipientId={defaultRecipient}
            onSuccess={() => { setItemOpen(false); setEditingItem(null); load(); }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
