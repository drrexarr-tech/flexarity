import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ArrowDown, ArrowUp, RotateCcw } from 'lucide-react';
import { ALL_SECTIONS, MAX_VISIBLE, useNavStore, type SectionId } from '@/stores/navStore';
import { cn } from '@/lib/utils';

/**
 * Picks what the bottom bar shows and in what order.
 *
 * Reordering uses buttons rather than drag and drop. On a phone, dragging is
 * unreliable, has no keyboard equivalent, and fights the browser's own scroll
 * gestures; two arrows and a visible order are unambiguous and work with a
 * screen reader.
 */
interface BottomNavSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BottomNavSettings({ open, onOpenChange }: BottomNavSettingsProps) {
  const order = useNavStore((s) => s.order);
  const toggle = useNavStore((s) => s.toggle);
  const move = useNavStore((s) => s.move);
  const reset = useNavStore((s) => s.reset);

  const visible = order
    .map((id) => ALL_SECTIONS.find((s) => s.id === id))
    .filter((s): s is (typeof ALL_SECTIONS)[number] => Boolean(s));
  const hidden = ALL_SECTIONS.filter((s) => !order.includes(s.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Меню внизу</DialogTitle>
          <DialogDescription>
            Выберите разделы для нижнего меню и их порядок. До {MAX_VISIBLE} разделов.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          {visible.map((section, index) => (
            <div
              key={section.id}
              className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2"
            >
              <span className="w-5 shrink-0 text-center text-sm text-muted-foreground">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{section.label}</span>

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label={`Переместить «${section.label}» выше`}
                disabled={index === 0}
                onClick={() => move(section.id as SectionId, -1)}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label={`Переместить «${section.label}» ниже`}
                disabled={index === visible.length - 1}
                onClick={() => move(section.id as SectionId, 1)}
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Switch
                checked
                onCheckedChange={() => toggle(section.id as SectionId)}
                aria-label={`Убрать «${section.label}» из меню`}
              />
            </div>
          ))}

          {visible.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              В меню должен остаться хотя бы один раздел.
            </p>
          )}

          {hidden.length > 0 && (
            <>
              <p className="pt-2 text-xs font-medium text-muted-foreground">
                Скрытые разделы — доступны в боковом меню
              </p>
              <div className="flex flex-wrap gap-1.5">
                {hidden.map((section) => (
                  <button
                    key={section.id}
                    type="button"
                    disabled={visible.length >= MAX_VISIBLE}
                    onClick={() => toggle(section.id as SectionId)}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                      'hover:bg-accent disabled:opacity-40'
                    )}
                  >
                    + {section.label}
                  </button>
                ))}
              </div>
              {visible.length >= MAX_VISIBLE && (
                <p className="text-xs text-muted-foreground">
                  Уберите один раздел, чтобы добавить другой.
                </p>
              )}
            </>
          )}
        </div>

        <DialogFooter className="flex-row justify-between gap-2">
          <Button variant="ghost" onClick={reset} className="text-muted-foreground">
            <RotateCcw className="mr-2 h-4 w-4" />
            Сбросить
          </Button>
          <Button onClick={() => onOpenChange(false)}>Готово</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}