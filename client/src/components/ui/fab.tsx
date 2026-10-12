import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The add button for a page, parked in the bottom-right corner.
 *
 * There was none: the only way to add a task or an event was a button in the
 * page header, which scrolls away the moment you look at the list and gets
 * pushed half off-screen on a narrow phone because that row has no wrap.
 *
 * It clears the mobile nav (4rem) plus the home indicator inset, and steps up
 * to the usual corner on desktop where there is no bar. z-30 keeps it above the
 * nav's z-20 while staying under the drawer and any dialog.
 */
interface FabProps {
  onClick: () => void;
  label: string;
  className?: string;
}

export function Fab({ onClick, label, className }: FabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'fixed right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95',
        'bottom-[calc(4rem+env(safe-area-inset-bottom)+0.75rem)] lg:bottom-6',
        className
      )}
    >
      <Plus className="h-6 w-6" />
    </button>
  );
}