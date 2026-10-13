import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
ref={ref}
      // Focusable so the dialog can take focus on open. Without tabIndex the
      // .focus() below does nothing and the panel is skipped by assistive tech.
      tabIndex={-1}
      /* No autofocus on open: Radix focuses the first field, which raises the
         keyboard the moment the sheet appears. Preventing the default leaves
         focus outside the dialog entirely, though, so screen readers never
         announce it and Tab walks the page behind the overlay - hence the
         focus moved onto the panel itself. Closing is left alone so focus
         still returns to whatever opened it. */
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        (event.currentTarget as HTMLElement | null)?.focus();
      }}
      className={cn(
        // Sizing notes, all of them learned on an iPhone:
        // - overflow-y-auto belongs here, not on individual callers. Without it
        //   a dialog taller than the cap is clipped with no way to reach the
        //   bottom, which is where the submit button lives.
        // - dvh, never vh. On iOS vh is the height the page would have with the
        //   bars hidden, so a vh-based cap is taller than what is actually
        //   visible and the button ends up underneath Safari's own toolbar.
        // - the sheet is anchored to the bottom of the visual viewport, so it
        //   needs the home-indicator inset as padding or the button sits on it.
        // - bottom and max-height follow --kb / --vvh from useVisualViewport.
        //   position:fixed is laid out against the layout viewport and is not
        //   moved when the keyboard opens, so a sheet pinned to bottom:0 ends up
        //   underneath it with no way to scroll the rest of the form into view.
        // - overflow-x-hidden, not just overflow-y-auto. A sheet is a vertical
        //   form; letting it pan sideways means a thumb swipe meant to scroll
        //   the form drags the sheet sideways instead, which on a phone reads
        //   as the page being broken.
        // - !max-w-none on small screens. Every caller sets a desktop max-w-*
        //   (max-w-sm, max-w-lg) and those also applied on a phone, where 24rem
        //   is narrower than the screen. The sheet is pinned left, so it ended up
        //   hugging the left edge with a gap down the right side. Important is
        //   what makes it stick: the base rule and the caller's rule have equal
        //   specificity, so which one wins would depend on stylesheet order.
        // - The dialog does not take focus on open. Radix focuses the first
        //   focusable child, which is the first input, which raises the
        //   keyboard the instant the sheet appears and puts a cursor in a field
        //   the user has not decided to fill in yet. Closing the dialog should
        //   also return focus to whatever opened it.
        'fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] touch-pan-y gap-4 overflow-x-hidden overflow-y-auto overscroll-contain border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg max-h-[calc(var(--vvh,100dvh)-2rem)] max-sm:inset-x-0 max-sm:bottom-[var(--kb,0px)] max-sm:top-auto max-sm:max-h-[calc(var(--vvh,100dvh)-env(safe-area-inset-top))] max-sm:!max-w-none max-sm:w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-t-2xl max-sm:p-4 max-sm:pb-[max(1rem,env(safe-area-inset-bottom))]',
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
        <X className="h-4 w-4" />
        <span className="sr-only">Закрыть</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)} {...props} />
);
DialogHeader.displayName = 'DialogHeader';

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)} {...props} />
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold leading-none tracking-tight', className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
