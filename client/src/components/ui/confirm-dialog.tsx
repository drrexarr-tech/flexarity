import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

/**
 * Confirmation for anything irreversible.
 *
 * The dozen call sites this replaces each had their own version, and between
 * them they had every failure mode a destructive action can have:
 *
 * - Several cleared their "are you sure" state only on the happy path. A
 *   failed request left the dialog on screen with nothing but a toast behind
 *   it, so the button looked dead.
 * - None of them guarded against a second tap. Two DELETEs go out, the second
 *   comes back 404, and the user is shown an error for an action that worked.
 * - Every one of them wrote onOpenChange={(next) => { if (!next) setTarget(null); }}, discarding
 *   the boolean the component passes. That only works because nothing ever asks
 *   to open, and it silently breaks the first time something does.
 *
 * Here the button is disabled while the request is in flight, the dialog
 * reports the failure where the user is looking, and closing is only refused
 * mid-request so a slow network cannot leave the state and the server out of
 * step.
 */
interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  pendingLabel?: string;
  cancelLabel?: string;
  className?: string;
  onConfirm: () => Promise<void> | void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Удалить',
  pendingLabel = 'Удаление...',
  cancelLabel = 'Отмена',
  className,
  onConfirm,
}: ConfirmDialogProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset between openings so a retry never inherits the previous attempt's
  // spinner or error.
  useEffect(() => {
    if (!open) {
      setPending(false);
      setError(null);
    }
  }, [open]);

  async function handleConfirm() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (err) {
      // Stay open. Closing here is what made a failed delete look like the
      // button had done nothing at all.
      setError(err instanceof Error && err.message ? err.message : 'Не удалось выполнить действие');
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Never let the dialog close while the request is running: the caller
        // would lose track of what it asked to delete.
        if (!pending) onOpenChange(next);
      }}
    >
      <DialogContent className={className ?? 'max-w-sm'}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <DialogFooter className="flex gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={pending}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </DialogFooter>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}