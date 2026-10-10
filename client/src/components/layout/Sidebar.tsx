import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, BookOpen, CheckSquare, Users, MessageSquare, StickyNote, PiggyBank, Gift, CalendarDays, ShoppingCart, LogOut, Moon, Sun, X, Menu, SlidersHorizontal } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { ALL_SECTIONS, useNavStore, type SectionId } from '@/stores/navStore';
import { BottomNavSettings } from '@/components/layout/BottomNavSettings';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { cn } from '@/lib/utils';

const icons: Record<SectionId, typeof LayoutDashboard> = {
  home: LayoutDashboard,
  tasks: CheckSquare,
  calendar: CalendarDays,
  shopping: ShoppingCart,
  chats: MessageSquare,
  notes: StickyNote,
  recipes: BookOpen,
  plans: PiggyBank,
  wishes: Gift,
  family: Users,
};

const links = ALL_SECTIONS.map((s) => ({
  to: s.to,
  icon: icons[s.id as SectionId],
  label: s.label,
  id: s.id as SectionId,
}));

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const { user, logout } = useAuthStore();
  const { isDark, toggle } = useThemeStore();
  const location = useLocation();
  const order = useNavStore((s) => s.order);
  const [navSettingsOpen, setNavSettingsOpen] = useState(false);

  const bottomLinks = order
    .map((id) => links.find((l) => l.id === id))
    .filter((l): l is (typeof links)[number] => Boolean(l));

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          'fixed left-0 top-0 z-40 flex h-full w-64 flex-col border-r bg-card transition-transform duration-300 lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-14 items-center justify-between border-b px-4 shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <span className="text-sm font-bold text-primary-foreground">F</span>
            </div>
            <span className="text-lg font-bold">Flex</span>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 lg:hidden" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <nav className="flex-1 space-y-1 p-3 overflow-y-auto">
          {links.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t p-3 shrink-0">
          <NavLink
            to="/profile"
            onClick={onClose}
            className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-accent"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-medium">
              {user?.name?.[0]?.toUpperCase() || '?'}
            </div>
            <div className="flex-1 truncate">
              <p className="text-sm font-medium">{user?.name}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
          </NavLink>
          <div className="mt-2 flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggle}>
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={logout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-20 border-t bg-card/95 backdrop-blur-md lg:hidden safe-area-bottom">
        <div className="flex items-stretch">
          {bottomLinks.map(({ to, icon: Icon, label }) => {
            const isActive = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));
            return (
              <NavLink
                key={to}
                to={to}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                {/* The active tab used to be distinguished by text colour alone,
                    which is the one cue that does not survive a dim screen or a
                    colour-blind reader. A tinted plate makes it obvious. */}
                <span
                  className={cn(
                    'flex h-7 w-12 items-center justify-center rounded-lg transition-colors',
                    isActive ? 'bg-primary/12' : 'bg-transparent'
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="max-w-full truncate leading-tight">{label}</span>
              </NavLink>
            );
          })}

          <button
            type="button"
            onClick={() => setNavSettingsOpen(true)}
            aria-label="Настроить меню"
            className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium text-muted-foreground transition-colors"
          >
            <span className="flex h-7 w-12 items-center justify-center rounded-lg">
              <SlidersHorizontal className="h-5 w-5" />
            </span>
            <span className="max-w-full truncate leading-tight">Меню</span>
          </button>
        </div>
      </nav>

      <BottomNavSettings open={navSettingsOpen} onOpenChange={setNavSettingsOpen} />
    </>
  );
}

export function SidebarToggle({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-9 w-9 lg:hidden"
      onClick={onClick}
    >
      <Menu className="h-5 w-5" />
    </Button>
  );
}
