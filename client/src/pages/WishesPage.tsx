import { useEffect, useState } from 'react';
import { Plus, Trash2, Edit3, Gift, Users, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { WishlistForm } from '@/components/wishes/WishlistForm';
import type { Wishlist } from '@/types';
import { formatMoney } from '@/lib/utils';
import toast from 'react-hot-toast';

export function WishesPage() {
  const [lists, setLists] = useState<Wishlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Wishlist | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const navigate = useNavigate();

  async function load() {
    try {
      setLists(await api.wishes.getAll());
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleDelete(id: string) {
    try {
      await api.wishes.delete(id);
      setLists((prev) => prev.filter((l) => l.id !== id));
      toast.success('Список удалён');
    } catch (err: any) {
      toast.error(err.message);
    }
    setDeleteTarget(null);
  }

  return (
    <div className="space-y-4 lg:space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Хотелки</h1>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="mr-1 h-3.5 w-3.5" /> Новый список</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg sm:w-full">
              <DialogHeader>
                <DialogTitle>{editing ? 'Редактировать список' : 'Новый список'}</DialogTitle>
              </DialogHeader>
              <WishlistForm
                wishlist={editing}
                onSuccess={() => {
                  setEditing(null);
                  setDialogOpen(false);
                  load();
                }}
              />
            </DialogContent>
          </Dialog>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Подарки для близких и для себя</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : lists.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-muted-foreground">
          <Gift className="mb-3 h-10 w-10" />
          <p className="text-lg">Списков пока нет</p>
          <p className="text-sm">Создайте список подарков</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lists.map((list) => (
            <Card
              key={list.id}
              className="group cursor-pointer transition-shadow hover:shadow-md"
              onClick={() => navigate(`/wishes/${list.id}`)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2">
                    <Gift className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <h3 className="truncate font-medium">{list.title}</h3>
                  </div>
                  {list.canEdit && (
                    <div className="flex shrink-0 gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditing(list);
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
                          setDeleteTarget(list.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>

                {list.description && (
                  <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{list.description}</p>
                )}

                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${list.itemCount ? (list.boughtCount / list.itemCount) * 100 : 0}%` }}
                  />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">
                    <Check className="mr-1 h-3 w-3" />
                    {list.boughtCount} из {list.itemCount}
                  </Badge>
                  {list.totalPrice > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      на {formatMoney(list.totalPrice)}
                    </span>
                  )}
                  {list.visibility !== 'private' && (
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Users className="h-3 w-3" />
                      {list.visibility === 'family' ? 'Семья' : 'Общий'}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Удалить список?</DialogTitle>
            <DialogDescription>Вместе с ним удалятся все подарки. Это нельзя отменить.</DialogDescription>
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
