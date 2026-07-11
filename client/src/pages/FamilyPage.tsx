import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Plus, Mail, Check, X, LogOut, UserMinus, MessageSquare } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import toast from 'react-hot-toast';

export function FamilyPage() {
  const navigate = useNavigate();
  const [families, setFamilies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<{ familyId: string; userId: string } | null>(null);
  const [leaveTarget, setLeaveTarget] = useState<string | null>(null);

  async function load() {
    try {
      const data = await api.family.getAll();
      setFamilies(data);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate() {
    if (!newName.trim()) return;
    try {
      await api.family.create(newName.trim());
      setNewName('');
      toast.success('Семья создана');
      load();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function handleChat(userId: string) {
    try {
      const chat = await api.chat.create(userId);
      navigate(`/chats/${chat.id}`);
    } catch (err: any) { toast.error(err.message); }
  }

  async function handleInvite(familyId: string) {
    if (!inviteEmail.trim()) return;
    try {
      await api.family.invite(familyId, inviteEmail.trim());
      setInviteEmail('');
      setInviting(null);
      toast.success('Приглашение отправлено');
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function handleRemoveMember(familyId: string, userId: string) {
    setRemoveTarget({ familyId, userId });
  }

  async function confirmRemoveMember() {
    const target = removeTarget;
    setRemoveTarget(null);
    if (!target) return;
    try {
      await api.family.removeMember(target.familyId, target.userId);
      toast.success('Участник удалён');
      load();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function handleLeave(familyId: string) {
    setLeaveTarget(familyId);
  }

  async function confirmLeave() {
    const id = leaveTarget;
    setLeaveTarget(null);
    if (!id) return;
    try {
      await api.family.leave(id);
      toast.success('Вы покинули семью');
      load();
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
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold lg:text-3xl">Моя семья</h1>
          <p className="text-sm text-muted-foreground">Синхронизация задач и рецептов с близкими</p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Создать семью</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Создать семью</DialogTitle></DialogHeader>
            <div className="flex gap-2">
              <Input placeholder="Название семьи" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <Button onClick={handleCreate}>Создать</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {families.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-muted-foreground">
            <Users className="mb-4 h-12 w-12" />
            <p className="text-lg">У вас нет семей</p>
            <p className="text-sm">Создайте семью и пригласите участников</p>
          </CardContent>
        </Card>
      ) : (
        families.map((family) => {
          const isAdmin = family.members?.some((m: any) => m.userId === localStorage.getItem('userId') && m.role === 'admin');
          return (
            <Card key={family.id}>
              <CardHeader className="flex flex-row items-center justify-between p-4 lg:p-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{family.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {family.members?.length || 0} участников
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Dialog open={inviting === family.id} onOpenChange={(o) => setInviting(o ? family.id : null)}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm"><Mail className="mr-1 h-3 w-3" /> Пригласить</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>Пригласить в семью</DialogTitle></DialogHeader>
                      <div className="flex gap-2">
                        <Input placeholder="Email участника" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
                        <Button onClick={() => handleInvite(family.id)}>Отправить</Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleLeave(family.id)}>
                    <LogOut className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4 lg:px-6 lg:pb-6">
                {family.members?.length > 0 && (
                  <div className="space-y-2">
                    {family.members.map((m: any) => (
                      <div key={m.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
                            {m.user.name?.[0]?.toUpperCase() || '?'}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{m.user.name}</p>
                            <p className="text-xs text-muted-foreground">{m.user.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {m.role === 'admin' && <Badge variant="secondary">Админ</Badge>}
                          {m.userId !== localStorage.getItem('userId') && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleChat(m.userId)} title="Написать">
                              <MessageSquare className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {isAdmin && m.role !== 'admin' && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleRemoveMember(family.id, m.userId)}>
                              <UserMinus className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {family.invites?.filter((i: any) => i.status === 'pending').length > 0 && (
                  <div className="mt-4">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">Ожидающие приглашения</p>
                    <div className="space-y-1">
                      {family.invites.filter((i: any) => i.status === 'pending').map((inv: any) => (
                        <div key={inv.id} className="flex items-center justify-between rounded-lg border px-3 py-1.5">
                          <span className="text-sm">{inv.email}</span>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px]">Ожидает</Badge>
                            {isAdmin && (
                              <button className="text-destructive hover:text-destructive/80" onClick={async () => {
                                try {
                                  await api.family.cancelInvite(family.id, inv.id);
                                  toast.success('Приглашение отменено');
                                  load();
                                } catch (err: any) { toast.error(err.message); }
                              }}>
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })
      )}

      <Dialog open={!!removeTarget} onOpenChange={() => setRemoveTarget(null)}>
        <DialogContent className="w-[90vw] max-w-sm">
          <DialogHeader>
            <DialogTitle>Удалить участника?</DialogTitle>
            <DialogDescription>Это действие нельзя отменить.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setRemoveTarget(null)}>Отмена</Button>
            <Button variant="destructive" onClick={confirmRemoveMember}>Удалить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!leaveTarget} onOpenChange={() => setLeaveTarget(null)}>
        <DialogContent className="w-[90vw] max-w-sm">
          <DialogHeader>
            <DialogTitle>Покинуть семью?</DialogTitle>
            <DialogDescription>Вы сможете вернуться только по новому приглашению.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setLeaveTarget(null)}>Отмена</Button>
            <Button variant="destructive" onClick={confirmLeave}>Выйти</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
