import { useState, useEffect, useRef } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { cn, formatDateTime } from '@/lib/utils';

export function NotificationBell() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      try {
        const data = await api.notifications.getAll();
        setNotifications(data);
      } catch {}
    }
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setUnread(notifications.filter((n) => !n.read).length);
  }, [notifications]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function handleMarkRead(id: string) {
    await api.notifications.markRead(id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }

  async function handleMarkAllRead() {
    await api.notifications.markAllRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  function handleClick(n: any) {
    if (!n.read) handleMarkRead(n.id);
    if (n.link) navigate(n.link);
    setOpen(false);
  }

  const visible = showAll ? notifications : notifications.filter((n) => !n.read);

  return (
    <div ref={ref} className="relative">
      <Button variant="ghost" size="icon" className="relative h-9 w-9" onClick={() => setOpen(!open)}>
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border bg-card shadow-xl lg:w-96">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="font-semibold">Уведомления</h3>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button className="text-xs text-primary hover:underline flex items-center gap-1" onClick={handleMarkAllRead}>
                  <CheckCheck className="h-3 w-3" /> Прочитать все
                </button>
              )}
              <button className="text-xs text-muted-foreground hover:underline" onClick={() => setShowAll(!showAll)}>
                {showAll ? 'Только новые' : 'Все'}
              </button>
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {visible.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">Нет уведомлений</p>
            ) : (
              visible.map((n) => (
                <button
                  key={n.id}
                  className={cn(
                    'w-full px-4 py-3 text-left transition-colors hover:bg-muted/50',
                    !n.read && 'bg-muted/20'
                  )}
                  onClick={() => handleClick(n)}
                >
                  <p className="text-sm font-medium">{n.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{n.message}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground/60">{formatDateTime(n.createdAt)}</p>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
